package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The plain clay token (token_ink) is the coin of an AI agent with no coin
// of its own: here opencode, signed in beside Claude Code and Codex, and amp,
// signed out (apps/web/demo-loadout.ts DEMO_CASE=other is the web's twin).
// Settings › Partner and Devices, light and dark, zh and en, from frames (no
// core); the faded token is theme/faded_test.go's:
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/token-ink/after go test ./internal/views -run TokenInkShots
func TestTokenInkShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	hs := []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"},
		{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"},
		{Harness: "opencode", Installed: true, LoggedIn: true},
		{Harness: "amp", Installed: true},
		{Harness: "pi"},
	}
	home := protocol.DeviceView{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Platform: "darwin-arm64", Harnesses: hs}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.Status = 2 // client.Connected
		app.OpenPartner()
		app.Receive(protocol.ServerFrame{T: "settings",
			Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Memory: true, Notify: true, DefaultAfterMin: 30, Brain: &protocol.Brain{Harness: "claude-code", Model: "opus"}},
			Mem:      &protocol.MemView{State: "connected"}, BrainNow: &protocol.BrainNow{Brain: protocol.Brain{Harness: "claude-code", Model: "opus"}}})
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{home}})
		app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "returning"}})
		tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		settle := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(300 * time.Millisecond)
			}
		}
		d302Both(t, app, tt, settle, "settings-partner", lang)
		app.Route = RouteDevices
		tt.SetSize(1280, 1000)
		d302Both(t, app, tt, settle, "devices", lang)
	}
}
