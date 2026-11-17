package views

// D300, D314: the pictures of what Ducter did for the person: one drawn
// glyph per kind and a sharper one per sub-kind where it is a different
// thing to look at (a mail, a chat message; a calendar event, a merge, a
// draft PR), never emoji (D211). One table with the web
// (packages/protocol/src/did-glyphs.ts through fixtures/did-glyphs.json,
// held equal by didglyphs_test.go): SVG path data on a 20-point grid,
// stroked 1.6 with round ends in the pebble's ink. The pebble's tint says
// the kind; the shape says what exactly it was.

import (
	"sync"

	"github.com/egoist/mygo/ui"
)

// didGlyphStroke is the grid's stroke width (DID_GLYPH_STROKE).
const didGlyphStroke = 1.6

var didGlyphs = map[string]string{
	"sent":             "M3.6 9.6 16.2 4l-4.6 12.4-2.9-5.1zM8.7 11.3 16.2 4",
	"sent.mail":        "M3.5 5.5h13v9h-13zM3.8 6.1 10 10.8l6.2-4.7",
	"sent.message":     "M4.2 4.8h11.6a1.7 1.7 0 0 1 1.7 1.7v6a1.7 1.7 0 0 1-1.7 1.7H9.3l-3.6 2.7v-2.7H4.2a1.7 1.7 0 0 1-1.7-1.7v-6a1.7 1.7 0 0 1 1.7-1.7z",
	"sent.post":        "M3.5 8.2v3.6h2.6l6.6 3.6V4.6L6.1 8.2zM6.6 11.8l1.1 4.2M15.3 7.6a3.3 3.3 0 0 1 0 4.8",
	"paid":             "M3.5 6h13v8.6h-13zM3.5 8.9h13M6 12.1h3.2",
	"paid.buy":         "M4.8 7h10.4l-.9 9.4H5.7zM7.5 7V5.9a2.5 2.5 0 0 1 5 0V7",
	"called":           "M6.2 3.8h2.1l1.1 3.3-1.7 1.2a8 8 0 0 0 4 4l1.2-1.7 3.3 1.1v2.1a1.7 1.7 0 0 1-1.9 1.7A12.3 12.3 0 0 1 4.5 5.7a1.7 1.7 0 0 1 1.7-1.9z",
	"filled":           "M12.6 11.2a3.6 3.6 0 1 0-3.4-2.4L4 14v2.2h2.4v-1.6H8v-1.6h1.6l1.3-1.3a3.6 3.6 0 0 0 1.7-.5zM13 6.6h.01",
	"filled.detail":    "M10 9.8a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM4.4 16.4a5.6 5.6 0 0 1 11.2 0",
	"changed":          "M4.5 15.5l1-3.5 7.6-7.6a1.6 1.6 0 0 1 2.3 2.3L7.8 14.3zM11.8 5.7l2.4 2.4",
	"changed.calendar": "M4 5.4h12v11.1H4zM4 8.9h12M7.3 3.6v3.2M12.7 3.6v3.2M8 12.8l1.5 1.5 2.9-2.9",
	"changed.merge":    "M5.5 3.5v3.6a4 4 0 0 0 1.4 3L10 12.8l3.1-2.7a4 4 0 0 0 1.4-3V3.5M10 12.8v3.7",
	"changed.pr":       "M6 6.6v6.8M6 3.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM6 13.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM14 13.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM14 13.4V8.1a2.6 2.6 0 0 0-2.6-2.6H8.8M10.7 3.6 8.8 5.5l1.9 1.9",
	"changed.files":    "M5 3.5h6.4L15 7.1v9.4H5zM11.4 3.5v3.6H15M7.6 10.6h4.8M7.6 13.4h3.2",
	"changed.setting":  "M3.8 6.6h12.4M3.8 13.4h12.4M7.6 4.4v4.4M12.4 11.2v4.4",
	"changed.install":  "M10 3.5v8.8M6.6 9 10 12.4 13.4 9M4.5 16h11",
	"deleted":          "M4.8 6.2h10.4M8 6.2V4.6h4v1.6M6.3 6.2l.8 9.8h5.8l.8-9.8M8.9 8.8v4.6M11.1 8.8v4.6",
	"deleted.calendar": "M4 5.4h12v11.1H4zM4 8.9h12M7.3 3.6v3.2M12.7 3.6v3.2M8.3 11.3l3.4 3.4M11.7 11.3l-3.4 3.4",
	"read":             "M2.8 10S5.5 5.2 10 5.2s7.2 4.8 7.2 4.8-2.7 4.8-7.2 4.8S2.8 10 2.8 10zM10 12.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z",
}

var didTints = map[string]string{
	"sent":    "clay",
	"paid":    "sand",
	"called":  "sage",
	"filled":  "mist",
	"changed": "lilac",
	"deleted": "stone",
	"read":    "",
}

var (
	didPathMu sync.Mutex
	didPaths  = map[string]*ui.Path{}
)

// didGlyphPath is the parsed path of an item's picture: its sub-kind's
// where it has one, else its kind's; nil for neither.
func didGlyphPath(kind, sub string) *ui.Path {
	key := kind + "." + sub
	if _, ok := didGlyphs[key]; !ok || sub == "" {
		key = kind
	}
	d, ok := didGlyphs[key]
	if !ok {
		return nil
	}
	didPathMu.Lock()
	defer didPathMu.Unlock()
	if p, ok := didPaths[key]; ok {
		return p
	}
	p, _ := ui.ParsePath(d)
	didPaths[key] = p
	return p
}

func drawDidGlyph(kind, sub string) func(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(col ui.Color) func(p *ui.Painter, r ui.Rect) {
		path := didGlyphPath(kind, sub)
		return func(p *ui.Painter, r ui.Rect) {
			s := min(r.W, r.H) / 20
			if path == nil {
				var m ui.Path
				m.Circle(r.X+r.W/2, r.Y+r.H/2, 2.5*s)
				p.FillPath(&m, col)
				return
			}
			x0, y0 := r.X+(r.W-20*s)/2, r.Y+(r.H-20*s)/2
			p.Transform(ui.Scaling(s, s).Then(ui.Translation(x0, y0)), 0, 0, func() {
				p.StrokePath(path, didGlyphStroke, col)
			})
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
