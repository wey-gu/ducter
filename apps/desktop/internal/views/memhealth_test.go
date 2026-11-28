package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D375: Mem's own health on Settings › 记忆's Nowledge Mem head and on a lent
// computer's Mem row, and D169's 装上 by Mem's own command.

func TestMemHealthLookGo(t *testing.T) {
	on := &protocol.BridgeView{State: "connected", CanRun: true}
	cases := []struct {
		h    *protocol.MemHealth
		b    *protocol.BridgeView
		home []protocol.DeviceHarness
		want memHealthView
	}{
		{nil, on, nil, memHealthView{Look: "unread"}},
		{&protocol.MemHealth{}, on, nil, memHealthView{Look: "ok"}},
		{&protocol.MemHealth{Issue: "old"}, on, nil, memHealthView{Look: "old", CanUpdate: true}},
		{&protocol.MemHealth{Issue: "old"}, &protocol.BridgeView{State: "update_mem", CanRun: true}, nil, memHealthView{Look: "unread"}},
		{&protocol.MemHealth{Issue: "unreachable"}, on, nil, memHealthView{Look: "unreachable"}},
		{&protocol.MemHealth{Issue: "signed_out"}, on, nil, memHealthView{Look: "signed_out"}},
		{&protocol.MemHealth{Issue: "plugin", Agents: []string{"claude-code", "codex"}}, on, []protocol.DeviceHarness{{Harness: "codex", Mem: &protocol.MemPluginView{State: "absent", Busy: true}}}, memHealthView{Look: "ok", Agents: []string{"claude-code", "codex"}, Busy: true}},
		{&protocol.MemHealth{Issue: "plugin", Agents: []string{"codex"}}, on, []protocol.DeviceHarness{{Harness: "codex", Mem: &protocol.MemPluginView{State: "installed", Fresh: true}}}, memHealthView{Look: "ok"}},
	}
	for i, c := range cases {
		got := memHealthLook(c.h, c.b, c.home)
		if fmt.Sprint(got) != fmt.Sprint(c.want) {
			t.Errorf("%d: %+v, want %+v", i, got, c.want)
		}
	}
}

func memHealthApp(t *testing.T, lang i18n.Lang, h *protocol.MemHealth, home []protocol.DeviceHarness) (*App, *[]any) {
	app, sent := memApp(t, lang, "on")
	app.S.Mem.Health = h
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "hel", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: home}}})
	app.openTab(TabMemory)
	return app, sent
}

