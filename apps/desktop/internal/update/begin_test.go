package update

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// Restart to update starts the swap before the quit (Begin, while the window
// says so); the quit after it does nothing more, and the next launch knows
// which version went in.
func TestBeginStartsTheSwapBeforeTheQuit(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	if st := w.u.CheckNow(context.Background()); st.State != Ready {
		t.Fatalf("status %+v", st)
	}
	app := exec.Command("sleep", "0.4")
	app.Start()
	w.u.cfg.Pid = app.Process.Pid
	if started, err := w.u.Begin(false); !started || err != nil {
		t.Fatalf("begin: %v %v", started, err)
	}
	// Changed after Begin's check: a second check would refuse it, so a
	// clean Quit proves the quit runs no check of its own.
	staged := filepath.Join(w.apps, ".Ducter.app.update-0.2.0", "Ducter.app")
	os.WriteFile(filepath.Join(staged, "Contents", "broken"), nil, 0o644)
	if started, err := w.u.Quit(false); !started || err != nil {
		t.Fatalf("the quit after Begin: %v %v", started, err)
	}
	app.Wait()
	if r := waitFor(t, filepath.Join(w.support, "last-result.txt")); r != "update: installed" {
		t.Fatalf("result %q", r)
	}
	if !JustInstalled(w.support) {
		t.Fatal("the next launch sees the swap put a version in")
	}
	u, err := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if err != nil || u.Status().Installed != "0.2.0" || u.Status().State != Idle {
		t.Fatalf("after: %+v %v", u.Status(), err)
	}
	if JustInstalled(w.support) {
		t.Fatal("said once: New takes the result")
	}
}

// A copy that fails its check in Begin leaves the app as it was: nothing
// starts, Settings says why.
func TestBeginRefusesATamperedCopy(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	w.u.CheckNow(context.Background())
	staged := filepath.Join(w.apps, ".Ducter.app.update-0.2.0", "Ducter.app")
	os.WriteFile(filepath.Join(staged, "Contents", "broken"), nil, 0o644)
	if started, err := w.u.Begin(true); started || err == nil {
		t.Fatalf("begin: %v %v", started, err)
	}
	if st := w.u.Status(); st.State != Failed || st.Reason != ReasonSignature {
		t.Fatalf("status %+v", st)
	}
}
