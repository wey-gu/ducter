package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D666 (research/247 Brief D): a connection says what is true. Mac shots of the three panes
// the brief names: Accounts' calling card with Tuwa out of reach (today's count and a ready word
// before; the failed line, no count and Try again after), Overview's 也能找我 and the Chat apps
// head with Feishu / Lark linked, and Import's signed-out source with its head and Try again.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/conntrue/mac/before \
//	  go test ./internal/views -run ConnTrueShots
func TestConnTrueShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	phoneFrame := func(state string) protocol.ServerFrame {
		pv := &protocol.PhoneView{Provider: "Tuwa", CapUSD: 10, SpentTodayUSD: 1.6, Calls: 1}
		pv.Rails = &struct {
			Cap      bool `json:"cap"`
			Sampling bool `json:"sampling"`
			Shared   bool `json:"shared"`
		}{true, true, false}
		return protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{
			{ID: "c1", Name: "OOMOL", Source: "oo", Via: "oo", State: "ok", Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"w@nowledge-labs.ai", "weyl.gu@gmail.com"}}}},
			{ID: "c2", Name: "Tuwa", URL: protocol.TuwaMCP, Source: "mcp", Via: "manual", State: state, SignIn: true, Phone: pv},
		}, Oo: &protocol.OoDetect{Installed: true, Account: true}}
	}
	channelsFrame := protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{
		{Kind: "telegram", State: "linked", Bot: &protocol.ChannelBot{Name: "Wey's Ducter", Handle: "weys_ducter_bot"}, Linked: &protocol.ChannelLinked{Name: "Wey Gu"}},
		{Kind: "feishu", State: "linked", Domain: "feishu", Bot: &protocol.ChannelBot{Name: "Ducter"}, Linked: &protocol.ChannelLinked{Name: "Wey Gu", At: "2026-11-20T08:00:00Z"}},
	}}
	signedOut := protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{
		{ID: "lody", App: "Lody", State: "signed_out", Problem: "signed_out", Imported: 0},
	}}}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, width := range []int{1000, 1400} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				if dark {
					app.T = theme.PebbleDark()
				}
				app.Receive(settingsFrame())
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "hel", Kind: "server", Home: true, AlwaysOn: true, State: protocol.DeviceAwake}}})
				app.Receive(channelsFrame)
				tt := ui.NewTesterWith(app.View, width, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				settle := func() {
					for i := 0; i < 5; i++ {
						tt.Frame()
						tt.Advance(120 * time.Millisecond)
					}
				}
				save := func(name string) {
					tt.Move(float32(width)/2, 340)
					settle()
					shotTester(t, tt, fmt.Sprintf("mac-%s-%s-%s-%d", name, lang, mode, width))
				}
				crop := func(name string, y, h int) {
					img := tt.Image()
					b := img.Bounds()
					top, bottom := y*2, (y+h)*2
					if bottom > b.Dy() {
						bottom = b.Dy()
					}
					if top > bottom {
						top = bottom
					}
					sub := img.SubImage(image.Rect(0, top, b.Dx(), bottom))
					f, err := os.Create(filepath.Join(shotsDir(t), fmt.Sprintf("crop-2x-mac-%s-%s-%s-%d.png", name, lang, mode, width)))
					if err != nil {
						t.Fatal(err)
					}
					defer f.Close()
					_ = png.Encode(f, sub)
				}

				// Accounts: the calling card with Tuwa out of reach.
				app.Receive(phoneFrame("unreachable"))
				app.openTab(TabAccounts)
				save("accounts-unreachable")
				if width == 1000 {
					crop("accounts-unreachable", 880, 700)
				}

				// A signed-in-again card stays as it was (Sign in again, no count).
				app.Receive(phoneFrame("unauthorized"))
				save("accounts-unauthorized")
				if width == 1000 {
					crop("accounts-unauthorized", 880, 700)
				}

				// Overview: 也能找我, and the Chat apps head, with Feishu / Lark linked.
				app.openTab("")
				save("overview-reach")
				if width == 1000 {
					crop("overview-reach", 0, 620)
				}
				app.openTab(TabChats)
				save("chats-head")
				if width == 1000 {
					crop("chats-head", 0, 260)
				}

				// Import: a source present and signed out; the head is the state, the row has Try again.
				app.Receive(signedOut)
				app.openTab(TabImport)
				save("import-signed-out")
				if width == 1000 {
					crop("import-signed-out", 0, 420)
				}
				app.imports.notice = app.L.T("imports.removed")
				save("import-removed")
				if width == 1000 {
					crop("import-removed", 0, 420)
				}
			}
		}
	}
}
