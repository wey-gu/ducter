package views

import (
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 上网 / Browse the web, set up where it's asked for: the first time the
// person picks it on Your devices and abilities (not before). Three calm
// steps, one at a time, each turning green by itself: the browser driver
// (cua-driver's own installer), then the two macOS switches CuaDriver
// needs, which its own guide walks through in System Settings. When all
// three are green Ducter's window comes back to the front and 上网 snaps
// into its slot.

// CuaPoll is how often the switches are looked at while the steps show.
const CuaPoll = 1500 * time.Millisecond

type webSetupState struct {
	cua       local.CuaState
	checked   bool
	busy      bool
	at        time.Time
	tools     time.Time // last check with list-tools
	wasReady  bool
	equipSent bool
}

const (
	jobCuaInstall = "cua.install"
	jobCuaUpdate  = "cua.update"
	jobCuaGrant   = "cua.grant"
)

// webSetupOwned: the steps can run here (this app runs Ducter on this Mac,
// and the device shown is that Mac).
func (a *App) webSetupOwned(dv *protocol.DeviceView) bool {
	return a.Backend != nil && dv != nil && dv.Home
}

// pollCua looks at cua-driver again when it's time (never on the UI thread).
func (a *App) pollCua(c *ui.Context, withTools bool) {
	w := &a.web
	now := a.Now()
	due := !w.checked || now.Sub(w.at) >= CuaPoll
	if !due || w.busy {
		if !w.busy {
			c.After(CuaPoll - now.Sub(w.at))
		}
		return
	}
	tools := withTools || !w.checked || now.Sub(w.tools) > 10*time.Second
	w.busy = true
	var st local.CuaState
	a.async(func() { st = a.Backend.Cua(tools) }, func() {
		w.busy, w.at, w.checked = false, a.Now(), true
		if tools {
			w.tools = w.at
		} else {
			st.Old = w.cua.Old && st.Installed()
		}
		w.cua = st
	})
	c.After(CuaPoll)
}

// webNeedsSetup reports whether 上网 on this Mac still lacks a step (the
// server may already say it's on: installed, but the switches are off).
func (a *App) webNeedsSetup(dv *protocol.DeviceView) bool {
	if !a.webSetupOwned(dv) {
		return false
	}
	ab := dv.Ability(protocol.AbilityWeb)
	if ab == nil || ab.State == protocol.AbilityUnavailable && ab.Reason != "cua_missing" && ab.Reason != "cua_old" {
		return false
	}
	w := &a.web
	if !w.checked {
		return ab.State == protocol.AbilityUnavailable
	}
	return !w.cua.Ready() || w.wasReady && !w.equipSent && ab.State != protocol.AbilityOn
}

// webSetup is the three steps, in the detail card.
func (a *App) webSetup(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	w := &a.web
	a.pollCua(c, false)
	for _, id := range []string{jobCuaInstall, jobCuaUpdate} {
		if j := a.Backend.Job(id); j != nil && !j.Running() && !a.setup.settled[j] {
			if a.setup.settled == nil {
				a.setup.settled = map[*local.Job]bool{}
			}
			a.setup.settled[j] = true
			w.at = time.Time{} // look again now, with the tools
			w.tools = time.Time{}
		}
	}
	st := w.cua
	if !w.checked {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			a.retryPulse(c)
			ui.Text(c, a.L.T("web.checking")).FontSize(t.SM).TextColor(t.InkMuted)
		})
		return
	}
	if st.Ready() {
		a.webReady(c, dv)
		return
	}
	driverOK := st.Installed() && !st.Old
	current := "driver"
	switch {
	case !driverOK:
	case !st.Accessibility:
		current = "ax"
	default:
		current = "screen"
	}
	ui.Column(c).Gap(8).Children(func() {
		a.webStep(c, "driver", 1, current, driverOK)
		a.webStep(c, "ax", 2, current, driverOK && st.Accessibility)
		a.webStep(c, "screen", 3, current, driverOK && st.ScreenRecording)
	})
	if current != "driver" {
		ui.Text(c, a.L.T("web.why")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5)
	}
}

