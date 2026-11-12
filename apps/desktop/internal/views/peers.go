package views

import (
	"regexp"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The user's other agents (D170, design/bridge.md X1): agents Ducter didn't
// start that reach the partner through Nowledge Bridge. They show as their
// coin and their own name, never as Bridge words.

var piWord = regexp.MustCompile(`(?i)\bpi\b`)

// dayOf is a timestamp's date ("2026-11-10"), the key of a day's set-aside count.
func dayOf(ts string) string {
	if len(ts) < 10 {
		return ts
	}
	return ts[:10]
}

// peerHarness is the coin of an agent Ducter didn't start, from its name;
// a plain coin when the kind is unknown.
func peerHarness(agent string) string {
	l := strings.ToLower(agent)
	switch {
	case strings.Contains(l, "claude"):
		return "claude-code"
	case strings.Contains(l, "codex"):
		return "codex"
	case piWord.MatchString(agent):
		return "pi"
	}
	return "peer"
}

// peerWho is how the user hears of an agent: 你的 <agent> for their own.
func (a *App) peerWho(agent string, mine bool) string {
	if !mine {
		return agent
	}
	if a.L.Lang == i18n.ZH {
		return "你的 " + agent
	}
	return "your " + agent
}

// peerAskerRow stands where a task's title would on a card asked for one of
// the user's own agents: 你的 <agent> 问你 and where it works (no coin at
// this size, D213).
func (a *App) peerAskerRow(c *ui.Context, d *protocol.PeerAsk) {
	t := a.T
	ui.Row(c.Key("peer-asker")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("peer.asks", d.Agent)).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).MaxLines(1)
		if d.Where != "" {
			ui.Text(c, "· "+d.Where).FontSize(t.SM).TextColor(t.InkMuted).MaxLines(1)
		}
	})
}

// peerLineText is the one quiet line about the user's other agents (J-Q5's
// strings): a request came in, or a reply or a message went out.
func (a *App) peerLineText(b *protocol.BridgeMsg) string {
	agent := firstNonEmpty(b.Agent, b.From, b.To)
	if b.Direction == "in" {
		gist := strings.Join(strings.Fields(b.Text), " ")
		if r := []rune(gist); len(r) > 40 {
			gist = string(r[:39]) + "…"
		}
		if b.Mine {
			return a.L.T("peer.in", agent, gist)
		}
		return a.L.T("peer.in.other", agent, gist)
	}
	if b.DecisionID != "" {
		return a.L.T("peer.sent", a.peerWho(agent, b.Mine))
	}
	return a.L.T("peer.replied", a.peerWho(agent, b.Mine))
}

// bridgeNote is the line under the persona's connection row (D205), in its
// state: what 连上 will do, each step, Mem's refusal and the step in Mem.
func (a *App) bridgeNote(b *protocol.BridgeView) string {
	space := "Only me"
	if b.Space != nil && b.Space.Label != "" {
		space = b.Space.Label
	}
	switch b.State {
	case "ready":
		return a.L.T("bridge.ready", b.Identity, space)
	case "connecting":
		return a.L.T("bridge.connecting")
	case "disconnecting":
		return a.L.T("bridge.disconnecting")
	case "connected":
		if b.Pinned {
			return a.L.T("bridge.pinned")
		}
		return a.L.T("bridge.connected", b.Identity, space)
	case "no_space":
		return a.L.T("bridge.no_space")
	case "refused":
		r := b.Reason
		if r == "" {
			r = "control_denied"
		}
		return a.L.T("bridge.refused."+r, b.Identity)
	case "unconfirmed":
		return a.L.T("bridge.unconfirmed", b.Identity)
	}
	return a.L.T("bridge.failed", b.Detail)
}

