package views

import (
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
		line, _ := a.memPluginWords(h.Mem)
		return line
	})
	coinActions = append(coinActions, (*App).memPluginAction)
}

// memPluginWords is the line and its action's words for one agent ("" when none).
func (a *App) memPluginWords(m *protocol.MemPluginView) (line, action string) {
	if m == nil {
		return "", ""
	}
	if m.TaskID != "" {
		return a.L.T("memp.setting"), ""
	}
	switch m.State {
	case "installed":
		if m.Version != "" {
			return a.L.T("memp.installed", m.Version), ""
		}
		return a.L.T("memp.installed.bare"), ""
	case "absent":
		return a.L.T("memp.absent"), a.L.T("memp.btn.install")
	case "update":
		return a.L.T("memp.update"), a.L.T("memp.btn.update")
	case "review":
		if m.Why == "multiple" {
			return a.L.T("memp.review.multiple"), a.L.T("memp.btn.review")
		}
		return a.L.T("memp.review.unclear"), a.L.T("memp.btn.review")
	}
	return "", ""
}

// memPluginAction is the line's action in the coin detail: the button, or
// the in-place ask once tapped, and why it didn't start. A computer that is
// away shows the line alone.
func (a *App) memPluginAction(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	if h.Mem == nil || !h.Installed || !h.LoggedIn {
		return
	}
	_, action := a.memPluginWords(h.Mem)
	if action == "" || dv.State != protocol.DeviceAwake {
		return
	}
	t := a.T
	d := a.devState()
	key := dv.ID + ":" + h.Harness
	agent := harnessName(h.Harness)
	about := agent + " · Nowledge Mem"
	if d.card.memAsk != key {
		ui.Row(c.Key("memp:" + key)).Children(func() {
			if a.buttonFor(c, action, about, btnSecondary, t.ControlSM, t.Surface) {
				d.card.memAsk, d.card.mem = key, nil
			}
		})
	} else {
		// The in-place ask (design/ui.md): one bold question, what changes and where, then the button and Cancel.
		ui.Column(c.Key("mempask:" + key)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusMD).Background(t.Bg).Children(func() {
			ui.Text(c, a.L.T("memp.ask", agent, a.deviceNameIn(dv))).FontSize(t.SM).FontWeight(800).LineHeight(1.4)
			a.note(c, a.L.T("memp.means", agent, a.deviceNameIn(dv)))
			ui.Row(c).Gap(t.S2).Children(func() {
				if a.buttonFor(c, a.L.T("memp.ok"), about, btnSecondary, t.ControlSM, t.Bg) {
					a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: dv.ID, Harness: h.Harness})
				}
				if a.buttonFor(c, a.L.T("memp.cancel"), about, btnText, t.ControlSM, t.Bg) {
					d.card.memAsk = ""
				}
			})
		})
	}
	if ans := d.card.mem; ans != nil && ans.Device == dv.ID && ans.Harness == h.Harness {
		a.reasonLine(c, a.memWhy(ans.Reason))
	}
}

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
