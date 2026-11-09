package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D148: a device card's header (its name, renamed in place), what it is in
// plain words, its Ducter version with one quiet dot when it's behind, the
// update's steps in words, and 断开 / Disconnect with a confirm. The same
// pieces serve a phone or a window elsewhere. Settings shows the versions
// with updateSection.

type cardState struct {
	cutting   string                // the device whose 断开 is being confirmed
	cutFailed string                // why the server said no
	more      map[string]bool       // devices whose not-signed-in AI accounts are shown
	answer    *protocol.ServerFrame // the last update_result that said no
	asked     string                // the device an update was asked for
	agent     *protocol.ServerFrame // the last agent_update_result that said no (D156)
}

// drainDeviceResults reads the server's answer to the last disconnect or
// update.
func (a *App) drainDeviceResults() {
	d := a.devState()
	res := a.S.DeviceResult
	if res == nil {
		return
	}
	a.S.DeviceResult = nil
	switch res.T {
	case "disconnect_result":
		if res.OK {
			d.card.cutting, d.card.cutFailed = "", ""
			if d.sel == res.Device {
				d.sel = ""
			}
			if d.selClient == res.Device {
				d.selClient = ""
			}
		} else {
			d.card.cutFailed = res.Reason
		}
	case "agent_update_result":
		if res.OK {
			d.card.agent = nil
		} else {
			fc := *res
			d.card.agent = &fc
		}
	case "update_result":
		if res.Update != nil {
			return // a check's answer: the devices frame says the rest
		}
		if res.OK {
			d.card.answer = nil
		} else {
			fc := *res
			d.card.answer = &fc
		}
	}
}

// editingDevice reports whether a device name is being edited; Esc then
// cancels the edit instead of leaving the page.
func (a *App) escDevice() bool {
	if a.Route != RouteDevices {
		return false
	}
	d := a.devState()
	if d.rename.device != "" {
		d.rename.device = ""
		return true
	}
	if d.card.cutting != "" {
		d.card.cutting = ""
		return true
	}
	return false
}

// cardName is the card's title: the name, which a click turns into a field
// (Enter keeps it, Esc puts it back), when it can be renamed.
func (a *App) cardName(c *ui.Context, id, name string, renamable bool) {
	t := a.T
	r := &a.devState().rename
	if res := a.S.Renamed; res != nil {
		a.S.Renamed = nil
		if res.OK {
			r.device, r.failed = "", ""
		} else if res.Device == r.device {
			r.failed = res.Reason
		}
	}
	if r.device != id {
		if !renamable {
			a.heading(c, name, t.XL).SingleLine()
			return
		}
		b := ui.Row(c.Key("name:" + id)).Gap(t.S2).AlignItems(ui.Center).Cursor(ui.CursorText).Role(ui.RoleButton).
			Label(a.L.T("device.rename") + " · " + name).Focusable()
		hover := b.Hovered()
		b.Children(func() {
			a.heading(c, name, t.XL).SingleLine().Shrink(1)
			// A quiet pencil-free hint: the words "改名字" appear on hover only.
			if hover {
				ui.Text(c, a.L.T("device.rename")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine()
			}
		})
		if b.Clicked() {
			*r = renameState{device: id, draft: name}
		}
		return
	}
	save := func() {
		next := strings.TrimSpace(r.draft)
		if next == "" || next == name {
			r.device = ""
			return
		}
		r.failed = ""
		a.send(protocol.RenameDeviceReq{T: "rename_device", Device: id, Name: next})
	}
	ui.Column(c).Gap(t.S2).Children(func() {
		in := ui.TextInput(c.Key("input:device-name:"+id), &r.draft).Placeholder(name).Label(a.L.T("device.rename")).
			Font(t.Display).FontSize(t.LG).FontWeight(800).Padding(t.S1, t.S2).Radius(t.RadiusSM).Background(t.Bg).Border(1, t.Line).
			MinWidth(120).OnSubmit(save)
		if !r.focused {
			in.Focus()
			r.focused = true
		}
		a.textRow(c, t.ControlSM).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			if a.button(c, a.L.T("device.rename.ok"), btnText, t.ControlSM, t.Surface) {
				save()
			}
			if a.button(c, a.L.T("device.rename.cancel"), btnText, t.ControlSM, t.Surface) {
				r.device = ""
			}
			ui.Text(c, a.L.T("device.rename.keys")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		})
		switch r.failed {
		case "":
		case "name_taken":
			a.reasonLine(c, a.L.T("device.rename.name_taken", strings.TrimSpace(r.draft)))
		default:
			a.reasonLine(c, a.L.T("device.rename."+r.failed))
		}
	})
}