// bridgeRow is the persona's own connection with the user's other AI agents
// (D205; Nowledge Bridge underneath, never named): 连上 runs the home's
// nmem on this tap; 断开 asks once, then runs. An older Mem: one line.
func (a *App) bridgeRow(c *ui.Context, st *protocol.Settings, b *protocol.BridgeView) {
	t := a.T
	if a.bridgeMemRow(c, st, b) {
		return
	}
	help := a.bridgeNote(b)
	if b.Space != nil && (b.State == "ready" || b.State == "connected") {
		help += "\n" + b.Identity + " · " + b.Space.Label + " · " + b.Space.ID
	}
	if b.State == "connected" && b.Detail != "" {
		help += "\n" + a.L.T("bridge.undo.failed", b.Detail)
	}
	canUndo := (b.State == "connected" && !b.Pinned) || b.State == "unconfirmed"
	if canUndo && a.bridgeConfirm {
		help += "\n" + a.L.T("bridge.undo.ask")
	}
	canTry := b.State == "ready" || b.State == "refused" || b.State == "failed" || b.State == "unconfirmed"
	busy := b.State == "connecting" || b.State == "disconnecting"
	help += a.memUpkeepHelp(b)
	upkeep := a.memUpkeepButton(c, b)
	a.row(c, "bridge", a.L.T("bridge.title", st.Name), help, func() {
		if upkeep != nil {
			upkeep()
		}
		if canUndo && a.bridgeConfirm && a.buttonFor(c, a.L.T("bridge.undo.keep"), b.Identity, btnText, t.ControlSM, t.Surface) {
			a.bridgeConfirm = false
		}
		if canUndo && a.buttonFor(c, a.L.T("bridge.undo"), b.Identity, btnSecondary, t.ControlSM, t.Surface) {
			if !a.bridgeConfirm {
				a.bridgeConfirm = true
			} else {
				a.bridgeConfirm = false
				b.State = "disconnecting"
				a.send(protocol.BridgeAction{T: "bridge_disconnect"})
			}
		}
		if canTry {
			label, kind := a.L.T("bridge.retry"), btnSecondary
			if b.State == "ready" {
				label, kind = a.L.T("bridge.connect"), btnPrimary
			}
			if a.buttonFor(c, label, b.Identity, kind, t.ControlSM, t.Surface) {
				b.State = "connecting"
				a.send(protocol.BridgeAction{T: "bridge_connect"})
			}
		}
		if busy {
			label := a.L.T("bridge.connecting")
			if b.State == "disconnecting" {
				label = a.L.T("bridge.disconnecting")
			}
			ui.Text(c, label).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
}

// memFailed is D229's failed install or update: one plain sentence, whether
// the old copy still works, and the installer's own words last.
func (a *App) memFailed(install bool, home, detail string, kept bool) string {
	line := a.L.T("bridge.mem.update.failed")
	if install {
		line = a.L.T("bridge.mem.install.failed")
	}
	if kept {
		line += " " + a.L.T("bridge.mem.kept")
	}
	return line + "\n" + a.L.T("bridge.mem.detail", detail)
}

// memUpkeepHelp is D229's quiet line under a working row: just done (a warm
// word), or the one thing worth doing to the home's Mem (move, update).
func (a *App) memUpkeepHelp(b *protocol.BridgeView) string {
	if b.Done != "" {
		return "\n" + a.L.T("bridge.mem.done."+b.Done, b.Home)
	}
	if b.Upkeep == nil {
		return ""
	}
	if b.Upkeep.Kind == "move" {
		// The how (pipx, the system Python's mark) stays off the row: plain words only.
		line := "\n" + a.L.T("bridge.mem.upkeep.move", b.Home)
		if b.Upkeep.Detail != "" {
			return line + "\n" + a.memFailed(false, b.Home, b.Upkeep.Detail, b.Upkeep.Kept)
		}
		return line
	}
	line := "\n" + a.L.T("bridge.mem.upkeep.update", b.Home)
	if b.Upkeep.Detail != "" {
		line += "\n" + a.memFailed(false, b.Home, b.Upkeep.Detail, b.Upkeep.Kept)
	}
	return line
}

// memUpkeepButton is the upkeep's one tap (换一下 / 更新, or 再试一次);
// nil when there is nothing to do.
func (a *App) memUpkeepButton(c *ui.Context, b *protocol.BridgeView) func() {
	if b.Done != "" || b.Upkeep == nil {
		return nil
	}
	return func() {
		t := a.T
		label := a.L.T("bridge.mem.update.go")
		if b.Upkeep.Kind == "move" {
			label = a.L.T("bridge.mem.upkeep.move.go")
		}
		if b.Upkeep.Detail != "" {
			label = a.L.T("bridge.retry")
		}
		if a.buttonFor(c, label, b.Home, btnSecondary, t.ControlSM, t.Surface) {
			b.State = "updating"
			b.Upkeep = &protocol.BridgeUpkeep{Kind: b.Upkeep.Kind}
			a.send(protocol.BridgeAction{T: "bridge_mem_install"})
		}
	}
}

// memSetup: the row's states before the home's Mem can connect anyone (D225).
func memSetup(state string) bool {
	switch state {
	case "install_mem", "installing", "update_mem", "updating", "sign_in", "signing_in", "local_mem":
		return true
	}
	return false
}

// bridgeMemRow is D225's first part of the row: the home's own Nowledge Mem
// command line put in, updated or signed in, with one tap each. It reports
// whether it drew the row.
func (a *App) bridgeMemRow(c *ui.Context, st *protocol.Settings, b *protocol.BridgeView) bool {
	t := a.T
	const min = "0.10.118"
	title := a.L.T("bridge.title", st.Name)
	switch b.State {
	case "install_mem", "installing", "update_mem", "updating":
		install := b.State == "install_mem" || b.State == "installing"
		busy := b.State == "installing" || b.State == "updating"
		var line string
		switch {
		case b.State == "installing":
			line = a.L.T("bridge.mem.installing", b.Home)
		case b.State == "updating" && b.Upkeep != nil && b.Upkeep.Kind == "move":
			line = a.L.T("bridge.mem.moving", b.Home)
		case b.State == "updating":
			line = a.L.T("bridge.mem.updating", b.Home)
		case install && b.CanRun:
			line = a.L.T("bridge.mem.install", b.Home)
		case install:
			line = a.L.T("bridge.mem.install.need", b.Home)
		case b.CanRun && b.Upkeep != nil && b.Upkeep.Kind == "move":
			line = a.L.T("bridge.mem.update.move", b.Home, b.Version, min)
		case b.CanRun:
			line = a.L.T("bridge.mem.update", b.Home, b.Version, min)
		case b.Need == "app" || b.Version == "":
			// The app's copy, or a core from before D225: update it there.
			line = a.L.T("bridge.update", b.Home)
		default:
			line = a.L.T("bridge.mem.update.other", b.Home, b.Version, min)
		}
		help := line
		if b.Detail != "" && !busy {
			help += "\n" + a.memFailed(install, b.Home, b.Detail, b.Kept)
		}
		if install && !b.CanRun && !busy {
			help += "\n" + a.L.T("bridge.mem.install.need.how")
		}
		a.row(c, "bridge", title, help, func() {
			if busy {
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted)
				return
			}
			if !b.CanRun && !install {
				return
			}
			label, kind := a.L.T("bridge.mem.update.go"), btnPrimary
			if !install && b.Detail != "" {
				label = a.L.T("bridge.retry")
			}
			if install {
				label = a.L.T("bridge.mem.install.go")
				if !b.CanRun {
					label, kind = a.L.T("bridge.retry"), btnSecondary
				}
			}
			if a.buttonFor(c, label, b.Home, kind, t.ControlSM, t.Surface) {
				if b.State == "update_mem" {
					b.State = "updating"
				} else {
					b.State = "installing"
				}
				a.send(protocol.BridgeAction{T: "bridge_mem_install"})
			}
		})
		return true
	case "sign_in", "signing_in":
		busy := b.State == "signing_in"
		help := a.L.T("bridge.mem.signin", b.Home)
		if b.Done != "" {
			help = a.L.T("bridge.mem.done."+b.Done, b.Home) + "\n" + help
		}
		switch b.SignIn {
		case "used":
			help += "\n" + a.L.T("bridge.mem.signin.used")
		case "bad":
			help += "\n" + a.L.T("bridge.mem.signin.bad")
		case "failed":
			help += "\n" + a.L.T("bridge.mem.signin.failed", b.Detail)
		}
		a.row(c, "bridge", title, help, func() {
			a.field(c, "bridge-link", a.L.T("bridge.mem.signin.link"), &a.bridgeLink, "https://…?nmem_connect=…", "")
			label := a.L.T("bridge.mem.signin.go")
			if busy {
				label = a.L.T("bridge.mem.signin.busy")
			}
			if a.buttonFor(c, label, b.Home, btnPrimary, t.ControlSM, t.Surface) && !busy && strings.TrimSpace(a.bridgeLink) != "" {
				b.State = "signing_in"
				a.send(protocol.BridgeMemSignIn{T: "bridge_mem_sign_in", Link: strings.TrimSpace(a.bridgeLink)})
				a.bridgeLink = ""
			}
		})
		return true
	case "local_mem":
		a.row(c, "bridge", title, a.L.T("bridge.mem.local", b.Home)+a.memUpkeepHelp(b), a.memUpkeepButton(c, b))
		return true
	}
	return false
}

// peersCard is Settings › 伙伴's "your other AI agents" (D170): who may reach
// the partner, the rules it learned about them, and whom the user stopped
// listening to. D205: always there once the home's Mem can connect the
// persona (or needs updating to); before that, only once another agent has
// written (J6). 断开 ends it all; 谁都不行 lets no other agent reach the
// partner while what the user sends on a card still goes.
func (a *App) peersCard(c *ui.Context, st *protocol.Settings) {
	if st == nil || st.Peers == nil {
		return
	}
	p := st.Peers
	b := a.S.Bridge
	seen := false
	for _, e := range a.S.Channel {
		if e.Peer != nil {
			seen = true
			break
		}
	}
	if b == nil && !seen && len(p.Trusted) == 0 && len(p.Muted) == 0 {
		return
	}
	if b != nil && b.State != "connected" {
		a.bridgeConfirm = false
	}
	reachShown := seen || len(p.Trusted) > 0 || len(p.Muted) > 0 || (b != nil && !memSetup(b.State))
	t := a.T
	set := func(next protocol.Peers) {
		*p = next
		a.SetSettings(protocol.SettingsPatch{Peers: &next})
	}
	a.group(c, "peers", a.L.T("peers.title"), "", func() {
		if b != nil {
			a.bridgeRow(c, st, b)
		}
		if !reachShown {
			return
		}
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
			reachNote = a.L.T("peers.reach.off.note", st.Name)
		}
		a.row(c, "reach", a.L.T("peers.reach", st.Name), reachNote, func() {
			if i := a.choices(c, "reach", a.L.T("peers.reach", st.Name), labels, sel); i >= 0 {
				next := *p
				next.Reach = reaches[i]
				set(next)
			}
		})
		for _, agent := range p.Trusted {
			agent := agent
			a.row(c, "trusted:"+agent, a.L.T("peers.trusted", agent), a.L.T("peers.trusted.why"), func() {
				if a.buttonFor(c, a.L.T("peers.trusted.stop"), agent, btnText, t.ControlSM, t.Surface) {
					next := *p
					next.Trusted = without(p.Trusted, agent)
					set(next)
				}
			})
		}
		for _, agent := range p.Muted {
			agent := agent
			a.row(c, "muted:"+agent, a.L.T("peers.muted", agent), "", func() {
				if a.buttonFor(c, a.L.T("peers.muted.undo"), agent, btnText, t.ControlSM, t.Surface) {
					next := *p
					next.Muted = without(p.Muted, agent)
					set(next)
				}
			})
		}
	})
}

// without is list less one name.
func without(list []string, name string) []string {
	out := []string{}
	for _, x := range list {
		if x != name {
			out = append(out, x)
		}
	}
	return out
}

// peerAsked: a card was asked for this message (X1), so its request line
// doesn't show as well.
func (a *App) peerAsked(messageID string) bool {
	for _, d := range a.S.Decisions {
		if d.Asker != nil && d.Asker.MessageID == messageID {
			return true
		}
	}
	return false
}

// peerLine draws that line, small and centred, with the agent's coin.
func (a *App) peerLine(c *ui.Context, b *protocol.BridgeMsg, setAside int) {
	t := a.T
	text := a.peerLineText(b)
	if b.State == "set_aside" {
		text = a.L.T("peer.set_aside", a.peerWho(firstNonEmpty(b.Agent, b.From), b.Mine), itoa(int64(setAside)))
	}
	ui.Row(c).Justify(ui.Center).Children(func() {
		ui.Row(c).Gap(t.S1+2).AlignItems(ui.Center).Padding(3, t.S3).Radius(999).Background(t.SurfaceSunken).Children(func() {
			ui.Text(c, text).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(1)
		})
	})
}