func TestMemHealthHead(t *testing.T) {
	frames := func(tt *ui.Tester) {
		for i := 0; i < 4; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		// All well: the calm line.
		app, sent := memHealthApp(t, lang, &protocol.MemHealth{}, nil)
		tt := ui.NewTesterWith(app.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		frames(tt)
		// D664: the setup, all done, is one calm line naming the home.
		if _, ok := tt.Find(L.T("memsetup.done", "hel")); !ok {
			t.Fatalf("%s: no calm line in %q", lang, tt.Texts())
		}
		// Unreachable: 再看一次 asks the home to read it again.
		app.S.Mem.Health = &protocol.MemHealth{Issue: "unreachable"}
		frames(tt)
		if _, ok := tt.Find(L.T("mem.health.unreachable.line", "hel")); !ok {
			t.Fatalf("%s: no unreachable line", lang)
		}
		if err := tt.Click(L.T("mem.health.again")); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, f := range *sent {
			if r, ok := f.(protocol.MemHealthReq); ok && r.T == "mem_health" {
				found = true
			}
		}
		if !found {
			t.Fatalf("%s: 再看一次 sent nothing", lang)
		}
		// Signed out: 重新登录 opens the link field in place.
		app.S.Mem.Health = &protocol.MemHealth{Issue: "signed_out"}
		frames(tt)
		if err := tt.Click(L.T("mem.health.signin")); err != nil {
			t.Fatal(err)
		}
		frames(tt)
		if _, ok := tt.Find(L.T("bridge.mem.signin.link")); !ok {
			t.Fatalf("%s: no link field", lang)
		}
		if _, ok := tt.Find(L.T("mem.health.resign.how")); !ok {
			t.Fatalf("%s: no re-sign-in line of its own", lang)
		}
		app.memReSign = false
		// Plugin: 接上 sends D169's install for each agent on the home.
		app2, sent2 := memHealthApp(t, lang, &protocol.MemHealth{Issue: "plugin", Agents: []string{"claude-code", "codex"}}, []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
			{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
		})
		tt2 := ui.NewTesterWith(app2.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		frames(tt2)
		if err := tt2.Click(L.T("mem.health.plugin.go")); err != nil {
			t.Fatal(err)
		}
		var hs []string
		for _, f := range *sent2 {
			if r, ok := f.(protocol.MemPluginInstall); ok && r.Device == "local" {
				hs = append(hs, r.Harness)
			}
		}
		if strings.Join(hs, ",") != "claude-code,codex" {
			t.Fatalf("%s: sent %v", lang, hs)
		}
		for _, k := range []string{"mem.health.ok", "mem.health.old", "mem.health.signed_out", "mem.health.plugin.why", "memp.busy", "memp.means.direct", "wmem.again", "wmem.update"} {
			if w := L.T(k); w == k || strings.Contains(w, "%!") {
				t.Errorf("%s %s: %q", lang, k, w)
			}
		}
		for _, k := range []string{"mem.health.unreachable", "mem.health.plugin", "mem.health.plugin.busy", "memp.fresh", "wmem.health.unreachable", "wmem.health.signed_out", "wmem.health.old", "wmem.health.old.how"} {
			if w := L.T(k, "hel"); w == k || strings.Contains(w, "%!") || !strings.Contains(w, "hel") {
				t.Errorf("%s %s: %q", lang, k, w)
			}
		}
	}
}

func TestMemPluginBusyFresh(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	if line, act, _ := app.memPluginWords(&protocol.MemPluginView{State: "absent", Busy: true}, "codex"); line != "正在用 Nowledge Mem 自己的命令安装…" || act != "" {
		t.Fatalf("busy: %q %q", line, act)
	}
	if line, _, _ := app.memPluginWords(&protocol.MemPluginView{State: "installed", Version: "0.7.36", Fresh: true}, "codex"); line != "Nowledge Mem 装好了，重开 Codex 才用得上" {
		t.Fatalf("fresh: %q", line)
	}
	if line, _, _ := app.memPluginWords(&protocol.MemPluginView{State: "installed", Version: "0.7.36"}, "codex"); line != app.L.T("memp.installed", "0.7.36") {
		t.Fatalf("plain: %q", line)
	}
}

// D375: D169's offer closed by itself reads as done, never as a default taken.
func TestMemOfferSettled(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		d := &store.DecisionState{DecisionID: "d_mem", MemPlugin: &protocol.MemPluginAsk{Device: "local", DeviceName: "hel", Harness: "claude-code"},
			Resolved: &protocol.DecisionResolved{DecisionID: "d_mem", Option: "hold", By: "default", Settled: true}}
		if got, want := app.answeredWords(d), app.L.T("memp.card.done"); got != want || want == "memp.card.done" {
			t.Fatalf("%s: %q, want %q", lang, got, want)
		}
		d.Resolved.Settled = false
		if got := app.answeredWords(d); got != app.L.T("decision.resolved.default") {
			t.Fatalf("%s: a plain default: %q", lang, got)
		}
	}
}

// D375: the offer in the conversation, closed by itself, drawn as done
// (DUCTER_MEMHEALTH_SHOTS writes its picture too).
func TestMemOfferSettledCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		h := newHarness(t, lang)
		L := h.app.L
		now := time.Now().UTC()
		h.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(900, now.Add(-time.Minute).Format(time.RFC3339Nano), "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_mem", Question: "raw", GoLabel: "装上", DefaultOption: "go", Reversible: true,
				MemPlugin: &protocol.MemPluginAsk{Device: "local", DeviceName: "hel", Harness: "claude-code"},
			}),
			protocol.NewEvent(901, now.Format(time.RFC3339Nano), "default", "channel", protocol.OriginSystem, "decision_resolved", protocol.DecisionResolved{DecisionID: "d_mem", Option: "hold", By: "default", Settled: true}),
		}})
		h.app.Route = RouteConversation
		done := L.T("memp.card.done")
		h.until("settled", func() bool { return hasText(h.tt, done) })
		if hasText(h.tt, L.T("decision.resolved.default")) {
			t.Fatalf("%s: reads as a default taken", lang)
		}
		if dir := os.Getenv("DUCTER_MEMHEALTH_SHOTS"); dir != "" {
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-conv-offer-settled-%s.png", lang)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, h.tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}

func TestMemRowHealthCard(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Now = func() time.Time { return lendNow }
	app.Route = RouteDevices
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	show := func(m *protocol.DeviceMemView) {
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswellMem(m)}})
		app.devState().sel = "hw1"
		tt.Frame()
		tt.Frame()
	}
	show(&protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Health: &protocol.MemHealth{Issue: "unreachable"}})
	if _, ok := tt.Find("haswell 连不上它设好的 Nowledge Mem"); !ok {
		t.Fatal("no unreachable line")
	}
	if _, ok := tt.Find(app.L.T("wmem.signin.ph")); ok {
		t.Fatal("unreachable shows a paste box")
	}
	if err := tt.Click("再看一次"); err != nil {
		t.Fatal(err)
	}
	if got := memSent(*sent); len(got) == 0 || got[len(got)-1].Action != "look" {
		t.Fatalf("sent %+v", got)
	}
	show(&protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Health: &protocol.MemHealth{Issue: "signed_out"}})
	if _, ok := tt.Find("haswell 上的登录失效了"); !ok {
		t.Fatal("no signed-out line")
	}
	show(&protocol.DeviceMemView{State: "sign_in", Version: "0.10.116", Health: &protocol.MemHealth{Issue: "old"}, Ours: true})
	if err := tt.Click("更新"); err != nil {
		t.Fatal(err)
	}
	if got := memSent(*sent); got[len(got)-1].Action != "install" {
		t.Fatalf("sent %+v", got)
	}
	show(&protocol.DeviceMemView{State: "sign_in", Version: "0.10.116", Health: &protocol.MemHealth{Issue: "old"}})
	if _, ok := tt.Find(app.L.T("wmem.health.old.how", "haswell")); !ok {
		t.Fatal("no how for the person's own nmem")
	}
}

