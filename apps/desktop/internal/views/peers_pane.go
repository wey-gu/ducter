package views

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D332: Settings › 和你的其他 agent 通信 / Talk with your other agents on the settings grid
// (D289). On: any problem as one row with its fix, what came and went
// lately (both ways), what to say (试试看), the one switch. Before Mem is
// ready: the picture, one sentence of what Nowledge Mem is and its steps in
// place; once it is, the home connects by itself (no tap). Off: the picture
// and the switch. Identity, place, labels and ids are never shown; agents
// the person stopped listening to are the only rules shown, each with 恢复.
// The web's: PeersPage (apps/web/src/memory.tsx).

// coinsTile is two of the person's agents' coins, overlapping, in the tile
// column: the rail's own mark for this tab.
func (a *App) coinsTile(c *ui.Context, faded bool) func() {
	return func() {
		ui.Row(c.Key("coins-tile")).Width(44).Height(40).Shrink(0).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			for i, art := range []string{"coin_claude_code", "coin_codex"} {
				if i == 1 {
					ui.Box(c).Width(0).Margin(0, 0, 0, -14)
				}
				bmp := theme.Clay(art)
				if faded {
					bmp = theme.FadedClay(art, a.T) // D374: grey, never see-through
				}
				if bmp != nil {
					ui.Image(c, bmp).Size(28, 28)
				}
			}
		})
	}
}

// drawWay is the picture's arrow, left to right or back.
func drawWay(col ui.Color, back bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		y := r.Y + r.H/2
		l, rt := r.X+2, r.X+r.W-2
		var m ui.Path
		m.MoveTo(l, y)
		m.LineTo(rt, y)
		if back {
			m.MoveTo(l+6, y-5)
			m.LineTo(l, y)
			m.LineTo(l+6, y+5)
		} else {
			m.MoveTo(rt-6, y-5)
			m.LineTo(rt, y)
			m.LineTo(rt-6, y+5)
		}
		p.StrokePath(&m, 2, col)
	}
}

// peersPicture is the page's picture, literal (D321 (6): no metaphor): the
// person's own agents' coins, the partner, and the two ways between them,
// each said in words.
func (a *App) peersPicture(c *ui.Context, name string) {
	t := a.T
	label := func(s string) {
		uiText(c, s).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).TextAlign(ui.Center)
	}
	ui.Row(c.Key("peers-pic")).Gap(t.S3).AlignItems(ui.Center).Justify(ui.Center).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.SurfaceSunken).Children(func() {
		ui.Column(c).Gap(t.S2).AlignItems(ui.Center).Shrink(0).Children(func() {
			ui.Row(c).AlignItems(ui.Center).AccessHidden(true).Children(func() {
				for i, art := range []string{"coin_claude_code", "coin_codex"} {
					if i == 1 {
						ui.Box(c).Width(0).Margin(0, 0, 0, -16)
					}
					if bmp := theme.Clay(art); bmp != nil {
						ui.Image(c, bmp).Size(44, 44)
					}
				}
			})
			label(a.L.T("peers.pic.them"))
		})
		ui.Column(c).Gap(t.S3).Grow(1).Basis(0).MinWidth(120).MaxWidth(260).Children(func() {
			ui.Column(c).Gap(2).Children(func() {
				label(a.L.T("peers.pic.to", name))
				ui.Box(c).Height(14).AccessHidden(true).Draw(drawWay(t.InkMuted, false))
			})
			ui.Column(c).Gap(2).Children(func() {
				ui.Box(c).Height(14).AccessHidden(true).Draw(drawWay(t.InkMuted, true))
				label(a.L.T("peers.pic.back", name))
			})
		})
		ui.Column(c).Gap(t.S2).AlignItems(ui.Center).Shrink(0).Children(func() {
			a.avatar(c, theme.Idle, 56)
			label(name)
		})
	})
}

