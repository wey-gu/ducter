// Package update keeps Ducter.app current, without interrupting anyone.
//
// Once at launch and once a day it reads the newest published release of
// wey-gu/ducter on GitHub. When it is newer, it downloads the disk image into
// ~/Library/Application Support/Ducter/updates, checks it against the
// release's SHA256SUMS.txt, copies the app out next to the running one, and
// checks that copy: its bundle id and version, codesign --verify --deep
// --strict, a Developer ID Application signature of the running app's own
// team, and Gatekeeper's verdict. Only then is it "ready": the next quit (or
// "Restart to update") swaps the bundles by rename once the app has exited,
// keeps the previous version for a rollback, restarts the background
// LaunchAgent so Ducter itself runs the new helper (tasks resume from the
// Log), and opens the app again when asked to.
//
// Why not Sparkle: it is the macOS standard, but it is an Objective-C
// framework to embed and sign into a Go app built without Xcode, plus an
// EdDSA key and an appcast to keep. The Developer ID check already proves who
// built the update (Apple issues and can revoke the certificate), and the
// release already carries SHA256SUMS.txt. See design/release/README.md.
package update

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

// State is where the updater is.
type State string

const (
	Idle        State = "idle"        // not checked yet
	Checking    State = "checking"    // reading the feed
	Downloading State = "downloading" // fetching and checking a new version
	UpToDate    State = "uptodate"    // nothing newer
	Ready       State = "ready"       // a checked new version installs at the next quit
	Available   State = "available"   // newer, but this copy can't replace itself (Reason)
	Failed      State = "failed"      // the last try failed (Reason); tried again tomorrow
	NoFeed      State = "nofeed"      // no public releases to read yet
)

// Reason says why an update is Available only or Failed, for the copy.
type Reason string

const (
	ReasonNone      Reason = ""
	ReasonLocation  Reason = "location"   // not in a folder it can write (a disk image, a read-only copy)
	ReasonUnsigned  Reason = "unsigned"   // this build isn't signed with a Developer ID: nothing to match
	ReasonFeed      Reason = "feed"       // couldn't read which version is newest (offline, rate limited): tried again within the hour (D187)
	ReasonNetwork   Reason = "network"    // couldn't reach GitHub
	ReasonChecksum  Reason = "checksum"   // the download doesn't match SHA256SUMS.txt
	ReasonSignature Reason = "signature"  // not signed by the same team, or the signature is broken
	ReasonGatekeep  Reason = "gatekeeper" // macOS wouldn't open it
	ReasonBundle    Reason = "bundle"     // another app, or another version than the feed said
	ReasonDisk      Reason = "disk"       // couldn't write the download or the copy
	ReasonInstall   Reason = "install"    // the swap after quitting didn't happen: the old version came back
	ReasonOwner     Reason = "owner"      // Ducter.app belongs to an administrator and the password was not given
)

// Status is what Settings and the app menu show.
type Status struct {
	State   State
	Current string // the running version
	Version string // the newer version, when there is one
	Page    string // its release page
	Reason  Reason
	Detail  string // the error behind Reason, for the log and a diagnostics bundle
	// Progress of a download, 0..1 (0 when unknown).
	Progress  float64
	CheckedAt time.Time
	// InstallOnQuit: a ready update installs when the app quits (default on).
	InstallOnQuit bool
	// CanRollBack: the version before this one is kept.
	CanRollBack bool
	// Installed is the version the last swap put in, when this launch is
	// its first (Settings says "Updated to" it once).
	Installed string
}

