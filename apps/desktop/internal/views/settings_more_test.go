package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D307: Settings › Partner holds what the last lanes left on their own
// surfaces: a pasted key (D298), the hand-off when a limit runs out
// (D297), and what the person's own AI agents keep (D298, D299).
func TestSettingsPartnerMoreRows(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, sent := iaApp(t, lang)
		app.Status = client.Connected
		app.OpenPartner()
		app.Receive(settingsFrame())
		app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "returning", OutsideHidden: []string{"codex"}}})
		tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		for _, want := range []string{L.T("key.settings.row"), L.T("handoff.title"), L.T("handoff.row"), L.T("records.title"), L.T("records.look"), L.T("records.hidden", "Codex")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		// A switch sits at its row's right end, where the key row's button ends.
		edge, _ := tt.Find(L.T("key.paste.check.open"))
		flip := func(label, help string) {
			t.Helper()
			r, ok := tt.Find(label)
			h, ok2 := tt.Find(help)
			if !ok || !ok2 {
				t.Fatalf("%s: no %q", lang, label)
			}
			tt.ClickAt(edge.X+edge.W-24, (r.Y+h.Y+h.H)/2)
		}
		// The hand-off: the same setting as the limit card's switch, and the partner's word.
		flip(L.T("handoff.row"), L.T("handoff.help"))
		tt.Frame()
		if s, ok := lastSent[protocol.SettingsSet](*sent); !ok || s.Patch.LimitHandoff == nil || !*s.Patch.LimitHandoff {
			t.Errorf("%s: hand-off sent %+v", lang, s)
		}
		if !tt.HasText(L.T("said.handoff.on")) {
			t.Errorf("%s: no word after the hand-off", lang)
		}
		// Codex's conversations back in Past tasks.
		if err := tt.Click(spoken(L, L.T("records.show"), "Codex")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		tt.Frame()
		if v, ok := lastSent[protocol.OutsideHide](*sent); !ok || v.Agent != "codex" || v.Hidden {
			t.Errorf("%s: show again sent %+v", lang, v)
		}
		if tt.HasText(L.T("records.hidden", "Codex")) {
			t.Errorf("%s: Codex still listed as hidden", lang)
		}
		// Stop looking, from Settings (D327: off everywhere, so the finer rows go with it).
		flip(L.T("records.look"), L.T("records.look.help", L.T("first.here")))
		tt.Frame()
		if v, ok := lastSent[protocol.LocalAgents](*sent); !ok || v.On {
			t.Errorf("%s: looking sent %+v", lang, v)
		}
		// A key pasted here is answered here, never again over the composer.
		if err := tt.Click(L.T("key.paste.check.open")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if tt.HasText(L.T("key.paste.title")) {
			t.Errorf("%s: the Settings card repeats the conversation's title", lang)
		}
		app.kp.key = "sk-0123456789abcdef0123456789abcdef"
		if err := tt.Click(L.T("key.paste.check")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		k, ok := lastSent[protocol.KeyAdd](*sent)
		if !ok || k.ClientID == "" {
			t.Fatalf("%s: key sent %+v", lang, k)
		}
		good := &protocol.Words{ZH: "好了，这把 DeepSeek 的密钥能用。", EN: "That DeepSeek key works."}
		app.Receive(protocol.ServerFrame{T: "key_add_result", ClientID: k.ClientID, KeyResult: &protocol.KeyResult{OK: true, Provider: "deepseek", Harness: "pi", Say: good}})
		tt.Frame()
		if !tt.HasText(autospace(app.words(*good))) {
			t.Errorf("%s: no answer in Settings: %q", lang, tt.Texts())
		}
		if app.keyJustAdded() {
			t.Errorf("%s: a key from Settings would be answered again over the composer", lang)
		}
		shotTester(t, tt, "settings-partner-more-"+string(lang))
	}
}
