package views

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Ducter.app's first run, against a fake Mac.
//
//	DUCTER_SHOTS=1 go test ./internal/views -run Setup   # writes docs/app-setup-*.png

type fakeBackend struct {
	healthy    bool
	reports    []local.Report // one per Doctor call; the last repeats
	doctored   int
	started    int
	ran        []string
	dir        string
	cli        local.CLIState
	linked     bool
	onPath     bool
	exited     chan struct{}
	stopping   bool
	startErr   error
	linkError  error
	background bool
	rested     int
	// Background fixes and macOS: the jobs the app started (fed by the
	// test), cua-driver's state, the agent's.
	jobs      map[string]*local.Job
	runs      []string
	cua       local.CuaState
	settings  []string
	bgFirst   bool
	bgBlocked bool
	bgAllowed bool
	stopped   int
}

func (f *fakeBackend) Run(id, cmd string) (*local.Job, error) {
	if f.jobs == nil {
		f.jobs = map[string]*local.Job{}
	}
	if j := f.jobs[id]; j != nil && j.Running() {
		return j, nil
	}
	j := local.NewJob(id, cmd)
	f.jobs[id] = j
	f.runs = append(f.runs, id+": "+cmd)
	return j, nil
}
func (f *fakeBackend) Job(id string) *local.Job { return f.jobs[id] }
func (f *fakeBackend) Cua(bool) local.CuaState  { return f.cua }
func (f *fakeBackend) OpenSettings(link string) error {
	f.settings = append(f.settings, link)
	return nil
}
func (f *fakeBackend) BundleID() string        { return "co.nowledge.ducter" }
func (f *fakeBackend) BackgroundFirst() bool   { return f.bgFirst }
func (f *fakeBackend) BackgroundBlocked() bool { return f.bgBlocked }
func (f *fakeBackend) BackgroundAllowed() bool { return f.bgAllowed }
func (f *fakeBackend) StopChild()              { f.stopped++ }

func (f *fakeBackend) Healthy() bool { return f.healthy }
func (f *fakeBackend) Doctor() (local.Report, error) {
	r := f.reports[min(f.doctored, len(f.reports)-1)]
	f.doctored++
	return r, nil
}
func (f *fakeBackend) Start() error {
	f.started++
	return f.startErr
}
func (f *fakeBackend) Exited() <-chan struct{} { return f.exited }
func (f *fakeBackend) Stopping() bool          { return f.stopping }
func (f *fakeBackend) ExitReason() string      { return "exit status 1\nport 7777 is taken" }
func (f *fakeBackend) LogPath() string         { return f.dir + "/app.log" }
func (f *fakeBackend) DataDir() string         { return f.dir }
func (f *fakeBackend) RunInTerminal(id, cmd string) error {
	f.ran = append(f.ran, cmd)
	return nil
}
func (f *fakeBackend) OpenURL(string) error     { return nil }
func (f *fakeBackend) CLIState() local.CLIState { return f.cli }
func (f *fakeBackend) LinkCLI() error {
	if f.linkError != nil {
		return f.linkError
	}
	f.linked = true
	return nil
}
func (f *fakeBackend) CLIOnPath() bool  { return f.onPath }
func (f *fakeBackend) Background() bool { return f.background }
func (f *fakeBackend) Rest() error {
	f.rested++
	return nil
}

func TestStopDucterAndWakeIt(t *testing.T) {
	f := &fakeBackend{reports: []local.Report{readyReport()}, healthy: true, background: true}
	h := newSetup(t, i18n.ZH, f)
	var menu []bool
	h.app.OnResting = func(r bool) { menu = append(menu, r) }
	h.app.StartLocal()
	h.app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 0})
	h.app.Rest()
	if f.rested != 1 || !h.app.Resting() {
		t.Fatalf("rested %d", f.rested)
	}
	h.has("Ducter 歇着了", "开机也不会", "叫醒 Ducter")
	h.shot("app-resting-zh")
	h.click("叫醒 Ducter")
	if f.started != 1 || h.app.Resting() {
		t.Errorf("started %d, resting %v", f.started, h.app.Resting())
	}
	if len(menu) != 2 || !menu[0] || menu[1] {
		t.Errorf("menu told %v", menu)
	}
}

