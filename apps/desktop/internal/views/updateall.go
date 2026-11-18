package views

import (
	"context"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D224: 全部更新 / Update all, first on Settings › 更新和关于. One card:
// what is behind and the one button, in the order the home will take it
// (its own Ducter, the other computers, then each computer's AI agents);
// then the same list ticking itself off, every step's state at its row's
// right; then how it went, 再试一次 when something didn't, and the switch
// that keeps everything up to date. Built from the shared pieces only
// (update_guard_test.go). The home owns the plan (core/src/update-all.ts);
// this app adds only its own step, last (ownAppStep).

// updAllShown is how many steps the offer lists before 还有 n 项.
const updAllShown = 4

func (a *App) updateAllSection(c *ui.Context) {
	ua := a.S.UpdateAll
	own := a.ownAppStep()
	if ua == nil {
		return
	}
	plan := ua.Plan
	if plan == nil && len(ua.Offer) == 0 {
		return
	}
	t := a.T
	a.restartForPlan()
	switch {
	case plan == nil:
		n := len(ua.Offer)
		if own.show {
			n++
		}
		title := a.L.T("upall.title", n)
		if n == 1 {
			title = a.L.T("upall.title.one")
		}
		a.sheetCard(c, "updateall", title, func() {
			shown := updAllOfferShown(ua.Offer, updAllShown)
			for _, i := range shown {
				it := &ua.Offer[i]
				a.valueRow(c, "ua:"+it.Key, a.updAllName(it), "", nil, a.updAllVersions(it), nil, nil)
			}
			if len(ua.Offer) > len(shown) {
				a.note(c, a.L.T("upall.more", len(ua.Offer)-len(shown)))
			}
			if own.show {
				a.ownAppRow(c, own)
			}
			for _, nn := range ua.NotNow {
				a.note(c, a.updAllNotNow(nn))
			}
			a.note(c, a.updAllOrder())
			label := a.L.T("upall.button")
			if n == 1 {
				label = a.L.T("upall.button.one")
			}
			a.textRow(c, t.ControlMD).Children(func() {
				if a.button(c, label, btnPrimary, t.ControlMD, t.Surface) {
					a.startUpdateAll()
				}
			})
		})
	case plan.FinishedAt == "":
		c.After(500 * time.Millisecond)
		title := a.L.T("upall.running")
		if len(plan.Items) == 1 {
			title = a.L.T("upall.running.one")
		}
		a.sheetCard(c, "updateall", title, func() {
			for i := range plan.Items {
				a.updAllRow(c, &plan.Items[i])
			}
			if own.show {
				a.ownAppRow(c, own)
			}
			a.textRow(c, t.ControlSM).Children(func() {
				if a.button(c, a.L.T("upall.stop"), btnText, t.ControlSM, t.Surface) {
					a.send(protocol.UpdateAllReq{T: "update_all", Stop: true})
				}
			})
		})
	default:
		done, failed := 0, 0
		for _, it := range plan.Items {
			switch it.State {
			case "done":
				done++
			case "failed":
				failed++
			}
		}
		title := a.L.T("upall.done.all")
		switch {
		case plan.Stopped:
			title = a.L.T("upall.done.stopped", done)
		case failed > 0:
			title = a.L.T("upall.done.some", done, failed)
		}
		a.sheetCard(c, "updateall", title, func() {
			for i := range plan.Items {
				a.updAllRow(c, &plan.Items[i])
			}
			if own.show {
				a.ownAppRow(c, own)
			}
			if st := a.S.Settings; st != nil && !st.AutoUpdate {
				if v, ch := a.switchRow(c, "upall-auto", a.L.T("upall.auto"), a.L.T("upall.auto.note"), false); ch {
					a.send(protocol.SettingsSet{T: "settings_set", Patch: protocol.SettingsPatch{AutoUpdate: &v}})
				}
			}
			// D314: the card's one decision is a small secondary clay button at
			// the right edge, as 检查更新 is; with something to retry, 再试一次 is
			// that button and 完成 steps back to a quiet text button before it.
			var quiet func()
			if failed > 0 {
				quiet = func() {
					if a.button(c, a.L.T("upall.dismiss"), btnText, t.ControlSM, t.Surface) {
						a.send(protocol.UpdateAllReq{T: "update_all", Dismiss: true})
					}
				}
			}
			a.cardEnd(c, t.ControlSM, quiet, func() {
				if failed > 0 {
					if a.button(c, a.L.T("upall.retry"), btnSecondary, t.ControlSM, t.Surface) {
						a.startUpdateAll()
					}
				} else if a.button(c, a.L.T("upall.dismiss"), btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.UpdateAllReq{T: "update_all", Dismiss: true})
				}
			})
		})
	}
}

