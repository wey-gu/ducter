package update

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// D187: the app's side of an update asked from the phone. The Ducter on
// this Mac writes app-ask.json; the app answers in app.json
// (packages/core/src/app-update.ts is the other side, with its own tests).

func writeAskFile(t *testing.T, dir string, k Ask) {
	t.Helper()
	b, _ := json.Marshal(k)
	if err := os.WriteFile(filepath.Join(dir, "app-ask.json"), b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func readAppSide(t *testing.T, dir string) AppSide {
	t.Helper()
	var s AppSide
	b, err := os.ReadFile(filepath.Join(dir, "app.json"))
	if os.IsNotExist(err) {
		return s // not written yet
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestAsksGetThenRestart(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	dir := t.TempDir()
	restarted, helper := 0, 0
	a := &Asks{Dir: dir, U: w.u, Restart: func() { restarted++ }, RestartHelper: func() error { helper++; return nil }}
	a.Beat()
	if s := readAppSide(t, dir); s.Current != "0.1.0" || s.State != "idle" || s.At == "" || s.Pid == 0 {
		t.Fatalf("heartbeat %+v", s)
	}

	writeAskFile(t, dir, Ask{ID: "k1", To: "0.2.0", Step: "get"})
	a.Step(context.Background())
	eventually(t, func() bool { s := readAppSide(t, dir); return s.Asked == "k1" && s.State == "ready" })
	s := readAppSide(t, dir)
	if s.Version != "0.2.0" || !s.CanRestart {
		t.Fatalf("ready %+v", s)
	}
	// The same ask read again starts nothing twice.
	a.Step(context.Background())

	writeAskFile(t, dir, Ask{ID: "k1", To: "0.2.0", Step: "restart"})
	a.Step(context.Background())
	if restarted != 1 || helper != 0 {
		t.Fatalf("restart %d helper %d", restarted, helper)
	}
	if _, err := os.Stat(filepath.Join(dir, "app-ask.json")); !os.IsNotExist(err) {
		t.Fatal("a restart ask is taken once: the app that opens after the swap must not restart again")
	}
}

func TestAsksRestartHelperWhenTheAppIsAlreadyThere(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	dir := t.TempDir()
	restarted, helper := 0, 0
	a := &Asks{Dir: dir, U: w.u, Restart: func() { restarted++ }, RestartHelper: func() error { helper++; return nil }}
	writeAskFile(t, dir, Ask{ID: "k2", To: "0.1.0", Step: "restart"})
	a.Step(context.Background())
	if restarted != 0 || helper != 1 {
		t.Fatalf("restart %d helper %d", restarted, helper)
	}
}

func TestAsksGetFindsNothingNewer(t *testing.T) {
	w := setup(t, "0.1.0", "TEAM", nil)
	dir := t.TempDir()
	a := &Asks{Dir: dir, U: w.u}
	writeAskFile(t, dir, Ask{ID: "k3", To: "0.2.0", Step: "get"})
	a.Step(context.Background())
	eventually(t, func() bool { return readAppSide(t, dir).Asked == "k3" })
	// The feed has nothing newer and nothing is downloadable by tag here: the
	// answer says so instead of "ready".
	if s := readAppSide(t, dir); s.State == "ready" {
		t.Fatalf("%+v", s)
	}
}

func TestGoneRemovesTheHeartbeat(t *testing.T) {
	w := setup(t, "0.2.0", "TEAM", nil)
	dir := t.TempDir()
	a := &Asks{Dir: dir, U: w.u}
	a.Beat()
	a.Gone()
	if _, err := os.Stat(filepath.Join(dir, "app.json")); !os.IsNotExist(err) {
		t.Fatal("app.json stays after the app quit")
	}
}
