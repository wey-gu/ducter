package local

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestFindBundle(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "Ducter.app")
	exe := filepath.Join(app, "Contents", "MacOS", "Ducter")
	cli := filepath.Join(app, "Contents", "Helpers", "ducter")
	for _, p := range []string{exe, cli} {
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte("#!/bin/sh\n"), 0o755)
	}
	b, ok := FindBundle(exe)
	if !ok || b.CLI != cli && !strings.HasSuffix(b.CLI, "Ducter.app/Contents/Helpers/ducter") {
		t.Fatalf("FindBundle = %+v %v", b, ok)
	}
	if _, ok := FindBundle(filepath.Join(dir, "bin", "ducter-desktop")); ok {
		t.Error("a plain binary is not a bundle")
	}
	os.Remove(cli)
	if _, ok := FindBundle(exe); ok {
		t.Error("a bundle without the CLI is not ours")
	}
}

func TestLoadDevEnvOnlyDucterKeys(t *testing.T) {
	p := filepath.Join(t.TempDir(), "dev.env")
	os.WriteFile(p, []byte("# scratch run\nDUCTER_PORT=7798\nexport DUCTER_DATA_DIR=\"~/scratch/d\"\nPATH=/evil\nHOME=/nope\n"), 0o644)
	t.Setenv("DUCTER_PORT", "")
	t.Setenv("DUCTER_DATA_DIR", "")
	path := os.Getenv("PATH")
	keys := LoadDevEnv(p)
	home, _ := os.UserHomeDir()
	if len(keys) != 2 || os.Getenv("DUCTER_PORT") != "7798" || os.Getenv("DUCTER_DATA_DIR") != filepath.Join(home, "scratch/d") {
		t.Errorf("keys %v, port %q, dir %q", keys, os.Getenv("DUCTER_PORT"), os.Getenv("DUCTER_DATA_DIR"))
	}
	if os.Getenv("PATH") != path {
		t.Error("dev.env changed PATH")
	}
	if Port() != 7798 {
		t.Errorf("Port() = %d", Port())
	}
	if LoadDevEnv(filepath.Join(t.TempDir(), "none")) != nil {
		t.Error("a missing file set something")
	}
}

func TestMergePath(t *testing.T) {
	if got := MergePath("/a:/b", "/b:/c", "", "/a:/d"); got != "/a:/b:/c:/d" {
		t.Errorf("MergePath = %q", got)
	}
	if !OnPath("/x/.local/bin", "/usr/bin:/x/.local/bin/") || OnPath("/x/.local/bin", "/usr/bin") {
		t.Error("OnPath")
	}
}

func TestLoginPathAsksTheShell(t *testing.T) {
	if _, err := os.Stat("/bin/zsh"); err != nil {
		t.Skip("no zsh")
	}
	if p := LoginPath("/bin/zsh"); !strings.Contains(p, "/usr/bin") {
		t.Errorf("LoginPath = %q", p)
	}
}

func TestLinkCLI(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "bin")
	cli := "/Applications/Ducter.app/Contents/Helpers/ducter"
	if CLIStatus(dir, cli) != CLINone {
		t.Fatal("not none")
	}
	if err := LinkCLI(dir, cli); err != nil {
		t.Fatal(err)
	}
	if CLIStatus(dir, cli) != CLILinked {
		t.Error("not linked")
	}
	// A newer copy of the app elsewhere replaces its own old link.
	other := "/Users/x/Downloads/Ducter.app/Contents/Helpers/ducter"
	if CLIStatus(dir, other) != CLIOther {
		t.Error("a link to another copy should read as other")
	}
	if err := LinkCLI(dir, other); err != nil || CLIStatus(dir, other) != CLILinked {
		t.Errorf("relink: %v", err)
	}
	// A real file a person put there is never replaced.
	os.Remove(filepath.Join(dir, "ducter"))
	os.WriteFile(filepath.Join(dir, "ducter"), []byte("mine"), 0o755)
	if err := LinkCLI(dir, cli); err != ErrNotLinked {
		t.Errorf("err = %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "ducter")); string(b) != "mine" {
		t.Error("replaced the person's file")
	}
}

