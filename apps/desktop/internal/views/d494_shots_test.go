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

// D494: Agent 通信 with the author's helpers (apps/web/demo-d494.ts), at 1280 and 760, zh and en, light
// and dark. A live run only:
//
//	DUCTER_PORT=7494 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d494.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7494/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d494> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D494Shots -count=1
func TestD494Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
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
	h.app.openTab(TabPeers)
	h.until("helpers", func() bool { return h.app.S.Settings != nil && h.app.S.Bridge != nil && len(h.app.S.Helpers) > 0 })
	settle()
	for _, w := range []int{1280, 760} {
		h.tt.SetSize(w, 2400)
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%d-peers-%s-%s.png", w, paper, lang)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
}
