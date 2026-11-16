package views

// D285: the ten pictures of kinds of work a person can give a past task,
// drawn (never emoji, D211): one stroke weight on a 20-point grid, scaled
// to the box, in one ink. And the star.

import (
	"math"

	"github.com/egoist/mygo/ui"
)

// arcTo adds an arc of a circle (angles in degrees, clockwise on screen).
func arcTo(m *ui.Path, cx, cy, r, from, to float64, move bool) {
	const steps = 28
	for i := 0; i <= steps; i++ {
		a := (from + (to-from)*float64(i)/steps) * math.Pi / 180
		x, y := float32(cx+r*math.Cos(a)), float32(cy+r*math.Sin(a))
		if i == 0 && move {
			m.MoveTo(x, y)
		} else {
			m.LineTo(x, y)
		}
	}
}

// drawPastGlyph draws a kind of work: fix build look review write ship
// data talk errand idea (an unknown one is a dot).
func drawPastGlyph(kind string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		s := min(r.W, r.H) / 20
		X := func(v float32) float32 { return cx + v*s }
		Y := func(v float32) float32 { return cy + v*s }
		w := 1.7 * s
		var m ui.Path
		switch kind {
		case "fix": // a wrench
			arcTo(&m, float64(X(2.6)), float64(Y(-2.6)), float64(4.6*s), -15, 285, true)
			p.StrokePath(&m, w, col)
			var h ui.Path
			h.MoveTo(X(-0.6), Y(0.6)).LineTo(X(-7), Y(7))
			p.StrokePath(&h, w*1.25, col)
		case "build": // three blocks, two and one on top
			roundRect(&m, X(-7.5), Y(0), 7, 7, 1.6*s)
			roundRect(&m, X(0.5), Y(0), 7, 7, 1.6*s)
			roundRect(&m, X(-3.5), Y(-7.5), 7, 7, 1.6*s)
			p.StrokePath(&m, w, col)
		case "look": // a magnifier
			m.Circle(X(-1.6), Y(-1.6), 5.2*s)
			m.MoveTo(X(2.4), Y(2.4)).LineTo(X(6.6), Y(6.6))
			p.StrokePath(&m, w, col)
		case "review": // an eye
			m.MoveTo(X(-8), Y(0)).QuadTo(X(0), Y(-8.5), X(8), Y(0)).QuadTo(X(0), Y(8.5), X(-8), Y(0)).Close()
			p.StrokePath(&m, w, col)
			var d ui.Path
			d.Circle(X(0), Y(0), 2.4*s)
			p.FillPath(&d, col)
		case "write": // a pencil
			m.MoveTo(X(-7), Y(7)).LineTo(X(-6), Y(2.4)).LineTo(X(3.6), Y(-7.2)).LineTo(X(7.2), Y(-3.6)).LineTo(X(-2.4), Y(6)).Close()
			m.MoveTo(X(1.2), Y(-4.8)).LineTo(X(4.8), Y(-1.2))
			p.StrokePath(&m, w, col)
		case "ship": // a paper plane
			m.MoveTo(X(-7.5), Y(0.5)).LineTo(X(7.5), Y(-6.5)).LineTo(X(2.5), Y(7)).LineTo(X(-0.5), Y(2.5)).Close()
			m.MoveTo(X(-0.5), Y(2.5)).LineTo(X(7.5), Y(-6.5))
			p.StrokePath(&m, w, col)
		case "data": // three bars on a line
			for i, top := range []float32{1, -6, -2.5} {
				x := float32(-5 + 5*i)
				var b ui.Path
				b.MoveTo(X(x), Y(5)).LineTo(X(x), Y(top))
				p.StrokePath(&b, w*1.5, col)
			}
			m.MoveTo(X(-8), Y(7.8)).LineTo(X(8), Y(7.8))
			p.StrokePath(&m, w*0.8, col)
		case "talk": // a speech bubble
			m.MoveTo(X(-4), Y(4)).LineTo(X(-6), Y(7.5)).LineTo(X(0.5), Y(4))
			m.LineTo(X(5), Y(4)).QuadTo(X(7.5), Y(4), X(7.5), Y(1.5))
			m.LineTo(X(7.5), Y(-4)).QuadTo(X(7.5), Y(-6.5), X(5), Y(-6.5))
			m.LineTo(X(-5), Y(-6.5)).QuadTo(X(-7.5), Y(-6.5), X(-7.5), Y(-4))
			m.LineTo(X(-7.5), Y(1.5)).QuadTo(X(-7.5), Y(4), X(-5), Y(4)).Close()
			p.StrokePath(&m, w, col)
		case "errand": // a shopping bag
			roundRect(&m, X(-6.5), Y(-2.5), 13, 10, 2*s)
			arcTo(&m, float64(X(0)), float64(Y(-2.5)), float64(3.4*s), 180, 360, true)
			p.StrokePath(&m, w, col)
		case "idea": // a light bulb
			arcTo(&m, float64(X(0)), float64(Y(-2.2)), float64(5.4*s), 140, 400, true)
			m.LineTo(X(2.2), Y(4.4)).LineTo(X(-2.2), Y(4.4)).Close()
			m.MoveTo(X(-1.8), Y(7)).LineTo(X(1.8), Y(7))
			p.StrokePath(&m, w, col)
		case "repeat": // two arrows going round: a routine (D285, Ongoing)
			arcTo(&m, float64(X(0)), float64(Y(0)), float64(6.4*s), 200, 330, true)
			m.MoveTo(X(3.2), Y(-6.9)).LineTo(X(5.6), Y(-3.4)).LineTo(X(1.6), Y(-2.6))
			arcTo(&m, float64(X(0)), float64(Y(0)), float64(6.4*s), 20, 150, true)
			m.MoveTo(X(-3.2), Y(6.9)).LineTo(X(-5.6), Y(3.4)).LineTo(X(-1.6), Y(2.6))
			p.StrokePath(&m, w, col)
		case "watch": // a clock: a task looking again on its own wait
			m.Circle(X(0), Y(0), 7*s)
			m.MoveTo(X(0), Y(-4)).LineTo(X(0), Y(0)).LineTo(X(3), Y(2))
			p.StrokePath(&m, w, col)
		default:
			m.Circle(X(0), Y(0), 2.5*s)
			p.FillPath(&m, col)
		}
	}
}

// drawStar is a five-pointed star, filled when on, else outlined.
func drawStar(col ui.Color, on bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2+r.H*0.04
		R := min(r.W, r.H) * 0.46
		in := R * 0.47
		var m ui.Path
		for i := 0; i < 10; i++ {
			rad := R
			if i%2 == 1 {
				rad = in
			}
			a := -math.Pi/2 + float64(i)*math.Pi/5
			x, y := cx+rad*float32(math.Cos(a)), cy+rad*float32(math.Sin(a))
			if i == 0 {
				m.MoveTo(x, y)
			} else {
				m.LineTo(x, y)
			}
		}
		m.Close()
		if on {
			p.FillPath(&m, col)
			return
		}
		p.StrokePath(&m, max(1.3, R*0.16), col)
	}
}
