package views

import (
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
				if bmp != nil {
					img := ui.Image(c, bmp).Size(28, 28)
					if faded {
						img.Opacity(0.5)
					}
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
		ui.Text(c, s).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).TextAlign(ui.Center)
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
	if phase == "on" {
		if !b.Pinned && len(b.Others) > 0 {
			a.group(c, "peers-problem", "", "", func() { a.peersProblem(c, b, name) })
		}
		a.peersRecent(c, name)
		a.peersTry(c, name)
	} else {
		a.peersPicture(c, name)
	}
	switch phase {
	case "getting":
		a.group(c, "peers-mem", "", "", func() {
			a.headRow(c, "peers-mem", a.memTile(c, true), "Nowledge Mem", a.L.T("peers.mem.what"), sideMuted, nil)
			if u := memUpdate(b); u != nil && (u.Kind == "needed" || u.Kind == "updating") {
				a.memUpdateRow(c, u, b)
			} else if ph := memPhase(true, a.S.Mem, b); ph == "install" || ph == "installing" || ph == "sign_in" || ph == "signing_in" {
				a.memSteps(c, ph, b)
			}
			a.footRow(c, "peers-mem", a.L.T("peers.mem.then", name), nil)
		})
	case "joining":
		a.group(c, "peers-joining", "", "", func() {
			a.tileRow(c, "peers-joining", a.handoffDot(c), a.L.T("peers.joining", name), "", nil)
		})
	case "problem":
		a.group(c, "peers-problem", "", "", func() { a.peersProblem(c, b, name) })
	case "none":
		a.group(c, "peers-none", "", "", func() {
			a.tileRow(c, "peers-none", nil, a.L.T("peers.none", name), "", func() {
				if a.button(c, a.L.T("peers.mem.go"), btnSecondary, t.ControlSM, t.Surface) {
					a.openTab(TabMemory)
				}
			})
		})
	}
	if phase != "getting" && phase != "none" {
		a.group(c, "peers-switch", "", "", func() {
			note := a.L.T("peers.switch.on")
			if !on {
				note = a.L.T("peers.switch.off", name)
			}
			a.textBlock(c, "peers-switch", func() {
				if v, changed := a.switchRow(c, "peers", a.L.T("peers.switch", name), note, on); changed && v && p.Reach != "off" {
					b.State = "connecting"
					a.send(protocol.BridgeAction{T: "bridge_connect"})
					a.say("peers", a.L.T("said.peers.on"))
				} else if changed {
					next := *p
					next.Reach = "own"
					said := a.L.T("said.peers.on")
					if !v {
						next.Reach, said = "off", a.L.T("said.peers.off")
					}
					set(next)
					a.say("peers", said)
				}
			})
		})
		a.saidLine(c, "peers")
	}
	if len(p.Muted) == 0 {
		return
	}
	a.group(c, "peer-muted", a.L.T("peers.muted.title"), "", func() {
		for _, agent := range p.Muted {
			agent := agent
			a.tileRow(c, "muted:"+agent, a.toolTile(c, peerName(agent)), a.L.T("peers.muted", agent), "", func() {
				if a.quietButton(c, "muted:"+agent, a.L.T("peers.muted.undo"), agent, false, 0) {
					next := *p
					next.Muted = without(p.Muted, agent)
					set(next)
				}
			})
		}
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
	case "local_mem":
		a.tileRow(c, "peers-problem", a.coinsTile(c, true), a.L.T("bridge.mem.local", a.memHome()), "", nil)
		return
	case "no_space":
		a.tileRow(c, "peers-problem", a.coinsTile(c, true), a.L.T("bridge.no_space"), "", nil)
		return
	case "mem_closed":
		// D329: the Nowledge Mem app on the home is closed: the agents can't
		// reach the partner until it's open; Memory's own row, said here.
		home := a.memHome()
		line := a.L.T("bridge.mem.closed.there", home)
		var control func()
		if b.CanOpen {
			line = a.L.T("bridge.mem.closed.open", home)
			control = func() {
				if a.buttonFor(c, a.L.T("bridge.mem.open"), home, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.BridgeAction{T: "bridge_mem_open"})
				}
			}
		}
		a.tileRow(c, "peers-problem", a.coinsTile(c, true), a.L.T("bridge.mem.closed"), line, control)
		return
	}
	line := a.bridgeNote(b)
	tryNewer := b.Newer != nil
	if tryNewer {
		line += "\n" + a.L.T("peers.mem.newer")
	}
	a.tileRow(c, "peers-problem", a.coinsTile(c, true), line, "", func() {
		if tryNewer && a.button(c, a.L.T("peers.mem.go"), btnSecondary, t.ControlSM, t.Surface) {
			a.openTab(TabMemory)
		}
		if a.buttonFor(c, a.L.T("bridge.retry"), b.Identity, btnSecondary, t.ControlSM, t.Surface) {
			b.State = "connecting"
			a.send(protocol.BridgeAction{T: "bridge_connect"})
		}
	})
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
	a.footRow(c, "peers-invite", a.L.T("peers.invite", a.personaName()), func() {
		if a.quietButton(c, "peers-invite", a.L.T("peers.invite.go"), "", false, 1) {
			a.peersAsked = true
			a.openTab(TabPeers)
		}
	})
}