// peersCard is the tab's groups (D332).
func (a *App) peersCard(c *ui.Context, st *protocol.Settings) {
	if st == nil || st.Peers == nil {
		return
	}
	p := st.Peers
	b := a.S.Bridge
	t := a.T
	name := st.Name
	on := peersSwitchOn(p.Reach, b)
	phase := peersPhase(b, on)
	if b == nil || (b.State != "elsewhere" && (b.State != "connected" || len(b.Others) == 0)) {
		a.bridgeHere = false
	}
	// Opening the page while Mem is ready is the ask: the home connects (as at start).
	if phase == "joining" && b.State == "ready" {
		b.State = "connecting"
		a.send(protocol.BridgeAction{T: "bridge_connect"})
	}
	set := func(next protocol.Peers) {
		*p = next
		a.SetSettings(protocol.SettingsPatch{Peers: &next})
	}
	// D459: the pane's one switch is its first group's head row, as Memory's is: who it is about,
	// what came and went this week, the switch at the right edge, and where it all shows up as
	// the group's last line. Then the one problem, who can reach the partner, what came and went,
	// and what to say.
	head := func() {
		if phase == "getting" || phase == "none" {
			return
		}
		a.group(c, "peers-head", "", "", func() {
			// D470: the switch is the page's first group; the partner's sentence above says how things stand.
			// D583: the picture above names who they are; the title says 它们, the switch's
			// accessible name stays whole.
			title, line, tone := a.L.T("peers.switch.title", name), "", sideMuted
			if !on {
				line = a.L.T("peers.switch.off", name)
			}
			a.headRow(c, "peers", a.coinsTile(c, !on), title, line, tone, func() {
				v := on
				if !a.switchControl(c, "peers", a.L.T("peers.switch", name), &v) {
					return
				}
				if v && p.Reach != "off" {
					b.State = "connecting"
					a.send(protocol.BridgeAction{T: "bridge_connect"})
					a.say("peers", a.L.T("said.peers.on"))
					return
				}
				next := *p
				next.Reach = "own"
				said := a.L.T("said.peers.on")
				if !v {
					next.Reach, said = "off", a.L.T("said.peers.off")
				}
				set(next)
				a.say("peers", said)
			})
			note := a.L.T("peers.switch.on", name)
			if !on {
				note = a.L.T("peers.off.kept")
			}
			a.footRow(c, "peers-head", note, nil)
		})
		a.saidLine(c, "peers")
	}
	if phase == "on" {
		head()
		if !b.Pinned && len(b.Others) > 0 {
			a.group(c, "peers-problem", "", "", func() { a.peersProblem(c, b, name) })
		}
		a.peersNames(c, b, name)
		a.peersStuck(c, b, name)
		a.peersNotices(c, b, name)
		a.peersAgents(c, name)
		a.peersHelpers(c)
		threads := exchangeThreads(peerFeed(a.S.Channel, a.S.TaskPeers), a.S.OutOps, a.S.Decisions, 3)
		a.peersThreads(c, name, threads, p)
		a.peersRules(c, p)
		if len(threads) > 0 {
			a.peersTry(c, name)
		}
		// D664: the setup, done, as one calm line at the foot (its steps one tap away).
		a.memSetup(c, "peers-setup", true, nil, nil, nil)
	} else {
		a.peersPicture(c, name)
		head()
	}
	// D664: the one Nowledge Mem setup, the same group as Memory's, with the mailbox as its last step.
	if phase == "getting" || phase == "joining" || (phase == "problem" && b.State != "elsewhere") {
		a.memSetup(c, "peers-mem", true, func() {
			a.tileRow(c, "peers-what", nil, a.L.T("mem.app.learn"), a.L.T("peers.mem.what"), func() {
				if a.button(c, a.L.T("mem.app.open"), btnSecondary, t.ControlSM, t.Surface) {
					a.openLink(memSite)
				}
			})
		}, nil, func() {
			// "Once it's in and signed in, I connect by myself": only while those steps are left.
			if phase == "getting" {
				a.footRow(c, "peers-mem", a.L.T("peers.mem.then"), nil)
			}
		})
	}
	switch phase {
	case "problem":
		if b.State == "elsewhere" {
			a.group(c, "peers-problem", "", "", func() { a.peersProblem(c, b, name) })
		}
	case "none":
		a.group(c, "peers-none", "", "", func() {
			a.tileRow(c, "peers-none", nil, a.L.T("peers.none", name), "", func() {
				if a.button(c, a.L.T("peers.mem.go"), btnSecondary, t.ControlSM, t.Surface) {
					a.openTab(TabMemory)
				}
			})
		})
	}
	if phase == "on" {
		return // D470: on, the muted are under 谁能让我做什么
	}
	if len(p.Muted) == 0 {
		a.saidLine(c, "peer-undo") // D296: the last 恢复 leaves this line behind, where the row was
		return
	}
	a.group(c, "peer-muted", a.L.T("peers.muted.title"), "", func() {
		for _, agent := range p.Muted {
			agent := agent
			a.tileRow(c, "muted:"+agent, a.toolTile(c, peerName(agent)), a.L.T("peers.muted", agent), "", func() {
				if a.quietButton(c, "muted:"+agent, a.L.T("peers.muted.undo"), agent, false, 0) {
					next := *p
					next.Muted = without(p.Muted, agent)
					a.SetSettings(protocol.SettingsPatch{Peers: &next})
					a.sayAfter("peer-undo", a.L.T("said.peers.trust.undo", agent), func(st *protocol.Settings) bool {
						return st.Peers != nil && !contains(st.Peers.Muted, agent)
					})
				}
			})
		}
	})
	a.saidLine(c, "peer-undo")
}

