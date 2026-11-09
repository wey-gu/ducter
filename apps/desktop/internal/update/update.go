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
	ReasonNetwork   Reason = "network"    // couldn't reach GitHub
	ReasonChecksum  Reason = "checksum"   // the download doesn't match SHA256SUMS.txt
	ReasonSignature Reason = "signature"  // not signed by the same team, or the signature is broken
	ReasonGatekeep  Reason = "gatekeeper" // macOS wouldn't open it
	ReasonBundle    Reason = "bundle"     // another app, or another version than the feed said
	ReasonDisk      Reason = "disk"       // couldn't write the download or the copy
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
}

// Config is where the app is and what to check with.
type Config struct {
	App        string // the running .app
	Feed       string // DefaultFeed unless a test serves its own
	Arch       string // "arm64" or "x86_64"; default from runtime.GOARCH
	Dir        string // ~/Library/Application Support/Ducter/updates
	AgentLabel string // the background LaunchAgent to restart after a swap ("" none)
	AgentPlist string // its plist: restarted only when it is there (not resting)
	HTTP       *http.Client
	Check      Checker
	Now        func() time.Time
	// OnChange is called after every change of Status, on any goroutine.
	OnChange func(Status)
	Logf     func(format string, args ...any)
	// Pid is the process the swap waits for (default: this one).
	Pid int
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
	if err := os.MkdirAll(cfg.Dir, 0o755); err != nil {
		return nil, err
	}
	u := &Updater{cfg: cfg, info: info}
	u.load()
	u.st = Status{State: Idle, Current: info.Version, CheckedAt: u.saved.CheckedAt, InstallOnQuit: u.installOnQuit(), CanRollBack: u.previousOK()}
	if r, err := os.ReadFile(u.resultPath()); err == nil {
		cfg.Logf("ducter: last update: %s", strings.TrimSpace(string(r)))
		os.Remove(u.resultPath())
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
// so a Mac that slept through the day still asks when it wakes).
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
				if u.cfg.Now().Sub(u.Status().CheckedAt) >= 24*time.Hour {
					u.CheckNow(ctx)
				}
			}
		}
	}()
}

// CheckNow reads the feed and, when there is a newer version, downloads and
// checks it. It returns the resulting status; a check already running is not
// started twice (the current status comes back).
func (u *Updater) CheckNow(ctx context.Context) Status {
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
	rel, err := FetchRelease(ctx, u.cfg.HTTP, u.cfg.Feed, u.cfg.Arch)
	now := u.cfg.Now()
	u.mu.Lock()
	u.saved.CheckedAt = now
	u.mu.Unlock()
	u.save()
	if err != nil {
		if errors.Is(err, ErrNoFeed) {
			u.cfg.Logf("ducter: update check: %v", err)
			u.set(func(s *Status) { s.State, s.CheckedAt = NoFeed, now })
		} else {
			u.fail(ReasonNetwork, err, now)
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
		u.set(func(s *Status) { s.State, s.Reason, s.Detail = Available, ReasonUnsigned, "this build has no Developer ID team" })
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
	if r, err := u.verify(dst, rel.Version, team); err != nil {
		os.RemoveAll(stage)
		return "", r, err
	}
	return dst, ReasonNone, nil
}

// verify checks a copy of the app before it may replace the running one.
func (u *Updater) verify(app, version, team string) (Reason, error) {
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
	p := u.pending
	st := u.st
	u.mu.Unlock()
	if p == nil || st.State != Ready || !(relaunch || st.InstallOnQuit || strings.HasPrefix(p.note, "rollback")) {
		return false, nil
	}
	// The copy is checked again: it sat on disk since it was staged.
	if p.note == "update" {
		team, err := u.cfg.Check.Team(u.cfg.App)
		if err != nil || team == "" {
			return false, fmt.Errorf("the running app's team: %v", err)
		}
		if r, err := u.verify(p.from, st.Version, team); err != nil {
			u.dropStaged()
			u.fail(r, err, u.cfg.Now())
			return false, err
		}
	}
	if err := os.MkdirAll(filepath.Dir(p.prev), 0o755); err != nil {
		return false, err
	}
	rl := "0"
	if relaunch {
		rl = "1"
	}
	cmd := exec.Command("/bin/sh", "-c", swapScript, "ducter-update",
		fmt.Sprint(u.cfg.Pid), u.cfg.App, p.from, p.prev, u.cfg.AgentLabel, u.cfg.AgentPlist, rl, u.resultPath(), p.note)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return false, err
	}
	_ = cmd.Process.Release()
	u.mu.Lock()
	u.saved.Staged = nil // done or not, the next launch starts clean
	u.mu.Unlock()
	u.save()
	u.cfg.Logf("ducter: %s starts once the app has quit", p.note)
	return true, nil
}

// swapScript: $1 pid, $2 the running app, $3 the new bundle, $4 where the
// running one is kept, $5 the LaunchAgent label, $6 its plist, $7 relaunch,
// $8 the result file, $9 what this is. The waits are capped: a stuck app
// leaves everything as it was.
const swapScript = `pid=$1 target=$2 new=$3 prev=$4 label=$5 plist=$6 relaunch=$7 result=$8 what=$9
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
	/bin/launchctl kickstart -k "gui/$(id -u)/$label" >/dev/null 2>&1
fi
if [ "$relaunch" = 1 ]; then exec /usr/bin/open "$target"; fi
`

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
func (u *Updater) statePath() string  { return filepath.Join(u.cfg.Dir, "state.json") }

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