// Config is where the app is and what to check with.
type Config struct {
	App  string // the running .app
	Feed string // DefaultFeed unless a test serves its own
	// Page and Download: the fallback when the API refuses (D187).
	// DefaultPage and DefaultDownload with the default feed; a test feed
	// has none unless it sets them.
	Page       string
	Download   string
	Arch       string // "arm64" or "x86_64"; default from runtime.GOARCH
	Dir        string // ~/Library/Application Support/Ducter/updates
	AgentLabel string // the background LaunchAgent to restart after a swap ("" none)
	AgentPlist string // its plist: restarted only when it is there (not resting)
	// WorkerLabel/WorkerPlist: this Mac's worker LaunchAgent (D155), restarted
	// after a swap too, so it runs the new bundled helper instead of the old
	// one it still has in memory (D167). "" none.
	WorkerLabel string
	WorkerPlist string
	HTTP        *http.Client
	Check       Checker
	Now         func() time.Time
	// OnChange is called after every change of Status, on any goroutine.
	OnChange func(Status)
	Logf     func(format string, args ...any)
	// Pid is the process the swap waits for (default: this one).
	Pid int
	// Authorize makes the running app the person's own when it isn't
	// (installed with sudo: then the swap's rename would fail and the old
	// version would open again). It asks for an administrator's password,
	// so it runs only when the person asked to restart into the update.
	// Default: AuthorizeOwner.
	Authorize func(app string) error
}

// Updater is the one updater of the running app.
type Updater struct {
	cfg  Config
	info Info // the running app's

	mu      sync.Mutex
	st      Status
	busy    bool
	saved   saved
	pending *pending // what the next quit swaps in
	begun   bool     // the swap is started: it runs once the app has exited
	// hint is the newest version the home said there is (D187), used when
	// GitHub's API can't say; hinted is when each one last started a check.
	hint   string
	hinted map[string]time.Time
}

type saved struct {
	InstallOnQuit *bool     `json:"installOnQuit,omitempty"`
	Skip          string    `json:"skip,omitempty"` // a version rolled back from: never offered again
	Staged        *staged   `json:"staged,omitempty"`
	CheckedAt     time.Time `json:"checkedAt,omitzero"`
}

type staged struct {
	Version string `json:"version"`
	Path    string `json:"path"` // the checked .app, next to the running one
	Page    string `json:"page,omitempty"`
}

type pending struct {
	from string // the bundle that goes in
	prev string // where the running one goes
	note string // "update" or "rollback"
}

// New sets up the updater for the running app. It reads what an earlier run
// left (a staged version, the person's choice, the result of the last swap).
func New(cfg Config) (*Updater, error) {
	info, err := ReadInfo(cfg.App)
	if err != nil {
		return nil, err
	}
	if cfg.Feed == "" {
		cfg.Feed = DefaultFeed
		if cfg.Page == "" {
			cfg.Page = DefaultPage
		}
		if cfg.Download == "" {
			cfg.Download = DefaultDownload
		}
	}
	if cfg.Arch == "" {
		cfg.Arch = runtime.GOARCH
		if cfg.Arch == "amd64" {
			cfg.Arch = "x86_64"
		}
	}
	if cfg.HTTP == nil {
		cfg.HTTP = &http.Client{Timeout: 10 * time.Minute}
	}
	if cfg.Check == nil {
		cfg.Check = Codesign{}
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Logf == nil {
		cfg.Logf = func(string, ...any) {}
	}
	if cfg.Pid == 0 {
		cfg.Pid = os.Getpid()
	}
	if cfg.Authorize == nil {
		cfg.Authorize = AuthorizeOwner("")
	}
	if err := os.MkdirAll(cfg.Dir, 0o755); err != nil {
		return nil, err
	}
	u := &Updater{cfg: cfg, info: info}
	u.load()
	u.st = Status{State: Idle, Current: info.Version, CheckedAt: u.saved.CheckedAt, InstallOnQuit: u.installOnQuit(), CanRollBack: u.previousOK()}
	if r, err := os.ReadFile(u.resultPath()); err == nil {
		res := strings.TrimSpace(string(r))
		cfg.Logf("ducter: last update: %s", res)
		os.Remove(u.resultPath())
		// The swap ran but this is still the old version: say so in Settings,
		// never open the old app again as if it had updated.
		if !strings.HasSuffix(res, ": installed") {
			u.st.State, u.st.Reason, u.st.Detail = Failed, ReasonInstall, res
		} else if strings.HasPrefix(res, "update:") {
			u.st.Installed = info.Version
		}
	}
	// A version staged by an earlier run: ready again if it is still newer
	// and still there. It is checked again before every swap.
	if s := u.saved.Staged; s != nil {
		if Compare(s.Version, info.Version) > 0 && exists(s.Path) && s.Version != u.saved.Skip {
			u.st.State, u.st.Version, u.st.Page = Ready, s.Version, s.Page
			u.pending = &pending{from: s.Path, prev: u.previousPath(), note: "update"}
		} else {
			u.dropStaged()
		}
	}
	return u, nil
}

// Status is the updater's state now.
func (u *Updater) Status() Status {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.st
}

func (u *Updater) set(f func(*Status)) {
	u.mu.Lock()
	f(&u.st)
	st := u.st
	u.mu.Unlock()
	if u.cfg.OnChange != nil {
		u.cfg.OnChange(st)
	}
}

// Start checks shortly after launch, then once a day (checked every hour,
// so a Mac that slept through the day still asks when it wakes). A check
// that couldn't read anything (offline, rate limited) is tried again the
// next hour: only an answer counts as the day's check (D187).
func (u *Updater) Start(ctx context.Context, firstDelay time.Duration) {
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(firstDelay):
		}
		u.CheckNow(ctx)
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if st := u.Status(); st.State == Failed && (st.Reason == ReasonFeed || st.Reason == ReasonNetwork) || u.cfg.Now().Sub(st.CheckedAt) >= 24*time.Hour {
					u.CheckNow(ctx)
				}
			}
		}
	}()
}

