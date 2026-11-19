package views

import (
	"testing"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D390: a Codex-only home whose Codex lists its own models: the partner's
// model row offers them (its default chosen while none is named), says the
// default in plain words and never guesses smart or fast; a tap on Astra
// sets the brain to it and the partner says so.
func TestPartnerModelsFromCodexLiveList(t *testing.T) {
	for _, tc := range []struct {
		lang              i18n.Lang
		title, line, said string
	}{
		{i18n.ZH, "用哪个模型", "GPT-6.2-Sol 是 Codex 默认用的模型。", "好，从你的下一句话开始，我用 Codex 的 GPT-6.2-Astra 想事情。"},
		{i18n.EN, "Which model", "GPT-6.2-Sol is the model Codex uses by default.", "Got it: from your next message, I think with Codex with GPT-6.2-Astra."},
	} {
		app, sent := iaApp(t, tc.lang)
		f := settingsFrame()
		f.BrainNow = &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Auto: true, Why: "only_codex", Models: []protocol.BrainModel{
			{ID: "gpt-6.2-sol", Label: "GPT-6.2-Sol", Default: true},
			{ID: "gpt-6.2-astra", Label: "GPT-6.2-Astra"},
		}}
		app.Receive(f)
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "dev_home", Name: "test-home", Kind: "server", Home: true, State: protocol.DeviceAwake,
			Harnesses: []protocol.DeviceHarness{{Harness: "claude-code"}, {Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true}}}}})
		app.OpenPartner()
		tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		for _, want := range []string{tc.title, "GPT-6.2-Sol", "GPT-6.2-Astra", tc.line} {
			if !tt.HasText(want) {
				t.Errorf("%s: no %q in %q", tc.lang, want, tt.Texts())
			}
		}
		for _, not := range []string{"GPT-6.2-Sol 想得最深。", "GPT-6.2-Sol thinks the deepest.", "GPT-6.2-Astra 回得更快。", "用它自己默认的模型"} {
			if tt.HasText(not) {
				t.Errorf("%s: %q on the pane", tc.lang, not)
			}
		}
		*sent = nil
		if err := tt.Click("GPT-6.2-Astra"); err != nil {
			t.Fatalf("%s: %v", tc.lang, err)
		}
		tt.Frame()
		var got *protocol.Brain
		for _, m := range *sent {
			if p, ok := m.(protocol.SettingsSet); ok && p.Patch.Brain != nil {
				got = p.Patch.Brain
			}
		}
		if got == nil || got.Harness != "codex" || got.Model != "gpt-6.2-astra" {
			t.Fatalf("%s: the brain sent is %+v, want codex gpt-6.2-astra", tc.lang, got)
		}
		tt.Frame()
		if !tt.HasText(tc.said) {
			t.Errorf("%s: no %q in %q", tc.lang, tc.said, tt.Texts())
		}
	}
}

// D390: the model in use is the one named, else the agent's own default,
// else the first.
func TestBrainModelIndex(t *testing.T) {
	ms := []modelChoice{{id: "gpt-6.2-sol"}, {id: "gpt-6.2-astra", def: true}, {id: "gpt-6-luna"}}
	for model, want := range map[string]int{"": 1, "gpt-6-luna": 2, "gpt-gone": 1} {
		if got := brainModelIndex(ms, model); got != want {
			t.Errorf("brainModelIndex(%q) = %d, want %d", model, got, want)
		}
	}
	if got := brainModelIndex(ms[:1], ""); got != 0 {
		t.Errorf("no default: %d, want 0", got)
	}
}
