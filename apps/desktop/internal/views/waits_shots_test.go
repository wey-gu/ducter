package views

// D628: the Mac board at 1150 for hel's five waiting tasks, before and after one truth for a
// PR (zh, light and dark), against apps/web/demo-waits.ts:
//
//	DUCTER_PORT=7614 DEMO_BEFORE=0 bun apps/web/demo-waits.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7614/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_LABEL=after \
//	  DUCTER_SHOTS_DIR=<.shots/waits/mac/light> go test ./internal/views -run WaitsShots -count=1
import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

func TestWaitsShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	label := os.Getenv("DUCTER_SHOTS_LABEL")
	if label == "" {
		label = "after"
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.OnHand.Tasks) >= 5 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	h.app.Route = RouteOnHand
	for i := 0; i < 10; i++ {
		start := time.Now()
		h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
		h.tt.Advance(200 * time.Millisecond)
	}
	h.tt.SetSize(1150, 1500)
	img := h.tt.Image()
	f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1150-zh-%s-%s.png", label, paper)))
	if err != nil {
		t.Fatal(err)
	}
	_ = png.Encode(f, img)
	f.Close()
	// The header and the waiting rows, doubled.
	r := image.Rect(0, 0, 1150, 760).Intersect(img.Bounds())
	out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
	for y := 0; y < r.Dy(); y++ {
		for x := 0; x < r.Dx(); x++ {
			out.Set(x*2, y*2, img.At(r.Min.X+x, r.Min.Y+y))
			out.Set(x*2+1, y*2, img.At(r.Min.X+x, r.Min.Y+y))
			out.Set(x*2, y*2+1, img.At(r.Min.X+x, r.Min.Y+y))
			out.Set(x*2+1, y*2+1, img.At(r.Min.X+x, r.Min.Y+y))
		}
	}
	c, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1150-zh-%s-%s-crop.png", label, paper)))
	if err != nil {
		t.Fatal(err)
	}
	_ = png.Encode(c, out)
	c.Close()
}
