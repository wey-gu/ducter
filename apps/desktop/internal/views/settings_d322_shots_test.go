package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D322: Settings › Partner in the five cases a person brings to it, built
// from frames (no core): one AI agent signed in on a server (the author's
// case: Codex only, Claude Code not installed), two on this Mac, none
// signed in, a server home with both, and a pasted key only.
type d322Case struct {
	name    string
	home    protocol.DeviceView
	url     string
	brain   *protocol.BrainNow
	setting *protocol.Brain
	rules   bool
}

func d322Cases() []d322Case {
	resets := time.Now().Add(18 * time.Hour).UTC().Format(time.RFC3339)
	opus := []protocol.HarnessModel{{ID: "opus", Label: "Opus"}, {ID: "sonnet", Label: "Sonnet"}}
	ccModels := []protocol.BrainModel{{ID: "opus", Label: "Opus", Kind: "smart"}, {ID: "sonnet", Label: "Sonnet", Kind: "fast"}}
	cc := protocol.DeviceHarness{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan", Models: opus,
		Allowance: &protocol.Allowance{Left: 0.62, ResetsAt: resets, SharedBy: 1}}
	cx := protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"}
	cxLimit := cx
	cxLimit.Allowance = &protocol.Allowance{Left: 0.48, ResetsAt: time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)}
	none := func(h string) protocol.DeviceHarness { return protocol.DeviceHarness{Harness: h} }
	signedOut := func(h string) protocol.DeviceHarness {
		return protocol.DeviceHarness{Harness: h, Installed: true, CanBePartner: true}
	}
	dev := func(id, name, kind string, hs ...protocol.DeviceHarness) protocol.DeviceView {
		return protocol.DeviceView{ID: id, Name: name, Kind: kind, Home: true, State: "online", Harnesses: hs}
	}
	return []d322Case{
		{name: "one-agent", url: "wss://hetzner.example.com/ws",
			home:  dev("hetzner", "Hetzner Server", "server", none("claude-code"), cx, none("pi"), none("deepseek-harness")),
			brain: &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Auto: true, Why: "only_codex"}},
		{name: "two-agents",
			home:  dev("local", "MacBook", "laptop", cc, cxLimit, none("pi"), none("deepseek-harness")),
			brain: &protocol.BrainNow{Brain: protocol.Brain{Harness: "claude-code", Model: "opus"}, Models: ccModels}, setting: &protocol.Brain{Harness: "claude-code", Model: "opus"}, rules: true},
		{name: "none",
			home: dev("local", "MacBook", "laptop", signedOut("claude-code"), none("codex"), none("pi"), none("deepseek-harness"))},
		{name: "server", url: "wss://hel.example.com/ws",
			home:  dev("hel", "hel", "server", cc, cx, none("pi"), none("deepseek-harness")),
			brain: &protocol.BrainNow{Brain: protocol.Brain{Harness: "claude-code", Model: "opus"}, Models: ccModels}, setting: &protocol.Brain{Harness: "claude-code", Model: "opus"}},
		{name: "key-only",
			home: dev("local", "MacBook", "laptop", none("claude-code"), none("codex"), none("pi"),
				protocol.DeviceHarness{Harness: "deepseek-harness", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "usage"}),
			brain: &protocol.BrainNow{Brain: protocol.Brain{Harness: "deepseek-harness"}, Auto: true, Why: "only_signed_in"}},
	}
}

// d322App is the app showing Settings › Partner in one case.
func d322App(t *testing.T, lang i18n.Lang, k d322Case) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = 2 // client.Connected
	app.URL = k.url
	app.OpenPartner()
	app.Receive(protocol.ServerFrame{T: "settings",
		Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Memory: true, Notify: true, DefaultAfterMin: 30, Brain: k.setting},
		Mem:      &protocol.MemView{State: "connected"}, BrainNow: k.brain})
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{k.home}})
	if k.rules {
		rule := map[i18n.Lang]string{i18n.ZH: "后端的事 → Codex", i18n.EN: "Backend work → Codex"}[lang]
		app.Receive(protocol.ServerFrame{T: "rules", Rules: []protocol.RuleView{{ID: "r1", Text: rule}}})
	}
	app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "returning"}})
	return app, sent
}

