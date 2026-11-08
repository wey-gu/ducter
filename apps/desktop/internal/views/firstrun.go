package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// StartCommand is what starts Ducter's main process.
const StartCommand = "ducter up"

// firstRun is the plain first-run screen: shown while Ducter has never
// answered on this window. It says how to start Ducter, and keeps trying
// on its own; the conversation replaces it as soon as Ducter is up.
func (a *App) firstRun(c *ui.Context) {
	t := a.T
	ui.Column(c).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Padding(32).Children(func() {
		card := ui.Column(c.Key("firstrun")).Width(560).MaxWidthPercent(100).Padding(36, 40, 32, 40).Gap(18).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color)
		a.enter(c, card)
		card.Children(func() {
			if theme.Art(theme.Napping, 240) != nil {
				a.avatar(c, theme.Napping, 120)
			} else {
				a.sleepyFace(c, 72)
			}
			ui.Text(c, a.L.T("firstrun.title")).FontSize(28).FontWeight(800).LetterSpacing(-0.4)
			ui.Text(c, a.L.T("firstrun.body")).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
			a.commandBox(c, StartCommand)
			ui.Text(c, a.L.T("firstrun.source")).FontSize(t.SM).TextColor(t.InkMuted)
			ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
			ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
				a.retryPulse(c)
				ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
					ui.Text(c, a.retryLine(c)).FontSize(t.MD).FontWeight(700)
					if a.URL != "" {
						ui.Text(c, a.L.T("firstrun.where", a.URL)).Font(t.Mono).FontSize(11.5).TextColor(t.InkMuted).SingleLine()
					}
				})
				if a.RetryNow != nil && a.button(c, a.L.T("firstrun.retry"), btnQuiet, 44, t.Bg) {
					a.RetryNow()
				}
			})
			ui.Text(c, a.L.T("firstrun.auto")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			if a.Pair != nil {
				ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
				if a.button(c, a.L.T("firstrun.elsewhere"), btnText, 40, t.Surface) {
					a.openConnect()
				}
			}
		})
	})
}

// retryLine says when the next attempt is.
func (a *App) retryLine(c *ui.Context) string {
	if a.NextAttempt == nil {
		return a.L.T("firstrun.retrying")
	}
	at := a.NextAttempt()
	if at.IsZero() {
		return a.L.T("firstrun.retrying")
	}
	left := at.Sub(a.Now())
	if left <= 0 {
		return a.L.T("firstrun.retrying")
	}
	c.After(min(left, time.Second-time.Duration(left.Nanoseconds()%int64(time.Second))+time.Millisecond))
	return a.L.T("firstrun.retry.in", int(math.Ceil(left.Seconds())))
}

// commandBox shows a command to type, with a copy button.
func (a *App) commandBox(c *ui.Context, cmd string) {
	a.commandBoxSized(c, cmd, 17)
}

// commandBoxSized is a command box with its own type size (long commands
// set smaller).
func (a *App) commandBoxSized(c *ui.Context, cmd string, size float32) {
	t := a.T
	box := ui.Row(c.Key("cmd")).Gap(12).Padding(8, 8, 8, 18).Radius(t.RadiusSM).Background(t.Ink).AlignItems(ui.Center)
	copied := ui.Local(box, "copied", func() time.Time { return time.Time{} })
	box.Children(func() {
		ui.Text(c, "$").Font(t.Mono).FontSize(16).TextColor(t.Accent)
		ui.Text(c, cmd).Font(t.Mono).FontSize(size).FontWeight(700).TextColor(t.OnUserBubble).Grow(1).Selectable()
		label := a.L.T("firstrun.copy")
		if since := a.Now().Sub(*copied); !copied.IsZero() && since < 2*time.Second {
			label = a.L.T("firstrun.copied")
			c.After(2*time.Second - since)
		}
		b := ui.Row(c.Key("copy")).Height(36).Padding(0, 14).Radius(10).Background(t.InkSoft).Justify(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("firstrun.copy")).Shrink(0)
		b.Children(func() {
			ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.OnUserBubble)
		})
		if b.Clicked() {
			c.WriteClipboard(cmd)
			*copied = a.Now()
		}
	})
}

// retryPulse is a small dot that breathes while the client keeps trying.
func (a *App) retryPulse(c *ui.Context) {
	t := a.T
	still := c.Preferences().ReduceMotion
	now := c.Now()
	ui.Box(c).Size(28, 28).Shrink(0).Draw(func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		ph := float32(0.5)
		if !still {
			ph = float32(now.UnixMilli()%1800) / 1800
		}
		ring := 6 + 8*ph
		var m ui.Path
		m.Circle(cx, cy, ring)
		p.FillPath(&m, t.Waiting.Dot.Alpha(0.45*(1-ph)))
		var d ui.Path
		d.Circle(cx, cy, 6)
		p.FillPath(&d, t.Waiting.Dot)
	})
	if !still {
		c.After(33 * time.Millisecond)
	}
}

// sleepyFace is the persona's face with its eyes closed: Ducter is not up
// yet. Its eyelids are two soft arcs; it breathes slowly.
func (a *App) sleepyFace(c *ui.Context, size float32) {
	t := a.T
	still := c.Preferences().ReduceMotion
	now := c.Now()
	ui.Box(c).Size(size, size).Role(ui.RoleImage).Label(a.L.T("firstrun.title")).Draw(func(p *ui.Painter, r ui.Rect) {
		breathe := float32(0)
		if !still {
			breathe = float32(math.Sin(float64(now.UnixMilli())/900)) * 0.6
		}
		s := r.W / 52
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + (v+breathe*(v-46)/40)*s }
		var peb ui.Path
		peb.MoveTo(x(8), y(26))
		peb.CubeTo(x(8), y(14), x(16), y(6), x(27), y(6))
		peb.CubeTo(x(38), y(6), x(46), y(13), x(46), y(24))
		peb.CubeTo(x(46), y(35), x(38), y(46), x(26), y(46))
		peb.CubeTo(x(14), y(46), x(8), y(38), x(8), y(26))
		peb.Close()
		p.FillPath(&peb, t.Accent.Mix(t.SurfaceSunken, 0.35))
		for _, ex := range []float32{19, 30} {
			var lid ui.Path
			lid.MoveTo(x(ex-0.5), y(24))
			lid.QuadTo(x(ex+2.5), y(27), x(ex+5.5), y(24))
			p.StrokePath(&lid, 2*s, t.Ink)
		}
	})
	if !still {
		c.After(50 * time.Millisecond)
	}
}

// enter plays an element's entrance once: it rises a little and fades in.
func (a *App) enter(c *ui.Context, e ui.Element) {
	if c.Preferences().ReduceMotion {
		return
	}
	shown := ui.Local(e, "entered", func() bool { return false })
	p := ui.Pose{}
	if !*shown {
		p, *shown = ui.Pose{Y: 12, Scale: 0.98, Fade: 1}, true
		c.Invalidate()
	}
	e.AnimatePose(p, a.T.Bouncy)
}