// updAllRow is one step of a plan: its name, from → to, and its state at
// the right; a failure opens its why under the row on a tap.
func (a *App) updAllRow(c *ui.Context, it *protocol.UpdateAllItem) {
	key := "ua:" + it.Key
	open := a.open[key]
	status := func() {
		switch it.State {
		case "queued":
			a.sideStatus(c, a.L.T("upall.state.queued"), sideMuted)
		case "waiting":
			if it.Wait == "ducter" {
				a.sideStatus(c, a.L.T("upall.state.ducter", it.DeviceName), sideInk)
			} else if it.Busy <= 1 {
				a.sideStatus(c, a.L.T("upall.state.waiting.one"), sideInk)
			} else {
				a.sideStatus(c, a.L.T("upall.state.waiting", it.Busy), sideInk)
			}
		case "running":
			a.sideStatus(c, a.updAllPhase(it), sideInk)
		case "done":
			a.sideStatus(c, a.updAllDone(it), sideDone)
		case "failed":
			line := a.L.T("upall.state.failed")
			if it.RolledBack {
				line = a.L.T("upall.state.rolledback", it.From)
			}
			chev := 1
			if open {
				chev = 2
			}
			if a.sideLink(c, key, line, a.updAllName(it), sideFailed, chev) {
				a.open[key] = !open
			}
		case "skipped":
			switch it.Reason {
			case "home":
				a.sideStatus(c, a.L.T("upall.state.home", it.Detail), sideMuted)
			case "offline":
				a.sideStatus(c, a.L.T("upall.state.offline"), sideMuted)
			default:
				a.sideStatus(c, a.L.T("upall.state.stopped"), sideMuted)
			}
		}
	}
	var below func()
	// D362: a step past its usual time there: one quiet line, 再等等 and 停止.
	if it.Kind == "agent" && it.State == "running" && it.Wait != "reconnect" && a.agentSlow(key, &it.AgentProgress) {
		below = func() {
			a.note(c, a.L.T("upall.slow"))
			t := a.T
			a.cardEnd(c, t.ControlSM, func() {
				if a.buttonFor(c, a.L.T("upall.slow.wait"), a.updAllName(it), btnText, t.ControlSM, t.Surface) {
					a.agentKeepWaiting(key, &it.AgentProgress)
				}
			}, func() {
				if a.buttonFor(c, a.L.T("upall.slow.stop"), a.updAllName(it), btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.UpdateAllReq{T: "update_all", StopItem: it.Key})
				}
			})
		}
	}
	if it.State == "failed" && open {
		below = func() {
			a.reasonLine(c, a.updAllWhy(it))
			if it.Detail != "" {
				a.note(c, it.Detail)
			}
		}
	}
	a.valueRow(c, key, a.updAllName(it), "", nil, a.updAllVersions(it), status, below)
}

// updAllName: Ducter on hel · Claude Code on MacBook.
func (a *App) updAllName(it *protocol.UpdateAllItem) string {
	if it.Kind == "mem" {
		return a.L.T("upall.item.mem", it.DeviceName)
	}
	if it.Kind == "agent" {
		return a.L.T("upall.item.agent", harnessName(it.Harness), it.DeviceName)
	}
	return a.L.T("upall.item.ducter", it.DeviceName)
}