// CheckNow reads the feed and, when there is a newer version, downloads and
// checks it. It returns the resulting status; a check already running is not
// started twice (the current status comes back).
func (u *Updater) CheckNow(ctx context.Context) Status { return u.check(ctx) }

// Hint is told the newest version the home knows of, from its devices
// frame (D187): the devices view and this updater answer "is there a newer
// version for this Mac" alike. A hint newer than this app and than what
// the updater has found starts a check now (once per version every 15
// minutes), and stays as the version to fetch while GitHub's API can't
// say. It reports whether it started one.
func (u *Updater) Hint(ctx context.Context, v string) bool {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if _, ok := parse(v); !ok || Compare(v, u.info.Version) <= 0 || v == u.Skip() {
		return false
	}
	now := u.cfg.Now()
	u.mu.Lock()
	if Compare(v, u.hint) > 0 {
		u.hint = v
	}
	st := u.st
	last, seen := u.hinted[v]
	if u.busy || (st.State == Ready || st.State == Available) && Compare(st.Version, v) >= 0 || seen && now.Sub(last) < hintEvery {
		u.mu.Unlock()
		return false
	}
	if u.hinted == nil {
		u.hinted = map[string]time.Time{}
	}
	u.hinted[v] = now
	u.mu.Unlock()
	go u.check(ctx)
	return true
}

// Get is asked from elsewhere (D187: the phone's 更新 on this Mac's card):
// fetch and check version v now, whatever was checked when. It returns once
// v is ready or the check has ended.
func (u *Updater) Get(ctx context.Context, v string) Status {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	u.mu.Lock()
	if _, ok := parse(v); ok && Compare(v, u.hint) > 0 {
		u.hint = v
	}
	st := u.st
	u.mu.Unlock()
	if st.State == Ready && Compare(st.Version, v) >= 0 {
		return st
	}
	return u.check(ctx)
}

// Unattended reports whether a ready update can go in with nobody at the
// Mac: Ducter.app is the person's own, so no administrator's password is
// asked (D187).
func (u *Updater) Unattended() bool { return writable(u.cfg.App) }

// hintEvery: a hint starts a check at most this often per version.
const hintEvery = 15 * time.Minute

