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

// D470: Agent messaging, the Overview and the conversation against apps/web/demo-d470.ts, one
// stage per core, at 1280 and 760, zh and en, light and dark. A live run only:
//
//	DUCTER_PORT=7561 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_STAGE=exchanges bun apps/web/demo-d470.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7561/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d470/after> \
//	  DUCTER_SHOTS_STAGE=exchanges [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D470Shots
func TestD470Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	stage := os.Getenv("DUCTER_SHOTS_STAGE")
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
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%d-%s-%s-%s-%s.png", w, lang, paper, stage, name)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
	h.app.openTab(TabPeers)
	h.until("settings", func() bool { return h.app.S.Settings != nil && h.app.S.Bridge != nil })
	settle()
	for _, w := range []int{1280, 760} {
		shoot("peers", w, 1900)
	}
	if stage != "exchanges" {
		return
	}
	h.app.openTab(TabHome)
	settle()
	for _, w := range []int{1280, 760} {
		shoot("overview", w, 1400)
	}
	h.app.Route = RouteConversation
	settle()
	for _, w := range []int{1280, 760} {
		shoot("conv", w, 900)
	}
}