// peersNames is D364's one quiet row: an nmem too old to say who wrote
// while a newer one is out, its update said by what it gives here. The
// Nowledge Mem app's own copy is updated in the app.
func (a *App) peersNames(c *ui.Context, b *protocol.BridgeView, name string) {
	u := peersNamesUpdate(b)
	if u == nil {
		return
	}
	t := a.T
	home := a.memHome()
	title := a.L.T("peers.names.title", name)
	line := a.L.T("peers.names.line")
	var control func()
	if u.Kind == "app" {
		line = a.L.T("mem.update.app.body", home)
	} else {
		label := a.L.T("bridge.mem.update.go")
		if u.Detail != "" {
			label = a.L.T("bridge.retry")
			line = strings.TrimSpace(line + "\n" + a.memFailed(false, home, u.Detail, u.Kept))
		}
		control = func() {
			if a.buttonFor(c, label, home, btnSecondary, t.ControlSM, t.Surface) {
				b.State = "updating"
				a.send(protocol.BridgeAction{T: "bridge_mem_install"})
			}
		}
	}
	a.group(c, "peers-names", "", "", func() {
		a.tileRow(c, "peers-names", a.glyphTile(c, 18, drawUp(t.Accent)), title, line, control)
	})
}

// peersStuck is D369's one quiet line: Mem said the partner's mailbox
// can't be read until Mem sorts it out on its side. D669 (#4): Mem's
// code is a fact behind 详情, never the line; gone once a read works again.
func (a *App) peersStuck(c *ui.Context, b *protocol.BridgeView, name string) {
	if b == nil || b.Stuck == nil {
		return
	}
	t := a.T
	a.group(c, "peers-stuck", "", "", func() {
		a.tileRow(c, "peers-stuck", nil, a.L.T("peers.stuck.title", name), a.L.T("peers.stuck.line", name), nil)
		a.footRow(c, "peers-stuck", "", func() {
			if a.quietButton(c, "peers-stuck-fact", a.L.T("mem.details"), "Nowledge Mem", a.peersStuckFact, 0) {
				a.peersStuckFact = !a.peersStuckFact
			}
		})
		if a.peersStuckFact {
			a.textBlock(c, "peers-stuck-fact-body", func() {
				ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
					uiText(c, a.L.T("mem.details.code")).FontSize(t.SM).TextColor(t.InkMuted).Shrink(0)
					uiText(c, b.Stuck.Code).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable().MinWidth(0).Shrink(1)
				})
			})
		}
	})
}

// peersNotices is D400's one quiet line: Nowledge Mem itself also tells
// the person about mail to the partner's identity, so one message may
// announce itself twice. Nothing to tap; Mem's settings are Mem's.
func (a *App) peersNotices(c *ui.Context, b *protocol.BridgeView, name string) {
	if b == nil || b.State != "connected" || !b.Notices {
		return
	}
	a.group(c, "peers-notices", "", "", func() {
		a.tileRow(c, "peers-notices", nil, a.L.T("peers.notices.title", name), a.L.T("peers.notices.line", name), nil)
	})
}

