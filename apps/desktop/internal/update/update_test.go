package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCompare(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want int
	}{
		{"0.1.0", "0.1.0", 0},
		{"v0.2.0", "0.1.9", 1},
		{"0.1.10", "0.1.9", 1},
		{"1.0.0", "0.99.99", 1},
		{"0.2.0-beta.1", "0.2.0", -1},
		{"0.2.0-beta.2", "0.2.0-beta.10", -1},
		{"0.2.0-beta.1", "0.2.0-alpha.9", 1},
		{"0.2.0-1", "0.2.0-beta", -1},
		{"0.2.0+abc", "0.2.0+def", 0},
		{"garbage", "0.0.1", -1},
		{"0.1", "0.0.1", -1},
	} {
		if got := Compare(c.a, c.b); got != c.want {
			t.Errorf("Compare(%q, %q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestSumFor(t *testing.T) {
	sum := strings.Repeat("ab", 32)
	listing := []byte(sum + "  Ducter-0.2.0-arm64.dmg\n" + strings.Repeat("cd", 32) + " *ducter-0.2.0-linux-x64.tar.gz\n")
	got, err := SumFor(listing, "Ducter-0.2.0-arm64.dmg")
	if err != nil || hex.EncodeToString(got) != sum {
		t.Fatalf("got %x %v", got, err)
	}
	if _, err := SumFor(listing, "ducter-0.2.0-linux-x64.tar.gz"); err != nil {
		t.Fatal(err)
	}
	if _, err := SumFor(listing, "Ducter-0.3.0-arm64.dmg"); err == nil {
		t.Fatal("a missing file has no sum")
	}
}

// fixture: a fake app bundle at dir/name with an id and a version.
func writeApp(t *testing.T, dir, id, version, team string) string {
	t.Helper()
	app := filepath.Join(dir, "Ducter.app")
	if err := os.MkdirAll(filepath.Join(app, "Contents", "MacOS"), 0o755); err != nil {
		t.Fatal(err)
	}
	plist := fmt.Sprintf("<plist><dict><key>CFBundleIdentifier</key>\n<string>%s</string><key>CFBundleShortVersionString</key><string>%s</string></dict></plist>", id, version)
	os.WriteFile(filepath.Join(app, "Contents", "Info.plist"), []byte(plist), 0o644)
	os.WriteFile(filepath.Join(app, "Contents", "MacOS", "Ducter"), []byte("binary "+version), 0o755)
	os.WriteFile(filepath.Join(app, "Contents", "team"), []byte(team), 0o644)
	return app
}

// fakeCheck: the team is the bundle's Contents/team file; a "broken" file
// breaks the signature; Mount maps a disk image's bytes to a folder.
type fakeCheck struct {
	mu        sync.Mutex
	images    map[string]string // sha of image bytes -> folder holding Ducter.app
	gatekeep  error
	verified  []string
	mountedAt []string
}

func (f *fakeCheck) Team(app string) (string, error) {
	b, err := os.ReadFile(filepath.Join(app, "Contents", "team"))
	if err != nil {
		return "", nil
	}
	return string(b), nil
}

func (f *fakeCheck) Signature(app, team string) error {
	f.mu.Lock()
	f.verified = append(f.verified, app)
	f.mu.Unlock()
	if exists(filepath.Join(app, "Contents", "broken")) {
		return errors.New("a sealed resource is missing or invalid")
	}
	if got, _ := f.Team(app); got != team {
		return fmt.Errorf("test-requirement: team %q != %q", got, team)
	}
	return nil
}

func (f *fakeCheck) Gatekeeper(string) error { return f.gatekeep }

func (f *fakeCheck) Mount(dmg string) (string, func(), error) {
	b, err := os.ReadFile(dmg)
	if err != nil {
		return "", nil, err
	}
	s := sha256.Sum256(b)
	dir, ok := f.images[hex.EncodeToString(s[:])]
	if !ok {
		return "", nil, errors.New("hdiutil: not a disk image")
	}
	f.mu.Lock()
	f.mountedAt = append(f.mountedAt, dir)
	f.mu.Unlock()
	return dir, func() {}, nil
}

func (f *fakeCheck) Copy(src, dst string) error {
	return exec.Command("cp", "-R", src, dst).Run()
}

// feed serves a fake GitHub release: the API document, the image, the sums.
type feed struct {
	srv     *httptest.Server
	version string
	image   []byte
	sums    string // overrides the right listing when set
	status  int    // the API's answer, when not 200
}

func newFeed(t *testing.T, version string, image []byte) *feed {
	f := &feed{version: version, image: image}
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/wey-gu/ducter/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		if f.status != 0 {
			w.WriteHeader(f.status)
			return
		}
		name := "Ducter-" + f.version + "-arm64.dmg"
		json.NewEncoder(w).Encode(map[string]any{
			"tag_name": "v" + f.version, "html_url": f.srv.URL + "/release",
			"assets": []map[string]any{
				{"name": name, "browser_download_url": f.srv.URL + "/dl/" + name, "size": len(f.image)},
				{"name": "SHA256SUMS.txt", "browser_download_url": f.srv.URL + "/dl/SHA256SUMS.txt", "size": 100},
			},
		})
	})
	mux.HandleFunc("/dl/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/dl/")
		if name == "SHA256SUMS.txt" {
			if f.sums != "" {
				fmt.Fprint(w, f.sums)
				return
			}
			s := sha256.Sum256(f.image)
			fmt.Fprintf(w, "%x  Ducter-%s-arm64.dmg\n", s, f.version)
			return
		}
		w.Write(f.image)
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *feed) url() string { return f.srv.URL + "/repos/wey-gu/ducter/releases/latest" }