// kindLine says what a device is and what it's for, in plain words:
// 云上的电脑 · 小鸭住这儿, 这台 Mac · 小鸭住这儿, 另一台电脑 · 替小鸭做事.
func (a *App) kindLine(dv *protocol.DeviceView) string {
	who := a.S.PersonaName
	what := a.L.T("device.what.computer")
	switch {
	case dv.Kind == "server":
		what = a.L.T("device.what.cloud")
	case dv.Home && a.onThisMac():
		what = a.L.T("device.local")
	case strings.HasPrefix(dv.Platform, "darwin") || dv.Kind == "laptop" || dv.Kind == "mini":
		what = a.L.T("device.what.mac")
	}
	if dv.Home {
		return a.L.T("device.what.home", what, who)
	}
	if !dv.Home && dv.Kind != "server" {
		what = a.L.T("device.other")
		if a.isThisMac(deviceComputer(dv)) && !a.onThisMac() {
			what = a.L.T("device.local") // D155: this Mac, doing tasks for a Ducter elsewhere
		}
	}
	return a.L.T("device.what.worker", what, who)
}

// behind: one quiet dot by a device's name, and nothing louder (D148 (9)).
func behind(dv *protocol.DeviceView) bool {
	u := dv.Update
	return u != nil && u.Available && !u.Running() && u.Phase != "failed"
}

// updateDot is the one quiet clay dot of a device that's behind.
func (a *App) updateDot(c *ui.Context) {
	t := a.T
	ui.Box(c).Size(8, 8).Radius(4).Background(t.Accent).Shrink(0).Label(a.L.T("devup.dot")).Role(ui.RoleImage)
}

// phaseLine is an update's step in words.
func (a *App) phaseLine(u *protocol.DeviceUpdate) string {
	switch u.Phase {
	case "downloading":
		if u.Progress > 0.01 {
			return a.L.T("devup.phase.downloading.pct", u.To, int(u.Progress*100+0.5))
		}
		return a.L.T("devup.phase.downloading", u.To)
	case "verifying":
		return a.L.T("devup.phase.verifying", u.To)
	case "waiting":
		return a.L.T("devup.phase.waiting")
	case "restarting":
		return a.L.T("devup.phase.restarting")
	case "done":
		return a.L.T("devup.phase.done", firstNonEmpty(u.To, u.Current))
	case "failed":
		if u.RolledBack {
			return a.L.T("devup.phase.rolledback", u.From)
		}
		return a.L.T("devup.phase.failed")
	}
	return ""
}

// updateReason is why an update didn't happen, in plain words.
func (a *App) updateReason(reason string) string {
	key := "devup.why." + reason
	if s := a.L.T(key); s != key {
		return s
	}
	return a.L.T("devup.why.failed")
}

