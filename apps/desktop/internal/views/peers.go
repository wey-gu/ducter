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
// the user's own agents: its coin, 你的 <agent> 问你, and where it works.
func (a *App) peerAskerRow(c *ui.Context, d *protocol.PeerAsk, open bool) {
	t := a.T
	m := coinStill
	if open {
		m = coinWaiting
	}
	ui.Row(c.Key("peer-asker")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		a.coinBox(c, "peer:"+d.MessageID, peerHarness(d.Agent), 22, false, m)
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

// peersCard is Settings › 伙伴's "your other AI agents" (D170): who may reach
// the partner, the rules it learned about them, and whom the user stopped
// listening to. Shown only once another agent has written (J6).
func (a *App) peersCard(c *ui.Context, st *protocol.Settings) {
	if st == nil || st.Peers == nil {
		return
	}
	p := st.Peers
	seen := false
	for _, e := range a.S.Channel {
		if e.Peer != nil {
			seen = true
			break
		}
	}
	if !seen && len(p.Trusted) == 0 && len(p.Muted) == 0 {
		return
	}
	t := a.T
	set := func(next protocol.Peers) {
		*p = next
		a.SetSettings(protocol.SettingsPatch{Peers: &next})
	}
	a.group(c, "peers", a.L.T("peers.title"), "", func() {
		reaches := []string{"own", "team", "off"}
		labels := []string{a.L.T("peers.reach.own"), a.L.T("peers.reach.team"), a.L.T("peers.reach.off")}
		sel := 0
		for i, r := range reaches {
			if r == p.Reach {
				sel = i
			}
		}
		a.row(c, "reach", a.L.T("peers.reach", st.Name), a.L.T("peers.reach.note"), func() {
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
			a.coinBox(c, "peerline", peerHarness(firstNonEmpty(b.Agent, b.From, b.To)), 16, false, coinStill)
			ui.Text(c, text).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(1)
		})
	})
}