// D375 pictures, offline (never anyone's real Mem):
//
//	DUCTER_MEMHEALTH_SHOTS=/path/to/.shots/mem-health/after-mac go test ./internal/views -run MemHealthShots
func TestMemHealthShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEMHEALTH_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEMHEALTH_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	absent := []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
		{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.36"}},
	}
	busy := []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent", Busy: true}},
		{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.36"}},
	}
	type pane struct {
		name  string
		h     *protocol.MemHealth
		home  []protocol.DeviceHarness
		state string
		set   func(app *App)
	}
	panes := []pane{
		{"pane-00-before", nil, nil, "on", nil},
		{"pane-01-ok", &protocol.MemHealth{}, nil, "on", nil},
		{"pane-02-unreachable", &protocol.MemHealth{Issue: "unreachable"}, nil, "on", nil},
		{"pane-03-signed-out", &protocol.MemHealth{Issue: "signed_out"}, nil, "on", nil},
		{"pane-04-signed-out-open", &protocol.MemHealth{Issue: "signed_out"}, nil, "on", func(app *App) { app.memReSign = true }},
		{"pane-05-plugin", &protocol.MemHealth{Issue: "plugin", Agents: []string{"claude-code"}}, absent, "on", nil},
		{"pane-06-plugin-busy", &protocol.MemHealth{Issue: "plugin", Agents: []string{"claude-code"}}, busy, "on", nil},
		{"pane-07-old", &protocol.MemHealth{Issue: "old"}, nil, "on", func(app *App) { app.S.Bridge.CanRun = true }},
	}
	type row struct {
		name string
		m    *protocol.DeviceMemView
	}
	rows := []row{
		{"card-08-unreachable", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Health: &protocol.MemHealth{Issue: "unreachable"}}},
		{"card-09-signed-out", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Health: &protocol.MemHealth{Issue: "signed_out"}}},
		{"card-10-old", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.116", Health: &protocol.MemHealth{Issue: "old"}, Ours: true}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			theme := "light"
			if dark {
				theme = "dark"
			}
			write := func(tt *ui.Tester, name string, w int) {
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s-%s.png", name, w, theme, lang)))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}
			for _, p := range panes {
				for _, w := range []int{1280, 900} {
					app, _ := memApp(t, lang, p.state)
					app.S.Mem.Health = p.h
					app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "hel", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: p.home}}})
					if p.set != nil {
						p.set(app)
					}
					app.openTab(TabMemory)
					tt := ui.NewTesterWith(app.View, w, 2000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
					tt.SetDark(dark)
					for i := 0; i < 12; i++ {
						tt.Advance(150 * time.Millisecond)
						tt.Frame()
					}
					write(tt, p.name, w)
				}
			}
			for _, r := range rows {
				app, _ := iaApp(t, lang)
				app.Now = func() time.Time { return lendNow }
				app.Route = RouteDevices
				tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswellMem(r.m)}})
				app.devState().sel = "hw1"
				tt.Frame()
				tt.Frame()
				write(tt, r.name, 1440)
			}
		}
	}
}
