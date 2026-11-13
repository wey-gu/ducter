package views

// D244: the workbench's edge, and its launcher.

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// benchGrip is the workbench's left edge: nothing at rest, a grip on
// hover, a darker one while dragged; dragging sets the width (kept on this
// Mac), the arrows with a keyboard.
func (a *App) benchGrip(c *ui.Context) {
	t := a.T
	g := ui.Box(c.Key("bench-grip")).Absolute().Left(0).Top(0).Bottom(0).Width(10).ZIndex(2).
		Cursor(ui.CursorResizeEW).Role(ui.RoleSeparator).Label(a.L.T("wb.resize")).Focusable()
	dx, _, dragging := g.Dragged()
	w := a.bench.colW
	if w <= 0 {
		w = benchWidth
	}
	if dragging && dx != 0 {
		a.Local.SetBenchWidth(max(benchMin, min(benchMax, w-dx)))
	}
	switch {
	case g.Focused() && c.Shortcut(0, ui.KeyLeft):
		a.Local.SetBenchWidth(min(benchMax, w+24))
	case g.Focused() && c.Shortcut(0, ui.KeyRight):
		a.Local.SetBenchWidth(max(benchMin, w-24))
	}
	var ink ui.Color
	shown := true
	switch {
	case dragging || g.Focused():
		ink = t.InkMuted
	case g.Hovered():
		ink = t.Line2
	default:
		shown = false
	}
	if shown {
		g.Draw(func(p *ui.Painter, r ui.Rect) {
			p.Fill(ui.Rect{X: r.X + 3, Y: r.Y + r.H/2 - 20, W: 4, H: 40}, ink, 2)
		})
	}
}

// benchLauncher is the open workbench with nothing to show: what can show
// up here, and when, as clay tiles; a page with something is raised and
// opens it. Never a blank, never closing on its own.
func (a *App) benchLauncher(c *ui.Context, task *store.Task) {
	t := a.T
	tabs := a.benchTabs(task)
	type tile struct {
		tab, title, when string
		mark             func(ui.Color) func(*ui.Painter, ui.Rect)
	}
	tiles := []tile{
		{"changes", a.L.T("wb.tab.changes") + " · " + a.L.T("wb.tab.files"), a.L.T("wb.launcher.files"), drawFolder},
		{"preview", a.L.T("wb.tab.preview"), a.L.T("wb.launcher.preview"), drawWindowMark},
		{"browser", a.L.T("wb.tab.browser"), a.L.T("wb.launcher.browser"), drawGlobe},
		{"phone", a.L.T("wb.tab.phone"), a.L.T("wb.launcher.phone"), drawPhoneMark},
		{"made", a.L.T("wb.tab.made"), a.L.T("wb.launcher.made"), drawPicture},
	}
	ui.Row(c.Key("bench-head")).Padding(t.S3, t.S4).Gap(t.S2).AlignItems(ui.Center).MinHeight(56).Children(func() {
		ui.Text(c, a.L.T("wb.launcher")).FontSize(t.MD).FontWeight(800).TextColor(t.Ink)
		ui.Spacer(c)
		if a.button(c, a.L.T("wb.close"), btnText, t.ControlSM, t.BgDeep) {
			a.bench.open = false
		}
	})
	ui.Scroll(c.Key("bench-launch")).Grow(1).MinHeight(0).Children(func() {
		ui.Column(c).Padding(t.S2, t.S4, t.S5, t.S4).Gap(t.S3).Children(func() {
			// The partner waits on its bench for something to show.
			ui.Row(c.Key("wait")).Justify(ui.Center).Padding(t.S2, 0, t.S3, 0).Children(func() {
				stillFace(c, "wait-face", theme.Waiting, 88)
			})
			for _, x := range tiles {
				on := contains(tabs, x.tab)
				card := ui.Row(c.Key("tile:"+x.tab)).Gap(t.S3).Padding(t.S3+2, t.S4).AlignItems(ui.Center).Radius(t.RadiusLG).Label(x.title)
				// White clay; a page with something is raised and opens.
				card.Background(t.Surface)
				if on {
					card.Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
					if card.Hovered() {
						card.Background(t.SurfaceRaised)
					}
				} else {
					card.Shadow(0, 2, 0, 0, t.Line)
				}
				card.Children(func() {
					ink := t.InkMuted
					if on {
						ink = t.Ink
					}
					ui.Box(c.Key("m")).Size(40, 40).Shrink(0).Radius(t.RadiusSM).Background(t.Sunken).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
						a.glyph(c, 20, x.mark(ink))
					})
					ui.Column(c.Key("w")).Grow(1).MinWidth(0).Gap(2).Children(func() {
						w := ui.Text(c, x.title).FontSize(t.MD).FontWeight(700)
						if !on {
							w.TextColor(t.InkSoft)
						}
						ui.Text(c, x.when).FontSize(t.SM).TextColor(t.InkMuted)
					})
				})
				if on && card.Clicked() {
					a.bench.tab = x.tab
					a.benchLoad(task)
				}
			}
		})
	})
}

// drawWindowMark is a page in a window: a frame with its bar.
func drawWindowMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		p.Stroke(ui.Rect{X: r.X + 2*s, Y: r.Y + 3*s, W: 12 * s, H: 10 * s}, col, 2*s, 1.5)
		p.Line(r.X+2*s, r.Y+6*s, r.X+14*s, r.Y+6*s, 1.5, col)
	}
}

// drawPhoneMark is a phone: a tall rounded frame and its speaker.
func drawPhoneMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		p.Stroke(ui.Rect{X: r.X + 4.5*s, Y: r.Y + 1.5*s, W: 7 * s, H: 13 * s}, col, 2*s, 1.5)
		p.Line(r.X+7*s, r.Y+3.6*s, r.X+9*s, r.Y+3.6*s, 1.5, col)
	}
}