func (u *Updater) check(ctx context.Context) Status {
	u.mu.Lock()
	if u.busy {
		st := u.st
		u.mu.Unlock()
		return st
	}
	u.busy = true
	u.mu.Unlock()
	defer func() {
		u.mu.Lock()
		u.busy = false
		u.mu.Unlock()
	}()

	prevState := u.Status()
	u.set(func(s *Status) { s.State, s.Reason, s.Detail = Checking, ReasonNone, "" })
	u.mu.Lock()
	hint := u.hint
	u.mu.Unlock()
	rel, err := Latest(ctx, u.cfg.HTTP, Source{Feed: u.cfg.Feed, Page: u.cfg.Page, Download: u.cfg.Download}, u.cfg.Arch, hint)
	now := u.cfg.Now()
	// Only an answer is a check (D187): a refused or failed read leaves
	// "checked" where the last answer was, and is tried again within the
	// hour instead of a day later.
	if err == nil || errors.Is(err, ErrNoFeed) {
		u.mu.Lock()
		u.saved.CheckedAt = now
		u.mu.Unlock()
		u.save()
	}
	if err != nil {
		if errors.Is(err, ErrNoFeed) {
			u.cfg.Logf("ducter: update check: %v", err)
			u.set(func(s *Status) { s.State, s.CheckedAt = NoFeed, now })
		} else {
			u.cfg.Logf("ducter: update: %s: %v", ReasonFeed, err)
			u.set(func(s *Status) { s.State, s.Reason, s.Detail = Failed, ReasonFeed, err.Error() })
		}
		if prevState.State == Ready { // a staged version stays ready
			u.set(func(s *Status) { s.State, s.Reason, s.Detail = Ready, ReasonNone, "" })
		}
		return u.Status()
	}
	if Compare(rel.Version, u.info.Version) <= 0 || rel.Version == u.Skip() {
		u.set(func(s *Status) { s.State, s.Version, s.CheckedAt = UpToDate, "", now })
		return u.Status()
	}
	if prevState.State == Ready && prevState.Version == rel.Version {
		u.set(func(s *Status) { s.State, s.CheckedAt = Ready, now })
		return u.Status()
	}
	u.set(func(s *Status) { s.Version, s.Page, s.CheckedAt = rel.Version, rel.Page, now })

	// Only a copy that can replace itself downloads anything.
	if r, why := u.canReplace(); r != ReasonNone {
		u.cfg.Logf("ducter: update %s available, not installable here: %s", rel.Version, why)
		u.set(func(s *Status) { s.State, s.Reason, s.Detail = Available, r, why })
		return u.Status()
	}
	team, err := u.cfg.Check.Team(u.cfg.App)
	if err != nil || team == "" {
		u.set(func(s *Status) {
			s.State, s.Reason, s.Detail = Available, ReasonUnsigned, "this build has no Developer ID team"
		})
		return u.Status()
	}

	u.set(func(s *Status) { s.State, s.Progress = Downloading, 0 })
	path, r, err := u.fetchAndStage(ctx, rel, team)
	if err != nil {
		u.fail(r, err, now)
		return u.Status()
	}
	u.mu.Lock()
	u.saved.Staged = &staged{Version: rel.Version, Path: path, Page: rel.Page}
	u.pending = &pending{from: path, prev: u.previousPath(), note: "update"}
	u.mu.Unlock()
	u.save()
	u.cfg.Logf("ducter: update %s is ready (%s)", rel.Version, path)
	u.set(func(s *Status) { s.State, s.Progress = Ready, 1 })
	return u.Status()
}

func (u *Updater) fail(r Reason, err error, now time.Time) {
	u.cfg.Logf("ducter: update: %s: %v", r, err)
	u.set(func(s *Status) { s.State, s.Reason, s.Detail, s.CheckedAt = Failed, r, err.Error(), now })
}

// canReplace reports why this copy of the app can't put a new one in its
// place: not on a disk image or a translocated copy, and its folder writable.
func (u *Updater) canReplace() (Reason, string) {
	app := u.cfg.App
	if strings.HasPrefix(app, "/Volumes/") || strings.Contains(app, "/AppTranslocation/") {
		return ReasonLocation, "runs from " + app
	}
	probe, err := os.MkdirTemp(filepath.Dir(app), ".ducter-update-probe-")
	if err != nil {
		return ReasonLocation, "can't write next to " + app + ": " + err.Error()
	}
	os.Remove(probe)
	return ReasonNone, ""
}

