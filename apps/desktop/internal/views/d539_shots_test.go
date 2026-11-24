package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D539: 复制密钥 / Copy a key on the Mac at 1150, light and dark: the card in
// the conversation, the task waiting on it in 等你, the task's own card, and
// Ducter 存着的密钥 on this computer's card, against a demo core:
//
//	DUCTER_PORT=7941 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_KEYCOPY=1 bun apps/web/demo.ts
//	DUCTER_D539_URL=ws://127.0.0.1:7941/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/secret-copy go test ./internal/views -run D539Shots
func TestD539Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D539_URL")
	if url == "" {
		t.Skip("DUCTER_D539_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("the copy cards", func() bool { return h.app.S.Decisions["d_copy_both"] != nil })
	h.tt.SetSize(1150, 900)
	d302Both(t, h.app, h.tt, settle, "1150-01-conversation", lang)
	h.app.Route = RouteOnHand
	d302Both(t, h.app, h.tt, settle, "1150-02-onhand-needs-you", lang)
	h.app.OpenTask("t_prow")
	d302Both(t, h.app, h.tt, settle, "1150-03-task-card", lang)
	h.app.OpenDevices()
	h.until("the devices", func() bool { return h.app.S.Devices != nil })
	h.app.devState().sel = "local"
	settle()
	h.app.devState().card.sheet.fold = "kept:local"
	h.tt.SetSize(1150, 1400)
	d302Both(t, h.app, h.tt, settle, "1150-04-settings-kept-keys", lang)
}
