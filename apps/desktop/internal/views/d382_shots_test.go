package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D382: 晚点再问我 / Ask me later in the Mac app against the demo core: the
// conversation with the times open on the newest ask, and On hand with the
// put-off one in Waiting and the one back at its time, light and dark:
//
//	DUCTER_PORT=7841 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-later.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7841/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=../../../../.shots/later go test ./internal/views -run D382LiveShots
func TestD382LiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 15; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("asks", func() bool { return len(h.app.S.OpenDecisions()) >= 3 })
	// The times open on every open ask (the conversation shows the newest one's).
	for _, d := range h.app.S.OpenDecisions() {
		h.app.laterOpen[d.DecisionID] = true
	}
	shot := func(name string, dark bool) {
		paper := "light"
		if dark {
			paper = "dark"
		}
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s.png", name, lang, paper)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	for _, dark := range []bool{false, true} {
		h.tt.SetDark(dark)
		h.tt.SetSize(1180, 1000)
		h.app.Route = RouteConversation
		shot("conversation", dark)
		h.app.Route = RouteOnHand
		h.tt.SetSize(1180, 1500)
		shot("onhand", dark)
	}
}