// fetchAndStage downloads the disk image, checks its sum, copies the app out
// next to the running one and checks the copy. It returns the copy's path.
func (u *Updater) fetchAndStage(ctx context.Context, rel Release, team string) (string, Reason, error) {
	want, err := ExpectedSum(ctx, u.cfg.HTTP, rel.Sums, rel.DMG.Name)
	if err != nil {
		return "", ReasonChecksum, err
	}
	dl := filepath.Join(u.cfg.Dir, rel.Version)
	if err := os.MkdirAll(dl, 0o755); err != nil {
		return "", ReasonDisk, err
	}
	defer os.RemoveAll(dl) // the disk image is only needed until the copy is out
	dmg := filepath.Join(dl, rel.DMG.Name)
	if r, err := u.download(ctx, rel.DMG, dmg, want); err != nil {
		return "", r, err
	}

	mnt, detach, err := u.cfg.Check.Mount(dmg)
	if err != nil {
		return "", ReasonBundle, err
	}
	name := filepath.Base(u.cfg.App)
	src := filepath.Join(mnt, name)
	if !exists(src) {
		detach()
		return "", ReasonBundle, fmt.Errorf("the disk image has no %s", name)
	}
	// Next to the running app, so the swap is a rename on one volume.
	stage := filepath.Join(filepath.Dir(u.cfg.App), "."+name+".update-"+rel.Version)
	os.RemoveAll(stage)
	if err := os.MkdirAll(stage, 0o755); err != nil {
		detach()
		return "", ReasonDisk, err
	}
	dst := filepath.Join(stage, name)
	cerr := u.cfg.Check.Copy(src, dst)
	detach()
	if cerr != nil {
		os.RemoveAll(stage)
		return "", ReasonDisk, cerr
	}
	if r, err := u.verify(dst, rel.Version, team, true); err != nil {
		os.RemoveAll(stage)
		return "", r, err
	}
	return dst, ReasonNone, nil
}

// verify checks a copy of the app before it may replace the running one.
// gatekeeper: also ask Gatekeeper (spctl). The staged copy asks it once; the
// check again before the swap doesn't (see Begin).
func (u *Updater) verify(app, version, team string, gatekeeper bool) (Reason, error) {
	in, err := ReadInfo(app)
	if err != nil {
		return ReasonBundle, err
	}
	if in.ID != u.info.ID {
		return ReasonBundle, fmt.Errorf("the update is %s, not %s", in.ID, u.info.ID)
	}
	if in.Version != version || Compare(in.Version, u.info.Version) <= 0 {
		return ReasonBundle, fmt.Errorf("the update says version %s; the feed said %s (running %s)", in.Version, version, u.info.Version)
	}
	if err := u.cfg.Check.Signature(app, team); err != nil {
		return ReasonSignature, err
	}
	if got, err := u.cfg.Check.Team(app); err != nil || got != team {
		return ReasonSignature, fmt.Errorf("the update is signed by team %q, this app by %q (%v)", got, team, err)
	}
	if !gatekeeper {
		return ReasonNone, nil
	}
	if err := u.cfg.Check.Gatekeeper(app); err != nil {
		return ReasonGatekeep, err
	}
	return ReasonNone, nil
}

// maxDMG bounds a download (Ducter's disk image is under 100 MB).
const maxDMG = 1 << 30

func (u *Updater) download(ctx context.Context, a Asset, path string, want []byte) (Reason, error) {
	resp, err := open(ctx, u.cfg.HTTP, a.URL)
	if err != nil {
		return ReasonNetwork, err
	}
	defer resp.Body.Close()
	total := a.Size
	if total <= 0 {
		total = resp.ContentLength
	}
	if total > maxDMG {
		return ReasonBundle, fmt.Errorf("the disk image is %d bytes", total)
	}
	part := path + ".part"
	f, err := os.Create(part)
	if err != nil {
		return ReasonDisk, err
	}
	h := sha256.New()
	pr := &progress{r: io.LimitReader(resp.Body, maxDMG+1), total: total, fn: func(p float64) {
		u.set(func(s *Status) { s.Progress = p })
	}}
	n, err := io.Copy(io.MultiWriter(f, h), pr)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(part)
		return ReasonNetwork, err
	}
	if n > maxDMG || (a.Size > 0 && n != a.Size) {
		os.Remove(part)
		return ReasonChecksum, fmt.Errorf("downloaded %d bytes, the release lists %d", n, a.Size)
	}
	if subtle.ConstantTimeCompare(h.Sum(nil), want) != 1 {
		os.Remove(part)
		return ReasonChecksum, fmt.Errorf("%s doesn't match SHA256SUMS.txt", a.Name)
	}
	if err := os.Rename(part, path); err != nil {
		return ReasonDisk, err
	}
	return ReasonNone, nil
}