func TestStartingSaysItKeepsWorking(t *testing.T) {
	f := &fakeBackend{reports: []local.Report{readyReport()}, background: true}
	f.dir = t.TempDir()
	_ = hints.WritePersona(f.dir, hints.Persona{AskedAt: "x"})
	h := newSetup(t, i18n.EN, f)
	h.app.StartLocal()
	h.has("keeps working when you close the window", "Stop Ducter")
}

func check(id, label, detail string, ok, required bool, fix string) local.Check {
	st := "ok"
	if !ok {
		st = "missing"
	}
	return local.Check{ID: id, Label: label, Status: st, Required: required, Detail: detail, Fix: fix}
}

// A Mac with Claude Code installed but signed out, and no Codex or Mem.
func blockedReport() local.Report {
	return local.Report{Checks: []local.Check{
		check("git", "git", "2.50", true, true, ""),
		check("claude", "Claude Code", "已安装，没登录", false, true, "claude auth login"),
		check("codex", "Codex", "没装", false, false, "brew install codex"),
		check("nmem", "Nowledge Mem", "没装", false, false, "pipx install nmem-cli"),
		check("port", "端口", "7777 空着", true, true, ""),
	}}
}

func readyReport() local.Report {
	r := blockedReport()
	r.Checks[1] = check("claude", "Claude Code", "已登录", true, true, "")
	r.OK, r.HarnessReady = true, true
	return r
}

func newSetup(t *testing.T, lang i18n.Lang, f *fakeBackend) *harness {
	t.Helper()
	theme.LoadFonts()
	if f.dir == "" {
		f.dir = t.TempDir()
	}
	t.Setenv("DUCTER_PERSONA_NAME", "")
	os.Unsetenv("DUCTER_PERSONA_NAME")
	app := New(store.New(), theme.Pebble(), i18n.New(lang))
	app.Local = hints.Open(f.dir)
	app.Backend = f
	h := &harness{t: t, app: app}
	h.tt = ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	return h
}

func (h *harness) has(want ...string) {
	h.t.Helper()
	h.tt.Frame()
	all := strings.Join(h.tt.Texts(), "\n")
	for _, w := range want {
		if !strings.Contains(all, w) {
			h.t.Errorf("lacks %q in %q", w, h.tt.Texts())
		}
	}
}

func TestSetupBlockedShowsOnlyWhatBlocks(t *testing.T) {
	f := &fakeBackend{reports: []local.Report{blockedReport(), readyReport()}}
	h := newSetup(t, i18n.ZH, f)
	h.app.StartLocal()
	h.has("还差一步", "Claude Code", "已安装，没登录", "claude auth login", "在终端里运行", "可选，以后再说：Codex、Nowledge Mem", "再检查一次")
	if strings.Contains(strings.Join(h.tt.Texts(), "\n"), "brew install codex") {
		t.Error("an optional fix is shown as a step")
	}
	h.shot("app-setup-blocked-zh")
	h.click("在终端里运行")
	if len(f.ran) != 1 || f.ran[0] != "claude auth login" {
		t.Fatalf("ran %q", f.ran)
	}
	h.has("终端开好了")
	// Back from Terminal: check again; ready now, so the name comes next.
	h.click("再检查一次")
	h.has("你好，我是 Ducter。", "想叫我什么？", "就叫这个", "就叫 Ducter")
	if f.started != 0 {
		t.Error("started before the name was answered")
	}
	h.shot("app-setup-name-zh")
	h.tt.Type("小鸭")
	h.click("就叫这个")
	if p, ok := hints.ReadPersona(f.dir); !ok || p.Name != "小鸭" || p.AskedAt == "" {
		t.Errorf("persona.json %+v %v", p, ok)
	}
	if f.started != 1 {
		t.Fatalf("started %d times", f.started)
	}
	h.has("小鸭马上就好…")
	h.shot("app-setup-starting-zh")
	// Ducter answers: the conversation takes over, with starters from the
	// firstrun.json that `ducter up` wrote after the window opened.
	if err := os.WriteFile(f.dir+"/"+hints.HintsFile, []byte(hintsJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	h.app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "小鸭", HeadSeq: 0})
	h.app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	h.has("你好，我是小鸭。", "看看 ~/dev/ducter 最近有哪些测试没过，修好了告诉我")
}

