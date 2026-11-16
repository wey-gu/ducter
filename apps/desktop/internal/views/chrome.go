package views

import (
	"fmt"
	"math"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// The window's chrome. The native title bar is hidden (main.go:
// TitleBarHiddenInset), the content runs to the top, and every zoom level
// starts with one bar ChromeH tall: it holds the traffic lights at its
// left, vertically centered, and it is the title region: it drags the
// window, and a double click zooms it, as a title bar does.

// ChromeH is the height of the top bar.
const ChromeH = 60

// TrafficLights is where the window controls go (the close button's
// top-left corner, in points from the window's): centered on the bar.
var TrafficLights = struct{ X, Y float32 }{X: 20, Y: (ChromeH - 14) / 2}

// chromeInset is the bar's left padding: clear of the traffic lights when
// the window has them, a plain gutter otherwise (other platforms, full
// screen, the tester).
func chromeInset(c *ui.Context) (left, right float32) {
	bar := c.TitleBar()
	left, right = 24, 24
	if bar.Left > 0 {
		left = bar.Left + 14
	}
	if bar.Right > 0 {
		right = bar.Right + 16
	}
	return left, right
}

// chrome is the top bar of a zoom level: left holds where you are, right
// what you can do here. It drags the window wherever nothing else takes
// the pointer.
func (a *App) chrome(c *ui.Context, key string, left, right func()) {
	t := a.T
	l, r := chromeInset(c)
	ui.Row(c.Key("chrome:"+key)).Height(ChromeH).Shrink(0).Gap(t.S3).AlignItems(ui.Center).Padding(0, r, 0, l).
		Background(t.Chrome).BorderWidth(0, 0, 1, 0).BorderColor(t.ChromeLine).DragWindow().Children(func() {
		ui.Row(c).Gap(t.S3).Grow(1).MinWidth(0).AlignItems(ui.Center).Children(left)
		if right != nil {
			ui.Row(c).Gap(t.S3).Shrink(0).AlignItems(ui.Center).Children(right)
		}
	})
}

// bareChrome is the top bar of a screen that is one centered card (first
// run, connect, setup): no surface, no line, just room for the traffic
// lights and a handle to drag the window.
func (a *App) bareChrome(c *ui.Context) {
	ui.Box(c.Key("chrome:bare")).Height(ChromeH).Shrink(0).DragWindow()
}

// crumb is one step of the breadcrumb: a button back up to a zoom level.
func (a *App) crumb(c *ui.Context, label string, to Route) {
	t := a.T
	l := ui.Text(c.Key("crumb:"+label), label).FontSize(t.MD).FontWeight(700).TextColor(t.InkMuted).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Focusable().Padding(t.S1+2, t.S2).Radius(t.RadiusSM).SingleLine().Shrink(0)
	// A text button of the chrome: muted ink, the secondary hover tint.
	switch {
	case l.Pressed():
		l.TextColor(t.Ink).Background(t.SurfaceSunken)
	case l.Hovered():
		l.TextColor(t.Ink).Background(t.SurfaceSunken.Mix(t.Chrome, 0.45))
	}
	if l.Clicked() {
		a.Route = to
	}
	ui.Text(c, "/").FontSize(t.MD).TextColor(t.Faint).Shrink(0)
}

// chromeTitle is the current level's name in the bar.
func (a *App) chromeTitle(c *ui.Context, title string) ui.Element {
	return a.heading(c, autospace(title), a.T.XL).SingleLine().Shrink(1).MinWidth(0)
}

// routeEnter plays a zoom level's entrance as the route changes: a short
// fade and a 6-point rise, at once under reduced motion.
func (a *App) routeEnter(c *ui.Context, e ui.Element) {
	if c.Preferences().ReduceMotion {
		return
	}
	shown := ui.Local(e, "entered", func() bool { return false })
	p := ui.Pose{}
	if !*shown {
		p, *shown = ui.Pose{Y: 6, Fade: 1}, true
		c.Invalidate()
	}
	e.AnimatePose(p, ui.Animation{Duration: 220e6})
}

// ---------- the shell (D262) ----------

// placeBar is the one header every place has: where you are on the left
// (the partner on the conversation, crumbs elsewhere); on the right the
// place's own actions, then the way to the other places, always in the
// same order and the same clay buttons. here is the place shown, drawn as
// the chosen one.
func (a *App) placeBar(c *ui.Context, key string, here Route, left, actions func()) {
	a.chrome(c, key, left, func() {
		if actions != nil {
			actions()
			// A hairline between this place's own actions and the places.
			ui.Box(c).Size(1, 20).Background(a.T.ChromeLine).Shrink(0)
		}
		a.placeNav(c, here)
	})
}

// compactBar: a window too narrow for every word: Settings keeps only its
// drawn gear (its name is its tooltip and its accessible name).
func (a *App) compactBar() bool { return a.winW > 0 && a.winW < 1060 }

// placeNav is the way to the other places: 更新 while something waits to
// be updated, then 设备 · 手头的事 · 设置, the place shown chosen.
func (a *App) placeNav(c *ui.Context, here Route) {
	if n, running := a.updatesWaiting(); n > 0 || running {
		label := a.L.T("nav.update")
		switch {
		case running:
			label = a.L.T("nav.updating")
		case n > 1:
			label = a.L.T("nav.update.n", n)
		}
		if a.navButton(c, "update", label, a.L.T("nav.update.about"), func() {
			a.glyph(c, 22, a.drawUpdatePebble())
		}, false) {
			a.OpenAbout()
		}
	}
	a.placeSegments(c, here)
}

// placeSegments is the three places as one control (D264): a sunk track
// holding 设备 · 手头的事 · 设置, the place you are in a raised knob in
// it, the others flat. One object instead of three buttons, so the bar
// stays calm, and "where you are" reads as a knob in its slot, not as a
// button that went dead. Every segment has its drawn mark; a narrow window
// drops all three words together (each keeps its name as tooltip and
// accessible name), never one word alone.
func (a *App) placeSegments(c *ui.Context, here Route) {
	t := a.T
	words := !a.compactBar()
	inSettings := here == RouteSettings || here == RoutePartner
	segs := []struct {
		key, word, name string
		draw            func(ui.Color) func(p *ui.Painter, r ui.Rect)
		on              bool
		open            func()
	}{
		{"devices", a.L.T("nav.devices"), a.L.T("nav.devices.label"), drawDevices, here == RouteDevices, a.OpenDevices},
		{"onhand", a.L.T("nav.onhand"), a.L.T("nav.onhand"), drawOnHand, here == RouteOnHand, func() { a.Route = RouteOnHand; a.markRead() }},
		{"settings", a.L.T("nav.settings"), a.L.T("nav.settings"), drawGear, inSettings, a.OpenSettings},
	}
	pad := float32(3)
	ui.Row(c.Key("places")).Height(t.ControlSM).Padding(pad).Gap(2).Radius(t.RadiusSM+2).AlignItems(ui.Center).
		Background(t.SurfaceSunken).InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleTabList).Shrink(0).Children(func() {
		for _, s := range segs {
			seg := ui.Row(c.Key("nav:" + s.key)).Height(t.ControlSM - 2*pad).Gap(t.S1 + 2).AlignItems(ui.Center).
				Radius(t.RadiusSM - 1).Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(s.name).Focusable().Shrink(0)
			if words {
				seg.Padding(0, t.S3-2, 0, t.S2)
			} else {
				seg.Padding(0, t.S2-1, 0, t.S2-1).Tooltip(s.name)
			}
			fg := t.InkMuted
			switch {
			case s.on:
				// The knob: the card's white with a 2-point clay ledge.
				seg.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
				fg = t.Ink
			case seg.Pressed():
				seg.Background(t.SurfaceSunken.Mix(t.Ink, 0.06))
				fg = t.Ink
			case seg.Hovered():
				seg.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
				fg = t.Ink
			}
			if s.on {
				seg.AccessSelected(true)
			}
			seg.Children(func() {
				a.glyph(c, 18, s.draw(fg))
				if words {
					ui.Text(c, s.word).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
				}
			})
			if seg.Clicked() && !s.on {
				s.open()
			}
		}
	})
}