// webStep is one calm card: done (a green check, folded), current (its
// one action), or later (dim).
func (a *App) webStep(c *ui.Context, id string, n int, current string, done bool) {
	t := a.T
	w := &a.web
	isCur := id == current && !done
	bg := t.SurfaceSunken
	if !isCur {
		bg = t.Bg
	}
	card := ui.Column(c.Key("webstep:"+id)).Gap(8).Padding(12, 14).Radius(t.RadiusLG).Background(bg)
	if !isCur && !done {
		card.Opacity(0.6)
	}
	if isCur {
		a.enter(c, card)
	}
	card.Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			switch {
			case done:
				ui.Box(c).Size(22, 22).Radius(8).Background(t.Awake.Surface).Draw(drawCheck(t.Awake.Dot)).Shrink(0)
			case isCur:
				ui.Box(c).Size(22, 22).Radius(8).Background(t.NeedsYou.Surface).Shrink(0).Children(func() {
					ui.Text(c, strconv.Itoa(n)).FontSize(12).FontWeight(800).TextColor(t.NeedsYou.Ink).Margin(ui.Auto)
				})
			default:
				ui.Box(c).Size(22, 22).Radius(8).Background(t.SurfaceSunken).Shrink(0).Children(func() {
					ui.Text(c, strconv.Itoa(n)).FontSize(12).FontWeight(800).TextColor(t.InkMuted).Margin(ui.Auto)
				})
			}
			title := "web." + id
			if id == "driver" && w.cua.Installed() && w.cua.Old {
				title = "web.driver.old"
			}
			ui.Text(c, a.L.T(title)).FontSize(t.MD).FontWeight(800).Grow(1).MinWidth(0)
			if done {
				ui.Text(c, a.L.T("web.done")).FontSize(t.SM).TextColor(t.Awake.Ink)
			}
		})
		if !isCur {
			return
		}
		switch id {
		case "driver":
			a.webDriverStep(c)
		default:
			a.webGrantStep(c, id)
		}
	})
}

func (a *App) webDriverStep(c *ui.Context) {
	t := a.T
	w := &a.web
	old := w.cua.Installed() && w.cua.Old
	jid, cmd, label := jobCuaInstall, local.CuaInstall, a.L.T("web.driver.install")
	if old {
		jid, cmd, label = jobCuaUpdate, w.cua.Bin+" update --apply", a.L.T("web.driver.update")
	}
	k := local.Check{ID: "cua", Label: "cua-driver", Fix: cmd, Action: "install"}
	j := a.Backend.Job(jid)
	switch {
	case j != nil && j.Running():
		a.jobProgress(c, k, j, a.L.T("web.driver.installing"), a.L.T("web.driver.installing.body"))
		c.After(250 * time.Millisecond)
	case j != nil && !j.OK() && !a.setup.retried[j]:
		a.jobFailed(c, local.Check{ID: jid, Label: "cua-driver", Fix: cmd, Action: "install"}, j)
	default:
		ui.Text(c, a.L.T("web.driver.body")).FontSize(t.SM).LineHeight(1.55).TextColor(t.InkSoft)
		ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
			if a.buttonFor(c, label, a.L.T("ability.web"), btnPrimary, 44, t.SurfaceSunken) {
				if _, err := a.Backend.Run(jid, cmd); err != nil {
					a.dev.line, a.dev.lineAt = err.Error(), a.Now()
				}
			}
			ui.Box(c).Grow(1)
			if a.button(c, a.L.T("fix.terminal"), btnText, 36, t.SurfaceSunken) {
				_ = a.Backend.RunInTerminal("cua", cmd)
			}
		})
	}
}