func TestSetupReadyMacStartsWithoutQuestions(t *testing.T) {
	r := readyReport()
	r.Checks[3] = check("nmem", "Nowledge Mem", "local", true, false, "")
	f := &fakeBackend{reports: []local.Report{r}}
	h := newSetup(t, i18n.EN, f)
	h.app.StartLocal()
	if f.started != 1 {
		t.Fatalf("Mem holds the name, so no question; started %d", f.started)
	}
	h.has("Getting Ducter ready…")
	h.shot("app-setup-starting-en")
	// Already asked once: no question either.
	f2 := &fakeBackend{reports: []local.Report{readyReport()}}
	f2.dir = t.TempDir()
	if err := hints.WritePersona(f2.dir, hints.Persona{AskedAt: "2026-11-09T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	h2 := newSetup(t, i18n.EN, f2)
	h2.app.StartLocal()
	if f2.started != 1 {
		t.Errorf("asked again; started %d", f2.started)
	}
}

func TestSetupAttachesToARunningDucter(t *testing.T) {
	f := &fakeBackend{healthy: true, reports: []local.Report{readyReport()}}
	h := newSetup(t, i18n.EN, f)
	h.app.StartLocal()
	if f.doctored != 0 || f.started != 0 {
		t.Errorf("doctor %d, start %d for a Ducter already running", f.doctored, f.started)
	}
	if h.app.setupActive() {
		t.Error("setup shown while a Ducter runs")
	}
}

func TestSetupSaysWhenDucterStops(t *testing.T) {
	f := &fakeBackend{reports: []local.Report{readyReport()}, startErr: errors.New("exec: no such file")}
	h := newSetup(t, i18n.EN, f)
	_ = hints.WritePersona(f.dir, hints.Persona{})
	h.app.StartLocal()
	h.has("Ducter didn't start", "exec: no such file", "Try again")
	f.startErr = nil
	h.click("Try again")
	h.has("Getting Ducter ready…")
	// It stops later, not because the app quit: say so, with the log.
	h.app.setup.everUp = true
	h.app.childExited()
	h.has("Ducter stopped", "port 7777 is taken")
	h.shot("app-setup-stopped-en")
	// Quitting is quiet.
	h.app.setup.phase = setupIdle
	f.stopping = true
	h.app.childExited()
	if h.app.setup.phase == setupFailed {
		t.Error("quitting showed a failure")
	}
}

func TestCLIOfferOnceAfterTheFirstReply(t *testing.T) {
	f := &fakeBackend{reports: []local.Report{readyReport()}, healthy: true}
	h := newSetup(t, i18n.ZH, f)
	h.app.StartLocal()
	h.app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 0})
	h.app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	h.tt.Frame()
	if h.tt.HasText("在终端里也能用 ducter？") {
		t.Fatal("offered before the partner said anything")
	}
	h.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: "你好"}),
	}})
	h.has("在终端里也能用 ducter？", "不需要管理员密码")
	h.shot("app-cli-offer-zh")
	h.click("好")
	if !f.linked {
		t.Fatal("not linked")
	}
	h.has("~/.local/bin 还不在 PATH 里", "export PATH=")
	h.click("知道了")
	if h.tt.HasText("在终端里也能用 ducter？") || h.app.Local.CLIOffer() != "linked" {
		t.Errorf("offer stays: %q", h.app.Local.CLIOffer())
	}
	// A new launch doesn't ask again.
	again := newSetup(t, i18n.ZH, &fakeBackend{dir: f.dir, healthy: true, reports: []local.Report{readyReport()}})
	again.app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 0})
	again.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: "你好"}),
	}})
	again.tt.Frame()
	if again.tt.HasText("在终端里也能用 ducter？") {
		t.Error("asked twice")
	}
}
