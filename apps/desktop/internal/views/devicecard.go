package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// deviceDetail is the chosen island's card beside the stage (D81, D148):
// one header (its name, renamed in place; what it is, in plain words), a
// short state line, what it can do, its AI accounts (the signed-in ones;
// the rest folded behind + 再登录一个 AI unless none is signed in), its
// Ducter version with the update, and the actions at the bottom. Tapping
// an account lifts every island it's signed in on; on the Mac this app
// runs Ducter on, an account opens its sheet (sign in, install, sign out).
func (a *App) deviceDetail(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	a.drainDeviceResults()
	card := ui.Column(c.Key("device-card")).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
		Padding(t.S5).Gap(t.S2)
	if d.selClient != "" && a.S.Reach != nil {
		for i := range a.S.Reach.Clients {
			cl := &a.S.Reach.Clients[i]
			if cl.ID != d.selClient {
				continue
			}
			card.Role(ui.RoleGroup).Label(cl.Name).Children(func() { a.clientCard(c, cl) })
			return
		}
		d.selClient = ""
	}
	if dv == nil {
		return
	}
	name := a.deviceName(dv)
	card.Role(ui.RoleGroup).Label(name).Children(func() {
		ui.Column(c).Gap(t.S1).Children(func() {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ui.Column(c).Grow(1).MinWidth(0).Children(func() { a.cardName(c, dv.ID, name, !dv.Home) })
			})
			ui.Text(c, a.kindLine(dv)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).LineHeight(1.5)
		})
		var line string
		ink := t.Awake.Ink
		switch dv.State {
		case protocol.DeviceAsleep:
			line, ink = a.L.T("device.asleep.line", name), t.Asleep.Ink
		case protocol.DeviceUnreachable:
			if ago := a.agoLong(dv.LastSeen); ago != "" {
				line = a.L.T("device.unreachable.line", a.deviceNameIn(dv), ago)
			} else {
				line = a.L.T("device.unreachable.line.never", a.deviceNameIn(dv))
			}
			ink = t.Away.Ink
		default:
			switch n := a.runningOn(dv); {
			case n == 1:
				line = a.L.T("device.state.awake") + " · " + a.L.T("device.other.working.one")
			case n > 1:
				line = a.L.T("device.state.awake") + " · " + a.L.T("device.other.working", n)
			default:
				line = a.L.T("device.state.awake")
			}
		}
		ui.Text(c, line).FontSize(t.SM).TextColor(ink).LineHeight(1.5)
		var on []string
		for _, ab := range dv.Abilities {
			if a.abilityOn(dv, ab.ID) {
				on = append(on, a.L.T("ability."+ab.ID))
			}
		}
		if len(on) > 0 {
			ui.Text(c, a.L.T("devices.can", name, strings.Join(on, " · "))).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5)
		}

		// AI accounts: the signed-in ones; the rest only on a tap, unless none is.
		ui.Text(c, a.L.T("devices.accounts", a.deviceNameIn(dv))).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).Margin(t.S3, 0, 0, 0)
		var in, rest []protocol.DeviceHarness
		for _, h := range dv.Harnesses {
			if h.Installed && h.LoggedIn {
				in = append(in, h)
			} else {
				rest = append(rest, h)
			}
		}
		if len(dv.Harnesses) == 0 {
			ui.Text(c, a.L.T("devices.accounts.none", a.deviceNameIn(dv))).FontSize(t.SM).TextColor(t.InkSoft)
		}
		for _, h := range in {
			a.accountRow(c, dv, h)
		}
		if d.card.more == nil {
			d.card.more = map[string]bool{}
		}
		if len(in) == 0 || d.card.more[dv.ID] {
			for _, h := range rest {
				a.accountRow(c, dv, h)
			}
		} else if len(rest) > 0 {
			a.textRow(c, t.ControlSM).Children(func() {
				if a.button(c, a.L.T("devices.accounts.more"), btnText, t.ControlSM, t.Surface) {
					d.card.more[dv.ID] = true
				}
			})
		}

		a.browserBlock(c, dv) // D150: 上网 on a server, Ducter's own browser
		a.versionBlock(c, dv)
		if !dv.Home {
			a.disconnectRow(c, dv.ID, name, false)
		}
	})
}

// accountRow is one AI account in the device card.
func (a *App) accountRow(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	t := a.T
	d := a.devState()
	name := harnessName(h.Harness)
	status := a.L.T("token.signed_in")
	switch {
	case !h.Installed:
		status = a.L.T("token.missing")
	case !h.LoggedIn:
		status = a.L.T("token.signed_out")
	default:
		if h.Allowance != nil {
			status += " · " + a.L.T("token.allowance", int(h.Allowance.Left*100+0.5))
		}
		n := len(a.signedIn(h.Harness))
		if h.Allowance != nil && h.Allowance.SharedBy > n {
			n = h.Allowance.SharedBy
		}
		if n > 1 {
			status += " · " + a.L.T("token.shared", n)
		}
	}
	manage := a.Backend != nil && dv.Home && dv.State == protocol.DeviceAwake && accountCheck(h.Harness) != ""
	lit := d.lit == h.Harness
	row := ui.Row(c.Key("acct:"+dv.ID+":"+h.Harness)).Gap(t.S3).Padding(t.S2, 0).AlignItems(ui.Center).
		Role(ui.RoleButton).Label(name + " · " + status).Cursor(ui.CursorPointer).AccessSelected(lit)
	if !h.LoggedIn || dv.State != protocol.DeviceAwake {
		row.Opacity(0.7)
	}
	row.Children(func() {
		bmp := theme.Clay(accountArt(h.Harness))
		ui.Box(c.Key("art")).Size(34, 34).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			if bmp != nil {
				p.Image(bmp, r, ui.Contain)
			}
			if lit {
				var m ui.Path
				m.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2+2)
				p.StrokePath(&m, 2, t.Ink)
			}
		})
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			ui.Text(c, name).FontSize(t.MD).FontWeight(800).SingleLine()
			ui.Text(c, status).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).LineHeight(1.4).MaxLines(2)
		})
		if manage {
			label := a.L.T("token.signout")
			switch {
			case !h.Installed:
				label = a.L.T("token.install")
			case !h.LoggedIn:
				label = a.L.T("token.signin")
			}
			if a.buttonFor(c, label, name, btnText, t.ControlSM, t.Surface) {
				d.account = h.Harness
			}
		}
	})
	if row.Clicked() && h.LoggedIn {
		if lit {
			d.lit = ""
		} else {
			d.lit, d.litAt = h.Harness, a.Now()
		}
	}
}
