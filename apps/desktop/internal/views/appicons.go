package views

import (
	"sync"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D410, D422: an app's mark and its clay tile. The marks are the web's
// (packages/protocol/src/app-glyphs.ts through fixtures/app-glyphs.json, held
// equal by TestAppGlyphsMatchTheFixture): SVG path data on a 20-point grid,
// chosen by what the app is about, never an emoji. On its tile the mark is
// pressed into the clay: a light edge above, a soft ledge below, the ink
// between. The tile is the app's muted clay tint (the person's tints of D285,
// never a state's colour), on its clay ledge.

var (
	appPathMu sync.Mutex
	appPaths  = map[string]*ui.Path{}
)

// appGlyphPath is the parsed path of a mark (the window for an unknown one).
func appGlyphPath(icon string) *ui.Path {
	d, ok := protocol.AppGlyphs[icon]
	if !ok {
		icon, d = "window", protocol.AppGlyphs["window"]
	}
	appPathMu.Lock()
	defer appPathMu.Unlock()
	if p, ok := appPaths[icon]; ok {
		return p
	}
	p, _ := ui.ParsePath(d)
	appPaths[icon] = p
	return p
}

// drawAppIcon draws icon in col inside r; hi and ledge (when not
// transparent) press it into the clay.
func drawAppIcon(icon string, col, hi, ledge ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		path := appGlyphPath(icon)
		if path == nil {
			return
		}
		s := min(r.W, r.H) / 20
		x0, y0 := r.X+(r.W-20*s)/2, r.Y+(r.H-20*s)/2
		at := func(dy float32, c ui.Color) {
			p.Transform(ui.Scaling(s, s).Then(ui.Translation(x0, y0+dy*s)), 0, 0, func() {
				p.StrokePath(path, protocol.AppGlyphStroke, c)
			})
		}
		if ledge != ui.Transparent {
			at(0.7, ledge)
		}
		if hi != ui.Transparent {
			at(-0.45, hi)
		}
		at(0, col)
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
	hi := t.PressSecondary.Hi
	if gone {
		bg, ink, ledge, hi = t.SurfaceSunken, t.InkMuted, t.SurfaceSunken, ui.Transparent
	}
	icon := "window"
	if m != nil {
		icon = m.IconOf()
	}
	ui.Box(c.Key(key)).Size(size, size).Shrink(0).AccessHidden(true).Radius(14*k).Background(bg).
		Shadow(0, 3*k, 0, 0, ledge).Draw(func(p *ui.Painter, r ui.Rect) {
		g := size * 0.56
		drawAppIcon(icon, ink, hi, ink.Alpha(0.22))(p, ui.Rect{X: r.X + (r.W-g)/2, Y: r.Y + (r.H-g)/2, W: g, H: g})
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
