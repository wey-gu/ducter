package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D169: Nowledge Mem in the user's own AI agents, in an agent's coin
// detail (D161). Its line goes in the coinLines slot: 已装 with its version
// (never "working": Mem's check doesn't prove the agent loads it), 没装,
// 有新版, 要看一下, 正在装. Its action goes in the coinActions slot: 装上 /
// 更新 / 理一下 asks in place first (what changes and where), then one task
// on that computer follows Mem's own setup guide. Shared controls only:
// buttonFor, the note line, reasonLine.

func init() {
	coinLines = append(coinLines, func(a *App, dv *protocol.DeviceView, h protocol.DeviceHarness) string {
		if h.Mem == nil || !h.Installed {
			return ""
		}
		line, _, _ := a.memPluginWords(h.Mem, h.Harness)
		return line
	})
	coinActions = append(coinActions, (*App).memPluginAction)
}

// memPluginWords is the line, its action's words and, while it is under
// way, its busy button's words for one agent ("" when none).
func (a *App) memPluginWords(m *protocol.MemPluginView, harness string) (line, action, busy string) {
	if m == nil {
		return "", "", ""
	}
	// D466: an open task says what it is doing: updating (D552: to which
	// version), keeping one, else installing. D552: from the tap on (Busy),
	// and its button stays where it was, saying so (更新中…), never gone.
	if m.TaskID != "" || m.Busy {
		switch {
		case m.Handed && m.State == "update":
			// D597: the direct update didn't take and a task finishes it.
			return a.L.T("memp.handed"), "", a.L.T("memp.btn.updating")
		case m.State == "update":
			if m.Available != "" {
				return a.L.T("memp.setting.update.to", m.Available), "", a.L.T("memp.btn.updating")
			}
			return a.L.T("memp.setting.update"), "", a.L.T("memp.btn.updating")
		case m.State == "review" && m.Why == "multiple":
			return a.L.T("memp.setting.tidy"), "", a.L.T("memp.btn.tidying")
		case m.State == "review":
			return a.L.T("memp.setting"), "", a.L.T("memp.btn.reviewing")
		}
		// D375: Mem's own command putting it in now, where Mem has one for this agent.
		if m.TaskID == "" && memConnectTools[harness] {
			return a.L.T("memp.busy"), "", a.L.T("memp.btn.installing")
		}
		return a.L.T("memp.setting"), "", a.L.T("memp.btn.installing")
	}
	// D552: an update that took, until the next check.
	if m.Updated && m.Version != "" {
		return a.L.T("memp.updated", m.Version, harnessName(harness)), "", ""
	}
	// D597: it didn't take and nothing could pick it up: one line, and 更新 stays.
	if m.Stuck && m.State == "update" {
		return a.L.T("memp.stuck"), a.L.T("memp.btn.update"), ""
	}
	if m.Fresh && m.State != "absent" {
		return a.L.T("memp.fresh", harnessName(harness)), "", ""
	}
	switch m.State {
	case "installed":
		if m.Version != "" {
			return a.L.T("memp.installed", m.Version), "", ""
		}
		return a.L.T("memp.installed.bare"), "", ""
	case "absent":
		return a.L.T("memp.absent"), a.L.T("memp.btn.install"), ""
	case "update":
		// D466: from the version there to the one out, when both are known.
		if m.Version != "" && m.Available != "" {
			return a.L.T("memp.update.to", m.Version, m.Available), a.L.T("memp.btn.update"), ""
		}
		return a.L.T("memp.update"), a.L.T("memp.btn.update"), ""
	case "review":
		if m.Why == "multiple" {
			if len(m.Versions) == 2 {
				return a.L.T("memp.review.two", m.Versions[0], m.Versions[1]), a.L.T("memp.btn.tidy"), ""
			}
			return a.L.T("memp.review.multiple"), a.L.T("memp.btn.tidy"), ""
		}
		return a.L.T("memp.review.unclear"), a.L.T("memp.btn.review"), ""
	}
	return "", "", ""
}

// memCant is whether an update (or any setup) can run on that computer from
// here, as the home runs it (core mem-plugins.ts openSetup): the computer
// awake and any AI signed in there, not only the one whose plugin it is
// (D569: a worker's Claude Code signed out there hid 更新 while its Codex
// could do it). "" when it can; else why not ("away", "no_agent"), said
// under the row, and nothing offers an update.
func memCant(dv *protocol.DeviceView) string {
	if dv.State != protocol.DeviceAwake {
		return "away"
	}
	for _, x := range dv.Harnesses {
		if x.Installed && x.LoggedIn {
			return ""
		}
	}
	return "no_agent"
}