type progress struct {
	r     io.Reader
	total int64
	n     int64
	last  float64
	fn    func(float64)
}

func (p *progress) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	p.n += int64(n)
	if p.total > 0 {
		if f := float64(p.n) / float64(p.total); f-p.last >= 0.02 || f >= 1 {
			p.last = f
			p.fn(min(f, 1))
		}
	}
	return n, err
}

// SetInstallOnQuit is the person's choice; it is kept.
func (u *Updater) SetInstallOnQuit(on bool) {
	u.mu.Lock()
	u.saved.InstallOnQuit = &on
	u.mu.Unlock()
	u.save()
	u.set(func(s *Status) { s.InstallOnQuit = on })
}

// InstallOnQuit reports the person's choice (default on).
func (u *Updater) InstallOnQuit() bool { return u.Status().InstallOnQuit }

func (u *Updater) installOnQuit() bool {
	return u.saved.InstallOnQuit == nil || *u.saved.InstallOnQuit
}

// Skip is a version rolled back from, never offered again.
func (u *Updater) Skip() string {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.saved.Skip
}

// RollBackOnQuit makes the next quit put the previous version back (and the
// running one aside); the running version is never offered again. The app
// then relaunches with Quit(relaunch=true).
func (u *Updater) RollBackOnQuit() error {
	prev := u.previousPath()
	if !u.previousOK() {
		return errors.New("no previous version is kept")
	}
	in, err := ReadInfo(prev)
	if err != nil || in.ID != u.info.ID {
		return fmt.Errorf("the kept version isn't this app: %v", err)
	}
	team, err := u.cfg.Check.Team(u.cfg.App)
	if err == nil && team != "" {
		if err := u.cfg.Check.Signature(prev, team); err != nil {
			return fmt.Errorf("the kept version's signature: %w", err)
		}
	}
	back := filepath.Join(u.cfg.Dir, "rollback", filepath.Base(u.cfg.App))
	os.RemoveAll(filepath.Dir(back))
	if err := os.MkdirAll(filepath.Dir(back), 0o755); err != nil {
		return err
	}
	if err := os.Rename(prev, back); err != nil {
		return err
	}
	u.mu.Lock()
	u.saved.Skip = u.info.Version
	if u.saved.Staged != nil {
		os.RemoveAll(filepath.Dir(u.saved.Staged.Path))
		u.saved.Staged = nil
	}
	u.pending = &pending{from: back, prev: prev, note: "rollback to " + in.Version}
	u.mu.Unlock()
	u.save()
	u.set(func(s *Status) { s.State, s.Version, s.CanRollBack = Ready, in.Version, false })
	return nil
}

// Quit is called as the app quits. When a checked version is ready and the
// person wants updates on quit (or asked to restart into it: relaunch), it
// starts the swap: a small detached sh that waits for this process to
// exit, swaps the bundles by rename (putting the old one back if the new
// one can't go in), restarts the background LaunchAgent, and opens the app
// again when relaunch. It reports whether a swap was started. The app's
// bundle is never replaced while the app runs: the Dock tile would follow
// the moved bundle and the new app get a second one (as mygo found).
func (u *Updater) Quit(relaunch bool) (bool, error) {
	u.mu.Lock()
	begun := u.begun
	u.mu.Unlock()
	if begun {
		return true, nil // Begin started it before the quit
	}
	return u.Begin(relaunch)
}