// DUCTER_D322_SHOTS=<dir> go test ./internal/views -run TestD322PartnerShots
func TestD322PartnerShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D322_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D322_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, k := range d322Cases() {
			app, _ := d322App(t, lang, k)
			for _, w := range []int{1280, 900} {
				tt := ui.NewTesterWith(app.View, w, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				settle := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(300 * time.Millisecond)
					}
				}
				d302Both(t, app, tt, settle, fmt.Sprintf("partner-%s-%d", k.name, w), lang)
			}
		}
	}
}

// D322: the pane is one story, said once: what it thinks with, who does the
// tasks, one place to add another AI, and the hand-off; nothing repeated,
// nothing reassuring where nothing can change.
func TestD322PartnerStory(t *testing.T) {
	cases := map[string]d322Case{}
	for _, k := range d322Cases() {
		cases[k.name] = k
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		frame := func(k d322Case) (*ui.Tester, *[]any) {
			app, sent := d322App(t, lang, k)
			tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			return tt, sent
		}
		must := func(tt *ui.Tester, name string, want ...string) {
			t.Helper()
			for _, w := range want {
				if !tt.HasText(w) {
					t.Errorf("%s %s: no %q in %q", lang, name, w, tt.Texts())
				}
			}
		}
		never := func(tt *ui.Tester, name string, not ...string) {
			t.Helper()
			for _, w := range not {
				if tt.HasText(w) {
					t.Errorf("%s %s: %q should not show", lang, name, w)
				}
			}
		}
		// The author's case: Codex only, on a server.
		tt, _ := frame(cases["one-agent"])
		must(tt, "one", L.T("loadout.brain.title"), L.T("loadout.tasks.only", "Codex"), L.T("loadout.add.title"), L.T("loadout.add.one", "Ducter"),
			"Claude Code", L.T("loadout.add.install"), L.T("key.settings.row"), L.T("handoff.one"))
		never(tt, "one", L.T("loadout.brain.keep"), L.T("loadout.switch"), L.T("loadout.signed_in"), L.T("loadout.brain.auto", "Codex"),
			L.T("loadout.tray", "Hetzner Server"), L.T("loadout.tasks.devices"))
		// Two agents: the choice, the reassurance, a switch per agent, how it picks.
		tt, sent := frame(cases["two-agents"])
		must(tt, "two", L.T("loadout.brain.keep"), L.T("loadout.tasks.how", "Ducter"), L.T("loadout.tasks.override"), L.T("loadout.add.more", "Ducter"))
		never(tt, "two", L.T("handoff.one"))
		if err := tt.Click(spoken(L, L.T("loadout.switch"), L.T("loadout.brain.title"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if err := tt.Click(spoken(L, L.T("loadout.use"), "Codex")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		tt.Frame()
		if s, ok := lastSent[protocol.SettingsSet](*sent); !ok || s.Patch.Brain == nil || s.Patch.Brain.Harness != "codex" {
			t.Errorf("%s: switch sent %+v", lang, s)
		}
		if !tt.HasText(L.T("said.brain", "Codex")) {
			t.Errorf("%s: no word after the switch", lang)
		}
		// Nothing signed in: one empty row, the add block, no tasks or hand-off.
		tt, _ = frame(cases["none"])
		must(tt, "none", L.T("loadout.brain.none"), L.T("loadout.add.none", "Ducter"), L.T("loadout.add.signin.go"), L.T("loadout.add.install.go"))
		never(tt, "none", L.T("loadout.tasks.title"), L.T("handoff.title"))
		// A key only: said as a key, paid per use.
		tt, _ = frame(cases["key-only"])
		must(tt, "key", "DeepSeek Harness", L.T("loadout.brain.key"))
	}
}