// memSendingFor is how long this window's own tap reads busy without the
// home's word (D552; the frame with its task comes in a second or two).
const memSendingFor = 15 * time.Second

// memLine is an agent's Mem line as this window knows it (D552): from the
// tap until the home answers, busy, so a second tap has nothing to press.
func (a *App) memLine(dv *protocol.DeviceView, h protocol.DeviceHarness) *protocol.MemPluginView {
	m := h.Mem
	key := dv.ID + ":" + h.Harness
	if m == nil {
		return m
	}
	// The home's own word (its task, its busy, or the line moved on) ends this window's.
	if m.TaskID != "" || m.Busy || m.Updated || m.Fresh || m.Stuck || m.State == "installed" {
		delete(a.memSent, key)
		return m
	}
	if at, ok := a.memSent[key]; ok && time.Since(at) < memSendingFor {
		c := *m
		c.Busy = true
		return &c
	}
	return m
}

// installMem asks the home to install or update Nowledge Mem in that agent
// there (D169), once: a tap while this window's last ask is in flight does
// nothing (D552).
func (a *App) installMem(device, harness string) {
	key := device + ":" + harness
	if at, ok := a.memSent[key]; ok && time.Since(at) < memSendingFor {
		return
	}
	if a.memSent == nil {
		a.memSent = map[string]time.Time{}
	}
	a.memSent[key] = time.Now()
	a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: device, Harness: harness})
}

// memAskWords is the in-place ask before a tap does anything (D466): its
// question, what changes and where, and its button, by what the line says.
// direct: Mem's own command puts it in (D375: Claude Code and Codex, absent).
func (a *App) memAskWords(m *protocol.MemPluginView, agent, device string, direct bool) (ask, means, ok string) {
	switch {
	case m.State == "update":
		ask = a.L.T("memp.ask.update.bare", agent, device)
		if m.Available != "" {
			ask = a.L.T("memp.ask.update", agent, device, m.Available)
		}
		return ask, a.L.T("memp.means.update", agent, device), a.L.T("memp.ok.update")
	case m.State == "review" && m.Why == "multiple":
		return a.L.T("memp.ask.tidy", agent, device), a.L.T("memp.means.tidy", agent, device), a.L.T("memp.ok.tidy")
	case m.State == "review":
		return a.L.T("memp.ask.review", agent, device), a.L.T("memp.means.review", agent, device), a.L.T("memp.ok.review")
	}
	means = a.L.T("memp.means", agent, device)
	if direct {
		means = a.L.T("memp.means.direct", agent, device)
	}
	return a.L.T("memp.ask", agent, device), means, a.L.T("memp.ok")
}

// memAskBlock is the in-place ask (design/ui.md): one bold question, what
// changes and where, then its button and Cancel.
func (a *App) memAskBlock(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	t := a.T
	d := a.devState()
	key := dv.ID + ":" + h.Harness
	agent := harnessName(h.Harness)
	about := spoken(a.L, agent, "Nowledge Mem")
	// D375: Mem's own command first where it has one for this agent and the plugin isn't there.
	ask, means, ok := a.memAskWords(h.Mem, agent, a.deviceNameIn(dv), memConnectTools[h.Harness] && h.Mem.State == "absent")
	ui.Column(c.Key("mempask:" + key)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusMD).Background(t.Bg).Children(func() {
		uiText(c, ask).FontSize(t.SM).FontWeight(800).LineHeight(1.4)
		a.note(c, means)
		ui.Row(c).Gap(t.S2).Children(func() {
			if a.buttonFor(c, ok, about, btnSecondary, t.ControlSM, t.Bg) {
				a.installMem(dv.ID, h.Harness)
				d.card.memAsk = ""
			}
			if a.buttonFor(c, a.L.T("memp.cancel"), about, btnText, t.ControlSM, t.Bg) {
				d.card.memAsk = ""
			}
		})
	})
}

// memPluginRowsFor is the agents whose Mem is worth a tap in Settings ›
// 记忆 (D466): a newer version out, or several copies; the home first.
func memPluginRowsFor(devices []protocol.DeviceView) []memPluginRow {
	var out []memPluginRow
	for pass := 0; pass < 2; pass++ {
		for i := range devices {
			dv := &devices[i]
			if dv.Home != (pass == 0) {
				continue
			}
			for _, h := range dv.Harnesses {
				m := h.Mem
				if m == nil || !h.Installed {
					continue
				}
				// D552: and one that just updated, so its row says the version it reached.
				if m.State == "update" || (m.State == "review" && m.Why == "multiple") || m.Updated {
					out = append(out, memPluginRow{dv: dv, h: h})
				}
			}
		}
	}
	return out
}