// Begin does Quit's work ahead of the quit, off the main thread: it checks
// the copy again and starts the swap, which waits for this process to exit.
// Restart to update calls it while the window says so, and quits only once
// it has started (a copy that fails its check leaves the app open, with the
// reason in Settings); the quit after it then has nothing left to do, so
// nothing slow runs while the app's windows go away.
func (u *Updater) Begin(relaunch bool) (bool, error) {
	u.mu.Lock()
	p := u.pending
	st := u.st
	begun := u.begun
	u.mu.Unlock()
	if begun {
		return true, nil
	}
	if p == nil || st.State != Ready || !(relaunch || st.InstallOnQuit || strings.HasPrefix(p.note, "rollback")) {
		return false, nil
	}
	// The copy is checked again: it sat on disk since it was staged. Its
	// signature, so a changed file is caught; not Gatekeeper, whose verdict
	// rests on the notarization ticket for this code's hash (the one the
	// signature check pins) and was given when the copy was staged. 2026-11-11: spctl hung
	// for its full 2 minutes on a restart asked from the phone, the copy was
	// dropped, and the update never went in; the same spctl takes 0.4 s.
	if p.note == "update" {
		team, err := u.cfg.Check.Team(u.cfg.App)
		if err != nil || team == "" {
			return false, fmt.Errorf("the running app's team: %v", err)
		}
		if r, err := u.verify(p.from, st.Version, team, false); err != nil {
			u.dropStaged()
			u.fail(r, err, u.cfg.Now())
			return false, err
		}
	}
	if err := os.MkdirAll(filepath.Dir(p.prev), 0o755); err != nil {
		return false, err
	}
	// A bundle that isn't the person's own can't be renamed away (the swap
	// would open the old version again): it stays ready until
	// PrepareRestart has made it theirs.
	if !writable(u.cfg.App) {
		return false, fmt.Errorf("%s isn't yours to replace; the update stays ready", u.cfg.App)
	}
	rl := "0"
	if relaunch {
		rl = "1"
	}
	cmd := exec.Command("/bin/sh", "-c", swapScript, "ducter-update",
		fmt.Sprint(u.cfg.Pid), u.cfg.App, p.from, p.prev, u.cfg.AgentLabel, u.cfg.AgentPlist, rl, u.resultPath(), p.note, u.cfg.WorkerLabel, u.cfg.WorkerPlist)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return false, err
	}
	_ = cmd.Process.Release()
	u.mu.Lock()
	u.begun = true
	u.saved.Staged = nil // done or not, the next launch starts clean
	u.mu.Unlock()
	u.save()
	u.cfg.Logf("ducter: %s starts once the app has quit", p.note)
	return true, nil
}

// PrepareRestart readies the swap before the app quits to restart into the
// update: a bundle installed by an administrator (sudo) is made the
// person's own, with macOS's password prompt. On an error the app should
// not quit: the update stays ready, and Settings says why.
func (u *Updater) PrepareRestart() error {
	if writable(u.cfg.App) {
		return nil
	}
	if err := u.cfg.Authorize(u.cfg.App); err != nil || !writable(u.cfg.App) {
		if err == nil {
			err = errors.New("still not writable")
		}
		u.set(func(s *Status) { s.Reason, s.Detail = ReasonOwner, err.Error() })
		return err
	}
	u.set(func(s *Status) { s.Reason, s.Detail = ReasonNone, "" })
	return nil
}

// swapScript: $1 pid, $2 the running app, $3 the new bundle, $4 where the
// running one is kept, $5 the LaunchAgent label, $6 its plist, $7 relaunch,
// $8 the result file, $9 what this is, $10 the worker LaunchAgent's label,
// $11 its plist. The waits are capped: a stuck app leaves everything as it
// was. DUCTER_LAUNCHCTL stands in for launchctl in tests.
const swapScript = `pid=$1 target=$2 new=$3 prev=$4 label=$5 plist=$6 relaunch=$7 result=$8 what=$9 wlabel=${10} wplist=${11}
lc=${DUCTER_LAUNCHCTL:-/bin/launchctl}
trap '' HUP
i=0
while kill -0 "$pid" 2>/dev/null; do
	i=$((i+1)); [ "$i" -gt 6000 ] && { echo "$what: the app didn't quit; nothing changed" >"$result"; exit 1; }
	sleep 0.05
done
rm -rf "$prev.old"
[ -e "$prev" ] && mv "$prev" "$prev.old"
ok=
if mv "$target" "$prev"; then
	if mv "$new" "$target"; then
		ok=1
		rm -rf "$prev.old"
		rmdir "$(dirname "$new")" 2>/dev/null
		echo "$what: installed" >"$result"
	else
		mv "$prev" "$target"
		[ -e "$prev.old" ] && mv "$prev.old" "$prev"
		echo "$what: couldn't move the new version in; the old one is back" >"$result"
	fi
else
	[ -e "$prev.old" ] && mv "$prev.old" "$prev"
	echo "$what: couldn't move the running version aside; nothing changed" >"$result"
fi
if [ -n "$ok" ] && [ -n "$label" ] && [ -f "$plist" ]; then
	"$lc" kickstart -k "gui/$(id -u)/$label" >/dev/null 2>&1
fi
# This Mac doing tasks for a Ducter elsewhere (D155): its worker runs the bundled helper from
# memory, the old one, until restarted (D167).
if [ -n "$ok" ] && [ -n "$wlabel" ] && [ -f "$wplist" ]; then
	"$lc" kickstart -k "gui/$(id -u)/$wlabel" >/dev/null 2>&1
fi
# Launch Services still holds the old bundle's record for this path: refresh it, so the open
# below starts the new version with its own Info.plist, as a launch from the Dock would.
ls=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
if [ -n "$ok" ] && [ -x "$ls" ]; then "$ls" -f "$target" >/dev/null 2>&1; fi
if [ "$relaunch" = 1 ]; then exec /usr/bin/open "$target"; fi
`