type world struct {
	apps, support string
	app           string
	check         *fakeCheck
	feed          *feed
	u             *Updater
}

// setup: the running app 0.1.0 of team TEAM in a scratch Applications, and
// a feed offering newVersion built by newTeam.
func setup(t *testing.T, newVersion, newTeam string, tweak func(app string)) *world {
	t.Helper()
	root := t.TempDir()
	w := &world{apps: filepath.Join(root, "Applications"), support: filepath.Join(root, "Support", "updates")}
	os.MkdirAll(w.apps, 0o755)
	w.app = writeApp(t, w.apps, "co.nowledge.ducter", "0.1.0", "TEAM")
	img := filepath.Join(root, "image-"+newVersion)
	newApp := writeApp(t, img, "co.nowledge.ducter", newVersion, newTeam)
	if tweak != nil {
		tweak(newApp)
	}
	image := []byte("dmg of " + newVersion + " by " + newTeam)
	s := sha256.Sum256(image)
	w.check = &fakeCheck{images: map[string]string{hex.EncodeToString(s[:]): img}}
	w.feed = newFeed(t, newVersion, image)
	u, err := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if err != nil {
		t.Fatal(err)
	}
	w.u = u
	return w
}

func TestCheckStagesAVerifiedUpdate(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	st := w.u.CheckNow(context.Background())
	if st.State != Ready || st.Version != "0.2.0" || !st.InstallOnQuit {
		t.Fatalf("status %+v", st)
	}
	staged := filepath.Join(w.apps, ".Ducter.app.update-0.2.0", "Ducter.app")
	if in, err := ReadInfo(staged); err != nil || in.Version != "0.2.0" {
		t.Fatalf("staged %v %v", in, err)
	}
	// The disk image is gone once the app is out; the state is kept.
	if ents, _ := os.ReadDir(filepath.Join(w.support, "0.2.0")); len(ents) != 0 {
		t.Fatalf("download left behind: %v", ents)
	}
	// A new run finds it ready again.
	u2, err := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if err != nil || u2.Status().State != Ready || u2.Status().Version != "0.2.0" {
		t.Fatalf("relaunch: %+v %v", u2.Status(), err)
	}
}

