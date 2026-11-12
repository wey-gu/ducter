package views

import (
	"context"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D148: a device card's header (its name, renamed in place), what it is in
// plain words, its Ducter version with one quiet dot when it's behind, the
// update's steps in words, and 断开 / Disconnect with a confirm. The same
// pieces serve a phone or a window elsewhere. Settings shows the versions
// with updateSection.

type cardState struct {
	anywhereOff bool                  // D228: 关掉 从外面连 is being confirmed
	anywhereNo  string                // D228: why 让 Ducter 帮我设好 didn't start
	cutting     string                // the device whose 断开 is being confirmed
	cutFailed   string                // why the server said no
	more        map[string]bool       // devices whose not-signed-in AI accounts are shown
	answer      *protocol.ServerFrame // the last update_result that said no
	asked       string                // the device an update was asked for
	agent       *protocol.ServerFrame // the last agent_update_result that said no (D156)
	memAsk      string                // "device:harness" whose 装上 / Install is being confirmed (D169)
	mem         *protocol.ServerFrame // the last mem_plugin_result that said no (D169)
	checking    bool                  // 现在检查 / Check now asked, no answer yet
	restarted   string                // this Mac's worker whose 重启它 was tapped (D172)
	restartedAt time.Time
	sheet       sheetState // D161: the character sheet's coins, chips and connections
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
		// "Nothing newer" answers a stale view, not a failure: the devices
		// frame that follows has the version there now.
		if res.OK || res.Reason == "no_update" {
			d.card.agent = nil
		} else {
			fc := *res
			d.card.agent = &fc
		}
	case "anywhere_setup_result":
		d.card.anywhereNo = ""
		if !res.OK && res.Reason != "running" {
			d.card.anywhereNo = res.Reason
			if d.card.anywhereNo == "" {
				d.card.anywhereNo = "failed"
			}
		}
	case "mem_plugin_result":
		d.card.memAsk = ""
		if res.OK {
			d.card.mem = nil
		} else {
			fc := *res
			d.card.mem = &fc
		}
	case "update_result":
		d.card.checking = false
		if res.Update != nil {
			return // a check's answer: the devices frame says the rest
		}
		if res.OK || res.Reason == "no_release" {
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
// (Enter keeps it, Esc puts it back), when it can be renamed. real is the name
// the field edits: the device's own name, which for this Mac differs from the
// "this Mac" the title says (D155: the home renames too).
func (a *App) cardName(c *ui.Context, id, name, real string, renamable bool) {
	t := a.T
	r := &a.devState().rename
	if res := a.S.Renamed; res != nil {
		a.S.Renamed = nil
		if res.OK {
			r.saved, r.savedAt = r.device, a.Now()
			r.device, r.failed = "", ""
		} else if res.Device == r.device {
			r.failed = res.Reason
		}
	}
	size := t.XXL
	if a.L.Lang == "zh" {
		size = 26 // the zh heading face reads larger (D78)
	}
	if r.device != id {
		if !renamable {
			a.heading(c, name, size).SingleLine().TextAlign(ui.Center)
			return
		}
		b := ui.Row(c.Key("name:"+id)).Gap(t.S1).AlignItems(ui.Center).Padding(2, t.S2).Radius(10).Cursor(ui.CursorText).Role(ui.RoleButton).
			Label(a.L.T("device.rename") + " · " + name).Tooltip(a.L.T("card.rename.hint")).Focusable()
		hover := b.Hovered()
		if hover {
			b.Background(t.Sunken)
		}
		// The name settles from 0.98 once it is saved (140 ms).
		if el := a.Now().Sub(r.savedAt); el < 140*time.Millisecond && r.saved == id && !c.Preferences().ReduceMotion {
			k := 0.98 + 0.02*float32(el)/float32(140*time.Millisecond)
			b.Scale(k, k)
			c.After(16 * time.Millisecond)
		}
		b.Children(func() {
			ui.Box(c).Size(14, 14) // the pencil's twin, so the name stays centered
			a.heading(c, name, size).SingleLine().Shrink(1)
			// A quiet pencil, always there so the name reads as editable; full ink on hover.
			pen := ui.Box(c.Key("pencil")).Size(14, 14).AccessHidden(true)
			if !hover {
				pen.Opacity(0.45)
			}
			pen.Draw(func(p *ui.Painter, rr ui.Rect) {
				var m ui.Path
				m.MoveTo(rr.X+3, rr.Y+rr.H-3).LineTo(rr.X+rr.W-3.5, rr.Y+3.5)
				m.Cap(ui.RoundCap)
				p.StrokePath(&m, 2.2, t.InkMuted)
				var tip ui.Path
				tip.MoveTo(rr.X+1.5, rr.Y+rr.H-1.5).LineTo(rr.X+2.4, rr.Y+rr.H-4.6).LineTo(rr.X+4.6, rr.Y+rr.H-2.4).Close()
				p.FillPath(&tip, t.InkMuted)
			})
		})
		if b.Clicked() {
			*r = renameState{device: id, draft: real}
		}
		return
	}
	save := func() {
		next := strings.TrimSpace(r.draft)
		if next == "" || next == real {
			r.device = ""
			return
		}
		r.failed = ""
		a.send(protocol.RenameDeviceReq{T: "rename_device", Device: id, Name: next})
	}
	ui.Column(c).Gap(t.S2).Children(func() {
		in := ui.TextInput(c.Key("input:device-name:"+id), &r.draft).Placeholder(real).Label(a.L.T("device.rename")).
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
		if a.isThisMacDevice(dv) && !a.onThisMac() {
			what = a.L.T("device.local") // D155: this Mac, doing tasks for a Ducter elsewhere
		}
	}
	return a.L.T("device.what.worker", what, who)
}

// behind: an update is available and not under way: said in words by the
// device's name (有更新, D213), and nothing louder.
func behind(dv *protocol.DeviceView) bool {
	u := dv.Update
	return u != nil && u.Available && !u.Running() && u.Phase != "failed"
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

// upToDate never says "latest" without when it was read: 已经是最新的 ·
// 3 小时前查过 / Up to date · checked 3 h ago.
func (a *App) upToDate(u *protocol.DeviceUpdate) string {
	line := a.L.T("devup.current")
	if at := store.ParseTime(u.CheckedAt); !at.IsZero() {
		if a.Now().Sub(at) < 2*time.Minute {
			return line + " · " + a.L.T("devup.checked.now")
		}
		return line + " · " + a.L.T("devup.checked", a.agoLong(u.CheckedAt))
	}
	return line
}

// checkNow is the quiet 现在检查 / Check now after it: the home reads the
// latest release again (device_update check); the devices frame brings the
// answer.
func (a *App) checkNow(c *ui.Context, device string) {
	t := a.T
	d := a.devState()
	if d.card.checking {
		ui.Text(c, a.L.T("devup.checking")).FontSize(t.SM).TextColor(t.InkMuted)
		return
	}
	if a.quietButton(c, "checknow:"+device, a.L.T("devup.checknow"), "", false, 0) {
		d.card.checking = true
		a.send(protocol.DeviceUpdateReq{T: "device_update", Device: device, Check: true})
	}
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
		if !a.appOnThisMac(dv) {
			if u.FromHere && dv.State == protocol.DeviceAwake {
				// D187: that Mac's app updates when asked from here.
				a.note(c, a.L.T("devup.how.app.here", a.deviceNameIn(dv)))
				a.textRow(c, t.ControlSM).Children(func() {
					if a.buttonFor(c, a.L.T("devup.button"), dv.Name, btnSecondary, t.ControlSM, t.Surface) {
						d.card.answer, d.card.asked = nil, dv.ID
						a.send(protocol.DeviceUpdateReq{T: "device_update", Device: dv.ID})
					}
				})
				return
			}
			a.note(c, a.L.T("devup.how.app", a.deviceNameIn(dv))) // another Mac: its own app does it
			return
		}
		if v := a.helperBehind(dv); v != "" {
			// This Mac's app is already current; the worker it runs still has
			// the old helper in memory (D167): one restart, not "open Ducter".
			if a.workRestarting(dv.ID) {
				a.note(c, a.L.T("devup.phase.restarting"))
				return
			}
			a.note(c, a.L.T("devup.how.helper", v, a.workHome()))
			if r, ok := a.MacWorker.(workerRestarter); ok {
				a.textRow(c, t.ControlSM).Children(func() {
					if a.buttonFor(c, a.L.T("devup.restart"), dv.Name, btnSecondary, t.ControlSM, t.Surface) {
						a.devState().card.restarted, a.devState().card.restartedAt = dv.ID, a.Now()
						go func() { _ = r.Restart() }()
					}
				})
			}
			return
		}
		// The Mac's own app updater (D72): restart into a ready copy, or open its card.
		a.textRow(c, t.ControlSM).Children(func() {
			if a.buttonFor(c, a.L.T("devup.button"), dv.Name, btnSecondary, t.ControlSM, t.Surface) {
				a.updateThisMac()
			}
		})
	case "manual":
		a.note(c, a.L.T("devup.how.manual", a.deviceNameIn(dv)))
	default:
		a.note(c, a.L.T("devup.how.source"))
	}
}

// appOnThisMac: this device's Ducter is the one inside this very app: the
// home this window runs, or this Mac doing tasks for a home elsewhere (its
// worker is the app's own helper, D155). Its update is this app's.
func (a *App) appOnThisMac(dv *protocol.DeviceView) bool {
	if dv.Home {
		return a.onThisMac()
	}
	return a.isThisMacDevice(dv)
}

// isThisMacDevice: a device on a home elsewhere is this Mac: its worker's
// own device id (worker.json), which no rename of the device or of the Mac
// changes, else the computer it said it runs on (D187).
func (a *App) isThisMacDevice(dv *protocol.DeviceView) bool {
	if a.MacWorker != nil {
		if on, id := a.workOn(); on && id != "" && id == dv.ID {
			return true
		}
	}
	return a.isThisMac(deviceComputer(dv))
}

// hintThisMac hands what the home knows to this app's own updater (D187):
// when the home says a newer version is out for this Mac, the updater
// checks for it now, and fetches that version even while GitHub's API
// won't say. One answer to "is there a newer version" on every page.
func (a *App) hintThisMac() {
	if a.Updates == nil {
		return
	}
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		if u := dv.Update; u != nil && u.Latest != "" && u.How == "app" && a.appOnThisMac(dv) {
			a.Updates.Hint(context.Background(), u.Latest)
		}
	}
}

// helperBehind is this app's version when the app is current but this
// Mac's worker still says an older one (it runs the old helper from memory
// until it restarts); "" otherwise.
func (a *App) helperBehind(dv *protocol.DeviceView) string {
	if dv.Home || a.Updates == nil || dv.Update == nil {
		return ""
	}
	st := a.Updates.Status()
	appV := st.Current
	if appV == "" || update.Compare(dv.Update.Current, appV) >= 0 {
		return ""
	}
	if st.State == update.Ready || st.State == update.Available || st.State == update.Downloading {
		return "" // the app itself is behind: its update comes first
	}
	return appV
}

// workerRestarter restarts this Mac's worker (its LaunchAgent), when the
// app can (main.go's appWorker).
type workerRestarter interface{ Restart() error }

// workRestarting: 重启它 was tapped for this device in the last minute.
func (a *App) workRestarting(id string) bool {
	d := a.devState()
	return d.card.restarted == id && a.Now().Sub(d.card.restartedAt) < time.Minute
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

// updateSection is Settings' list of every computer's Ducter version
// (D148 (9)): a self-contained card, so the Settings page can place it.
// It shows only when the server says versions. Built from shared pieces
// only (sheetCard, note, valueRow, switchRow; the guard in
// update_guard_test.go): every state of a computer, Check now and its
// 在查… included, lives in that computer's row (D167).
func (a *App) updateSection(c *ui.Context) {
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
		home := homeDevice(shown)
		for _, dv := range shown {
			a.versionRow(c, dv, dv == home)
		}
		if auto := a.S.Settings; auto != nil {
			if v, ch := a.switchRow(c, "autoupdate", a.L.T("settings.versions.night"), a.L.T("settings.versions.night.note"), auto.AutoUpdate); ch {
				a.send(protocol.SettingsSet{T: "settings_set", Patch: protocol.SettingsPatch{AutoUpdate: &v}})
			}
		}
	})
}

// versionRow is one computer in Settings' versions card: its name (the
// quiet dot when it's behind) and what it is; its version and one status at
// the right: the update's step, 有新版本 x, or 已经是最新的 with 现在检查
// (the home's), which reads 在查… in the same place while it asks. 没更新成
// opens its why and the one next step under the row on a tap (D167).
func (a *App) versionRow(c *ui.Context, dv *protocol.DeviceView, home bool) {
	u := dv.Update
	v := dv.Version
	if u != nil {
		v = firstNonEmpty(u.Current, v)
	}
	key := "ver:" + dv.ID
	open := a.open[key]
	failed := u != nil && u.Phase == "failed"
	status := func() {
		if u == nil {
			return
		}
		switch {
		case u.Running():
			c.After(500e6)
			a.sideStatus(c, a.phaseLine(u), sideInk)
		case u.Phase == "done":
			a.sideStatus(c, a.phaseLine(u), sideDone)
		case failed:
			chev := 1
			if open {
				chev = 2
			}
			if a.sideLink(c, key, a.phaseLine(u), a.deviceName(dv), sideFailed, chev) {
				a.open[key] = !open
			}
		case behind(dv):
			a.sideStatus(c, a.L.T("devup.available", u.Latest), sideInk)
		case u.Latest != "" && u.Phase == "":
			d := a.devState()
			if home && d.card.checking {
				a.sideStatus(c, a.L.T("devup.checking"), sideMuted)
				return
			}
			a.sideStatus(c, a.upToDate(u), sideMuted)
			if home && a.sideLink(c, "check:"+dv.ID, a.L.T("devup.checknow"), "", sideMuted, 0) {
				d.card.checking = true
				a.send(protocol.DeviceUpdateReq{T: "device_update", Device: dv.ID, Check: true})
			}
		}
	}
	// This Mac's row, home or worker, is itself the way to update it (D187).
	act := behind(dv) && (u.How == "self" && dv.State == protocol.DeviceAwake || u.How == "app" && a.appOnThisMac(dv))
	retry := failed && open && u.Available && u.How == "self" && dv.State == protocol.DeviceAwake
	var below func()
	if act || failed && open {
		below = func() {
			if failed && open {
				a.reasonLine(c, a.updateReason(u.Reason))
				if u.Detail != "" {
					a.note(c, u.Detail)
				}
			}
			if act || retry {
				a.updateAction(c, dv)
			}
		}
	}
	// Behind: the status says so in words (devup.available); no dot (D213).
	a.valueRow(c, key, a.deviceName(dv), a.kindLine(dv), nil, v, status, below)
}

// homeDevice is the home among the devices shown, or nil.
func homeDevice(ds []*protocol.DeviceView) *protocol.DeviceView {
	for _, d := range ds {
		if d.Home {
			return d
		}
	}
	return nil
}

// notesIf: what is new in this window's language, only while it is still
// news (not again after a failure). Never the other language's (D172).
func (a *App) notesIf(ok bool, u *protocol.DeviceUpdate) []string {
	if !ok || u == nil {
		return nil
	}
	return u.NotesBy[string(a.L.Lang)]
}
