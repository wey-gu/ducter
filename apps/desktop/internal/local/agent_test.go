package local

import (
	"errors"
	"net/http"
	"net/http/httptest"
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
	a := &Agent{Label: AgentLabel("co.nowledge.ducter"), BundleID: "co.nowledge.ducter", CLI: "/Applications/Ducter.app/Contents/Helpers/ducter",
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
	for _, want := range []string{"<string>co.nowledge.ducter.agent</string>", "<string>up</string>", "<string>--no-desktop</string>",
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
	if f.calls[len(f.calls)-1] != "kickstart gui/"+strconv.Itoa(os.Getuid())+"/co.nowledge.ducter.agent" {
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
	os.WriteFile(filepath.Join(app, "Contents", "Info.plist"), []byte("<dict>\n\t<key>CFBundleIdentifier</key>\n\t<string>co.nowledge.ducter</string>\n</dict>"), 0o644)
	if got := BundleID(app); got != "co.nowledge.ducter" {
		t.Errorf("BundleID = %q", got)
	}
}

func TestAgentStaleAndRestart(t *testing.T) {
	a, f := newAgent(t)
	if err := a.Install(map[string]string{"PATH": "/usr/bin"}); err != nil {
		t.Fatal(err)
	}
	build := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if build == "-" {
			w.Write([]byte(`{"ok":true,"headSeq":3}`)) // a Ducter older than the build field
			return
		}
		w.Write([]byte(`{"ok":true,"headSeq":3,"build":"` + build + `"}`))
	}))
	defer srv.Close()
	port, _ := strconv.Atoi(srv.URL[strings.LastIndex(srv.URL, ":")+1:])
	for _, c := range []struct {
		running, own string
		stale        bool
	}{{"cb1e94f", "cb1e94f", false}, {"fd5b7cc", "cb1e94f", true}, {"-", "cb1e94f", true}, {"fd5b7cc", "", false}, {"fd5b7cc", "dev", false}} {
		build = c.running
		if got := a.Stale(port, c.own); got != c.stale {
			t.Errorf("running %q, own %q: stale %v, want %v", c.running, c.own, got, c.stale)
		}
	}
	// Nothing answers: not stale (the app starts its own as usual).
	if a.Stale(1, "cb1e94f") {
		t.Error("stale with nothing on the port")
	}
	// Not the app's agent (Stop Ducter took it away): a Terminal Ducter is left alone.
	build = "fd5b7cc"
	f.loaded = false
	if a.Stale(port, "cb1e94f") {
		t.Error("stale without the agent loaded")
	}
	f.calls = nil
	if err := a.Restart(); err != nil || f.calls[0] != "kickstart -k gui/"+strconv.Itoa(os.Getuid())+"/co.nowledge.ducter.agent" {
		t.Errorf("restart: %v %q", err, f.calls)
	}
}
