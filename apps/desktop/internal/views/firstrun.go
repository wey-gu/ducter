package views

import (
	"math"
	"strings"
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
	a.bareChrome(c)
	ui.Column(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(ui.Center).Padding(8, 32, 8+ChromeH, 32).Children(func() {
		card := ui.Column(c.Key("firstrun")).Width(560).MaxWidthPercent(100).Padding(t.S6, t.S7, t.S6, t.S7).Gap(t.S4).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
		a.enter(c, card)
		card.Children(func() {
			if theme.Art(theme.Napping, 240) != nil {
				a.avatar(c, theme.Napping, 120)
			} else {
				a.sleepyFace(c, 72)
			}
			ui.Text(c, a.L.T("firstrun.title")).FontSize(t.XXL).FontWeight(800).LetterSpacing(-0.4)
			ui.Text(c, a.L.T("firstrun.body")).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
			a.commandBox(c, StartCommand)
			ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
					ui.Text(c, a.retryLine(c)).FontSize(t.MD).FontWeight(700)
					if a.URL != "" && isLocalURL(a.URL) {
						// Someone who has never heard of a WebSocket: say where, not the URL.
						ui.Text(c, a.L.T("firstrun.where.local")).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
					} else if a.URL != "" {
						ui.Text(c, a.L.T("firstrun.where", a.URL)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).SingleLine()
					}
				})
				if a.RetryNow != nil && a.button(c, a.L.T("firstrun.retry"), btnSecondary, t.ControlMD, t.Bg) {
					a.RetryNow()
				}
			})
			ui.Text(c, a.L.T("firstrun.auto")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			if a.Pair != nil {
				ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
				if a.button(c, a.L.T("firstrun.elsewhere"), btnText, t.ControlMD, t.Surface) {
					a.openConnect()
				}
			}
		})
	})
}

// isLocalURL: Ducter on this machine (loopback).
func isLocalURL(u string) bool {
	for _, h := range []string{"//127.0.0.1:", "//localhost:", "//[::1]:"} {
		if strings.Contains(u, h) {
			return true
		}
	}
	return false
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
	box := ui.Row(c.Key("cmd")).Gap(t.S3).Padding(t.S2, t.S2, t.S2, t.S4).Radius(t.RadiusSM).Background(t.Ink).AlignItems(ui.Center)
	copied := ui.Local(box, "copied", func() time.Time { return time.Time{} })
	box.Children(func() {
		ui.Text(c, "$").Font(t.Mono).FontSize(t.MD).TextColor(t.Accent)
		ui.Text(c, cmd).Font(t.Mono).FontSize(size).FontWeight(700).TextColor(t.OnUserBubble).Grow(1).Selectable()
		label := a.L.T("firstrun.copy")
		if since := a.Now().Sub(*copied); !copied.IsZero() && since < 2*time.Second {
			label = a.L.T("firstrun.copied")
			c.After(2*time.Second - since)
		}
		// A button on the dark box: the secondary shape, in the box's ink.
		b := ui.Row(c.Key("copy")).Height(t.ControlSM).Padding(0, t.S3).Radius(t.RadiusSM).Background(t.InkSoft).Justify(ui.Center).
			AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("firstrun.copy")).Focusable().Shrink(0)
		if b.Hovered() {
			b.Background(t.InkSoft.Mix(t.InkMuted, 0.35))
		}
		a.sink(c, b, b.Pressed())
		b.Children(func() {
			ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.OnUserBubble)
		})
		if b.Clicked() {
			c.WriteClipboard(cmd)
			*copied = a.Now()
		}
	})
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