// updAllVersions is From → To; D329: Mem may not name its newer version,
// then only the version it is on.
func (a *App) updAllVersions(it *protocol.UpdateAllItem) string {
	if it.To == "" {
		return it.From
	}
	return a.L.T("upall.versions", it.From, it.To)
}

// updAllDone is a done step's word; D329: Mem's unnamed newer version, bare.
func (a *App) updAllDone(it *protocol.UpdateAllItem) string {
	if it.To == "" {
		return a.L.T("upall.state.done.bare")
	}
	return a.L.T("upall.state.done", it.To)
}

// updAllPhase is a running step in the single update's own words (D227:
// or what it waits on: its computer to reconnect; started again after a cut).
func (a *App) updAllPhase(it *protocol.UpdateAllItem) string {
	if it.Wait == "reconnect" {
		return a.L.T("upall.state.reconnect", it.DeviceName)
	}
	if it.Kind == "agent" && it.Retried && (it.Phase == "" || it.Phase == "updating") {
		return a.L.T("upall.state.retry", it.To)
	}
	if it.Kind == "agent" || it.Kind == "mem" {
		ph := it.Phase
		if ph == "" {
			ph = "updating"
		}
		if it.To == "" && ph == "updating" {
			return a.L.T("upall.state.updating.bare")
		}
		// D362: what it is doing now, in words that move.
		if it.Kind == "agent" && ph == "updating" {
			if s := a.agentUpdatingWords(&it.AgentProgress, it.To); s != "" {
				return s
			}
		}
		return a.L.T("agentv.phase."+ph, it.To)
	}
	u := &protocol.DeviceUpdate{Phase: it.Phase, Progress: it.Progress, From: it.From, To: it.To}
	if u.Phase == "" {
		u.Phase = "downloading"
	}
	return a.phaseLine(u)
}

// updAllWhy is why a step didn't update, in the words its own card uses.
func (a *App) updAllWhy(it *protocol.UpdateAllItem) string {
	if it.Reason == "no_answer" {
		return a.L.T("upall.why.no_answer")
	}
	if it.Reason == "interrupted" {
		return a.L.T("upall.why.interrupted", it.DeviceName)
	}
	if it.Kind == "agent" || it.Kind == "mem" {
		return a.agentWhy(it.Reason)
	}
	return a.updateReason(it.Reason)
}

func (a *App) updAllNotNow(nn protocol.UpdateAllNotNow) string {
	switch nn.Why {
	case "offline":
		return a.L.T("upall.notnow.offline", nn.DeviceName)
	case "app_old":
		return a.L.T("upall.notnow.app_old", nn.DeviceName)
	}
	return a.L.T("upall.notnow.other", nn.DeviceName)
}

// updAllOrder says the order once: the home first, then the rest; with a
// single computer, only that nothing running is cut off.
func (a *App) updAllOrder() string {
	computers := 0
	var home string
	for i := range a.S.Devices {
		d := &a.S.Devices[i]
		if d.Kind == "phone" {
			continue
		}
		computers++
		if d.Home {
			home = d.Name
		}
	}
	// D329: the note names Nowledge Mem when it is a step.
	mem := ""
	if ua := a.S.UpdateAll; ua != nil {
		for i := range ua.Offer {
			if ua.Offer[i].Kind == "mem" {
				mem = ".mem"
			}
		}
	}
	if computers <= 1 || home == "" {
		return a.L.T("upall.order.solo" + mem)
	}
	return a.L.T("upall.order"+mem, home)
}

// updAllOfferShown is the offer's rows before 还有 n 项: the first few, and
// D329: the home's Nowledge Mem always (it is last in the plan; a step under
// "n more" is one the person didn't see).
func updAllOfferShown(offer []protocol.UpdateAllItem, max int) []int {
	if len(offer) <= max {
		out := make([]int, len(offer))
		for i := range offer {
			out[i] = i
		}
		return out
	}
	var mem, rest []int
	for i := range offer {
		if offer[i].Kind == "mem" {
			mem = append(mem, i)
		} else {
			rest = append(rest, i)
		}
	}
	keep := max - len(mem)
	if keep < 0 {
		keep = 0
	}
	if keep > len(rest) {
		keep = len(rest)
	}
	return append(rest[:keep:keep], mem...)
}

