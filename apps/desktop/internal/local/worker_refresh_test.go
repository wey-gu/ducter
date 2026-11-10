package local

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// D167: the author's Mac. The app updated to 0.0.7; its worker LaunchAgent
// still ran 0.0.6 from memory and the home showed "0.0.6 · update to 0.0.7".
// At the app's start, a worker that last said an older version is restarted
// once, and a plist that names a helper elsewhere is written again. A fake
// launchctl: no real LaunchAgent is touched.
func TestWorkerRefreshRestartsAnOldWorkerOnce(t *testing.T) {
	f := &fakeLaunchd{loaded: true}
	data := t.TempDir()
	cli := "/Applications/Ducter.app/Contents/Helpers/ducter"
	w := NewMacWorker("co.nowledge.ducter", cli, data, "zh")
	w.Agent.Dir, w.Agent.Launchctl = t.TempDir(), f.run
	alive := func(v string) {
		os.MkdirAll(filepath.Join(data, "updates"), 0o700)
		os.WriteFile(filepath.Join(data, "updates", "alive.json"), []byte(`{"version":"`+v+`","at":"2026-11-10T00:00:00Z","pid":1}`), 0o600)
	}
	// Not a worker: nothing.
	if did, err := w.Refresh("0.0.7"); did != "" || err != nil || len(f.calls) != 0 {
		t.Fatalf("not a worker: %q %v %v", did, err, f.calls)
	}
	if err := w.save(WorkerSaved{URL: "https://hel.example.com", Token: "dvc.w", DeviceID: "w1", Name: "Siweis-MacBook-Pro"}); err != nil {
		t.Fatal(err)
	}
	os.MkdirAll(w.Agent.Dir, 0o755)
	os.WriteFile(w.Agent.PlistPath(), w.Agent.Plist(w.Env), 0o644)

	alive("0.0.6")
	f.calls = nil
	did, err := w.Refresh("0.0.7")
	restart := "kickstart -k gui/" + strconv.Itoa(os.Getuid()) + "/co.nowledge.ducter.worker"
	if did != "restarted" || err != nil || strings.Join(f.calls, "|") != restart {
		t.Fatalf("an old worker: %q %v %v", did, err, f.calls)
	}
	// Once per version: it may not be able to reach its home to say the new one.
	f.calls = nil
	if did, _ := w.Refresh("0.0.7"); did != "" || len(f.calls) != 0 {
		t.Fatalf("again: %q %v", did, f.calls)
	}
	// On the app's version (or newer, or a dev build's word): left alone.
	os.Remove(filepath.Join(data, "updates", "worker-restarted"))
	for _, v := range []string{"0.0.7", "0.0.8", "dev"} {
		alive(v)
		if did, _ := w.Refresh("0.0.7"); did != "" {
			t.Fatalf("%s: %q", v, did)
		}
	}
	// A plist that names the bundle the update moved aside: written again on this helper.
	moved := NewMacWorker("co.nowledge.ducter", "/Applications/.Ducter.app.previous/Contents/Helpers/ducter", data, "zh")
	os.WriteFile(w.Agent.PlistPath(), moved.Agent.Plist(w.Env), 0o644)
	f.calls = nil
	if did, err := w.Refresh("0.0.7"); did != "reloaded" || err != nil {
		t.Fatalf("moved: %q %v", did, err)
	}
	if b, _ := os.ReadFile(w.Agent.PlistPath()); !strings.Contains(string(b), "<string>"+cli+"</string>") {
		t.Fatalf("plist still names %s", b)
	}
}
