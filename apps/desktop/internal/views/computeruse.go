package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// computerUseState: the Macs the guide was opened on (said once, in place of the button).
type computerUseState struct {
	granted map[string]bool
}

// D235, 用电脑 / Use the computer: tasks use the apps on a Mac (the home or a
// worker), gated at the effect. The chip: + adds it; added without macOS's
// two switches, it fails and its ⓘ says which, with the guide that opens on
// that Mac (and 移除 / Remove); on, a tap removes it and its ⓘ says how it
// works. Under the
// chips, each task using the apps there with 停下 / Stop. The same rules as
// the web's (apps/web/src/computer-use.tsx).

func (a *App) computerSpec(c *ui.Context, card string, dv *protocol.DeviceView, ab *protocol.DeviceAbility) chipSpec {
	id := protocol.AbilityComputer
	sp := chipSpec{id: id, label: a.L.T("chip." + id), art: abilityArt(id)}
	info := func() { a.toggleChipInfo(card, id) }
	sp.info = func() { a.infoText(c, a.L.T("ability.computer.about")) }
	switch {
	case ab.State == protocol.AbilityOn:
		// Off is one tap, as for every ability (nothing at stake); its ⓘ says how it works.
		sp.look = chipOn
		sp.tap = func(ui.Rect) {
			if dv.State == protocol.DeviceAwake {
				a.removeAbility(dv, id)
			}
		}
		sp.info = func() { a.infoText(c, a.L.T("computeruse.where", a.deviceNameIn(dv))) }
	case ab.State == protocol.AbilityUnavailable && ab.Reason == "computer_permissions":
		sp.look = chipFail
		sp.tap = func(ui.Rect) { info() }
		sp.info = func() {
			a.computerPerms(c, dv, ab)
			a.computerRemove(c, dv)
		}
	case ab.State == protocol.AbilityUnavailable:
		sp.look = chipOff
		sp.tap = func(ui.Rect) { info() }
		sp.info = func() {
			a.infoText(c, a.L.T("ability.computer.about"))
			if ab.Reason == "cua_missing" {
				a.reasonLine(c, a.L.T("computeruse.cua_missing"))
				a.unavailableFix(c, ab)
			} else {
				a.unavailable(c, ab)
			}
		}
	case dv.State == protocol.DeviceAwake:
		sp.look = chipAdd
		sp.tap = func(r ui.Rect) { a.startEquip(dv, id, r, false) }
	default:
		sp.look = chipOff
		sp.tap = func(ui.Rect) { info() }
		sp.info = func() {
			a.infoText(c, a.L.T("ability.computer.about"))
			a.reasonLine(c, a.L.T("ability.reason.asleep"))
		}
	}
	return sp
}

// unavailableFix is the one thing to do for cua-driver missing (its install page).
func (a *App) unavailableFix(c *ui.Context, ab *protocol.DeviceAbility) {
	t := a.T
	if a.button(c, a.L.T("ability.fix.install"), btnSecondary, t.ControlMD, t.Bg) {
		a.openLink("https://github.com/trycua/cua")
	}
}

// computerPerms lists macOS's two switches with where each stands, how to
// turn them on, and the guide that opens on that Mac's screen.
func (a *App) computerPerms(c *ui.Context, dv *protocol.DeviceView, ab *protocol.DeviceAbility) {
	t := a.T
	name := a.deviceNameIn(dv)
	a.infoText(c, a.L.T("computeruse.perms", name))
	p := ab.Perms
	for _, row := range []struct {
		key string
		on  bool
	}{{"computeruse.perm.accessibility", p != nil && p.Accessibility}, {"computeruse.perm.screen", p != nil && p.Screen}} {
		state, ink := a.L.T("computeruse.perm.off"), t.NeedsYou.Ink
		if row.on {
			state, ink = a.L.T("computeruse.perm.on"), t.InkSoft
		}
		ui.Row(c.Key("perm:" + row.key)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T(row.key)).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5).Grow(1).MinWidth(0)
			ui.Text(c, state).FontSize(t.SM).FontWeight(700).TextColor(ink)
		})
	}
	a.infoText(c, a.L.T("computeruse.perms.how"))
	if a.cu.granted[dv.ID] {
		a.reasonLine(c, a.L.T("computeruse.guide.sent", name))
		return
	}
	if dv.State == protocol.DeviceAwake {
		ui.Row(c).Children(func() {
			if a.button(c, a.L.T("computeruse.guide", name), btnSecondary, t.ControlSM, t.Bg) {
				a.computerGrant(dv.ID)
			}
		})
	}
}

// computerGrant opens cua-driver's guide on that Mac (the person flips the
// switches there; the card follows when that Mac says so).
func (a *App) computerGrant(device string) {
	if a.cu.granted == nil {
		a.cu.granted = map[string]bool{}
	}
	a.cu.granted[device] = true
	a.send(protocol.ComputerGrantReq{T: "computer_grant", Device: device})
}

func (a *App) computerRemove(c *ui.Context, dv *protocol.DeviceView) {
	if dv.State != protocol.DeviceAwake {
		return
	}
	ui.Row(c).Children(func() {
		if a.dangerText(c, "computer-remove:"+dv.ID, a.L.T("computeruse.remove"), a.L.T("chip.computer")) {
			a.removeAbility(dv, protocol.AbilityComputer)
		}
	})
}

// computerNotes is, under the chips, each task using this Mac's apps now,
// with 停下 / Stop.
func (a *App) computerNotes(c *ui.Context, dv *protocol.DeviceView, note func(key string, tint bool, body func())) {
	t := a.T
	if a.S.OnHand == nil {
		return
	}
	var cards []protocol.TaskCard
	for _, cd := range a.S.OnHand.Tasks {
		if cd.Computing == nil || cd.Computing.Device != dv.ID {
			continue
		}
		switch cd.Attention {
		case protocol.Working, protocol.Queued, protocol.NeedsYou, protocol.Blocked:
			cards = append(cards, cd)
		}
	}
	if len(cards) == 0 {
		return
	}
	note("computing", false, func() {
		for _, cd := range cards {
			id, title, app := cd.TaskID, cd.Title, cd.Computing.App
			ui.Row(c.Key("computing:" + id)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				a.coinBox(c, "computing:"+id, cd.Harness, 20, false, coinStill)
				line := a.L.T("computeruse.using.0", title)
				if app != "" {
					line = a.L.T("computeruse.using", title, app)
				}
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
				if a.buttonFor(c, a.L.T("computeruse.stop"), title, btnSecondary, t.ControlSM, t.Bg) {
					a.send(protocol.ComputerStopReq{T: "computer_stop", TaskID: id})
				}
			})
		}
	})
}

// computerTaskLine is, on the opened task, where it is using the person's
// apps, with 停下 / Stop.
func (a *App) computerTaskLine(c *ui.Context, task *store.Task) {
	t := a.T
	cu := a.S.Computing(task.ID)
	if cu == nil {
		return
	}
	name := cu.Device
	if dv := a.S.Device(cu.Device); dv != nil {
		name = a.deviceName(dv)
	}
	line := a.L.T("computeruse.task.0", name)
	if cu.App != "" {
		line = a.L.T("computeruse.task", name, cu.App)
	}
	ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5)
	if a.buttonFor(c, a.L.T("computeruse.stop"), line, btnSecondary, t.ControlSM, t.Chrome) {
		a.send(protocol.ComputerStopReq{T: "computer_stop", TaskID: task.ID})
	}
}
