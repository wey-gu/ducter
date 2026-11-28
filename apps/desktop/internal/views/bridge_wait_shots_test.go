package views

// D656 (research/243 Brief D): the Mac's frames of the bridge-wait demo: the conversation's
// one line naming the task and who it waits on, and On hand's 在等 Codex 回话 row, in zh and en,
// light and dark, at 2x. A live run:
//
//	DUCTER_PORT=7681 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-bridge-wait.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7681/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/bridgeq/after/mac go test ./internal/views -run BridgeWaitShots -count=1

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

func TestBridgeWaitShots(t *testing.T) {
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
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.OnHand.Tasks) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
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
	crop2x := func(file string, r image.Rectangle) {
		src := h.tt.Image()
		r = r.Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
			}
		}
		save(file, out)
	}
	shoot := func(name string, w, hgt int) {
		h.tt.SetSize(w, hgt)
		settle()
		save(fmt.Sprintf("mac-%d-%s-%s-%s.png", w, lang, paper, name), h.tt.Image())
	}
	// The conversation: the line at the bottom, over the composer.
	h.app.Route = RouteConversation
	settle()
	shoot("conv", 1150, 1000)
	crop2x(fmt.Sprintf("mac-1150-%s-%s-conv-line-2x.png", lang, paper), image.Rect(180, 325, 840, 465))
	// On hand: the task's row in 在等.
	h.app.Route = RouteOnHand
	settle()
	shoot("onhand", 1150, 900)
	crop2x(fmt.Sprintf("mac-1150-%s-%s-onhand-card-2x.png", lang, paper), image.Rect(185, 235, 965, 315))
}
