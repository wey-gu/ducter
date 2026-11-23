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

// D496: the opened task after the fix (Sent out in words, a wait whose
// condition is in another language quoted), against apps/web/demo-d496.ts,
// at 1400 and 1000, zh and en, light and dark. A live run only:
//
//	DUCTER_PORT=7496 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d496.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7496/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d496/after> \
//	  DUCTER_SHOTS_TAG=after [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D496Shots
func TestD496Shots(t *testing.T) {
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
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac%d-%s-%s-%s.png", w, lang, paper, name)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
	for _, w := range []int{1400, 1000} {
		h.app.OpenTask("t496")
		h.until("history", func() bool { return h.app.S.Task("t496").HistoryLoaded })
		shoot("task", w, 900)
		shoot("task-tall", w, 1800)
	}
}
