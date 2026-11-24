package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D550: the review loop's Keep page, its quiet rounds folded wherever they
// run, the fold row closed and opened, with 2x crops. A live run only:
//
//	DUCTER_PORT=7550 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7550/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/keep-quiet/mac> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D550Shots -count=1
func TestD550Shots(t *testing.T) {
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
	tag := os.Getenv("DUCTER_SHOTS_TAG") // before / after
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
	const width = 1150
	name := func(n string) string { return fmt.Sprintf("mac-%s-%s-%d-%s-%s.png", tag, n, width, lang, paper) }
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
	var review string
	for _, k := range h.app.S.OnHand.Keeps {
		if k.Run == "same" && strings.Contains(k.Title, "100gle") {
			review = k.ID
		}
	}
	h.tt.SetSize(width, 2300)
	h.tt.Move(2, 2)
	h.app.Route = RouteOnHand
	h.app.openKeep(review)
	h.until("page", func() bool { return h.app.S.KeepPages[review] != nil })
	settle()
	save(name("page"), h.tt.Image())
	prefix := "Looked "
	if lang == i18n.ZH {
		prefix = "又看过"
	}
	folds := func() []string {
		var out []string
		for _, s := range h.tt.Texts() {
			if strings.HasPrefix(s, prefix) && !strings.Contains(strings.Join(out, "\n"), s) {
				out = append(out, s)
			}
		}
		return out
	}
	fs := folds()
	t.Logf("folds: %q", fs)
	around := func(s string) image.Rectangle {
		r, ok := h.tt.Find(s)
		if !ok {
			t.Fatalf("no %q", s)
		}
		return image.Rect(int(r.X)-60, int(r.Y)-56, int(r.X+r.W)+60, int(r.Y+r.H)+56)
	}
	if len(fs) == 0 {
		return
	}
	crop("fold-closed", around(fs[0]))
	if tag == "before" {
		return
	}
	if err := h.tt.Click(fs[0]); err != nil {
		t.Fatal(err)
	}
	settle()
	save(name("page-open"), h.tt.Image())
	r := around(fs[0])
	r.Max.Y += 300
	crop("fold-open", r)
}
