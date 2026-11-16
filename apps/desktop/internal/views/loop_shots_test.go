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

// D271: the review loop of the demo core (apps/web/demo.ts, task t_loop:
// 24 rounds of wake → look → its next wait, about 1,500 events), opened:
// how long a frame takes at its end and halfway up, and its shots.
//
//	DUCTER_PORT=7812 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7812/ws DUCTER_SHOTS_DIR=… go test ./internal/views -run TestLoopShots -v
func TestLoopShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	s := h.app.S
	h.until("the loop", func() bool { return s.Task("t_loop") != nil })
	h.app.OpenTask("t_loop")
	h.until("history", func() bool { return s.Task("t_loop").HistoryLoaded })
	h.tt.SetSize(1440, 900)
	for i := 0; i < 6; i++ {
		h.until("frames", func() bool { return true })
		h.tt.Advance(200 * time.Millisecond)
	}
	frames := func(name string) {
		t.Helper()
		const n = 30
		start := time.Now()
		for i := 0; i < n; i++ {
			h.tt.Advance(16 * time.Millisecond)
			h.tt.Frame()
		}
		t.Logf("D271 frame time, %s (%d events): %.2f ms", name, len(s.Task("t_loop").Events), float64(time.Since(start).Microseconds())/1000/n)
	}
	frames("at its end")
	shot := func(name string) {
		t.Helper()
		dir := os.Getenv("DUCTER_SHOTS_DIR")
		if dir == "" {
			return
		}
		_ = os.MkdirAll(dir, 0o755)
		for i := 0; i < 6; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", name, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	shot("loop-end")
	scrollTaskTo(h.app, "t_loop", 0.5)
	frames("halfway up")
	shot("loop-mid")
	scrollTaskTo(h.app, "t_loop", 0)
	shot("loop-top")
	if !hoverLocator(h.app, h.tt) {
		t.Error("no locator")
	}
	shot("loop-locator")
	h.tt.SetSize(900, 760)
	scrollTaskTo(h.app, "t_loop", 1)
	shot("loop-narrow")
}
