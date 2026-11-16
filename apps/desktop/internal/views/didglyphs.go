package views

// D300: the pictures of what Ducter did for the person, one per kind,
// drawn (never emoji, D211) on Past tasks' 20-point grid in one ink: sent a
// paper plane, paid a card, called a handset, filled a key, changed a
// pencil, deleted a bin, read an eye.

import "github.com/egoist/mygo/ui"

func drawDidGlyph(kind string) func(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(col ui.Color) func(p *ui.Painter, r ui.Rect) {
		switch kind {
		case "sent":
			return drawPastGlyph("ship", col)
		case "changed":
			return drawPastGlyph("write", col)
		case "read":
			return drawPastGlyph("review", col)
		}
		return func(p *ui.Painter, r ui.Rect) {
			cx, cy := r.X+r.W/2, r.Y+r.H/2
			s := min(r.W, r.H) / 20
			X := func(v float32) float32 { return cx + v*s }
			Y := func(v float32) float32 { return cy + v*s }
			w := 1.7 * s
			var m ui.Path
			switch kind {
			case "paid": // a card with its stripe
				roundRect(&m, X(-8), Y(-5.5), 16, 11, 2*s)
				p.StrokePath(&m, w, col)
				var b ui.Path
				b.MoveTo(X(-8), Y(-1.8)).LineTo(X(8), Y(-1.8))
				p.StrokePath(&b, w*1.3, col)
				var d ui.Path
				d.MoveTo(X(-5), Y(2.6)).LineTo(X(-1.5), Y(2.6))
				p.StrokePath(&d, w, col)
			case "called": // a handset
				m.MoveTo(X(-6.6), Y(-7)).LineTo(X(-3.4), Y(-7.6)).LineTo(X(-1.6), Y(-3.4)).LineTo(X(-3.6), Y(-1.8))
				m.QuadTo(X(-1.6), Y(2.2), X(1.8), Y(3.6))
				m.LineTo(X(3.4), Y(1.6)).LineTo(X(7.6), Y(3.4)).LineTo(X(7), Y(6.6))
				m.QuadTo(X(6.4), Y(8), X(4.4), Y(7.8))
				m.QuadTo(X(-7.8), Y(6.4), X(-8), Y(-4.6))
				m.QuadTo(X(-8), Y(-6.6), X(-6.6), Y(-7)).Close()
				p.StrokePath(&m, w, col)
			case "filled": // a key: its bow and its bit
				m.Circle(X(-3.6), Y(-3.6), 3.8*s)
				p.StrokePath(&m, w, col)
				var k ui.Path
				k.MoveTo(X(-0.9), Y(-0.9)).LineTo(X(7.4), Y(7.4))
				k.MoveTo(X(3.8), Y(3.8)).LineTo(X(5.8), Y(1.8))
				k.MoveTo(X(5.8), Y(5.8)).LineTo(X(7.6), Y(4))
				p.StrokePath(&k, w, col)
			case "deleted": // a bin
				m.MoveTo(X(-7.5), Y(-5)).LineTo(X(7.5), Y(-5))
				m.MoveTo(X(-2.6), Y(-5)).LineTo(X(-2.6), Y(-7.4)).LineTo(X(2.6), Y(-7.4)).LineTo(X(2.6), Y(-5))
				m.MoveTo(X(-5.8), Y(-5)).LineTo(X(-4.8), Y(7.6)).LineTo(X(4.8), Y(7.6)).LineTo(X(5.8), Y(-5))
				m.MoveTo(X(-1.8), Y(-1.6)).LineTo(X(-1.6), Y(4.4))
				m.MoveTo(X(1.8), Y(-1.6)).LineTo(X(1.6), Y(4.4))
				p.StrokePath(&m, w, col)
			default:
				m.Circle(X(0), Y(0), 2.5*s)
				p.FillPath(&m, col)
			}
		}
	}
}

// pastPebbleDraw is a pebble as Past tasks draws one (pastPebble), with any
// glyph: raised on its clay tint, or pressed into the sunken ground (tint "").
func (a *App) pastPebbleDraw(c *ui.Context, key, tint string, size float32, glyph func(ui.Color) func(*ui.Painter, ui.Rect)) ui.Element {
	t := a.T
	b := ui.Box(c.Key(key)).Size(size, size).Shrink(0).AccessHidden(true)
	k := size / 36
	b.Radius(13*k, 15*k, 12*k, 14*k)
	ink := t.InkMuted
	if tn, ok := t.Tint(tint); ok {
		ink = tn.Ink
		b.Background(tn.Ground).Shadow(0, 2.5*k, 0, 0, tn.Ledge).InsetShadow(0, 1.5, 0, 0, t.Surface.Alpha(0.55))
	} else {
		b.Background(t.SurfaceSunken).InsetShadow(0, 1.5*k, 2*k, 0, t.Line2.Alpha(0.9))
	}
	g := size * 0.58
	draw := glyph(ink)
	b.Draw(func(p *ui.Painter, r ui.Rect) {
		draw(p, ui.Rect{X: r.X + (r.W-g)/2, Y: r.Y + (r.H-g)/2, W: g, H: g})
	})
	return b
}
