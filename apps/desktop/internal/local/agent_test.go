package local

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// fakeLaunchd records launchctl calls and keeps one "loaded" flag.
type fakeLaunchd struct {
	calls  []string
	loaded bool
}

func (f *fakeLaunchd) run(args ...string) (string, error) {
	f.calls = append(f.calls, strings.Join(args, " "))
	switch args[0] {
	case "print":
		if !f.loaded {
			return "", errors.New("not found")
		}
	case "bootstrap":
		f.loaded = true
	case "bootout":
		f.loaded = false
	}
	return "", nil
}

func newAgent(t *testing.T) (*Agent, *fakeLaunchd) {
	f := &fakeLaunchd{}
	a := &Agent{Label: AgentLabel("dev.ducter.app"), BundleID: "dev.ducter.app", CLI: "/Applications/Ducter.app/Contents/Helpers/ducter",
		DataDir: t.TempDir(), Dir: t.TempDir(), Launchctl: f.run}
	return a, f
}

func TestAgentPlistIsValid(t *testing.T) {
	a, _ := newAgent(t)
	env := map[string]string{"PATH": "/usr/bin:/bin", "DUCTER_PORT": "7870", "DUCTER_SCRIPTED_MODEL": "1", "X": "a<b&c"}
	p := filepath.Join(t.TempDir(), "a.plist")
	os.WriteFile(p, a.Plist(env), 0o644)
	if out, err := exec.Command("/usr/bin/plutil", "-lint", p).CombinedOutput(); err != nil {
		t.Fatalf("plutil: %v %s", err, out)
	}
	s := string(a.Plist(env))
	for _, want := range []string{"<string>dev.ducter.app.ducter</string>", "<string>up</string>", "<string>--no-desktop</string>",
		"<key>RunAtLoad</key>", "<key>SuccessfulExit</key>", "app.log", "a&lt;b&amp;c", "<key>AssociatedBundleIdentifiers</key>"} {
		if !strings.Contains(s, want) {
			t.Errorf("plist lacks %q", want)
		}
	}
	if strings.Contains(s, "DUCTER_PARENT_PID") {
		t.Error("a background Ducter must not watch the app's pid")
	}
}

func TestAgentInstallAndRemove(t *testing.T) {
	a, f := newAgent(t)
	env := map[string]string{"PATH": "/usr/bin"}
	if err := a.Install(env); err != nil {
		t.Fatal(err)
	}
	if !a.Installed() || !f.loaded || !strings.HasPrefix(f.calls[len(f.calls)-1], "bootstrap gui/") {
		t.Fatalf("calls %q", f.calls)
	}
	// Same plist, already loaded: just make sure it runs.
	f.calls = nil
	if err := a.Install(env); err != nil {
		t.Fatal(err)
	}
	if f.calls[len(f.calls)-1] != "kickstart gui/"+strconv.Itoa(os.Getuid())+"/dev.ducter.app.ducter" {
		t.Errorf("calls %q", f.calls)
	}
	// The app moved: reload.
	f.calls = nil
	a.CLI = "/Users/x/Applications/Ducter.app/Contents/Helpers/ducter"
	if err := a.Install(env); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(f.calls, "|"), "bootout") || !f.loaded {
		t.Errorf("calls %q", f.calls)
	}
	// Stop Ducter: unloaded, plist gone (so not at login either).
	if err := a.Remove(); err != nil {
		t.Fatal(err)
	}
	if a.Installed() || f.loaded {
		t.Error("still installed after Remove")
	}
}

func TestAgentEnv(t *testing.T) {
	t.Setenv("DUCTER_SCRIPTED_MODEL", "1")
	t.Setenv("DUCTER_PARENT_PID", "42")
	env := AgentEnv(7870, "/tmp/d", "zh")
	if env["DUCTER_PORT"] != "7870" || env["DUCTER_DATA_DIR"] != "/tmp/d" || env["DUCTER_SCRIPTED_MODEL"] != "1" || env["PATH"] == "" || env["HOME"] == "" {
		t.Errorf("%v", env)
	}
	if _, ok := env["DUCTER_PARENT_PID"]; ok {
		t.Error("parent pid leaked into the agent")
	}
}

func TestBundleID(t *testing.T) {
	app := filepath.Join(t.TempDir(), "Ducter.app")
	os.MkdirAll(filepath.Join(app, "Contents"), 0o755)
	os.WriteFile(filepath.Join(app, "Contents", "Info.plist"), []byte("<dict>\n\t<key>CFBundleIdentifier</key>\n\t<string>dev.ducter.app</string>\n</dict>"), 0o644)
	if got := BundleID(app); got != "dev.ducter.app" {
		t.Errorf("BundleID = %q", got)
	}
}
