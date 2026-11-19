package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// TestPartnerModelsWrapWhenMany: the author's 0.0.91 shot — Codex's real list
// (five models and more) beside the title squeezed the title column to one
// character, "用哪个模型" stacked a glyph a line. With more than three models the
// title keeps its row and the models wrap below it, every one on screen.
func TestPartnerModelsWrapWhenMany(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1400} {
			app, _ := iaApp(t, lang)
			f := settingsFrame()
			f.BrainNow = &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Auto: true, Why: "only_codex", Models: []protocol.BrainModel{
				{ID: "gpt-6.2-sol", Label: "GPT-6.2-Sol", Default: true},
				{ID: "gpt-6.2-astra", Label: "GPT-6.2-Astra"},
				{ID: "gpt-6.1-terra", Label: "GPT-6.1 Terra"},
				{ID: "gpt-6.1-sol", Label: "GPT-6.1-Sol"},
				{ID: "gpt-6-astra", Label: "GPT-6-Astra"},
				{ID: "gpt-6-luna", Label: "GPT-6-Luna"},
			}}
			app.Receive(f)
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "dev_home", Name: "test-home", Kind: "server", Home: true, State: protocol.DeviceAwake,
				Harnesses: []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true}}}}})
			app.OpenPartner()
			tt := ui.NewTesterWith(app.View, w, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			if dir := os.Getenv("DUCTER_SHOTS_DIR"); dir != "" && w == 1000 {
				if f, err := os.Create(filepath.Join(dir, "brain-models-many-"+string(lang)+".png")); err == nil {
					_ = png.Encode(f, tt.Image())
					f.Close()
				}
			}
			title := app.L.T("loadout.brain.model")
			r, ok := tt.Find(title)
			if !ok {
				t.Fatalf("%s %d: no %q in %q", lang, w, title, tt.Texts())
			}
			if r.H > 40 || r.W < 40 {
				t.Errorf("%s %d: the title %q is squeezed: %+v", lang, w, title, r)
			}
			for _, m := range f.BrainNow.Models {
				b, ok := tt.Find(m.Label)
				if !ok {
					t.Errorf("%s %d: no %q", lang, w, m.Label)
					continue
				}
				if b.X+b.W > float32(w) || b.H > 40 {
					t.Errorf("%s %d: %q off screen or broken: %+v", lang, w, m.Label, b)
				}
			}
		}
	}
}