func TestCommandFile(t *testing.T) {
	p, err := CommandFile(t.TempDir(), "ducter-claude", "claude auth login", "It's done; go back to Ducter.")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(p)
	s := string(b)
	if !strings.HasSuffix(p, ".command") || !strings.Contains(s, "\nclaude auth login\n") || !strings.Contains(s, `'It'\''s done; go back to Ducter.'`) {
		t.Errorf("%s:\n%s", p, s)
	}
	if st, _ := os.Stat(p); st.Mode()&0o100 == 0 {
		t.Error("not executable")
	}
}

// fakeCLI is a shell script standing in for the ducter binary.
func fakeCLI(t *testing.T, body string) string {
	p := filepath.Join(t.TempDir(), "ducter")
	os.WriteFile(p, []byte("#!/bin/sh\n"+body), 0o755)
	return p
}

func TestDoctorReadsTheJSON(t *testing.T) {
	cli := fakeCLI(t, `echo "{\"ok\":false,\"harnessReady\":false,\"checks\":[{\"id\":\"claude\",\"label\":\"Claude Code\",\"status\":\"missing\",\"required\":true,\"detail\":\"$DUCTER_LOCALE\",\"fix\":\"claude auth login\"},{\"id\":\"codex\",\"label\":\"Codex\",\"status\":\"missing\",\"required\":false,\"detail\":\"\"}]}"; exit 1`)
	t.Setenv("DUCTER_LOCALE", "")
	os.Unsetenv("DUCTER_LOCALE")
	s := &Supervisor{CLI: cli, DataDir: t.TempDir(), Port: 7798, Locale: "zh"}
	r, err := s.Doctor()
	if err != nil {
		t.Fatal(err)
	}
	if r.OK || len(r.Blocking()) != 1 || r.Blocking()[0].Fix != "claude auth login" || r.Blocking()[0].Detail != "zh" || len(r.Later()) != 1 {
		t.Errorf("%+v", r)
	}
	bad := &Supervisor{CLI: fakeCLI(t, "echo oops >&2; exit 3"), DataDir: t.TempDir()}
	if _, err := bad.Doctor(); err == nil || !strings.Contains(err.Error(), "oops") {
		t.Errorf("err = %v", err)
	}
}

func TestStartStop(t *testing.T) {
	dir := t.TempDir()
	cli := fakeCLI(t, `trap 'echo bye; exit 0' TERM; echo "args: $* parent=$DUCTER_PARENT_PID port=$DUCTER_PORT"; while :; do sleep 0.05; done`)
	s := &Supervisor{CLI: cli, DataDir: dir, Port: 7798}
	if err := s.Start(); err != nil {
		t.Fatal(err)
	}
	if !s.Owned() {
		t.Error("not owned after Start")
	}
	for i := 0; i < 100 && !strings.Contains(LogTail(s.LogPath(), 5), "args:"); i++ {
		time.Sleep(30 * time.Millisecond) // the trap is set once it spoke
	}
	s.Stop(3 * time.Second)
	select {
	case <-s.Exited():
	default:
		t.Fatal("still running after Stop")
	}
	log := LogTail(s.LogPath(), 5)
	want := "args: up --no-desktop parent=" + strconv.Itoa(os.Getpid()) + " port=7798"
	if !strings.Contains(log, want) || !strings.Contains(log, "bye") {
		t.Errorf("log %q lacks %q and bye", log, want)
	}
	if !s.Stopping() {
		t.Error("Stopping false after Stop")
	}
}

func TestStartReportsAnEarlyExit(t *testing.T) {
	s := &Supervisor{CLI: fakeCLI(t, `echo "port 7798 is taken"; exit 1`), DataDir: t.TempDir(), Port: 7798}
	if err := s.Start(); err != nil {
		t.Fatal(err)
	}
	<-s.Exited()
	if r := s.ExitReason(); !strings.Contains(r, "exit status 1") || !strings.Contains(r, "port 7798 is taken") {
		t.Errorf("reason %q", r)
	}
}

func TestHealthy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.Write([]byte(`{"ok":true,"headSeq":0}`))
		}
	}))
	defer srv.Close()
	port, _ := strconv.Atoi(srv.URL[strings.LastIndex(srv.URL, ":")+1:])
	if !Healthy(port, time.Second) {
		t.Error("not healthy")
	}
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"ok":true}`)) }))
	defer other.Close()
	port2, _ := strconv.Atoi(other.URL[strings.LastIndex(other.URL, ":")+1:])
	if Healthy(port2, time.Second) {
		t.Error("something else on the port counted as Ducter")
	}
}
