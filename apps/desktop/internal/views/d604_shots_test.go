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

// D604: the babysitter's sheet says where it receives (别的 agent 怎么找到它: its
// name in Nowledge Mem, then the Spaces it receives in, as hel's identity inbox
// read them). A live run only, against apps/web/demo-keep-v2.ts:
//
//	DUCTER_PORT=7604 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7604/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/helper-spaces/mac> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D604Shots -count=1
func TestD604Shots(t *testing.T) {
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
	var sitter string
	for _, k := range h.app.S.OnHand.Keeps {
		if k.Run == "perItem" {
			sitter = k.ID
		}
	}
	if sitter == "" {
		t.Fatal("no helper Keep in the demo")
	}
	for _, w := range []int{1150, 1400} {
		h.tt.SetSize(w, 1500)
		h.tt.Move(2, 2)
		h.app.Route = RouteOnHand
		h.app.closeKeep()
		h.app.openKeep(sitter)
		h.until("page", func() bool { return h.app.S.KeepPages[sitter] != nil })
		settle()
		p := h.app.S.KeepPages[sitter]
		if p.Address == nil || len(p.Address.Spaces) == 0 {
			t.Fatalf("the sheet has no Spaces: %+v", p.Address)
		}
		save(fmt.Sprintf("mac-sitter-%d-%s-%s.png", w, lang, paper), h.tt.Image())
		src := h.tt.Image()
		r := image.Rect(w-372, 40, w-4, 900).Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
			}
		}
		save(fmt.Sprintf("mac-sitter-rules-2x-%d-%s-%s.png", w, lang, paper), out)
		h.app.closeKeep()
	}
}
