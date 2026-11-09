package update

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// A swap that didn't happen (the old version opened again) is said in
// Settings at the next launch, not only logged.
func TestFailedSwapIsSaidAtTheNextLaunch(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	os.WriteFile(filepath.Join(w.support, "last-result.txt"), []byte("update: couldn't move the running version aside; nothing changed\n"), 0o644)
	u, err := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check})
	if err != nil {
		t.Fatal(err)
	}
	if st := u.Status(); st.State != Failed || st.Reason != ReasonInstall {
		t.Fatalf("status %+v", st)
	}
	os.WriteFile(filepath.Join(w.support, "last-result.txt"), []byte("update: installed\n"), 0o644)
	if u, _ := New(Config{App: w.app, Feed: w.feed.url(), Arch: "arm64", Dir: w.support, Check: w.check}); u.Status().State != Idle {
		t.Fatalf("installed: %+v", u.Status())
	}
}

// Ducter.app installed with sudo: the swap's rename would fail, so the
// update waits for PrepareRestart to make the bundle the person's own (a
// password prompt), and the app never quits into the old version.
func TestBundleNotOursAsksBeforeTheRestart(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("root can write anything")
	}
	w := setup(t, "0.2.0", "TEAM", nil)
	if st := w.u.CheckNow(context.Background()); st.State != Ready {
		t.Fatalf("status %+v", st)
	}
	os.Chmod(w.app, 0o555)
	t.Cleanup(func() { os.Chmod(w.app, 0o755) })
	if started, err := w.u.Quit(true); started || err == nil {
		t.Fatalf("swapped a bundle it can't move: %v %v", started, err)
	}
	asked := 0
	w.u.cfg.Authorize = func(string) error { asked++; return errors.New("User canceled.") }
	if err := w.u.PrepareRestart(); err == nil || asked != 1 || w.u.Status().Reason != ReasonOwner || w.u.Status().State != Ready {
		t.Fatalf("declined: %v %d %+v", err, asked, w.u.Status())
	}
	w.u.cfg.Authorize = func(app string) error { asked++; return os.Chmod(app, 0o755) }
	if err := w.u.PrepareRestart(); err != nil || asked != 2 || w.u.Status().Reason != ReasonNone {
		t.Fatalf("given: %v %+v", err, w.u.Status())
	}
}
