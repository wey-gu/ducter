package views

import (
	"regexp"
	"strings"

	"github.com/egoist/mygo/ui"
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

// peerWho is how the user hears of an agent Ducter didn't start (D273): by
// what it is, its own name ("Claude Code"), never 你的 / other; when Mem
// didn't say who sent it, 一个 AI agent / an AI agent.
func (a *App) peerWho(agent string) string {
	if agent == "" || agent == "another agent" {
		return a.L.T("peer.someone")
	}
	return agent
}

// capPeer starts a line "An AI agent …"; an agent's own name stays as it is.
func capPeer(s string) string {
	if strings.HasPrefix(s, "an AI agent") {
		return "A" + s[1:]
	}
	return s
}

// peerAskerRow stands where a task's title would on a card asked for one of
// the user's own agents (D273): "Claude Code（~/dev/ducter）问你" (no coin at
// this size, D213).
func (a *App) peerAskerRow(c *ui.Context, d *protocol.PeerAsk) {
	t := a.T
	text := a.L.T("peer.asks", a.peerWho(d.Agent))
	if d.Where != "" {
		text = a.L.T("peer.asks.where", a.peerWho(d.Agent), d.Where)
	}
	ui.Row(c.Key("peer-asker")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		ui.Text(c, capPeer(text)).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).MaxLines(1)
	})
}

// peerLineText is the one quiet line about an agent Ducter didn't start
// (J-Q5's strings): a request came in, or a reply or a message went out.
func (a *App) peerLineText(b *protocol.BridgeMsg) string {
	who := a.peerWho(firstNonEmpty(b.Agent, b.From, b.To))
	if b.Direction == "in" {
		gist := strings.Join(strings.Fields(b.Text), " ")
		if r := []rune(gist); len(r) > 40 {
			gist = string(r[:39]) + "…"
		}
		return capPeer(a.L.T("peer.in.other", who, gist))
	}
	if b.DecisionID != "" {
		return a.L.T("peer.sent", who)
	}
	return a.L.T("peer.replied", who)
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

// memSetup: the row's states before the home's Mem can connect anyone (D225).
func memSetup(state string) bool {
	switch state {
	case "install_mem", "installing", "update_mem", "updating", "sign_in", "signing_in", "local_mem":
		return true
	}
	return false
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
		text = capPeer(a.L.T("peer.set_aside", a.peerWho(firstNonEmpty(b.Agent, b.From)), itoa(int64(setAside))))
	}
	ui.Row(c).Justify(ui.Center).Children(func() {
		ui.Row(c).Gap(t.S1+2).AlignItems(ui.Center).Padding(3, t.S3).Radius(999).Background(t.SurfaceSunken).Children(func() {
			ui.Text(c, text).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(1)
		})
	})
}