// versionBlock is the card's Ducter line: its version; when it's behind,
// the dot, 有新版本 x, what's new and one 更新 / Update; while it updates,
// the step in words; after, 回来了 or why not.
func (a *App) versionBlock(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	u := dv.Update
	if u == nil && dv.Version == "" {
		return
	}
	d := a.devState()
	current := dv.Version
	if u != nil {
		current = firstNonEmpty(u.Current, current)
	}
	ui.Column(c.Key("version:"+dv.ID)).Gap(t.S1).Margin(t.S2, 0, 0, 0).Children(func() {
		ui.Text(c, a.L.T("devices.ducter")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
			ui.Text(c, a.L.T("devup.version", current)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Selectable()
			switch {
			case u == nil:
			case u.Running():
				c.After(500e6)
			case behind(dv):
				a.updateDot(c)
				ui.Text(c, a.L.T("devup.available", u.Latest)).FontSize(t.SM).FontWeight(800).TextColor(t.Ink)
			case u.Latest != "" && u.Phase == "":
				ui.Text(c, a.L.T("devup.current")).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		if u == nil {
			return
		}
		if line := a.phaseLine(u); line != "" {
			ink := t.InkSoft
			switch u.Phase {
			case "done":
				ink = t.Done.Ink
			case "failed":
				ink = t.Failed.Ink
			}
			ui.Text(c, line).FontSize(t.SM).FontWeight(700).TextColor(ink).LineHeight(1.5)
			if u.Phase == "failed" && u.Reason != "" {
				a.note(c, a.updateReason(u.Reason))
			}
			if u.Phase == "downloading" && u.Progress > 0 {
				a.progressBar(c, u.Progress)
			}
		}
		if behind(dv) || (u.Phase == "failed" && u.Available) {
			for _, n := range notesIf(u.Phase != "failed", u.Notes) {
				ui.Text(c, n).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkMuted).MaxLines(2)
			}
			a.updateAction(c, dv)
		}
		if ans := d.card.answer; ans != nil && ans.Device == dv.ID {
			a.reasonLine(c, a.updateReason(ans.Reason))
		}
	})
}

// progressBar is a thin clay bar, how much is downloaded.
func (a *App) progressBar(c *ui.Context, f float64) {
	t := a.T
	ui.Row(c).Height(4).Radius(2).Background(t.Line).MaxWidth(220).Children(func() {
		ui.Box(c).Height(4).Radius(2).Background(t.Accent).Grow(float32(f)).Basis(0)
		ui.Box(c).Height(4).Grow(float32(1 - f)).Basis(0)
	})
}

// updateAction is the one button, or the one line saying where the update
// happens instead.
func (a *App) updateAction(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	u := dv.Update
	d := a.devState()
	switch u.How {
	case "self":
		if dv.State != protocol.DeviceAwake {
			a.note(c, a.L.T("devup.how.away", a.deviceNameIn(dv)))
			return
		}
		label := a.L.T("devup.button")
		if u.Phase == "failed" {
			label = a.L.T("devup.retry")
		}
		a.textRow(c, t.ControlSM).Children(func() {
			if a.buttonFor(c, label, dv.Name, btnSecondary, t.ControlSM, t.Surface) {
				d.card.answer, d.card.asked = nil, dv.ID
				a.send(protocol.DeviceUpdateReq{T: "device_update", Device: dv.ID})
			}
		})
	case "app":
		if dv.Home && a.onThisMac() {
			// The Mac's own app updater (D72): restart into a ready copy, or open its card.
			a.textRow(c, t.ControlSM).Children(func() {
				if a.buttonFor(c, a.L.T("devup.button"), dv.Name, btnSecondary, t.ControlSM, t.Surface) {
					a.updateThisMac()
				}
			})
			return
		}
		a.note(c, a.L.T("devup.how.app", a.deviceNameIn(dv)))
	case "manual":
		a.note(c, a.L.T("devup.how.manual", a.deviceNameIn(dv)))
	default:
		a.note(c, a.L.T("devup.how.source"))
	}
}

// updateThisMac is the seam into the app's own updater (D72, internal/update):
// a copy that's ready restarts into it; otherwise Settings' update card
// opens and checks.
func (a *App) updateThisMac() {
	if a.Updates != nil && a.Updates.Status().State == update.Ready && a.RestartToUpdate != nil {
		a.RestartToUpdate()
		return
	}
	a.OpenUpdate()
}

// disconnectRow is the card's last row: 断开 / Disconnect, then a confirm
// in place that says what it means (means is its i18n key).
func (a *App) disconnectRow(c *ui.Context, id, name, means string) {
	t := a.T
	d := a.devState()
	if d.card.cutting != id {
		// The quiet end of the card: a hairline, then 断开 as a text button.
		ui.Box(c.Key("cutline:"+id)).Height(1).Background(t.Line).Margin(t.S3, 0, t.S1, 0)
		a.textRow(c, t.ControlSM).Children(func() {
			if a.buttonFor(c, a.L.T("device.disconnect"), name, btnText, t.ControlSM, t.Surface) {
				d.card.cutting, d.card.cutFailed = id, ""
			}
		})
		return
	}
	a.disconnectConfirm(c, id, name, means)
}

// disconnectConfirm asks in place: what disconnecting means, 断开 or 算了.
func (a *App) disconnectConfirm(c *ui.Context, id, name, means string) {
	t := a.T
	d := a.devState()
	ui.Column(c.Key("cut:"+id)).Gap(t.S2).Margin(t.S2, 0, 0, 0).Padding(t.S3).Radius(t.RadiusMD).Background(t.Bg).Children(func() {
		ui.Text(c, a.L.T("device.disconnect.ask", name)).FontSize(t.SM).FontWeight(800).LineHeight(1.4)
		a.note(c, a.L.T(means))
		ui.Row(c).Gap(t.S2).Children(func() {
			if a.buttonFor(c, a.L.T("device.disconnect.ok"), name, btnSecondary, t.ControlSM, t.Bg) {
				a.send(protocol.DisconnectDeviceReq{T: "disconnect_device", Device: id})
			}
			if a.button(c, a.L.T("device.disconnect.cancel"), btnText, t.ControlSM, t.Bg) {
				d.card.cutting = ""
			}
		})
		if d.card.cutFailed != "" {
			a.reasonLine(c, a.L.T("device.rename."+d.card.cutFailed))
		}
	})
}

// clientWhat names a phone or a window elsewhere from its platform, for
// short places (the isles): iPhone · Safari, a Mac app window, a browser.
func (a *App) clientWhat(cl *protocol.ReachClient) string {
	p := strings.ToLower(cl.Platform)
	switch {
	case strings.Contains(p, "ios") || strings.Contains(p, "iphone"):
		if strings.Contains(p, "safari") || strings.Contains(p, "web") {
			return "iPhone · Safari"
		}
		return a.L.T("device.client.iphone")
	case strings.Contains(p, "android"):
		return a.L.T("device.client.android")
	case strings.Contains(p, "darwin") || strings.Contains(p, "mac"):
		return a.L.T("device.client.mac")
	case p != "":
		return a.L.T("device.client.browser")
	}
	return a.L.T("device.client.other")
}

// clientCard is a phone's (or a window's, or a lone command line's) card in
// the D148 language (D155): its name, renamed in place; what it is in plain
// words; now or when it was last here; what it does for you; on a Mac, the
// quiet lines of what else is connected from it, and on this Mac, Let this
// Mac do tasks; 断开 at the bottom.
func (a *App) clientCard(c *ui.Context, cl *protocol.ReachClient) {
	t := a.T
	name := a.clientName(cl)
	computer := clientComputer(cl)
	ui.Column(c).Gap(t.S1).Children(func() {
		a.cardName(c, cl.ID, name, true)
		ui.Text(c, a.clientKind(cl)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).LineHeight(1.5)
	})
	state, ink := a.clientState(cl)
	if isCLI(cl) {
		// A command line alone stands for its computer: its line says so, with its own menu.
		a.foldedLines(c, "cl:"+cl.ID, computer, cl)
	} else {
		ui.Text(c, state).FontSize(t.SM).TextColor(ink).LineHeight(1.5)
		a.foldedLines(c, "cl:"+cl.ID, computer, nil)
	}
	ui.Column(c).Gap(t.S1).Margin(t.S2, 0, 0, 0).Children(func() {
		ui.Text(c, a.L.T("device.does")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
		ui.Text(c, a.clientDoes(cl)).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5)
	})
	if computer != "" && a.isThisMac(computer) && a.canWork() {
		a.workBlock(c, "card")
	}
	if isCLI(cl) {
		a.disconnectRow(c, cl.ID, a.L.T("device.cli.name", computer), "device.disconnect.means.cli")
		return
	}
	a.disconnectRow(c, cl.ID, name, "device.disconnect.means.client")
}

// updateSection is Settings' list of every computer's Ducter version
// (D148 (9)): a self-contained card, so the Settings page can place it.
// It shows only when the server says versions.
func (a *App) updateSection(c *ui.Context) {
	t := a.T
	var shown []*protocol.DeviceView
	for i := range a.S.Devices {
		if a.S.Devices[i].Update != nil || a.S.Devices[i].Version != "" {
			shown = append(shown, &a.S.Devices[i])
		}
	}
	if len(shown) == 0 {
		return
	}
	a.sheetCard(c, "versions", a.L.T("settings.versions.title"), func() {
		a.note(c, a.L.T("settings.versions.note", a.S.PersonaName))
		for _, dv := range shown {
			ui.Row(c.Key("ver:" + dv.ID)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
				ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
					ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
						ui.Text(c, a.deviceName(dv)).FontSize(t.MD).FontWeight(800).SingleLine()
						if behind(dv) {
							a.updateDot(c)
						}
					})
					ui.Text(c, a.kindLine(dv)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
				ui.Column(c).Gap(2).AlignItems(ui.End).Children(func() {
					v := dv.Version
					if dv.Update != nil {
						v = firstNonEmpty(dv.Update.Current, v)
					}
					ui.Text(c, v).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
					if u := dv.Update; u != nil {
						switch {
						case u.Phase != "" && (u.Running() || u.Phase == "done" || u.Phase == "failed"):
							ui.Text(c, a.phaseLine(u)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).SingleLine()
						case behind(dv):
							ui.Text(c, a.L.T("devup.available", u.Latest)).FontSize(t.XS).FontWeight(700).TextColor(t.Ink).SingleLine()
						}
					}
				})
			})
			if behind(dv) && dv.Update.How == "self" && dv.State == protocol.DeviceAwake || behind(dv) && dv.Home && dv.Update.How == "app" && a.onThisMac() {
				a.updateAction(c, dv)
			}
		}
		if auto := a.S.Settings; auto != nil {
			if v, ch := a.switchRow(c, "autoupdate", a.L.T("settings.versions.night"), a.L.T("settings.versions.night.note"), auto.AutoUpdate); ch {
				a.send(protocol.SettingsSet{T: "settings_set", Patch: protocol.SettingsPatch{AutoUpdate: &v}})
			}
		}
	})
}

// notesIf: what is new, only while it is still news (not again after a failure).
func notesIf(ok bool, notes []string) []string {
	if !ok {
		return nil
	}
	return notes
}
