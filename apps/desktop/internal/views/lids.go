package views

import (
	"math"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The blink (D77). The closed face is the same render with each eye filled
// from the clay round it (tools/art/eyes.py), so it differs from the open
// face only inside each lid box. A blink draws it through a lid that slides
// down over each eye: an ellipse a little larger than the filled one (past
// its edge both faces are the same pixels, so no seam can show), cut by
// the lid's lower edge. A crease rides just above that edge as the lid
// closes, and stays as the closed eye's line.

// blinkArt is a face's closed version and where its eyes are.
type blinkArt struct {
	closed *ui.Bitmap
	lids   []theme.Lid
}

// faceBlink is the blink of the cut-out idle face (theme.Face).
func faceBlink(px float32) *blinkArt {
	if b := theme.FaceClosed(px); b != nil {
		return &blinkArt{closed: b, lids: theme.FaceLids[:]}
	}
	return nil
}

// squareBlink is the blink of the square idle art (theme.Art), its lids
// mapped through where the cut-out art sits in the square.
func squareBlink(px float32) *blinkArt {
	if b := theme.ArtClosed(px); b != nil {
		return &blinkArt{closed: b, lids: squareLids[:]}
	}
	return nil
}

// squareLids are the idle face's eyelids on the square art (theme.Art).
var squareLids = func() [2]theme.Lid {
	sq := theme.IdleSquareContent
	var out [2]theme.Lid
	for i, l := range theme.FaceLids {
		out[i] = theme.Lid{X: sq.X + l.X*sq.W, Y: sq.Y + l.Y*sq.H, W: l.W * sq.W, H: l.H * sq.H}
	}
	return out
}()

// lidInk is the closed eye's crease: the eyes' own dark brown.
var lidInk = [3]uint8{58, 33, 22}

// drawLids shuts the eyes of the face drawn in dr by k (0 open … 1 shut).
func drawLids(p *ui.Painter, b *blinkArt, dr ui.Rect, k float64) {
	if b == nil || b.closed == nil || k <= 0.005 {
		return
	}
	k = math.Min(1, k)
	kf := float32(k)
	for _, l := range b.lids {
		bx, by, bw, bh := dr.X+l.X*dr.W, dr.Y+l.Y*dr.H, l.W*dr.W, l.H*dr.H
		cx, cy := bx+bw/2, by+bh/2
		rx, ry := bw/2*1.12, bh/2*1.12
		// The upper lid comes down to the closed eye's line, a little below
		// the middle; the lower lid rises to meet it, late (it moves less).
		// Both edges bow down in the middle, as lids do.
		top, bottom := cy-ry, cy+ry
		shut := by + bh*0.70
		bow := func(x float32) float32 {
			u := (x - cx) / rx
			return bh * 0.10 * (1 - u*u)
		}
		upper := func(x float32) float32 { return top + (shut-top)*kf + bow(x)*kf }
		kl := kf * kf * kf
		lower := func(x float32) float32 { return bottom - (bottom-shut)*kl + bow(x)*kl }
		var clip ui.Path
		const n = 48
		for _, lid := range []func(x, y float32) float32{
			func(x, y float32) float32 { return min(y, upper(x)) },
			func(x, y float32) float32 { return max(y, lower(x)) },
		} {
			for i := 0; i <= n; i++ {
				a := 2 * math.Pi * float64(i) / n
				x := cx + rx*float32(math.Cos(a))
				y := lid(x, cy+ry*float32(math.Sin(a)))
				if i == 0 {
					clip.MoveTo(x, y)
				} else {
					clip.LineTo(x, y)
				}
			}
			clip.Close()
		}
		p.ClipPath(&clip, func() {
			p.ImageRegion(b.closed, ui.Rect{}, dr, ui.ImageOptions{})
		})
		// The crease: the upper lid's edge, drawn from a third shut on, and
		// the closed eye's soft downward line when shut.
		if la := smooth01((k - 0.3) / 0.5); la > 0.01 {
			x0, x1 := bx+bw*0.22, bx+bw*0.78
			var lash ui.Path
			lash.MoveTo(x0, upper(x0)).QuadTo(cx, 2*upper(cx)-(upper(x0)+upper(x1))/2, x1, upper(x1)).Cap(ui.RoundCap)
			p.StrokePath(&lash, max(1, bw*0.07), rgba(lidInk[0], lidInk[1], lidInk[2], la*0.9))
		}
	}
}
