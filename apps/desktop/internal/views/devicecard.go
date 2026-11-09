package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// deviceDetail is the chosen island's card beside the stage (D81): what
// the device is, what it can do now, and the AI accounts on it, each with
// a literal line when its limit is shared with other devices. Tapping an
// account lifts every island it's signed in on, as on the stage; on the
// Mac this app runs Ducter on, an account opens its sheet (sign in,
// install, sign out; D71).
func (a *App) deviceDetail(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	card := ui.Column(c.Key("device-card")).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
		Padding(t.S4).Gap(t.S2)
	if d.selClient != "" && a.S.Reach != nil {
		for i := range a.S.Reach.Clients {
			cl := &a.S.Reach.Clients[i]
			if cl.ID != d.selClient {
				continue
			}
			card.Role(ui.RoleGroup).Label(cl.Name).Children(func() {
				a.heading(c, cl.Name, t.XL)
				ui.Text(c, a.clientLine(cl)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).LineHeight(1.5)
				ui.Text(c, a.L.T("ability.remote.how")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5)
			})
			return
		}
		d.selClient = ""
	}
	if dv == nil {
		return
	}
	name := a.deviceName(dv)
	card.Role(ui.RoleGroup).Label(name).Children(func() {
		a.heading(c, name, t.XL)
		var line string
		var ink ui.Color
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
			line, ink = a.deviceLine(dv, t.Awake)
		}
		if line != "" {
			ui.Text(c, line).FontSize(t.SM).FontWeight(700).TextColor(ink).LineHeight(1.5)
		}
		var on []string
		for _, ab := range dv.Abilities {
			if a.abilityOn(dv, ab.ID) {
				on = append(on, a.L.T("ability."+ab.ID))
			}
		}
		if len(on) > 0 {
			ui.Text(c, a.L.T("devices.can", name, strings.Join(on, " · "))).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5)
		}
		ui.Text(c, a.L.T("devices.accounts", a.deviceNameIn(dv))).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).Margin(t.S2, 0, 0, 0)
		if len(dv.Harnesses) == 0 {
			ui.Text(c, a.L.T("devices.accounts.none", a.deviceNameIn(dv))).FontSize(t.SM).TextColor(t.InkSoft)
		}
		for _, h := range dv.Harnesses {
			a.accountRow(c, dv, h)
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
