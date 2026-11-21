package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D469: Settings opens on 概览 / Overview, the partner's brief on its world: a lead true to what
// needs the person, each need with the way to its fix, the labelled lines, and the computers in
// their clay. Every pane's head is the partner saying that pane's state.

func homeApp(t *testing.T, lang i18n.Lang, trouble bool) (*App, *ui.Tester) {
	t.Helper()
	app, _ := memApp(t, lang, "on")
	harn := []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true,
		Mem: &protocol.MemPluginView{State: "installed", Version: "0.1.53"}}}
	if trouble {
		harn[0].Mem = &protocol.MemPluginView{State: "update", Version: "0.1.50", Available: "0.1.53"}
		app.S.Mem.Check = &protocol.MemCheck{Asks: []protocol.MemCheckItem{{ID: "c1", Kind: "rule", Title: "Reply in Chinese", Answers: []string{"keep"}}}}
	}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, AlwaysOn: true, State: protocol.DeviceAwake, Harnesses: harn},
		{ID: "mbp", Name: "MacBook Pro", Kind: "laptop", State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true}}},
	}})
	state := "ok"
	if trouble {
		state = "unreachable"
	}
	app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{{ID: "oo", Name: "OOMOL", Via: "oo", Source: "oo", State: state,
		Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"w@nowledge-labs.ai", "weyl.gu@gmail.com"}}, {Service: "slack", Title: "Slack", Accounts: []string{"Nowledge Labs"}}}}}})
	app.openTab("")
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	for i := 0; i < 6; i++ {
		tt.Advance(150 * time.Millisecond)
		tt.Frame()
	}
	return app, tt
}

func TestSettingsOpensOnOverviewD469(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := homeApp(t, lang, false)
		L := app.L
		if app.settingsTab() != TabHome {
			t.Fatalf("%s: opened on %q", lang, app.settingsTab())
		}
		for _, s := range []string{L.T("home.lead.ok"), L.T("home.lives.on", "hel"), L.T("home.l.reads"), L.T("home.map"), L.T("home.role.home", "小鸭")} {
			if _, ok := tt.Find(s); !ok && lang == i18n.ZH {
				t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
			}
		}
		if n := app.setNeeds(); len(n) != 0 {
			t.Fatalf("%s: needs with nothing wrong: %v", lang, n)
		}
	}
}

func TestOverviewNeedsCarryTheirFixD469(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := homeApp(t, lang, true)
		L := app.L
		var got []string
		for _, n := range app.setNeeds() {
			got = append(got, n.key+">"+n.tab)
		}
		want := "[src:oo>accounts memask>memory memp:local:codex>memory]"
		if s := "[" + strings.Join(got, " ") + "]"; s != want {
			t.Fatalf("%s: needs %s, want %s", lang, s, want)
		}
		for _, s := range []string{L.T("home.lead.many", 3), L.T("need.source", "OOMOL"), L.T("need.memask.one"), L.T("need.memplug", "Codex")} {
			if _, ok := tt.Find(s); !ok {
				t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
			}
		}
		// The plugin's fix is in Memory: its button goes there, and the pane's head says it again
		// in the needs-you ink, beside the partner in its flag pose.
		if err := tt.Click(spoken(L, L.T("need.go.update"), L.T("need.memplug", "Codex"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if app.settingsTab() != TabMemory {
			t.Fatalf("%s: went to %q", lang, app.settingsTab())
		}
		for i := 0; i < 4; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		for _, s := range []string{L.T("say.memory.on"), L.T("need.memplug", "Codex")} {
			if _, ok := tt.Find(s); !ok {
				t.Fatalf("%s: memory head lacks %q in %q", lang, s, tt.Texts())
			}
		}
	}
}

func TestPaneSaysItsStateD469(t *testing.T) {
	app, _ := homeApp(t, i18n.ZH, false)
	L := app.L
	if got := app.paneSay(TabAccounts, ""); got != L.T("say.accounts", 3) {
		t.Fatalf("accounts: %q", got)
	}
	app.S.Connections = nil
	if got := app.paneSay(TabAccounts, ""); got != L.T("say.accounts.none") {
		t.Fatalf("no accounts: %q", got)
	}
	app.S.Settings.Memory = false
	if got := app.paneSay(TabMemory, ""); got != L.T("say.memory.off") {
		t.Fatalf("memory off: %q", got)
	}
	// Never the retired words, never a counter of things.
	for _, k := range []string{"home.lead.many", "need.update", "need.memask", "say.accounts"} {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			s := i18n.New(lang).T(k, 2)
			for _, bad := range []string{"件", " · ", "奏章", "朱批"} {
				if strings.Contains(s, bad) {
					t.Fatalf("%s %s: %q has %q", lang, k, s, bad)
				}
			}
		}
	}
}