// drawOnHand is On hand's mark: three things in hand, a dot and a line
// each, the first one longest.
func drawOnHand(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		s := r.W / 18
		for i, w := range []float32{9, 7, 8} {
			y := cy + float32(i-1)*5*s
			var d ui.Path
			d.Circle(cx-6*s, y, 1.4*s)
			p.FillPath(&d, col)
			var m ui.Path
			m.MoveTo(cx-2.6*s, y).LineTo(cx-2.6*s+w*s, y).Cap(ui.RoundCap)
			p.StrokePath(&m, 1.8*s, col)
		}
	}
}

// drawDevices is Devices' mark: a laptop with a phone standing in front.
func drawDevices(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		s := r.W / 18
		w := float32(1.6) * s
		var lap ui.Path
		lap.MoveTo(cx-5*s, cy+2.5*s).LineTo(cx-5*s, cy-5*s).LineTo(cx+5*s, cy-5*s).LineTo(cx+5*s, cy-2*s)
		p.StrokePath(&lap, w, col)
		var base ui.Path
		base.MoveTo(cx-7.5*s, cy+4.5*s).LineTo(cx+1*s, cy+4.5*s).Cap(ui.RoundCap)
		p.StrokePath(&base, w, col)
		var ph ui.Path
		ph.MoveTo(cx+3*s, cy-0.5*s).LineTo(cx+7.5*s, cy-0.5*s).LineTo(cx+7.5*s, cy+7*s).LineTo(cx+3*s, cy+7*s).Close()
		p.StrokePath(&ph, w, col)
	}
}

