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
	// open: the steps show, over the stage (opened by picking 上网).
	open      bool
	cua       local.CuaState
	checked   bool
	busy      bool
	at        time.Time
	tools     time.Time // last check with list-tools
	wasReady  bool
	equipSent bool
	readyAt   time.Time
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
	// An AI agent's own browser is ready (Codex, or Claude in Chrome connected): nothing to
	// set up, cua-driver or not (D130). Ducter's own browser installs itself on the server (D144).
	if ab.Where == protocol.WhereChrome || ab.Where == protocol.WhereDucter {
		return false
	}
	if !a.web.checked {
		return ab.State == protocol.AbilityUnavailable
	}
	return !a.web.cua.Ready()
}

// openWebSetup shows the steps over the stage.
func (a *App) openWebSetup() {
	w := &a.web
	w.open, w.wasReady, w.equipSent = true, false, false
	a.dev.pair.open = false
}

// webSetupEntry is the detail card's part: what's missing, in one line,
// and the button that opens the steps.
func (a *App) webSetupEntry(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	w := &a.web
	key := "web.entry.missing"
	switch {
	case w.checked && w.cua.Installed() && w.cua.Old:
		key = "web.entry.old"
	case w.checked && w.cua.Installed():
		key = "web.entry.switches"
	}
	a.reasonLine(c, a.L.T(key))
	if !w.open && a.buttonFor(c, a.L.T("web.entry.start"), a.L.T("ability.web"), btnPrimary, 50, t.Surface) {
		a.openWebSetup()
	}
}

// webSheet is the steps, as a sheet over the stage (as the connect code).
func (a *App) webSheet(c *ui.Context, dv *protocol.DeviceView, sw, sh float32) {
	t := a.T
	w := min(sw-48, 440)
	sheet := ui.Column(c.Key("websheet")).Absolute().Left((sw-w)/2).Top(28).Width(w).MaxHeight(sh-56).
		Padding(18, 20).Gap(12).Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).ZIndex(10).
		Role(ui.RoleDialog).Label(a.L.T("web.title"))
	a.enter(c, sheet)
	sheet.Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("web.title")).FontSize(t.LG).FontWeight(800).Grow(1).MinWidth(0)
			if a.button(c, a.L.T("ask.later"), btnText, 36, t.Surface) {
				a.web.open = false
			}
		})
		a.webSetup(c, dv)
	})
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
		ui.Text(c, a.L.T("web.checking")).FontSize(t.SM).TextColor(t.InkMuted)
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
	ui.Column(c.Key("websteps")).Radius(t.RadiusLG).Background(t.SurfaceSunken).Children(func() {
		for i, id := range []string{"driver", "ax", "screen"} {
			if i > 0 {
				ui.Box(c).Height(1).Background(t.Line).Margin(0, t.S4)
			}
			done := map[string]bool{"driver": driverOK, "ax": driverOK && st.Accessibility, "screen": driverOK && st.ScreenRecording}[id]
			a.webStep(c, id, i+1, current, done)
		}
	})
	if current != "driver" {
		ui.Text(c, a.L.T("web.why")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5)
	}
}

// webStep is one flat row: done (a check, quiet), the one open now (its
// status line and its action at the right), or later (its name, quiet).
func (a *App) webStep(c *ui.Context, id string, n int, current string, done bool) {
	t := a.T
	w := &a.web
	isCur := id == current && !done
	title := "web." + id
	if id == "driver" && w.cua.Installed() && w.cua.Old {
		title = "web.driver.old"
	}
	ui.Column(c.Key("webstep:"+id)).Gap(t.S2).Padding(t.S3, t.S4).MinHeight(52).Justify(ui.Center).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
			mark := ui.Box(c).Size(20, 20).Shrink(0).Margin(1, 0, 0, 0)
			if done {
				mark.Draw(drawCheck(t.Ink))
			} else {
				mark.Children(func() {
					ui.Text(c, strconv.Itoa(n)).FontSize(t.SM).FontWeight(800).TextColor(t.InkMuted).Margin(ui.Auto)
				})
			}
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				tt := ui.Text(c, a.L.T(title)).FontSize(t.MD).FontWeight(800)
				if !isCur {
					tt.TextColor(t.InkMuted)
				}
				if isCur {
					ui.Text(c, a.webStatus(id)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45)
				}
			})
			if isCur {
				a.webAction(c, id)
			}
		})
		if !isCur || id == "driver" {
			if isCur {
				a.webDriverExtra(c)
			}
			return
		}
		pane, link := "web.ax.pane", local.SettingsAccessibility
		if id == "screen" {
			pane, link = "web.screen.pane", local.SettingsScreenRecording
		}
		ui.Column(c).Gap(t.S2).Padding(0, 0, 0, 32).Children(func() {
			a.switchArt(c, a.L.T(pane))
			ui.Row(c).Margin(0, -10).Children(func() {
				if a.button(c, a.L.T("web.grant.self"), btnText, t.ControlSM, t.SurfaceSunken) {
					_ = a.Backend.OpenSettings(link)
				}
			})
		})
	})
	if isCur {
		c.After(500 * time.Millisecond)
	}
}

func (a *App) driverJob() (string, string, *local.Job) {
	w := &a.web
	if w.cua.Installed() && w.cua.Old {
		id := jobCuaUpdate
		return id, shellQuoteArg(w.cua.Bin) + " update --apply", a.Backend.Job(id)
	}
	return jobCuaInstall, local.CuaInstall, a.Backend.Job(jobCuaInstall)
}

