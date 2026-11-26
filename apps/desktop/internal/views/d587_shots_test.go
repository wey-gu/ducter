package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D587: the conversation's end at 1150, light and dark, with two living messages each waiting on the
// partner's words, against apps/web/demo-d587.ts (shoot within its three minutes):
//
//	DUCTER_PORT=7587 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d587.ts
//	DUCTER_D587_URL=ws://127.0.0.1:7587/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/d587/after/mac go test ./internal/views -run D587Shots
func TestD587Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D587_URL")
	if url == "" {
		t.Skip("DUCTER_D587_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetScale(2)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("the conversation", func() bool { return len(h.app.S.Channel) > 0 })
	h.tt.Advance(time.Second)
	h.app.Route = RouteConversation
	h.tt.SetSize(1150, 900)
	h.app.list.ScrollToEnd()
	settle()
	d302Both(t, h.app, h.tt, settle, "conv-end-1150", lang)
}