// otherWhere is the other home(s) that also answer, in the person's words
// (D324): its name, or another computer.
func (a *App) otherWhere(b *protocol.BridgeView) string {
	if len(b.Others) > 1 {
		return a.L.T("peers.where.many", len(b.Others))
	}
	if len(b.Others) == 1 && b.Others[0].Home != "" {
		return b.Others[0].Home
	}
	return a.L.T("peers.where.other")
}

// peersProblem is the one problem worth a row, with its one fix (D332):
// two homes reading (只留这台), another home answering (改由这台收), Mem's
// refusal or failure (its step, 再试一次), Mem here offering no place, the
// Nowledge Mem app closed (D329: 打开 Nowledge Mem when the home can).
func (a *App) peersProblem(c *ui.Context, b *protocol.BridgeView, name string) {
	t := a.T
	where := a.otherWhere(b)
	switch b.State {
	case "connected", "elsewhere":
		ask, goLabel, title, line := a.L.T("peers.twice.ask", where, name), a.L.T("peers.twice.go"), a.L.T("peers.twice.title", name, where), a.L.T("peers.twice.line")
		stuck := false
		if b.State == "elsewhere" {
			ask, goLabel, title, line = a.L.T("peers.elsewhere.ask", where, name), a.L.T("peers.elsewhere.go"), a.L.T("peers.elsewhere", name, where), ""
			// D433: the other home Mem hasn't seen for over a day: its messages wait there.
			if len(b.Others) == 1 && awayFor(b.Others[0].SeenAt, a.Now()) {
				title = a.L.T("peers.elsewhere.away", name, where)
				line = a.L.T("peers.away", where, a.agoLong(time.UnixMilli(b.Others[0].SeenAt).UTC().Format(time.RFC3339)))
			}
		} else {
			for _, o := range b.Others {
				stuck = stuck || o.Stuck
			}
			if stuck {
				line = a.L.T("peers.twice.stuck", where)
			}
		}
		if a.bridgeHere {
			keep, goOn := a.confirmRow(c, "peers-here", ask, a.L.T("bridge.undo.keep"), goLabel, b.Identity)
			if keep {
				a.bridgeHere = false
			}
			if goOn {
				a.bridgeHere = false
				b.State = "connecting"
				a.send(protocol.BridgeAction{T: "bridge_only_here"})
			}
			return
		}
		var tile func()
		if b.State == "elsewhere" {
			tile = a.coinsTile(c, true)
		}
		a.tileRow(c, "peers-here", tile, title, line, func() {
			if !stuck && a.buttonFor(c, goLabel, b.Identity, btnSecondary, t.ControlSM, t.Surface) {
				a.bridgeHere = true
			}
		})
		return
	}
	// D664: every Mem state is a step of the one setup group (memsetup.go), not a row here.
}

// peerName is an agent's tool by name, for its coin ("terminal-claude" → Claude Code).
func peerName(agent string) string {
	switch peerHarness(agent) {
	case "claude-code":
		return "Claude Code"
	case "codex":
		return "Codex"
	case "pi":
		return "pi"
	}
	return agent
}

// peersInvite is the Partner page's one quiet line for someone Ducter
// hasn't seen run AI agents of their own (D332).
func (a *App) peersInvite(c *ui.Context) {
	for _, tab := range a.visibleTabs() {
		if tab == TabPeers {
			return
		}
	}
	if a.S.Settings == nil {
		return
	}
	// D500: a line on the paper, on the text edge with the group heads (never a card's foot with an
	// empty tile column and a hairline over it).
	t := a.T
	ui.Row(c.Key("peers-invite")).Gap(t.S3).Padding(t.S2, t.S5).MinHeight(44).AlignItems(ui.Center).Children(func() {
		uiText(c, a.L.T("peers.invite")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Grow(1).Basis(0).MinWidth(0)
		if a.quietButton(c, "peers-invite", a.L.T("peers.invite.go"), "", false, 1) {
			a.peersAsked = true
			a.openTab(TabPeers)
		}
	})
}