// newTaskButton is 新建 / New task in a bar: the secondary clay button
// with its drawn ＋, as every place's own action is (D262).
func (a *App) newTaskButton(c *ui.Context) bool {
	return a.navButton(c, "newtask", a.L.T("newtask.button"), a.L.T("newtask.button"), func() {
		a.glyph(c, 14, drawPlus(a.T.Ink))
	}, false)
}

// updatesWaiting is how many updates wait (the home's 全部更新 offer and
// this app's own), and whether 全部更新 is under way.
func (a *App) updatesWaiting() (n int, running bool) {
	if ua := a.S.UpdateAll; ua != nil {
		if ua.Plan != nil && ua.Plan.FinishedAt == "" {
			return 0, true
		}
		n = len(ua.Offer)
	}
	if a.ownAppStep().show {
		n++
	}
	if n == 0 && a.Updates != nil && a.Updates.Status().State == update.Ready {
		n = 1
	}
	return n, false
}

// drawGear is Settings' drawn mark: a ring and six rounded teeth.
func drawGear(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		s := r.W / 20
		for i := 0; i < 6; i++ {
			ang := float64(i)*math.Pi/3 + math.Pi/6
			dx, dy := float32(math.Cos(ang)), float32(math.Sin(ang))
			var m ui.Path
			m.MoveTo(cx+dx*6*s, cy+dy*6*s).LineTo(cx+dx*8.6*s, cy+dy*8.6*s).Cap(ui.RoundCap)
			p.StrokePath(&m, 3.6*s, col)
		}
		var ring ui.Path
		ring.Circle(cx, cy, 5.4*s)
		p.StrokePath(&ring, 2.6*s, col)
	}
}

// page wraps the zoom level shown in a column keyed by it, so changing
// level plays its entrance (routeEnter).
func (a *App) page(c *ui.Context, body func()) func() {
	return func() {
		// Keyed by level only: a reconnect must not rebuild the
		// conversation (and lose its scroll).
		// D262: not keyed by the welcome either: the home answering must not
		// replay the page's entrance (the launch's visible switch).
		key := fmt.Sprintf("page:%d", a.Route)
		if a.Route == RouteTask {
			key += ":" + a.TaskID
		}
		p := ui.Column(c.Key(key)).Grow(1).MinHeight(0)
		a.routeEnter(c, p)
		p.Children(body)
	}
}
