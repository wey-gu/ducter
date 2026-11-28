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

// D650 (research/245 §3.8): the Keep card's head, the stall ask and the budget ask, on the Mac
// at 1150, headless. A live run against apps/web/demo-keep-ends.ts:
//
//	DUCTER_PORT=7611 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-ends.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7611/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<.shots/keep-ends> go test ./internal/views -run TestKeepEndsShots -count=1
func TestKeepEndsShots(t *testing.T) {
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
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.OnHand.Keeps) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	h.app.Route = RouteOnHand
	h.app.oh.keep = keepState{}
	settle := func() {
		for i := 0; i < 10; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	save := func(file string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	name := func(n string) string { return fmt.Sprintf("mac-%s-1150-%s-%s.png", n, lang, paper) }
	h.tt.SetSize(1150, 1600)
	settle()
	save(name("onhand"), h.tt.Image())
	// 2x crops: the head of the #11230 Keep and the two asks.
	crop := func(n string, r image.Rectangle) {
		src := h.tt.Image()
		r = r.Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
			}
		}
		save(name(n+"-2x"), out)
	}
	crop("asks", image.Rect(150, 180, 1010, 920))
	crop("head", image.Rect(150, 780, 1010, 1100))
}
