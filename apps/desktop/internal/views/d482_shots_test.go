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

// D482: the morning note and the asks in the conversation, and the same asks
// on On hand, against apps/web/demo-d482.ts, at 1280, zh and en, light and
// dark. A live run only:
//
//	DUCTER_PORT=7482 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d482.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7482/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d482/after> \
//	  DUCTER_SHOTS_TAG=after [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D482Shots
func TestD482Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	tag := os.Getenv("DUCTER_SHOTS_TAG")
	if tag == "" {
		tag = "after"
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	shoot := func(name string, w, hgt int) {
		h.tt.SetSize(w, hgt)
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-1280-%s-%s-%s.png", tag, lang, paper, name)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
	h.app.Route = RouteConversation
	h.app.open["how:f482a"] = true
	shoot("conv", 1280, 2600)
	h.app.replyOpen["d482_loop"] = true
	h.app.replyDraft["d482_loop"] = map[i18n.Lang]string{i18n.ZH: "等这轮 CI 绿了再跑", i18n.EN: "Wait for this CI round to go green first"}[lang]
	shoot("reply", 1280, 2600)
	h.app.replyOpen["d482_loop"] = false
	h.app.Route = RouteOnHand
	shoot("onhand", 1280, 1100)
}
