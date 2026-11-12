package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D228: 从外面连 / From outside on the home: an address from outside at
// the person's own domain, through their own Cloudflare account. Off, its ⓘ
// says in one line what it needs and offers 让 Ducter 帮我设好 (a task on the
// home sets up their tunnel with Cloudflare's own program). Being set up, the
// steps tick by themselves, with the sign-in link while it waits for them.
// On: the address, who gets in, where TLS ends; 关掉 asks once more and says
// the tunnel stays in their Cloudflare account.

// anywhere is the home's From outside, nil when off with nothing kept.
func (a *App) anywhere() *protocol.Anywhere {
	if a.S.Reach == nil {
		return nil
	}
	return a.S.Reach.Anywhere
}

// anywhereSetupFailed: a step of the guided setup failed.
func anywhereSetupFailed(any *protocol.Anywhere) bool {
	if any == nil || any.Setup == nil {
		return false
	}
	for _, s := range any.Setup.Steps {
		if s.State == "failed" {
			return true
		}
	}
	return false
}

// beginAnywhere is 让 Ducter 帮我设好 / Set it up for me.
func (a *App) beginAnywhere() {
	a.devState().card.anywhereNo = ""
	a.send(protocol.AnywhereSetupReq{T: "anywhere_setup", Op: "begin"})
}

// anywhereInfo draws its state inside the chip's ⓘ.
func (a *App) anywhereInfo(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	any := a.anywhere()
	awake := dv.State == protocol.DeviceAwake
	no := a.devState().card.anywhereNo
	answer := func() {
		if no != "" {
			a.reasonLine(c, a.L.T("anywhere.answer."+no))
		}
	}
	if any == nil {
		if !awake {
			return
		}
		ui.Text(c, a.L.T("anywhere.need")).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.55))
		ui.Text(c, a.L.T("anywhere.setup.what")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
		answer()
		ui.Row(c).Children(func() {
			if a.button(c, a.L.T("anywhere.setup"), btnPrimary, t.ControlSM, t.Bg) {
				a.beginAnywhere()
			}
		})
		return
	}
	switch any.State {
	case "off":
		ui.Text(c, a.L.T("anywhere.kept", any.Hostname)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
		if awake {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("anywhere.turnOn"), btnPrimary, t.ControlSM, t.Bg) {
					a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: protocol.AbilityRemote, On: true})
				}
			})
		}
		return
	case "setup":
		if any.Setup != nil {
			a.anywhereSteps(c, any.Setup, awake)
		}
		answer()
		return
	case "starting":
		a.reasonLine(c, a.L.T("anywhere.starting", any.Hostname))
		return
	case "failed":
		why := any.Reason
		if why == "" {
			why = "failed"
		}
		a.reasonLine(c, a.L.T("anywhere.failed", a.anywhereWhy(why, any.Hostname)))
		if awake {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("anywhere.retry"), btnSecondary, t.ControlSM, t.Bg) {
					a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: protocol.AbilityRemote, On: true})
				}
			})
		}
		return
	}
	if a.S.Reach.Address != "" {
		ui.Text(c, a.S.Reach.Address).Font(t.Mono).FontSize(t.XS).TextColor(t.Ink).Selectable().MaxLines(2)
	}
	a.infoText(c, a.L.T("anywhere.who"))
	how := a.L.T("anywhere.edge")
	if any.How == "own" {
		how = a.L.T("anywhere.own")
	}
	ui.Text(c, how).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
}

