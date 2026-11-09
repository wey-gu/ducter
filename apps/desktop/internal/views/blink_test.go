package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The closed faces are the open ones with only the eyes changed: past
// each lid's clip both are the same pixels, so a blink can't show a seam.
func TestClosedFacesDifferOnlyUnderTheLids(t *testing.T) {
	load := func(name string) image.Image {
		t.Helper()
		f, err := os.Open(filepath.Join("..", "theme", "art", name))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		img, err := png.Decode(f)
		if err != nil {
			t.Fatal(err)
		}
		return img
	}
	check := func(name string, lids []theme.Lid) {
		t.Helper()
		oi, ci := load(name), load(strings.Replace(name, "ducter_idle@", "ducter_idle_closed@", 1))
		if oi.Bounds() != ci.Bounds() {
			t.Fatalf("%s: sizes differ: %v vs %v", name, oi.Bounds(), ci.Bounds())
		}
		b := oi.Bounds()
		w, h := float32(b.Dx()), float32(b.Dy())
		changed := 0
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				if same(oi, ci, x, y) {
					continue
				}
				changed++
				inside := false
				for _, l := range lids {
					// The clip drawLids uses: the box's ellipse, 1.12×.
					cx, cy := (l.X+l.W/2)*w, (l.Y+l.H/2)*h
					rx, ry := l.W/2*w*1.12, l.H/2*h*1.12
					dx, dy := (float32(x)+0.5-cx)/rx, (float32(y)+0.5-cy)/ry
					if dx*dx+dy*dy <= 1 {
						inside = true
					}
				}
				if !inside {
					t.Fatalf("%s: pixel %d,%d changed outside every lid", name, x, y)
				}
			}
		}
		if changed == 0 {
			t.Fatalf("%s: the closed face is the open one", name)
		}
	}
	for _, size := range []int{128, 256} {
		check(fmt.Sprintf("crop/ducter_idle@%d.png", size), theme.FaceLids[:])
	}
	for _, size := range []int{160, 400} {
		check(fmt.Sprintf("ducter_idle@%d.png", size), squareLids[:])
	}
}

func same(a, b image.Image, x, y int) bool {
	r1, g1, b1, a1 := a.At(x, y).RGBA()
	r2, g2, b2, a2 := b.At(x, y).RGBA()
	return r1 == r2 && g1 == g2 && b1 == b2 && a1 == a2
}

// Blink frames at 2× (the 52-point face as a Retina screen draws it, and
// the title), headless: DUCTER_BLINK_SHOTS=1 writes blink-*.png to shotsDir.
func TestBlinkShots(t *testing.T) {
	if os.Getenv("DUCTER_BLINK_SHOTS") == "" {
		t.Skip("DUCTER_BLINK_SHOTS not set")
	}
	dir := shotsDir(t)
	ks := []float64{0, 0.25, 0.5, 0.75, 1}
	face, closed := theme.Face(theme.Idle, 104), faceBlink(104)
	sq, sqb := theme.Art(theme.Idle, 120), squareBlink(120)
	view := func(c *ui.Context) {
		ui.Column(c).Background(ui.Hex("#FBF6EC")).Padding(16).Gap(16).Grow(1).Children(func() {
			ui.Row(c).Gap(16).Children(func() {
				for i, k := range ks {
					ui.Box(c.Key(fmt.Sprint("f", i))).Size(208, 187).Draw(func(p *ui.Painter, r ui.Rect) {
						at := fitIn(face, r)
						p.Image(face, at, ui.Contain)
						drawLids(p, closed, at, k)
					})
				}
			})
			ui.Row(c).Gap(16).Children(func() {
				for i, k := range ks {
					ui.Box(c.Key(fmt.Sprint("s", i))).Size(208, 208).Draw(func(p *ui.Painter, r ui.Rect) {
						p.Image(sq, r, ui.Contain)
						drawLids(p, sqb, r, k)
					})
				}
			})
		})
	}
	tt := ui.NewTesterWith(view, 1136, 460, ui.TesterOptions{})
	tt.Frame()
	write(t, filepath.Join(dir, "blink-faces-2x.png"), tt)

	for _, at := range []float64{3.3, titleEyes + 0.11, titleEyes + 0.3, titleEyes + 0.5, titleFirstBlink + 0.035, titleFirstBlink + 0.075, titleFirstBlink + 0.11} {
		for _, lang := range []i18n.Lang{i18n.EN} {
			app, tt, _ := titleApp(t, lang, ui.Preferences{})
			app.title.at = at
			tt.Frame()
			tt.Advance(time.Second)
			write(t, filepath.Join(dir, fmt.Sprintf("blink-title-%.3f.png", at)), tt)
		}
	}
}
