package theme

// D497: each partner is the same clay figure in its own clay colour
// (design/personas.md "Look", research/215). A look is a token; LookClay
// says how it recolours the art: a hue turn then a saturation, the same
// sRGB matrices as CSS's hue-rotate() and saturate() (the web's --clay,
// packages/protocol/src/partners.ts LOOK_CLAY), so a partner looks the
// same on the Mac and the web. The default's sand is the art as drawn.

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"math"
	"sync/atomic"

	"github.com/egoist/mygo/ui"
)

// ClayTint is one look's recolouring.
type ClayTint struct {
	Hue, Sat float64
}

// LookClay is every look's recolouring (LOOK_CLAY on the web).
var LookClay = map[string]ClayTint{
	"sand":    {0, 1},
	"sage":    {95, 0.62},
	"sky":     {175, 0.85},
	"plum":    {255, 0.7},
	"apricot": {-28, 1},
}

// LookTone is c in a look's clay (D526): the same hue turn and saturation
// the look gives the art, so a partner's small mark is the colour of its
// figure. The default's sand leaves c as it is.
func LookTone(c ui.Color, look string) ui.Color {
	if plain(look) {
		return c
	}
	m := clayMatrix(LookClay[look])
	r, g, b := float64(c.R), float64(c.G), float64(c.B)
	ch := func(v float64) uint8 { return uint8(math.Max(0, math.Min(255, v)) + 0.5) }
	out := ui.RGB(ch(m[0]*r+m[1]*g+m[2]*b), ch(m[3]*r+m[4]*g+m[5]*b), ch(m[6]*r+m[7]*g+m[8]*b))
	return out.Alpha(float32(c.A) / 255)
}

// artLook is the look of the partner the window shows: Face, FaceClosed,
// Art and ArtClosed draw the figure in it.
var artLook atomic.Value

// UseLook says which partner's clay the window's figure is in; "" or
// "sand" draws the art as it is. The app sets it every frame.
func UseLook(look string) { artLook.Store(look) }

func shownLook() string {
	if v, ok := artLook.Load().(string); ok {
		return v
	}
	return ""
}

// plain reports whether a look draws the art as it is.
func plain(look string) bool {
	t, ok := LookClay[look]
	return !ok || (t.Hue == 0 && t.Sat == 1)
}

// FaceAs is Face in a given partner's clay (an On hand mark, a switch).
func FaceAs(look string, p Presence, px float32) *ui.Bitmap {
	size := 128
	if px > 128 {
		size = 256
	}
	return loadAs(fmt.Sprintf("art/crop/ducter_%s@%d.png", p, size), look)
}

// loadAs loads an art file in a look, recoloured once and kept.
func loadAs(name, look string) *ui.Bitmap {
	if plain(look) {
		return load(name)
	}
	key := name + "#" + look
	artMu.Lock()
	if b, ok := artCache[key]; ok {
		artMu.Unlock()
		return b
	}
	artMu.Unlock()
	data, err := artFS.ReadFile(name)
	var b *ui.Bitmap
	if err == nil {
		var img image.Image
		if img, err = png.Decode(bytes.NewReader(data)); err == nil {
			b = ui.NewBitmap(recolour(img, LookClay[look]))
		}
	}
	if err != nil || b == nil {
		b = load(name)
	}
	artMu.Lock()
	artCache[key] = b
	artMu.Unlock()
	return b
}

// clayMatrix is hue-rotate(h) then saturate(s), as the Filter Effects spec
// writes them.
func clayMatrix(t ClayTint) [9]float64 {
	r := t.Hue * math.Pi / 180
	c, s := math.Cos(r), math.Sin(r)
	h := [9]float64{
		0.213 + c*0.787 - s*0.213, 0.715 - c*0.715 - s*0.715, 0.072 - c*0.072 + s*0.928,
		0.213 - c*0.213 + s*0.143, 0.715 + c*0.285 + s*0.140, 0.072 - c*0.072 - s*0.283,
		0.213 - c*0.213 - s*0.787, 0.715 - c*0.715 + s*0.715, 0.072 + c*0.928 + s*0.072,
	}
	v := t.Sat
	sat := [9]float64{
		0.213 + 0.787*v, 0.715 - 0.715*v, 0.072 - 0.072*v,
		0.213 - 0.213*v, 0.715 + 0.285*v, 0.072 - 0.072*v,
		0.213 - 0.213*v, 0.715 - 0.715*v, 0.072 + 0.928*v,
	}
	var m [9]float64
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			for k := 0; k < 3; k++ {
				m[i*3+j] += sat[i*3+k] * h[k*3+j]
			}
		}
	}
	return m
}

// recolour recolours an image by a look (on its unpremultiplied colours).
func recolour(src image.Image, t ClayTint) *image.NRGBA {
	b := src.Bounds()
	out := image.NewNRGBA(b)
	draw.Draw(out, b, src, b.Min, draw.Src)
	m := clayMatrix(t)
	clamp := func(v float64) uint8 {
		if v < 0 {
			return 0
		}
		if v > 255 {
			return 255
		}
		return uint8(v + 0.5)
	}
	for i := 0; i+3 < len(out.Pix); i += 4 {
		if out.Pix[i+3] == 0 {
			continue
		}
		r, g, bl := float64(out.Pix[i]), float64(out.Pix[i+1]), float64(out.Pix[i+2])
		out.Pix[i] = clamp(m[0]*r + m[1]*g + m[2]*bl)
		out.Pix[i+1] = clamp(m[3]*r + m[4]*g + m[5]*bl)
		out.Pix[i+2] = clamp(m[6]*r + m[7]*g + m[8]*bl)
	}
	return out
}
