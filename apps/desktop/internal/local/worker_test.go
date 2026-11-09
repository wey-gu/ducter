package local

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
)

// D155: Let this Mac do tasks, against a fake launchctl and a fake home: no
// real LaunchAgent is written under ~/Library or loaded, no network.
func TestMacWorkerOnAndOff(t *testing.T) {
	f := &fakeLaunchd{}
	data := t.TempDir()
	issued, paired := 0, []remote.PairInfo{}
	w := NewMacWorker("co.nowledge.ducter", "/Applications/Ducter.app/Contents/Helpers/ducter", data, "zh")
	w.Agent.Dir, w.Agent.Launchctl, w.Computer = t.TempDir(), f.run, "Siweis-MacBook-Pro"
	w.IssueCode = func(_ context.Context, base, token string) (string, error) {
		if base != "https://hel.example.com" || token != "dvc.app" {
			t.Fatalf("code asked of %s with %s", base, token)
		}
		issued++
		return "K7QM-4XPA", nil
	}
	w.Pair = func(_ context.Context, base, code string, info remote.PairInfo) (remote.Saved, error) {
		paired = append(paired, info)
		return remote.Saved{Token: "dvc.worker", DeviceID: "w1", Persona: "Ducter", Name: info.Name}, nil
	}

	if on, _ := w.On("wss://hel.example.com/ws"); on {
		t.Fatal("on before it was asked")
	}
	if _, err := w.Start(context.Background(), "wss://hel.example.com/ws", ""); !errors.Is(err, ErrNoToken) {
		t.Fatalf("no token: %v", err)
	}
	s, err := w.Start(context.Background(), "wss://hel.example.com/ws", "dvc.app")
	if err != nil {
		t.Fatal(err)
	}
	if s.DeviceID != "w1" || issued != 1 || paired[0] != (remote.PairInfo{Name: "Siweis-MacBook-Pro", Role: "worker", Computer: "Siweis-MacBook-Pro"}) {
		t.Fatalf("paired %+v issued %d saved %+v", paired, issued, s)
	}
	// worker.json is what `ducter worker` reads, owner-only.
	b, _ := os.ReadFile(filepath.Join(data, "worker.json"))
	var got map[string]string
	_ = json.Unmarshal(b, &got)
	if got["url"] != "https://hel.example.com" || got["token"] != "dvc.worker" || got["deviceId"] != "w1" || got["name"] != "Siweis-MacBook-Pro" {
		t.Fatalf("worker.json: %s", b)
	}
	if st, _ := os.Stat(filepath.Join(data, "worker.json")); st.Mode().Perm() != 0o600 {
		t.Fatalf("worker.json mode %v", st.Mode())
	}
	// The LaunchAgent: ducter worker, kept alive, worker.log, launchd's exit rule.
	plist := w.Agent.PlistPath()
	if filepath.Base(plist) != "co.nowledge.ducter.worker.plist" || !strings.HasPrefix(plist, w.Agent.Dir) {
		t.Fatalf("plist at %s", plist)
	}
	pb, _ := os.ReadFile(plist)
	for _, want := range []string{"<string>/Applications/Ducter.app/Contents/Helpers/ducter</string>\n\t\t<string>worker</string>\n\t</array>", "worker.log", "<key>SuccessfulExit</key>", "<key>RunAtLoad</key>", "<key>DUCTER_SUPERVISOR</key>\n\t\t<string>launchd</string>", "<key>DUCTER_DATA_DIR</key>"} {
		if !strings.Contains(string(pb), want) {
			t.Errorf("plist lacks %q", want)
		}
	}
	if strings.Contains(string(pb), "DUCTER_PORT") || strings.Contains(string(pb), "dvc.") {
		t.Error("the worker's plist carries no port and never a token")
	}
	if out, err := exec.Command("/usr/bin/plutil", "-lint", plist).CombinedOutput(); err != nil {
		t.Fatalf("plutil: %v %s", err, out)
	}
	if !f.loaded || f.calls[len(f.calls)-1] != "bootstrap gui/"+strconv.Itoa(os.Getuid())+" "+plist {
		t.Fatalf("launchctl: %v", f.calls)
	}
	if on, id := w.On("https://hel.example.com"); !on || id != "w1" {
		t.Fatalf("on %v %s", on, id)
	}
	if on, _ := w.On("https://other.example.com"); on {
		t.Fatal("on for another Ducter")
	}
	// Again (after a restart of the app): the saved worker is reused, no second device.
	if _, err := w.Start(context.Background(), "https://hel.example.com", "dvc.app"); err != nil || issued != 1 {
		t.Fatalf("again: %v issued %d", err, issued)
	}

	id, err := w.Stop()
	if err != nil || id != "w1" {
		t.Fatalf("stop: %s %v", id, err)
	}
	if f.loaded || w.Agent.Installed() || w.Saved() != nil {
		t.Fatalf("still there: loaded %v plist %v", f.loaded, w.Agent.Installed())
	}
	if on, _ := w.On("https://hel.example.com"); on {
		t.Fatal("on after off")
	}
}