// writable reports whether the person may rename the bundle away: moving a
// folder to another parent needs write access to the folder itself.
func writable(app string) bool { return syscall.Access(app, 2 /* W_OK */) == nil }

// AuthorizeOwner gives the bundle to the person running the app, asking
// macOS for an administrator's password (the standard prompt, with
// prompt as its line when given).
func AuthorizeOwner(prompt string) func(app string) error {
	return func(app string) error {
		script := []string{"-e", "on run argv",
			"-e", `set p to "/usr/sbin/chown -R " & (item 1 of argv) & " " & quoted form of (item 2 of argv)`,
			"-e", `if (item 3 of argv) is "" then`,
			"-e", "do shell script p with administrator privileges",
			"-e", "else",
			"-e", "do shell script p with prompt (item 3 of argv) with administrator privileges",
			"-e", "end if",
			"-e", "end run",
			fmt.Sprint(os.Getuid()), app, prompt}
		out, err := exec.Command("/usr/bin/osascript", script...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}
}

// previousPath is where the version before this one is kept: in Dir when
// that is on the app's volume (a rename), else next to the app.
func (u *Updater) previousPath() string {
	name := filepath.Base(u.cfg.App)
	in := filepath.Join(u.cfg.Dir, "previous", name)
	if sameVolume(u.cfg.Dir, filepath.Dir(u.cfg.App)) {
		return in
	}
	return filepath.Join(filepath.Dir(u.cfg.App), "."+name+".previous")
}

func (u *Updater) previousOK() bool {
	_, err := ReadInfo(u.previousPath())
	return err == nil
}

func sameVolume(a, b string) bool {
	var sa, sb syscall.Stat_t
	if syscall.Stat(a, &sa) != nil || syscall.Stat(b, &sb) != nil {
		return false
	}
	return sa.Dev == sb.Dev
}

func (u *Updater) resultPath() string { return filepath.Join(u.cfg.Dir, "last-result.txt") }

func (u *Updater) statePath() string { return filepath.Join(u.cfg.Dir, "state.json") }

// JustInstalled reports, before New reads it, whether the last swap in dir
// (Config.Dir) put a version in: the swap has already restarted the
// background LaunchAgent on the new helper, so the app need not again.
func JustInstalled(dir string) bool {
	b, err := os.ReadFile(filepath.Join(dir, "last-result.txt"))
	return err == nil && strings.HasSuffix(strings.TrimSpace(string(b)), ": installed")
}

func (u *Updater) load() {
	b, err := os.ReadFile(u.statePath())
	if err == nil {
		_ = json.Unmarshal(b, &u.saved)
	}
}

func (u *Updater) save() {
	u.mu.Lock()
	b, err := json.MarshalIndent(u.saved, "", "  ")
	u.mu.Unlock()
	if err != nil {
		return
	}
	tmp := u.statePath() + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, u.statePath())
	}
}

func (u *Updater) dropStaged() {
	u.mu.Lock()
	if s := u.saved.Staged; s != nil {
		os.RemoveAll(filepath.Dir(s.Path))
	}
	u.saved.Staged = nil
	u.pending = nil
	u.mu.Unlock()
	u.save()
}
