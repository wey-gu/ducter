package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D295: Settings › 连上的 AI agent / Connected AI agents on the settings
// grid (D289). One group is the link itself: its first row says whether
// your agents can reach the partner (two of their coins in the tile
// column); then its identity and its place in human words, who may reach
// it, and the last line's quiet 详情 (the raw ids, for support) and quiet
// 断开 that asks in place. What it learned about your agents is a section
// of its own. Nowledge Bridge underneath is never named (D205).

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

// peersSpace is the place it receives in, in the person's words.
func (a *App) peersSpace(b *protocol.BridgeView) string {
	if b.Space == nil || b.Space.Label == "" || b.Space.Label == "Only me" {
		return a.L.T("peers.space.own")
	}
	return a.L.T("peers.space.named", b.Space.Label)
}

// peersCard is the tab's groups (D170, D205).
func (a *App) peersCard(c *ui.Context, st *protocol.Settings) {
	if st == nil || st.Peers == nil {
		return
	}
	p := st.Peers
	b := a.S.Bridge
	t := a.T
	seen := a.peersSeen()
	if b == nil || b.State != "connected" {
		a.bridgeConfirm = false
	}
	if b == nil || (b.State != "elsewhere" && (b.State != "connected" || len(b.Others) == 0)) {
		a.bridgeHere = false
	}
	reachShown := seen || len(p.Trusted) > 0 || len(p.Muted) > 0 || (b != nil && !memSetup(b.State))
	set := func(next protocol.Peers) {
		*p = next
		a.SetSettings(protocol.SettingsPatch{Peers: &next})
	}
	name := st.Name
	a.group(c, "peers", "", "", func() {
		connected := false
		if b != nil {
			connected = a.peersHead(c, st, b)
		}
		if connected && !b.Pinned && len(b.Others) > 0 {
			a.peersTwice(c, b, name)
		}
		if connected {
			a.tileRow(c, "peers-as", nil, a.L.T("peers.as.title"), a.L.T("peers.as.line", b.Identity), nil)
			a.tileRow(c, "peers-space", nil, a.L.T("peers.space.title"), a.peersSpace(b), nil)
		}
		if reachShown {
			reaches := []string{"own", "team", "off"}
			labels := []string{a.L.T("peers.reach.own"), a.L.T("peers.reach.team"), a.L.T("peers.reach.off")}
			sel := 0
			for i, r := range reaches {
				if r == p.Reach {
					sel = i
				}
			}
			reachNote := a.L.T("peers.reach.note")
			if p.Reach == "off" {
				reachNote = a.L.T("peers.reach.off.note", name)
			}
			// The choice sits under its words on the text column, so a narrow window never squeezes them.
			a.tileRow(c, "reach", nil, a.L.T("peers.reach", name), reachNote, nil)
			ui.Row(c.Key("reach-choice")).Padding(0, t.S5, t.S4, t.S5+40+t.S3).Children(func() {
				if i := a.choices(c, "reach", a.L.T("peers.reach", name), labels, sel); i >= 0 {
					next := *p
					next.Reach = reaches[i]
					set(next)
				}
			})
		}
		if !connected {
			return
		}
		if a.peersDetails {
			a.textBlock(c, "peers-details", func() { a.memFacts(c, b) })
		}
		canUndo := !b.Pinned
		if canUndo && a.bridgeConfirm {
			keep, goOn := a.confirmRow(c, "peers-undo", a.L.T("peers.undo.ask"), a.L.T("bridge.undo.keep"), a.L.T("bridge.undo"), b.Identity)
			if keep {
				a.bridgeConfirm = false
			}
			if goOn {
				a.bridgeConfirm = false
				b.State = "disconnecting"
				a.send(protocol.BridgeAction{T: "bridge_disconnect"})
			}
			return
		}
		note := a.L.T("peers.foot")
		if b.Detail != "" {
			note = a.L.T("bridge.undo.failed", b.Detail)
		}
		a.footRow(c, "peers", note, func() {
			if a.quietButton(c, "peers-details", a.L.T("mem.details"), b.Identity, a.peersDetails, 0) {
				a.peersDetails = !a.peersDetails
			}
			if canUndo && a.quietDanger(c, "peers-undo", a.L.T("bridge.undo"), b.Identity) {
				a.bridgeConfirm = true
			}
		})
	})
	if b != nil && b.State == "connected" {
		a.peersTry(c, name)
	}
	if len(p.Trusted) == 0 && len(p.Muted) == 0 {
		return
	}
	a.group(c, "peer-rules", a.L.T("peers.rules.title"), "", func() {
		for _, agent := range p.Trusted {
			agent := agent
			a.tileRow(c, "trusted:"+agent, a.toolTile(c, peerName(agent)), a.L.T("peers.trusted", agent), a.L.T("peers.trusted.why"), func() {
				if a.quietButton(c, "trusted:"+agent, a.L.T("peers.trusted.stop"), agent, false, 0) {
					next := *p
					next.Trusted = without(p.Trusted, agent)
					set(next)
				}
			})
		}
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
	_ = t
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

// peersTwice is D324's one calm row when two homes read the partner's
// mailbox: 只留这台 asks in place; a connection Mem won't end from here says
// where to end it instead.
func (a *App) peersTwice(c *ui.Context, b *protocol.BridgeView, name string) {
	t := a.T
	where := a.otherWhere(b)
	stuck := false
	for _, o := range b.Others {
		stuck = stuck || o.Stuck
	}
	if a.bridgeHere {
		keep, goOn := a.confirmRow(c, "peers-twice", a.L.T("peers.twice.ask", where, name), a.L.T("bridge.undo.keep"), a.L.T("peers.twice.go"), b.Identity)
		if keep {
			a.bridgeHere = false
		}
		if goOn {
			a.bridgeHere = false
			a.send(protocol.BridgeAction{T: "bridge_only_here"})
		}
		return
	}
	line := a.L.T("peers.twice.line")
	if stuck {
		line = a.L.T("peers.twice.stuck", where)
	}
	a.tileRow(c, "peers-twice", nil, a.L.T("peers.twice.title", name, where), line, func() {
		if !stuck && a.buttonFor(c, a.L.T("peers.twice.go"), b.Identity, btnSecondary, t.ControlSM, t.Surface) {
			a.bridgeHere = true
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

// peersHead is the link's first row in its state; it reports connected.
func (a *App) peersHead(c *ui.Context, st *protocol.Settings, b *protocol.BridgeView) bool {
	t := a.T
	name := st.Name
	title := a.L.T("bridge.title", name)
	toMemory := func() {
		if a.button(c, a.L.T("peers.mem.go"), btnSecondary, t.ControlSM, t.Surface) {
			a.openTab(TabMemory)
		}
	}
	head := func(line string, tone sideTone, control func()) {
		a.headRow(c, "peers", a.coinsTile(c, tone != sideDone), title, line, tone, control)
	}
	switch b.State {
	case "install_mem", "installing", "sign_in", "signing_in":
		head(a.L.T("peers.mem.first", a.memHome(), name), sideMuted, toMemory)
		return false
	case "update_mem":
		head(a.L.T("peers.mem.update", a.memHome(), memMin), sideMuted, toMemory)
		return false
	case "updating":
		head(a.L.T("bridge.mem.updating", a.memHome()), sideMuted, nil)
		return false
	case "local_mem":
		head(a.L.T("bridge.mem.local", a.memHome()), sideMuted, nil)
		return false
	case "connected":
		title = a.L.T("peers.head.on", name)
		line := a.L.T("mem.app.on")
		if b.Pinned {
			line = a.L.T("bridge.pinned")
		}
		head(line, sideDone, nil)
		return true
	case "elsewhere":
		// D324: another home answers this partner's mailbox: where, and the one way to move it here.
		head(a.L.T("peers.elsewhere", name, a.otherWhere(b)), sideMuted, func() {
			if !a.bridgeHere && a.buttonFor(c, a.L.T("peers.elsewhere.go"), b.Identity, btnSecondary, t.ControlSM, t.Surface) {
				a.bridgeHere = true
			}
		})
		if a.bridgeHere {
			keep, goOn := a.confirmRow(c, "peers-here", a.L.T("peers.elsewhere.ask", a.otherWhere(b), name), a.L.T("bridge.undo.keep"), a.L.T("peers.elsewhere.go"), b.Identity)
			if keep {
				a.bridgeHere = false
			}
			if goOn {
				a.bridgeHere = false
				b.State = "connecting"
				a.send(protocol.BridgeAction{T: "bridge_only_here"})
			}
		}
		return false
	case "ready":
		head(a.L.T("peers.head.ready"), sideMuted, func() {
			if a.buttonFor(c, a.L.T("bridge.connect"), b.Identity, btnPrimary, t.ControlSM, t.Surface) {
				b.State = "connecting"
				a.send(protocol.BridgeAction{T: "bridge_connect"})
			}
		})
		return false
	case "connecting", "disconnecting":
		head(a.bridgeNote(b), sideMuted, nil)
		return false
	}
	// no_space, refused, failed, unconfirmed: what Mem said, and what to try.
	line := a.bridgeNote(b)
	tryNewer := b.Newer != nil && (b.State == "refused" || b.State == "failed" || b.State == "unconfirmed")
	if tryNewer {
		line += "\n" + a.L.T("peers.mem.newer")
	}
	tone := sideFailed
	if b.State == "no_space" {
		tone = sideMuted
	}
	head(line, tone, func() {
		if tryNewer {
			toMemory()
		}
		if b.State == "unconfirmed" && a.quietDanger(c, "peers-undo", a.L.T("bridge.undo"), b.Identity) {
			b.State = "disconnecting"
			a.send(protocol.BridgeAction{T: "bridge_disconnect"})
		}
		if b.State != "no_space" && a.buttonFor(c, a.L.T("bridge.retry"), b.Identity, btnSecondary, t.ControlSM, t.Surface) {
			b.State = "connecting"
			a.send(protocol.BridgeAction{T: "bridge_connect"})
		}
	})
	return false
}