func TestUpToDateAndNoFeed(t *testing.T) {
	w := setup(t, "0.1.0", "TEAM", nil)
	if st := w.u.CheckNow(context.Background()); st.State != UpToDate {
		t.Fatalf("same version: %+v", st)
	}
	w.feed.status = http.StatusNotFound // the repo is private
	st := w.u.CheckNow(context.Background())
	if st.State != NoFeed || st.Reason != ReasonNone || st.CheckedAt.IsZero() {
		t.Fatalf("404: %+v", st)
	}
	w.feed.status = http.StatusInternalServerError
	if st := w.u.CheckNow(context.Background()); st.State != Failed || st.Reason != ReasonNetwork {
		t.Fatalf("500: %+v", st)
	}
}

func TestChecksumMismatchIsRefused(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.feed.sums = strings.Repeat("00", 32) + "  Ducter-0.2.0-arm64.dmg\n"
	st := w.u.CheckNow(context.Background())
	if st.State != Failed || st.Reason != ReasonChecksum {
		t.Fatalf("status %+v", st)
	}
	if len(w.check.mountedAt) != 0 {
		t.Fatal("a disk image that fails its sum is never mounted")
	}
	if exists(filepath.Join(w.apps, ".Ducter.app.update-0.2.0")) {
		t.Fatal("nothing is staged")
	}
}

func TestSignatureMismatchIsRefused(t *testing.T) {
	for name, c := range map[string]struct {
		team  string
		tweak func(string)
		want  Reason
	}{
		"another team":     {"EVIL", nil, ReasonSignature},
		"broken signature": {"TEAM", func(app string) { os.WriteFile(filepath.Join(app, "Contents", "broken"), nil, 0o644) }, ReasonSignature},
		"another app": {"TEAM", func(app string) {
			writeApp(t, filepath.Dir(app), "com.example.other", "0.2.0", "TEAM")
		}, ReasonBundle},
		"version lies": {"TEAM", func(app string) {
			writeApp(t, filepath.Dir(app), "co.nowledge.ducter", "0.0.9", "TEAM")
		}, ReasonBundle},
	} {
		t.Run(name, func(t *testing.T) {
			w := setup(t, "0.2.0", c.team, c.tweak)
			st := w.u.CheckNow(context.Background())
			if st.State != Failed || st.Reason != c.want {
				t.Fatalf("status %+v", st)
			}
			if exists(filepath.Join(w.apps, ".Ducter.app.update-0.2.0")) {
				t.Fatal("a refused copy is removed")
			}
			if started, _ := w.u.Quit(true); started {
				t.Fatal("nothing to swap in")
			}
		})
	}
}

func TestGatekeeperRefusal(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.check.gatekeep = errors.New("rejected (the code is valid but does not seem to be an app)")
	if st := w.u.CheckNow(context.Background()); st.State != Failed || st.Reason != ReasonGatekeep {
		t.Fatalf("status %+v", st)
	}
}

func TestUnsignedBuildOnlySaysAvailable(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	os.Remove(filepath.Join(w.app, "Contents", "team")) // ad hoc
	st := w.u.CheckNow(context.Background())
	if st.State != Available || st.Reason != ReasonUnsigned || st.Page == "" {
		t.Fatalf("status %+v", st)
	}
}

func TestDiskImageLocationOnlySaysAvailable(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.u.cfg.App = "/Volumes/Ducter/Ducter.app"
	if st := w.u.CheckNow(context.Background()); st.State != Available || st.Reason != ReasonLocation {
		t.Fatalf("status %+v", st)
	}
}

