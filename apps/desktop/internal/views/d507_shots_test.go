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

// D507: a helper on On hand, its own sheet with the work it keeps
// (apps/web/demo-d507.ts), at 1400 and 1000, light or dark. A live run only:
//
//	DUCTER_PORT=7506 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_HELPER=busy bun apps/web/demo-d507.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7506/ws DUCTER_SHELL_LANG=zh DUCTER_D507_NAME=busy \
//	  DUCTER_SHOTS_DIR=<.shots/d507> [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D507Shots -count=1
func TestD507Shots(t *testing.T) {
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
	h.app.Route = RouteOnHand
	settle := func() {
		for i := 0; i < 10; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	settle()
	for _, w := range []int{1400, 1000} {
		h.tt.SetSize(w, 1000)
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac%d-%s-%s-%s.png", w, lang, paper, os.Getenv("DUCTER_D507_NAME"))))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
}
