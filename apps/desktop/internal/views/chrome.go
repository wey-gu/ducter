package views

import (
	"fmt"

	"github.com/egoist/mygo/ui"
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

// page wraps the zoom level shown in a column keyed by it, so changing
// level plays its entrance (routeEnter).
func (a *App) page(c *ui.Context, body func()) func() {
	return func() {
		// Keyed by level only: a reconnect must not rebuild the
		// conversation (and lose its scroll).
		key := fmt.Sprintf("page:%d:%v", a.Route, a.S.Welcomed)
		if a.Route == RouteTask {
			key += ":" + a.TaskID
		}
		p := ui.Column(c.Key(key)).Grow(1).MinHeight(0)
		a.routeEnter(c, p)
		p.Children(body)
	}
}
