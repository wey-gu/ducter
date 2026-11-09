package views

// The small drawn marks of the opened task's step lines and of an ask's
// default (D127): 16 pt, one stroke weight, muted ink, never on a tile (D73).

import (
	"math"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const glyphStroke = 1.6

// drawPage is a page with lines: it read a file.
func drawPage(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-4.5, cy-6)
		m.LineTo(cx+2, cy-6)
		m.LineTo(cx+4.5, cy-3.5)
		m.LineTo(cx+4.5, cy+6)
		m.LineTo(cx-4.5, cy+6)
		m.Close()
		m.MoveTo(cx-2, cy-0.5)
		m.LineTo(cx+2, cy-0.5)
		m.MoveTo(cx-2, cy+2.5)
		m.LineTo(cx+2, cy+2.5)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawPencil is a pencil: it edited a file.
func drawPencil(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-5, cy+5)
		m.LineTo(cx-4.2, cy+1.6)
		m.LineTo(cx+2.6, cy-5.2)
		m.LineTo(cx+5.2, cy-2.6)
		m.LineTo(cx-1.6, cy+4.2)
		m.Close()
		m.MoveTo(cx+0.8, cy-3.4)
		m.LineTo(cx+3.4, cy-0.8)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawLens is a magnifier: it searched.
func drawLens(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2-1, r.Y+r.H/2-1
		var m ui.Path
		m.Circle(cx, cy, 4.2)
		m.MoveTo(cx+3.1, cy+3.1)
		m.LineTo(cx+6, cy+6)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawGlobe is a globe: it browsed the web.
func drawGlobe(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.Circle(cx, cy, 6)
		m.MoveTo(cx-6, cy)
		m.LineTo(cx+6, cy)
		m.MoveTo(cx, cy-6)
		m.QuadTo(cx-3.6, cy, cx, cy+6)
		m.MoveTo(cx, cy-6)
		m.QuadTo(cx+3.6, cy, cx, cy+6)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawScreen is a display on its stand: it used the computer.
func drawScreen(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		k := float32(1.6)
		l, rt, top, bot := cx-6.5, cx+6.5, cy-5, cy+3
		m.MoveTo(l+k, top)
		m.LineTo(rt-k, top)
		m.QuadTo(rt, top, rt, top+k)
		m.LineTo(rt, bot-k)
		m.QuadTo(rt, bot, rt-k, bot)
		m.LineTo(l+k, bot)
		m.QuadTo(l, bot, l, bot-k)
		m.LineTo(l, top+k)
		m.QuadTo(l, top, l+k, top)
		m.Close()
		m.MoveTo(cx, bot)
		m.LineTo(cx, cy+6)
		m.MoveTo(cx-3, cy+6)
		m.LineTo(cx+3, cy+6)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawThought is an ellipsis: it was thinking.
func drawThought(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		for _, dx := range []float32{-4.5, 0, 4.5} {
			p.Fill(ui.Rect{X: cx + dx - 1.3, Y: cy - 1.3, W: 2.6, H: 2.6}, col, 1.3)
		}
	}
}

// drawFlag is a small flag: progress saved.
func drawFlag(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-3.5, cy+6)
		m.LineTo(cx-3.5, cy-5.5)
		m.LineTo(cx+4.5, cy-3)
		m.LineTo(cx-3.5, cy-0.5)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawDot is a small dot: a step of another kind, a note.
func drawDot(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		p.Fill(ui.Rect{X: cx - 2.5, Y: cy - 2.5, W: 5, H: 5}, col, 2.5)
	}
}

// drawRing is an ask's default as a small kitchen timer (D115's grammar:
// time is drawn, words are its caption): a rim, and the time still left
// as a filled wedge from twelve o'clock that shrinks as the default nears.
func drawRing(rim, left ui.Color, frac float32) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		rad := min(r.W, r.H)/2 - 1
		var m ui.Path
		m.Circle(cx, cy, rad)
		p.StrokePath(&m, 1.5, rim)
		f := min(1, max(0, frac))
		if f <= 0 {
			return
		}
		in := rad - 2.5
		if f >= 0.999 {
			var full ui.Path
			full.Circle(cx, cy, in)
			p.FillPath(&full, left)
			return
		}
		var w ui.Path
		w.MoveTo(cx, cy)
		const steps = 48
		n := max(2, int(math.Ceil(float64(steps*f))))
		for i := 0; i <= n; i++ {
			a := -math.Pi/2 + 2*math.Pi*float64(f)*float64(i)/float64(n)
			w.LineTo(cx+in*float32(math.Cos(a)), cy+in*float32(math.Sin(a)))
		}
		w.Close()
		p.FillPath(&w, left)
	}
}

// coin is an AI agent's clay token, small: who is doing it.
func (a *App) coin(c *ui.Context, harness string, size float32) {
	if bmp := theme.Clay(tokenArt(harness)); bmp != nil {
		ui.Image(c, bmp).Size(size, size).Shrink(0).AccessHidden(true)
	}
}