// webGrantStep: one macOS switch. The guide cua-driver ships opens System
// Settings at the right list; the card shows exactly what to look for,
// and turns green by itself.
func (a *App) webGrantStep(c *ui.Context, id string) {
	t := a.T
	w := &a.web
	pane, link := "web.ax.pane", local.SettingsAccessibility
	if id == "screen" {
		pane, link = "web.screen.pane", local.SettingsScreenRecording
	}
	ui.Text(c, a.L.T("web."+id+".body")).FontSize(t.SM).LineHeight(1.55).TextColor(t.InkSoft)
	a.switchArt(c, a.L.T(pane))
	j := a.Backend.Job(jobCuaGrant)
	ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
		if j != nil && j.Running() {
			a.retryPulse(c)
			ui.Text(c, a.L.T("web.grant.waiting")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Grow(1).MinWidth(0)
		} else {
			if a.buttonFor(c, a.L.T("web.grant.open"), a.L.T(pane), btnPrimary, 44, t.SurfaceSunken) {
				_, _ = a.Backend.Run(jobCuaGrant, shellQuoteArg(w.cua.Bin)+" "+local.CuaGrant)
			}
			ui.Box(c).Grow(1)
		}
		if a.button(c, a.L.T("web.grant.self"), btnText, 36, t.SurfaceSunken) {
			_ = a.Backend.OpenSettings(link)
		}
	})
}

// switchArt is the little picture of what to click: the CuaDriver row in
// that System Settings list, with its switch on. Drawn from the tokens; a
// picture of the literal thing, not a metaphor.
func (a *App) switchArt(c *ui.Context, pane string) {
	t := a.T
	ui.Column(c).Gap(6).Padding(10, 12).Radius(12).Background(t.Surface).Border(1, t.LineSoft).Role(ui.RoleImage).
		Label(a.L.T("web.art", pane)).Children(func() {
		ui.Text(c, a.L.T("web.art.where", pane)).FontSize(11.5).FontWeight(700).TextColor(t.InkMuted)
		ui.Row(c).Gap(10).AlignItems(ui.Center).Padding(6, 8).Radius(8).Background(t.SurfaceSunken).Children(func() {
			ui.Box(c).Size(22, 22).Radius(6).Background(t.Ink).Shrink(0).Draw(func(p *ui.Painter, r ui.Rect) {
				var m ui.Path
				m.Circle(r.X+r.W/2, r.Y+r.H/2, 5)
				p.FillPath(&m, t.Accent)
			})
			ui.Text(c, "CuaDriver").FontSize(t.SM).FontWeight(700).Grow(1)
			now := c.Now()
			still := c.Preferences().ReduceMotion
			ui.Box(c).Size(34, 20).Shrink(0).Draw(func(p *ui.Painter, r ui.Rect) {
				p.Fill(r, t.Awake.Dot, r.H/2)
				var knob ui.Path
				knob.Circle(r.X+r.W-r.H/2, r.Y+r.H/2, r.H/2-2)
				p.FillPath(&knob, t.Surface)
				ph := float32(0.5)
				if !still {
					ph = float32(now.UnixMilli()%2000) / 2000
				}
				ring := ui.Rect{X: r.X - 4*ph, Y: r.Y - 4*ph, W: r.W + 8*ph, H: r.H + 8*ph}
				p.Stroke(ring, t.NeedsYou.Dot.Alpha(0.8*(1-ph)), ring.H/2, 2)
			})
			if !still {
				c.After(50 * time.Millisecond)
			}
		})
	})
}

// webReady: all three green. Ducter's window comes back to the front, and
// 上网 is added (the slot fills) if the server doesn't have it on yet.
func (a *App) webReady(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	w := &a.web
	if !w.wasReady {
		w.wasReady = true
		if a.Desktop != nil && a.Backend.Job(jobCuaGrant) != nil {
			a.Desktop.Focus()
		}
		if j := a.Backend.Job(jobCuaGrant); j != nil && j.Running() {
			j.Cancel() // its guide is done; don't leave it waiting
		}
	}
	ab := dv.Ability(protocol.AbilityWeb)
	if ab != nil && ab.State != protocol.AbilityOn && !w.equipSent && a.dev.fx == nil {
		w.equipSent = true
		a.startEquip(dv, protocol.AbilityWeb, a.dev.tiles[protocol.AbilityWeb], false)
	}
	ui.Row(c).Gap(10).AlignItems(ui.Center).Padding(10, 12).Radius(14).Background(t.Done.Surface).Children(func() {
		if bmp := theme.Art(theme.Done, 72); bmp != nil {
			ui.Image(c, bmp).Size(36, 36).Shrink(0)
		}
		ui.Text(c, a.L.T("web.ready", a.deviceNameIn(dv))).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink).Grow(1).MinWidth(0).LineHeight(1.45)
	})
}

func shellQuoteArg(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
