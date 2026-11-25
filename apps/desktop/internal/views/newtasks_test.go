package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// d510Devices is the author's setup: this Mac is the home, hel (a server
// that never sleeps) does tasks for it; Claude Code and Codex on both.
func d510Devices() []protocol.DeviceView {
	cc := protocol.DeviceHarness{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"}
	cx := protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"}
	return []protocol.DeviceView{
		{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{cc, cx}},
		{ID: "dev_hel", Name: "hel", Kind: "server", State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{cx, cc}},
		{ID: "dev_phone", Name: "iPhone", Kind: "phone", State: protocol.DeviceAwake},
	}
}

func d510App(t *testing.T, lang i18n.Lang, nt *protocol.NewTasks) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	f := settingsFrame()
	f.Settings.NewTasks = nt
	app.Receive(f)
	app.Receive(protocol.ServerFrame{T: "devices", Devices: d510Devices()})
	app.OpenPartner()
	return app, sent
}

// D510: Settings › Partner shows 新任务默认 / New tasks start with two
// computers and two agents; a tap sends the whole setting, and the line says
// what it does.
func TestD510NewTasksGroup(t *testing.T) {
	for _, tc := range []struct {
		lang                        i18n.Lang
		title, where, who, on, said string
	}{
		{i18n.ZH, "新任务默认", "在哪儿做", "谁来做", "能做的都在 hel 上做。它连不上，或者要用别处才有的（你的 Chrome、某个 App），就换一台。", "新任务默认在 hel 上做"},
		{i18n.EN, "New tasks start", "Where", "Who does it", "On hel whenever it can. When it can't be reached, or the task needs what only another computer has (your Chrome, an app), another one takes it.", "New tasks now start on hel"},
	} {
		app, sent := d510App(t, tc.lang, nil)
		tt := ui.NewTesterWith(app.View, 1280, 2000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		for _, want := range []string{tc.title, tc.where, tc.who, "hel", "Codex"} {
			if !tt.HasText(want) {
				t.Errorf("%s: no %q in %q", tc.lang, want, tt.Texts())
			}
		}
		if tt.HasText("iPhone") {
			t.Errorf("%s: a phone offered as a place to run tasks", tc.lang)
		}
		*sent = nil
		if err := tt.Click("hel"); err != nil {
			t.Fatalf("%s: %v", tc.lang, err)
		}
		tt.Frame()
		var got *protocol.NewTasks
		for _, m := range *sent {
			if p, ok := m.(protocol.SettingsSet); ok && p.Patch.NewTasks != nil {
				got = p.Patch.NewTasks
			}
		}
		if got == nil || got.Where != "dev_hel" || got.Agent != "" {
			t.Fatalf("%s: sent %+v, want where dev_hel", tc.lang, got)
		}
		tt.Frame()
		for _, want := range []string{tc.on, tc.said} {
			if !tt.HasText(want) {
				t.Errorf("%s: no %q in %q", tc.lang, want, tt.Texts())
			}
		}
	}
}

// One computer and one agent: nothing to choose, no group.
func TestD510NoChoiceNoGroup(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Receive(settingsFrame())
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake,
		Harnesses: []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true}}}}})
	app.OpenPartner()
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if tt.HasText("新任务默认") {
		t.Errorf("New tasks start shown with nothing to choose: %q", tt.Texts())
	}
}

// D556: both 自动, New tasks start has no tile column (its words on the text
// edge, as Partner's 还没有能想事情的 AI agent, D501); a picked agent's coin
// opens the column for every row and the foot, so the group keeps one edge.
func TestD556NoEmptyTileColumn(t *testing.T) {
	foot := i18n.New(i18n.ZH).T("newtasks.foot")
	at := func(nt *protocol.NewTasks) (where, who, f ui.Rect) {
		app, _ := d510App(t, i18n.ZH, nt)
		tt := ui.NewTesterWith(app.View, 1150, 2000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		where, _ = tt.Find("在哪儿做")
		who, _ = tt.Find("谁来做")
		f, _ = tt.Find(foot)
		return
	}
	w0, h0, f0 := at(nil)
	if w0.X != h0.X || w0.X != f0.X {
		t.Fatalf("both 自动: three edges, where %v, who %v, foot %v", w0.X, h0.X, f0.X)
	}
	w1, h1, f1 := at(&protocol.NewTasks{Agent: "codex"})
	if w1.X != h1.X || w1.X != f1.X {
		t.Fatalf("Codex picked: three edges, where %v, who %v, foot %v", w1.X, h1.X, f1.X)
	}
	if d := w1.X - w0.X; d != 52 {
		t.Errorf("the coin's column is %v wide, want 40 and the gap (52)", d)
	}
}

// DUCTER_D510_SHOTS=<dir> go test ./internal/views -run TestD510Shots
func TestD510Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_D510_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D510_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for name, nt := range map[string]*protocol.NewTasks{"auto": nil, "hel-codex": {Where: "dev_hel", Agent: "codex"}} {
			app, _ := d510App(t, lang, nt)
			tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			settle := func() {
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
			}
			d302Both(t, app, tt, settle, "d510-partner-"+name, lang)
		}
	}
}