type memPluginRow struct {
	dv *protocol.DeviceView
	h  protocol.DeviceHarness
}

// memPluginRows draws those rows inside Nowledge Mem's group: the agent's
// coin, who and where, the line, and its one action asked in place.
func (a *App) memPluginRows(c *ui.Context) {
	t := a.T
	d := a.devState()
	for _, r := range memPluginRowsFor(a.S.Devices) {
		dv, h := r.dv, r.h
		key := dv.ID + ":" + h.Harness
		agent := harnessName(h.Harness)
		line, action, busy := a.memPluginWords(a.memLine(dv, h), h.Harness)
		cant := ""
		if action != "" {
			cant = memCant(dv)
		}
		can := action != "" && cant == ""
		asking := can && d.card.memAsk == key
		var control func()
		if busy != "" {
			control = func() {
				a.busyButton(c, busy, spoken(a.L, agent, a.deviceNameIn(dv), "Nowledge Mem"), t.ControlSM, t.Surface)
			}
		} else if can && !asking {
			control = func() {
				if a.buttonFor(c, action, spoken(a.L, agent, a.deviceNameIn(dv), "Nowledge Mem"), btnSecondary, t.ControlSM, t.Surface) {
					d.card.memAsk, d.card.mem = key, nil
				}
			}
		}
		a.tileRow(c, "memp:"+key, a.toolTile(c, agent), a.L.T("memp.row", agent, a.deviceNameIn(dv)), line, control)
		if cant != "" {
			// D569: why it can't be done from here, in one line; nothing claims 去更新.
			a.textBlock(c, "mempcant:"+key, func() { a.note(c, a.L.T("memp.cant."+cant, a.deviceNameIn(dv))) })
		}
		if asking {
			a.textBlock(c, "mempask:"+key, func() { a.memAskBlock(c, dv, h) })
		}
		if ans := d.card.mem; ans != nil && ans.Device == dv.ID && ans.Harness == h.Harness {
			a.textBlock(c, "mempwhy:"+key, func() { a.reasonLine(c, a.memWhy(ans.Reason)) })
		}
	}
}

// memPluginAction is the line's action in the coin detail: the button, or
// the in-place ask once tapped, and why it didn't start. A computer that is
// away shows the line alone.
func (a *App) memPluginAction(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	if h.Mem == nil || !h.Installed {
		return
	}
	_, action, busy := a.memPluginWords(a.memLine(dv, h), h.Harness)
	t := a.T
	d := a.devState()
	key := dv.ID + ":" + h.Harness
	agent := harnessName(h.Harness)
	about := spoken(a.L, agent, "Nowledge Mem")
	if busy != "" {
		ui.Row(c.Key("memp:" + key)).Children(func() { a.busyButton(c, busy, about, t.ControlSM, t.Surface) })
		return
	}
	if action == "" || memCant(dv) != "" {
		return
	}
	if d.card.memAsk != key {
		ui.Row(c.Key("memp:" + key)).Children(func() {
			if a.buttonFor(c, action, about, btnSecondary, t.ControlSM, t.Surface) {
				d.card.memAsk, d.card.mem = key, nil
			}
		})
	} else {
		a.memAskBlock(c, dv, h)
	}
	if ans := d.card.mem; ans != nil && ans.Device == dv.ID && ans.Harness == h.Harness {
		a.reasonLine(c, a.memWhy(ans.Reason))
	}
}

// memConnectTools is the agents Mem's own `nmem connect --tool` registers by
// itself (D375; protocol/src/mem-health.ts MEM_CONNECT_TOOLS).
var memConnectTools = map[string]bool{"claude-code": true, "codex": true}

// memWhy is why 装上 didn't start, in plain words.
func (a *App) memWhy(reason string) string {
	key := "memp.why." + reason
	if s := a.L.T(key); s != key {
		return s
	}
	return a.L.T("memp.why.failed")
}

// memCardQuestion is Ducter's one card about Nowledge Mem, in the reader's words.
func (a *App) memCardQuestion(m *protocol.MemPluginAsk) string {
	return a.L.T("memp.card.question", harnessName(m.Harness), m.DeviceName)
}
