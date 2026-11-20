package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D410: an app's mark and its clay tile. The marks are drawn on a 20-unit
// grid at the same stroke as Made for you's (drawMadeKind), never an emoji:
// window (the default), coins (spending), check (a habit), board (columns
// of cards), list, chart. The tile is the app's muted clay tint (the
// person's tints of D285, never a state's colour), the mark in its ink, on
// its clay ledge.

// drawAppIcon draws icon in col inside r.
func drawAppIcon(icon string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	switch icon {
	case "list", "chart":
		return drawMadeKind(icon, col)
	case "coins", "check", "board":
	default:
		return drawMadeKind("app", col)
	}
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W, r.H) / 20
		P := func(x, y float32) (float32, float32) { return r.X + x*s, r.Y + y*s }
		var m ui.Path
		w := 1.6 * s
		switch icon {
		case "coins": // a stack of coins seen from the side, and one coin face on
			for _, y := range []float32{12.6, 8.6, 4.6} {
				x0, y0 := P(2.4, y)
				roundRect(&m, x0, y0, 8.4*s, 3.4*s, 1.7*s)
			}
			cx, cy := P(14.4, 12.2)
			m.Circle(cx, cy, 3.8*s)
			m.Circle(cx, cy, 1.4*s)
		case "check": // a rounded box and its tick
			x0, y0 := P(3.5, 3.5)
			roundRect(&m, x0, y0, 13*s, 13*s, 3.6*s)
			m.MoveTo(P(6.6, 10.2))
			m.LineTo(P(9, 12.6))
			m.LineTo(P(13.6, 7.6))
		case "board": // three columns, cards in two
			x0, y0 := P(3, 4)
			roundRect(&m, x0, y0, 14*s, 12*s, 2.6*s)
			m.MoveTo(P(7.7, 4))
			m.LineTo(P(7.7, 16))
			m.MoveTo(P(12.3, 4))
			m.LineTo(P(12.3, 16))
			m.MoveTo(P(4.8, 7.4))
			m.LineTo(P(5.9, 7.4))
			m.MoveTo(P(9.4, 7.4))
			m.LineTo(P(10.6, 7.4))
			m.MoveTo(P(9.4, 10.4))
			m.LineTo(P(10.6, 10.4))
		}
		m.Cap(ui.RoundCap)
		p.StrokePath(&m, w, col)
	}
}

// appTint is the app's clay: ground, ink and ledge (the sunken paper when
// the theme has none by that name).
func (a *App) appTint(m *protocol.AppMeta) theme.Tint {
	t := a.T
	name := "clay"
	if m != nil {
		name = m.TintOf()
	}
	if v, ok := t.Tint(name); ok {
		return v
	}
	return theme.Tint{Ground: t.SurfaceSunken, Ink: t.InkSoft, Ledge: t.Line}
}

// appClay is the app's tile at size: its clay, its mark; faded once gone.
func (a *App) appClay(c *ui.Context, key string, size float32, m *protocol.AppMeta, gone bool) {
	t := a.T
	k := size / 48
	tn := a.appTint(m)
	bg, ink, ledge := tn.Ground, tn.Ink, tn.Ledge
	if gone {
		bg, ink, ledge = t.SurfaceSunken, t.InkMuted, t.SurfaceSunken
	}
	icon := "window"
	if m != nil {
		icon = m.IconOf()
	}
	ui.Box(c.Key(key)).Size(size, size).Shrink(0).AccessHidden(true).Radius(14*k).Background(bg).
		Shadow(0, 3*k, 0, 0, ledge).Draw(func(p *ui.Painter, r ui.Rect) {
		g := size * 0.56
		drawAppIcon(icon, ink)(p, ui.Rect{X: r.X + (r.W-g)/2, Y: r.Y + (r.H-g)/2, W: g, H: g})
	})
}

// appByID is the app as the list names it now, nil once it is gone.
func (a *App) appByID(id string) *protocol.AppMeta {
	for i := range a.S.Apps {
		if a.S.Apps[i].ID == id {
			return &a.S.Apps[i]
		}
	}
	return nil
}

// drawAppsMark is 你的小应用 / Your apps' mark in the bar (D410): four
// rounded tiles, the first filled, as the web draws it (controls.tsx AppsMark).
func drawAppsMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 18
		ox, oy := r.X+(r.W-18*s)/2, r.Y+(r.H-18*s)/2
		for i, xy := range [][2]float32{{2, 2}, {10, 2}, {2, 10}, {10, 10}} {
			var m ui.Path
			roundRect(&m, ox+xy[0]*s, oy+xy[1]*s, 6*s, 6*s, 1.8*s)
			if i == 0 {
				p.FillPath(&m, col)
			}
			p.StrokePath(&m, 1.6*s, col)
		}
	}
}
