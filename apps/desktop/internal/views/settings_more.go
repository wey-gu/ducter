package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D307: the Settings rows the last lanes left on their own surfaces, the
// same as the web's (apps/web/src/settings-more.tsx): a pasted key (D298)
// in Settings › Partner and on the home's card in Devices; 额度用完的时候 /
// When a limit runs out (D297), also on a task's limit card; and what the
// person's own AI agents keep: the first words' looking (D298) and the
// agents Past tasks doesn't show (D299), each with its way back.

// deviceKeyRow is the same row on the home's card in Devices, under its AI
// agents: closed, one quiet line and its button; open, the card.
func (a *App) deviceKeyRow(c *ui.Context) {
	t := a.T
	k := &a.kp
	// A flat row under the tray, never a card in the card (D273).
	ui.Column(c.Key("dev-apikey")).Gap(t.S3).Margin(t.S3, 0, 0, 0).Padding(t.S2, t.S2).Children(func() {
		if !k.setOpen["devices"] {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
					ui.Text(c, a.L.T("key.paste.instead")).FontSize(t.MD).FontWeight(700)
					ui.Text(c, a.L.T("key.paste.instead.note")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				})
				if a.button(c, a.L.T("key.paste.check.open"), btnSecondary, t.ControlSM, t.Surface) {
					a.openKeyRow("devices")
				}
			})
			return
		}
		a.keyRowOpen(c, "devices", t.Surface)
	})
}

func (a *App) openKeyRow(where string) {
	k := &a.kp
	if k.setOpen == nil {
		k.setOpen = map[string]bool{}
	}
	k.setOpen[where] = true
}

// keyRowOpen is an open key row: its title, the card without its own
// title (keyCardIn), and 收起 / Hide.
func (a *App) keyRowOpen(c *ui.Context, where string, on ui.Color) {
	t := a.T
	k := &a.kp
	title := a.L.T("key.settings.row")
	if where == "devices" {
		title = a.L.T("key.paste.instead")
	}
	ui.Text(c, title).FontSize(t.MD).FontWeight(700)
	a.keyCardIn(c, func(key string) {
		a.sendKey(key)
		k.from = where
	}, where)
	ui.Row(c).Justify(ui.End).Children(func() {
		if a.button(c, a.L.T("key.paste.back"), btnText, t.ControlSM, on) {
			k.setOpen[where] = false
		}
	})
}

// handoffGroup is 额度用完的时候 / When a limit runs out: D297's choice, the
// same setting as the switch under a task's limit card. With one agent
// that does tasks, its note says what happens then (D322).
func (a *App) handoffGroup(c *ui.Context, st *protocol.Settings) {
	note := ""
	if len(a.trayHarnesses()) > 0 {
		switch len(a.readyAgents()) {
		case 0:
			return // nothing does tasks yet: no limit to run out
		case 1:
			note = a.L.T("handoff.one")
		}
	}
	a.group(c, "handoff", a.L.T("handoff.title"), note, func() {
		if v, ch := a.toggleRow(c, "handoff", a.L.T("handoff.row"), a.L.T("handoff.help"), st.LimitHandoff); ch {
			st.LimitHandoff = v
			a.SetSettings(protocol.SettingsPatch{LimitHandoff: &v})
			if v {
				a.say("handoff", a.L.T("said.handoff.on"))
			} else {
				a.say("handoff", a.L.T("said.handoff.off"))
			}
		}
	})
	a.saidLine(c, "handoff")
}

// recordsGroup is 你的 AI agent 留下的记录 / What your AI agents keep: the
// first words' looking (别再看了's switch, D298) and, for each agent Past
// tasks doesn't show (D299), 再显示 / Show again.
func (a *App) recordsGroup(c *ui.Context) {
	t := a.T
	f := a.S.First
	if f == nil {
		return
	}
	note := ""
	looks := f.Looking()
	if looks && len(f.OutsideHidden) == 0 && len(f.OutsideFolders) == 0 {
		note = a.L.T("records.past.note")
	}
	// D364: the note under the heading, like every group's (D289), not stray under the card.
	a.group(c, "records", a.L.T("records.title"), note, func() {
		if v, ch := a.toggleRow(c, "records", a.L.T("records.look"), a.L.T("records.look.help", a.homeComputer()), looks); ch {
			f.SetLooking(v)
			a.send(protocol.LocalAgents{T: "local_agents", On: v})
			if v {
				a.say("records", a.L.T("said.records.on"))
			} else {
				a.say("records", a.L.T("said.records.off"))
			}
		}
		if !looks {
			return // off is off everywhere: nothing below it applies
		}
		for _, agent := range f.OutsideHidden {
			name := agentName(agent)
			a.row(c, "hidden:"+agent, a.L.T("records.hidden", name), "", func() {
				if a.buttonFor(c, a.L.T("records.show"), name, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.OutsideHide{T: "outside_hide", Agent: agent, Hidden: false})
					a.say("records", a.L.T("said.records.shown", name))
					f.OutsideHidden = without(f.OutsideHidden, agent)
				}
			})
		}
		// D327: each folder left out, with its way back.
		for _, p := range f.OutsideFolders {
			p := p
			a.row(c, "folder:"+p, a.L.T("records.folder"), p, func() {
				if a.buttonFor(c, a.L.T("records.show"), p, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.OutsideFolder{T: "outside_folder", Path: p, Hidden: false})
					a.say("records", a.L.T("said.records.folder", p))
					f.OutsideFolders = without(f.OutsideFolders, p)
				}
			})
		}
	})
	a.saidLine(c, "records")
}