// anywhereSteps is the setup's list, one drawn mark per step, then the
// sign-in link (and its QR, to open on a phone) while it waits for them.
func (a *App) anywhereSteps(c *ui.Context, s *protocol.AnywhereSetup, awake bool) {
	t := a.T
	failed := false
	ui.Column(c).Gap(t.S1).Children(func() {
		for _, st := range s.Steps {
			st := st
			col := t.InkMuted
			draw := drawStepTodo(t.Line)
			switch st.State {
			case "done":
				col, draw = t.Ink, drawCheck(t.Done.Ink)
			case "doing":
				col, draw = t.Ink, drawArrow(t.Working.Ink)
			case "waiting":
				col, draw = t.Ink, drawStepWaiting(t.Working.Ink)
			case "failed":
				failed = true
				col, draw = t.Failed.Ink, drawStepFailed(t.Failed.Ink)
			}
			ui.Column(c).Gap(2).Children(func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					a.glyph(c, 18, draw)
					ui.Text(c, a.anywhereStep(st.ID, s.Hostname)).FontSize(t.SM).TextColor(col).LineHeight(a.leading(1.4))
				})
				line := ""
				if st.ID == "name" && st.State == "waiting" {
					line = a.L.T("anywhere.go.wait")
				}
				if st.State == "failed" {
					line = a.anywhereWhy(st.Reason, s.Hostname)
				}
				if line != "" {
					ui.Row(c).Padding(0, 0, 0, 18+t.S2).Children(func() {
						ui.Text(c, line).FontSize(t.XS).TextColor(col).LineHeight(a.leading(1.45))
					})
				}
			})
		}
	})
	if l := s.Login; l != nil {
		ui.Column(c).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
			key := "anywhere.login.open"
			if l.Opened {
				key = "anywhere.login.opened"
			}
			ui.Text(c, a.L.T(key)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				if !l.Opened && len(l.QR) > 0 {
					qrBox(c, l.QR, 96, t.Ink, t.Surface)
				}
				ui.Column(c).Gap(t.S1).Children(func() {
					if a.button(c, a.L.T("anywhere.login.button"), btnPrimary, t.ControlSM, t.SurfaceSunken) {
						a.openLink(l.URL)
					}
					if !l.Opened && len(l.QR) > 0 {
						ui.Text(c, a.L.T("anywhere.login.qr")).FontSize(t.XS).TextColor(t.InkMuted)
					}
				})
			})
		})
	}
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		if failed && awake && a.button(c, a.L.T("anywhere.retry"), btnSecondary, t.ControlSM, t.Bg) {
			a.beginAnywhere()
		}
		if s.TaskID != "" && a.button(c, a.L.T("anywhere.task"), btnText, t.ControlSM, t.Bg) {
			a.OpenTask(s.TaskID)
		}
	})
}

// anywhereWhy says why a step or the tunnel didn't get there; two reasons
// name the address.
func (a *App) anywhereWhy(why, host string) string {
	switch why {
	case "taken", "unreachable":
		return a.L.T("anywhere.why."+why, host)
	case "download", "unsupported", "login", "cloudflare":
		return a.L.T("anywhere.why." + why)
	}
	return a.L.T("anywhere.why.failed")
}

// anywhereStep is a step's name (定下地址 names the address).
func (a *App) anywhereStep(id, host string) string {
	if id == "name" {
		if host == "" {
			return a.L.T("anywhere.step.name.bare")
		}
		return a.L.T("anywhere.step.name", host)
	}
	return a.L.T("anywhere.step." + id)
}

// anywhereOff is 关掉 at the end of the ⓘ, asked once more (the person's own
// tunnel; an address set up another way is not a switch here).
func (a *App) anywhereOff(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	any := a.anywhere()
	s := &a.devState().card
	if any == nil || any.How == "own" || any.State != "on" || dv.State != protocol.DeviceAwake {
		return
	}
	if s.anywhereOff {
		ui.Text(c, a.L.T("anywhere.off.note", a.deviceName(dv))).FontSize(t.XS).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
	}
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		if s.anywhereOff {
			if a.button(c, a.L.T("anywhere.keep"), btnSecondary, t.ControlSM, t.Bg) {
				s.anywhereOff = false
			}
			if a.dangerText(c, "anywhere-off", a.L.T("anywhere.off.sure"), "") {
				s.anywhereOff = false
				a.removeAbility(dv, protocol.AbilityRemote)
			}
			return
		}
		if a.button(c, a.L.T("anywhere.off"), btnText, t.ControlSM, t.Bg) {
			s.anywhereOff = true
		}
	})
}

// drawStepTodo is a step still to come (an empty ring).
func drawStepTodo(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		var m ui.Path
		m.Circle(r.X+r.W/2, r.Y+r.H/2, 6)
		p.StrokePath(&m, 1.8, col)
	}
}

// drawStepWaiting is a step waiting for the person (two bars).
func drawStepWaiting(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-2.4, cy-4)
		m.LineTo(cx-2.4, cy+4)
		m.MoveTo(cx+2.4, cy-4)
		m.LineTo(cx+2.4, cy+4)
		p.StrokePath(&m, 2.2, col)
	}
}

// drawStepFailed is a step that didn't get there: a ring with a bar and a
// dot inside (the state's mark, as on the update list).
func drawStepFailed(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var o ui.Path
		o.Circle(cx, cy, 7)
		p.StrokePath(&o, 1.6, col)
		var m ui.Path
		m.MoveTo(cx, cy-3.6)
		m.LineTo(cx, cy+0.8)
		p.StrokePath(&m, 1.9, col)
		p.Fill(ui.Rect{X: cx - 1.1, Y: cy + 2.4, W: 2.2, H: 2.2}, col, 1.1)
	}
}