// webStatus is the open step's one line, replaced in place while it works.
func (a *App) webStatus(id string) string {
	if id == "driver" {
		_, _, j := a.driverJob()
		switch {
		case j != nil && j.Running():
			return a.L.T("fix.installing.now", int(a.Now().Sub(j.Started).Seconds()))
		case j != nil && !j.OK() && !a.setup.retried[j] && j.Trouble() == "offline":
			return a.L.T("fix.offline", "cua-driver")
		case j != nil && !j.OK() && !a.setup.retried[j] && j.Trouble() == "canceled":
			return a.L.T("fix.canceled.short")
		case j != nil && !j.OK() && !a.setup.retried[j]:
			return a.L.T("fix.failed.short", "cua-driver")
		}
		return a.L.T("web.driver.body")
	}
	if g := a.Backend.Job(jobCuaGrant); g != nil && g.Running() {
		return a.L.T("web.grant.waiting")
	}
	return a.L.T("web." + id + ".body")
}

// webAction is the open step's action, at the row's right.
func (a *App) webAction(c *ui.Context, id string) {
	t := a.T
	w := &a.web
	if id != "driver" {
		if g := a.Backend.Job(jobCuaGrant); g != nil && g.Running() {
			return
		}
		pane := "web.ax.pane"
		if id == "screen" {
			pane = "web.screen.pane"
		}
		if a.buttonFor(c, a.L.T("web.grant.open"), a.L.T(pane), btnPrimary, t.ControlMD, t.SurfaceSunken) {
			_, _ = a.Backend.Run(jobCuaGrant, shellQuoteArg(w.cua.Bin)+" "+local.CuaGrant)
		}
		return
	}
	jid, cmd, j := a.driverJob()
	switch {
	case j != nil && j.Running():
		if a.buttonFor(c, a.L.T("fix.cancel"), "cua-driver", btnText, t.ControlSM, t.SurfaceSunken) {
			j.Cancel()
		}
	default:
		label := a.L.T("web.driver.install")
		if jid == jobCuaUpdate {
			label = a.L.T("web.driver.update")
		}
		failed := j != nil && !j.OK() && !a.setup.retried[j] && j.Trouble() != "canceled"
		if failed {
			label = a.L.T("fix.retry")
		}
		if a.buttonFor(c, label, a.L.T("ability.web"), btnPrimary, t.ControlMD, t.SurfaceSunken) {
			if j != nil {
				if a.setup.retried == nil {
					a.setup.retried = map[*local.Job]bool{}
				}
				a.setup.retried[j] = true
			}
			if _, err := a.Backend.Run(jid, cmd); err != nil {
				a.dev.line, a.dev.lineAt = err.Error(), a.Now()
			}
		}
	}
}

// webDriverExtra: after a failed install, the installer's last line and
// the Terminal way.
func (a *App) webDriverExtra(c *ui.Context) {
	t := a.T
	jid, cmd, j := a.driverJob()
	if j == nil || j.Running() || j.OK() || a.setup.retried[j] || j.Trouble() == "canceled" {
		return
	}
	ui.Column(c).Gap(t.S1).Padding(0, 0, 0, 32).Children(func() {
		if last := j.Last(); last != "" && j.Trouble() == "" {
			ui.Text(c, last).Font(t.Mono).FontSize(12).TextColor(t.InkMuted).SingleLine().Selectable()
		}
		ui.Row(c).Margin(0, -10).Children(func() {
			if a.button(c, a.L.T("fix.terminal"), btnText, t.ControlSM, t.SurfaceSunken) {
				_ = a.Backend.RunInTerminal(jid, cmd)
			}
		})
	})
}

// switchArt is the little picture of what to click: the CuaDriver row in
// that System Settings list, with its switch on. Drawn from the tokens; a
// picture of the literal thing, not a metaphor.
func (a *App) switchArt(c *ui.Context, pane string) {
	t := a.T
	ui.Column(c).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).Role(ui.RoleImage).
		Label(a.L.T("web.art", pane)).Children(func() {
		ui.Text(c, a.L.T("web.art.where", pane)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S2).Radius(t.RadiusXS).Background(t.SurfaceSunken).Children(func() {
			ui.Box(c).Size(20, 20).Radius(5).Background(t.Ink).Shrink(0)
			ui.Text(c, "CuaDriver").FontSize(t.SM).FontWeight(700).Grow(1)
			// The switch, on: what the person is looking for.
			ui.Box(c).Size(34, 20).Shrink(0).Draw(func(p *ui.Painter, r ui.Rect) {
				p.Fill(r, t.Awake.Dot, r.H/2)
				var knob ui.Path
				knob.Circle(r.X+r.W-r.H/2, r.Y+r.H/2, r.H/2-2)
				p.FillPath(&knob, t.Surface)
			})
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
	if !w.equipSent && a.dev.fx == nil {
		w.equipSent, w.readyAt = true, a.Now()
		if ab != nil && ab.State != protocol.AbilityOn {
			a.startEquip(dv, protocol.AbilityWeb, a.dev.tiles[protocol.AbilityWeb], false)
		} else {
			a.landed(a.deviceName(dv), protocol.AbilityWeb)
		}
	}
	// The sheet steps aside after a moment, and the sticker lands.
	if left := w.readyAt.Add(1200 * time.Millisecond).Sub(a.Now()); left > 0 {
		c.After(left)
	} else {
		w.open = false
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
