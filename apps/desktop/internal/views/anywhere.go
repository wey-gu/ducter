package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D228: 在哪儿都能用 / From anywhere on the home: one tap opens a way in from
// outside (Ducter's free Cloudflare tunnel when there is no address of the
// person's own). Its ⓘ says it is opening, why it didn't, or the address,
// who can get in, and how it is reached; 关掉 asks once more.

// anywhere is the home's From anywhere, nil when off.
func (a *App) anywhere() *protocol.Anywhere {
	if a.S.Reach == nil {
		return nil
	}
	return a.S.Reach.Anywhere
}

// anywhereInfo draws its state inside the chip's ⓘ.
func (a *App) anywhereInfo(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	any := a.anywhere()
	if any == nil {
		return
	}
	switch any.State {
	case "starting":
		key := "anywhere.starting"
		if any.Getting {
			key = "anywhere.getting"
		}
		a.reasonLine(c, a.L.T(key))
		return
	case "failed":
		why := any.Reason
		if why == "" {
			why = "failed"
		}
		a.reasonLine(c, a.L.T("anywhere.failed", a.L.T("anywhere.why."+why)))
		ui.Row(c).Children(func() {
			if a.button(c, a.L.T("anywhere.retry"), btnSecondary, t.ControlSM, t.Bg) {
				a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: protocol.AbilityRemote, On: true})
			}
		})
		return
	}
	if a.S.Reach.Address != "" {
		ui.Text(c, a.S.Reach.Address).Font(t.Mono).FontSize(t.XS).TextColor(t.Ink).Selectable().MaxLines(2)
	}
	a.infoText(c, a.L.T("anywhere.who"))
	how := a.L.T("anywhere.moves", a.deviceName(dv))
	switch any.How {
	case "own":
		how = a.L.T("anywhere.own")
	case "named":
		how = a.L.T("anywhere.named")
	}
	ui.Text(c, how).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
}

// anywhereOff is 关掉 at the end of the ⓘ, asked once more (Ducter's or the
// person's own tunnel; an address of their own is not a switch here).
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