// ---------- this app's own step (D224 (4)) ----------

type ownStep struct {
	show, ready bool
	from, to    string
}

// ownAppStep is this app's own update as Update all's last step: only
// when the app talks to a home elsewhere and is not this Mac's worker (that
// one is a step of the plan already), and its updater has, or the home
// knows of, a newer version.
func (a *App) ownAppStep() ownStep {
	if a.Updates == nil || a.onThisMac() {
		return ownStep{}
	}
	if a.MacWorker != nil {
		if on, _ := a.workOn(); on {
			return ownStep{}
		}
	}
	st := a.Updates.Status()
	switch st.State {
	case update.Ready:
		return ownStep{show: true, ready: true, from: st.Current, to: st.Version}
	case update.Downloading:
		return ownStep{show: true, from: st.Current, to: st.Version}
	}
	if v := a.homeLatest(); v != "" && st.Current != "" && update.Compare(v, st.Current) > 0 {
		return ownStep{show: true, from: st.Current, to: v}
	}
	return ownStep{}
}

// homeLatest is the newest release the home knows of.
func (a *App) homeLatest() string {
	for i := range a.S.Devices {
		if d := &a.S.Devices[i]; d.Home && d.Update != nil {
			return d.Update.Latest
		}
	}
	return ""
}

func (a *App) ownAppRow(c *ui.Context, own ownStep) {
	word := a.L.T("upall.app.last")
	if own.ready {
		word = a.L.T("upall.app.ready")
	}
	a.valueRow(c, "ua:app", a.L.T("upall.app.mac"), "", nil, a.L.T("upall.versions", own.from, own.to), func() {
		a.sideStatus(c, word, sideMuted)
	}, nil)
}

// startUpdateAll is the one tap: the home's plan, and this app starts
// fetching its own new version at once, so it is ready to restart last.
func (a *App) startUpdateAll() {
	a.updAllAsked = true
	a.send(protocol.UpdateAllReq{T: "update_all"})
	own := a.ownAppStep()
	if !own.show || own.ready || a.Updates == nil {
		return
	}
	u, v := a.Updates, own.to
	go func() {
		if !u.Hint(context.Background(), v) {
			u.CheckNow(context.Background())
		}
	}()
}

// restartForPlan restarts this app into its ready copy once, for the plan
// this window started (never one from another client or the night, which
// would close a window someone may be typing in): when nothing in the plan is mid-way
// (every step over, or only waiting for tasks to pause; the home keeps
// running the plan while this app restarts).
func (a *App) restartForPlan() {
	ua := a.S.UpdateAll
	if ua == nil || ua.Plan == nil || a.RestartToUpdate == nil {
		return
	}
	p := ua.Plan
	if p.ID != a.updAllMine || a.updAllRestarted == p.ID || !a.ownAppStep().ready {
		return
	}
	for _, it := range p.Items {
		if it.State == "running" || (it.State == "queued" && it.Kind == "ducter") {
			return
		}
		// D227: nothing still to do on this Mac (its restart would take
		// that step's Ducter down with it).
		if !it.Final() && a.planStepHere(&it) {
			return
		}
	}
	if a.AgentUpdating != nil && len(a.AgentUpdating()) > 0 {
		return
	}
	a.updAllRestarted = p.ID
	a.RestartToUpdate()
}

// planStepHere: the step is for this Mac (its device's computer is this
// one, or it is this app's own worker).
func (a *App) planStepHere(it *protocol.UpdateAllItem) bool {
	if a.MacWorker != nil {
		if on, dev := a.workOn(); on && dev != "" && dev == it.Device {
			return true
		}
	}
	for i := range a.S.Devices {
		if d := &a.S.Devices[i]; d.ID == it.Device {
			return a.isThisMac(d.Computer) || a.isThisMac(d.Name)
		}
	}
	return false
}
