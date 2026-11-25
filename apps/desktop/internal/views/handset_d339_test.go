package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D339, from the author's loan of their Pixel Fold on 0.0.69: Codex on
// Hetzner Server, "用手机 Chrome 查看今天上海天气", the phone locked (paused).
// The Mac drew the paused line into the window's title bar over the
// breadcrumb and the 工作台 tab; the task's head said "在 Hetzner Server 上用
// Ducter 自己的浏览器"; and the workbench offered 看它上网 for a task that
// never opened a page there.
func d339Task(t *testing.T, lang i18n.Lang, h protocol.HandsetCard) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: "awake", AlwaysOn: true, Platform: "linux-x64",
			Harnesses: []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true}}, Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}}},
		{ID: "dev_mac", Name: "MacBook", Kind: "laptop", State: "awake", Platform: "darwin-arm64"},
	}, Reach: &protocol.Reach{Clients: []protocol.ReachClient{{ID: "pix", Name: "Pixel Fold", Platform: "android-app", Connected: true}}}})
	title := "用手机 Chrome 查看今天上海天气"
	if lang == i18n.EN {
		title = "Check today's Shanghai weather in Chrome on my phone"
	}
	id := "t_wx"
	ts := protocol.TaskStream(id)
	now := time.Now()
	n := int64(10)
	at := func(ago time.Duration, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", ts, origin, kind, body)
	}
	place := protocol.Place{Kind: "browser", Device: "local", Profile: "default"}
	evs := []protocol.LogEvent{
		at(6*time.Minute, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "codex", Place: place, Brief: title}),
		at(6*time.Minute, protocol.OriginSystem, protocol.KindBodySelected, protocol.BodySelected{TaskID: id, Harness: "codex",
			Why: protocol.BodyWhy{Kind: "default", Where: &protocol.WhereWhy{Device: "Hetzner Server", Kind: "no_signin", Uses: "ducter"}}}),
		at(5*time.Minute, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "needs_input", Summary: "「" + title + "」想用你的 Pixel Fold",
			Questions: []protocol.Question{{ID: "handset_use", Text: "「" + title + "」想用你的 Pixel Fold", Blocking: true, Handset: &protocol.HandsetAsk{Kind: "use", Device: "pix", Name: "Pixel Fold"}}}}),
		at(4*time.Minute, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Blocked}),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: id, Title: title, Place: place, Harness: "codex",
		Attention: protocol.Blocked, Residency: "warm", Browsing: &protocol.Browsing{Device: "local"}, Handset: &h}}}})
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask(id)
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: id, Events: evs})
	for i := 0; i < 6; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	return app, tt
}

func TestD339PausedLoanLivesInTheTaskNotTheTitleBar(t *testing.T) {
	app, tt := d339Task(t, i18n.ZH, protocol.HandsetCard{Device: "pix", Paused: "locked"})
	line, ok := tt.Find("暂停了：你的 Pixel Fold 锁着")
	if !ok {
		t.Fatalf("no paused line: %q", tt.Texts())
	}
	why, ok := tt.Find("它什么都不做。解锁以后，在手机上点「继续借给它」才接着用。")
	if !ok {
		t.Fatalf("no line under it: %q", tt.Texts())
	}
	if line.Y < ChromeH || why.Y < ChromeH {
		t.Fatalf("drawn in the title bar (y %v, %v; bar %v)", line.Y, why.Y, ChromeH)
	}
	// Stop sits with it, in the task's head.
	if stop, ok := tt.Find("停下"); !ok || stop.Y < ChromeH {
		t.Fatalf("Stop: %v %v", stop, ok)
	}
	// The head says where it works, and 看它上网 isn't offered: it never opened a page in Ducter's browser.
	if on, _ := app.taskWhere(app.S.Task("t_wx")); on != "在你的 Pixel Fold 上" {
		t.Errorf("where: %q", on)
	}
	if !hasText(tt, "在你的 Pixel Fold 上") || strings.Contains(strings.Join(tt.Texts(), "|"), "用 Ducter 自己的浏览器") {
		t.Errorf("head: %q", tt.Texts())
	}
	if hasText(tt, "看它上网") || app.watchesBrowser(app.S.Task("t_wx")) {
		t.Errorf("看它上网 offered for a phone task that never browsed")
	}
	for _, k := range app.benchTabs(app.S.Task("t_wx")) {
		if k == "browser" {
			t.Errorf("workbench has the browser page")
		}
	}
	en, _ := d339Task(t, i18n.EN, protocol.HandsetCard{Device: "pix"})
	if on, _ := en.taskWhere(en.S.Task("t_wx")); on != "on your Pixel Fold" {
		t.Errorf("en where: %q", on)
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/phone-stop go test ./internal/views -run D339Shots
func TestD339Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, c := range []struct {
		name string
		lang i18n.Lang
		h    protocol.HandsetCard
	}{
		{"mac-task-paused-zh.png", i18n.ZH, protocol.HandsetCard{Device: "pix", Paused: "locked"}},
		{"mac-task-paused-en.png", i18n.EN, protocol.HandsetCard{Device: "pix", Paused: "locked"}},
		{"mac-task-lent-zh.png", i18n.ZH, protocol.HandsetCard{Device: "pix"}},
	} {
		_, tt := d339Task(t, c.lang, c.h)
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, c.name))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
