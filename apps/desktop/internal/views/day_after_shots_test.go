package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D623: the day after the first run, at 1150, zh, light and dark, against
// apps/web/demo-day-after.ts:
//
//	DUCTER_PORT=7901 DEMO_LANG=zh bun apps/web/demo-day-after.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7901/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/day-after/mac/light> \
//	  go test ./internal/views -run DayAfterShots -count=1
//	... DUCTER_SHOTS_DARK=1 DUCTER_SHOTS_DIR=<.shots/day-after/mac/dark>
func TestDayAfterShots(t *testing.T) {
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
	h.until("the day after", func() bool {
		for _, e := range h.app.S.Channel {
			if e.AI != nil && e.AI.DayAfter != nil {
				return true
			}
		}
		return false
	})
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	h.app.Route = RouteConversation
	settle := func() {
		for i := 0; i < 12; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 80*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.tt.SetSize(1150, 1500)
	settle()
	save := func(file string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	save(fmt.Sprintf("mac-1150-%s-%s.png", lang, paper), h.tt.Image())
	// 2x crop of the recap and its links.
	src := h.tt.Image()
	r := image.Rect(0, 220, 760, 640).Intersect(src.Bounds())
	out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
	for y := 0; y < r.Dy(); y++ {
		for x := 0; x < r.Dx(); x++ {
			draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
		}
	}
	save(fmt.Sprintf("mac-recap-2x-1150-%s-%s.png", lang, paper), out)
}
