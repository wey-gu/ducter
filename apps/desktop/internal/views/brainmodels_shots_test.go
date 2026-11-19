package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D390: Settings › Partner on a Codex-only home whose Codex lists its own
// models: on its default, and with GPT-6.2-Astra chosen.
// DUCTER_D390_SHOTS=<dir> go test ./internal/views -run TestD390PartnerModelShots
func TestD390PartnerModelShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D390_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D390_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	cx := protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"}
	models := []protocol.BrainModel{
		{ID: "gpt-6.2-sol", Label: "GPT-6.2-Sol", Default: true}, {ID: "gpt-6.2-astra", Label: "GPT-6.2-Astra"},
		{ID: "gpt-6.1-terra", Label: "GPT-6.1-Terra"}, {ID: "gpt-6-luna", Label: "GPT-6-Luna"},
	}
	home := protocol.DeviceView{ID: "hel", Name: "hel", Kind: "server", Home: true, State: "online", Harnesses: []protocol.DeviceHarness{{Harness: "claude-code"}, cx}}
	cases := []d322Case{
		{name: "codex-default", url: "wss://hel.example.com/ws", home: home,
			brain: &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Auto: true, Why: "only_codex", Models: models}},
		{name: "codex-astra", url: "wss://hel.example.com/ws", home: home,
			brain:   &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex", Model: "gpt-6.2-astra"}, Models: models},
			setting: &protocol.Brain{Harness: "codex", Model: "gpt-6.2-astra"}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, k := range cases {
			app, _ := d322App(t, lang, k)
			tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			settle := func() {
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
			}
			d302Both(t, app, tt, settle, "partner-"+k.name, lang)
		}
	}
}