// waitFor polls the result file the swap writes.
func waitFor(t *testing.T, path string) string {
	t.Helper()
	for i := 0; i < 200; i++ {
		if b, err := os.ReadFile(path); err == nil && len(b) > 0 {
			return strings.TrimSpace(string(b))
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("no result in %s", path)
	return ""
}

func version(t *testing.T, app string) string {
	in, err := ReadInfo(app)
	if err != nil {
		t.Fatal(err)
	}
	return in.Version
}

func TestSwapOnQuitThenRollBack(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	if st := w.u.CheckNow(context.Background()); st.State != Ready {
		t.Fatalf("status %+v", st)
	}
	// The "app" is a process the swap waits for.
	app := exec.Command("sleep", "0.4")
	app.Start()
	w.u.cfg.Pid = app.Process.Pid
	started, err := w.u.Quit(false)
	if !started || err != nil {
		t.Fatalf("quit: %v %v", started, err)
	}
	if version(t, w.app) != "0.1.0" {
		t.Fatal("nothing moves while the app runs")
	}
	app.Wait()
	if r := waitFor(t, filepath.Join(w.support, "last-result.txt")); r != "update: installed" {
		t.Fatalf("result %q", r)
	}
	if version(t, w.app) != "0.2.0" {
		t.Fatal("the new version is in place")
	}
	prev := filepath.Join(w.support, "previous", "Ducter.app")
	if version(t, prev) != "0.1.0" {
		t.Fatal("the previous version is kept")
	}
	if exists(filepath.Join(w.apps, ".Ducter.app.update-0.2.0")) {
		t.Fatal("the stage folder is cleaned up")
	}

	// The new version starts; it offers a roll back to 0.1.0.
	u, err := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if err != nil || !u.Status().CanRollBack || u.Status().Current != "0.2.0" {
		t.Fatalf("after: %+v %v", u.Status(), err)
	}
	if err := u.RollBackOnQuit(); err != nil {
		t.Fatal(err)
	}
	app = exec.Command("sleep", "0.2")
	app.Start()
	u.cfg.Pid = app.Process.Pid
	if started, err := u.Quit(false); !started || err != nil {
		t.Fatalf("rollback quit: %v %v", started, err)
	}
	app.Wait()
	if r := waitFor(t, filepath.Join(w.support, "last-result.txt")); r != "rollback to 0.1.0: installed" {
		t.Fatalf("result %q", r)
	}
	if version(t, w.app) != "0.1.0" || version(t, prev) != "0.2.0" {
		t.Fatal("rolled back, the bad version kept aside")
	}
	// 0.2.0 is never offered again.
	u3, _ := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if st := u3.CheckNow(context.Background()); st.State != UpToDate {
		t.Fatalf("skipped version offered: %+v", st)
	}
}

func TestQuitRespectsTheChoice(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.u.CheckNow(context.Background())
	w.u.SetInstallOnQuit(false)
	if started, _ := w.u.Quit(false); started {
		t.Fatal("off: a plain quit doesn't install")
	}
	u, _ := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if u.InstallOnQuit() {
		t.Fatal("the choice is kept")
	}
}

func TestStagedCopyIsCheckedAgainBeforeTheSwap(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.u.CheckNow(context.Background())
	staged := filepath.Join(w.apps, ".Ducter.app.update-0.2.0", "Ducter.app")
	os.WriteFile(filepath.Join(staged, "Contents", "broken"), nil, 0o644) // tampered with on disk
	started, err := w.u.Quit(true)
	if started || err == nil {
		t.Fatalf("a tampered copy is never swapped in: %v %v", started, err)
	}
	if version(t, w.app) != "0.1.0" || w.u.Status().State != Failed {
		t.Fatalf("status %+v", w.u.Status())
	}
}

func TestSwapPutsTheOldOneBackWhenTheNewOneCantMove(t *testing.T) {
	root := t.TempDir()
	target := writeApp(t, filepath.Join(root, "apps"), "x", "1.0.0", "T")
	prev := filepath.Join(root, "prev", "Ducter.app")
	os.MkdirAll(filepath.Dir(prev), 0o755)
	result := filepath.Join(root, "result")
	missing := filepath.Join(root, "nowhere", "Ducter.app")
	out, err := exec.Command("/bin/sh", "-c", swapScript, "t", "999999", target, missing, prev, "", "", "0", result, "update").CombinedOutput()
	if err != nil {
		t.Fatalf("%v %s", err, out)
	}
	if r := waitFor(t, result); !strings.Contains(r, "the old one is back") {
		t.Fatalf("result %q", r)
	}
	if version(t, target) != "1.0.0" {
		t.Fatal("the running version is back in place")
	}
}
