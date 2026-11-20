package views

import (
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
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

// peerCalled is what an agent Ducter didn't start is called, in this
// order (web: mem-view.ts peerCalled): its own name in Mem (the sender's
// agent, else the readable sender, or the recipient going out), else the
// tool it runs in when Mem says (host), else nothing. nmem stores a sender
// it can't name as "another agent"; that is no name.
func peerCalled(b *protocol.BridgeMsg) (name, host string) {
	other := b.From
	if b.Direction != "in" {
		other = b.To
	}
	for _, x := range []string{b.Agent, other} {
		if strings.TrimSpace(x) != "" && x != "another agent" {
			return x, ""
		}
	}
	return "", b.Host
}

// peerWho is how the user hears of an agent Ducter didn't start (D273): by
// what it is, its own name ("Claude Code"), never 你的 / other; when Mem
// didn't name it, the tool it runs in (Claude Code 里的 agent / an agent in
// Claude Code), else 一个没留名字的 agent / an unnamed agent.
func (a *App) peerWho(agent string) string {
	return a.peerCalledText(agent, "")
}

// peerWhoOf is peerWho for a message, with the tool it runs in. D418: one
// of the person's own agents named by its own words reads as theirs (你的
// Codex（Mem 协作）); one Mem names in no way is 你自己的一个 agent.
func (a *App) peerWhoOf(b *protocol.BridgeMsg) string {
	if b.Mine && b.SelfNamed && b.Agent != "" {
		if b.Role != "" {
			return a.L.T("peer.yours.role", b.Agent, b.Role)
		}
		return a.L.T("peer.yours", b.Agent)
	}
	name, host := peerCalled(b)
	if b.Mine && name == "" && host == "" {
		return a.L.T("peer.own.someone")
	}
	return a.peerCalledText(name, host)
}

// pingText is the folded line for an own agent's contact tests (D418): how
// many, the earliest's age when late, and whether they were answered.
func (a *App) pingText(who string, g *store.PingGroup, ts string) string {
	status := a.L.T("peer.ping.answered.one")
	switch {
	case len(g.Failed) > 0 && len(g.Failed) == g.N:
		status = a.L.T("peer.ping.failed")
	case len(g.Failed) > 0:
		status = a.L.T("peer.ping.failed.some", len(g.Failed))
	case len(g.Sent) < g.N:
		status = a.L.T("peer.ping.answering")
	case g.N > 1:
		status = a.L.T("peer.ping.answered.many")
	}
	late := ""
	if at := store.ParseTime(ts); !g.Earliest.IsZero() && at.Sub(g.Earliest) >= time.Hour {
		d := a.Now().Sub(g.Earliest)
		if d >= 36*time.Hour {
			late = a.L.T("time.ago.day", int(d.Hours()/24+0.5))
		} else {
			late = a.L.T("time.ago.hour", int(d.Hours()))
		}
	}
	switch {
	case g.N > 1 && late != "":
		return a.L.T("peer.ping.many.late", who, g.N, late, status)
	case g.N > 1:
		return a.L.T("peer.ping.many", who, g.N, status)
	case late != "":
		return a.L.T("peer.ping.one.late", who, late, status)
	}
	return a.L.T("peer.ping.one", who, status)
}

func (a *App) peerCalledText(name, host string) string {
	switch {
	case name != "" && name != "another agent":
		return name
	case host != "":
		return a.L.T("peer.in.host", host)
	}
	return a.L.T("peer.someone")
}

// capPeer starts a line "An unnamed agent …" or "An agent in …"; an
// agent's own name stays as it is.
func capPeer(s string) string {
	s = strings.ReplaceAll(s, "） ", "）")
	for _, p := range []string{"an unnamed agent", "an agent in ", "your ", "one of your own "} {
		if strings.HasPrefix(s, p) {
			return strings.ToUpper(s[:1]) + s[1:]
		}
	}
	return s
}

// peerTile is another agent's tile (最近, the first note): its tool's coin
// or mark by its name or the tool it runs in, else the drawn agent on the
// sunken pebble a letter sits on, never a minus or a remove button.
func (a *App) peerTile(c *ui.Context, name, host string) func() {
	if name != "" && name != "another agent" {
		return a.toolTile(c, peerName(name))
	}
	if host != "" {
		return a.toolTile(c, host)
	}
	t := a.T
	return func() {
		ui.Row(c.Key("peer-agent-tile")).Size(36, 36).Shrink(0).Radius(18).Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).
			Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			a.glyph(c, 20, drawAgent(t.InkSoft))
		})
	}
}

// drawAgent is an agent with no name and no tool: a rounded head, two eyes
// and a short antenna (web: memory.tsx AgentMark).
func drawAgent(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 20
		x, y := r.X, r.Y
		w := 1.7 * s
		var ant ui.Path
		ant.MoveTo(x+10*s, y+2.6*s).LineTo(x+10*s, y+5.2*s).Cap(ui.RoundCap)
		p.StrokePath(&ant, w, col)
		var tip ui.Path
		tip.Circle(x+10*s, y+2.3*s, 0.9*s)
		p.FillPath(&tip, col)
		var head ui.Path
		roundRect(&head, x+3.6*s, y+5.6*s, 12.8*s, 10.4*s, 4*s)
		p.StrokePath(&head, w, col)
		for _, ex := range []float32{7.6, 12.4} {
			var eye ui.Path
			eye.Circle(x+ex*s, y+10.6*s, 1.15*s)
			p.FillPath(&eye, col)
		}
	}
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
		uiText(c, capPeer(text)).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).MaxLines(1)
	})
}

// peerLineText is the one quiet line about an agent Ducter didn't start
// (J-Q5's strings): a request came in, or a reply or a message went out.
func (a *App) peerLineText(b *protocol.BridgeMsg) string {
	who := a.peerWhoOf(b)
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
		return a.L.TFamily("bridge.refused."+r, b.Identity)
	case "unconfirmed":
		return a.L.T("bridge.unconfirmed", b.Identity)
	}
	if k, ok := failedDetails[b.Detail]; ok {
		return a.L.T(k)
	}
	return a.L.T("bridge.failed", b.Detail)
}

// failedDetails (D404): the home's own words for a failed connect
// (bridge-link.ts), said in the person's language rather than shown raw.
var failedDetails = map[string]string{
	"Mem answered with another identity or place": "bridge.failed.identity",
	"nmem didn't start":                           "bridge.failed.nostart",
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
	case "install_mem", "installing", "update_mem", "updating", "sign_in", "signing_in", "mem_closed", "local_mem":
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
func (a *App) peerLine(c *ui.Context, b *protocol.BridgeMsg, setAside int, ping *store.PingGroup, ts string) {
	t := a.T
	text := a.peerLineText(b)
	lines := 1
	if b.State == "set_aside" {
		text = capPeer(a.L.T("peer.set_aside", a.peerWhoOf(b), itoa(int64(setAside))))
	}
	if b.State == "ping" && ping != nil {
		text = capPeer(a.pingText(a.peerWhoOf(b), ping, ts))
		lines = 2 // D418: its facts wrap, never cut
	}
	ui.Row(c).Justify(ui.Center).Children(func() {
		ui.Row(c).Gap(t.S1+2).AlignItems(ui.Center).Padding(3, t.S3).Radius(999).Background(t.SurfaceSunken).Children(func() {
			uiText(c, text).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(lines)
		})
	})
}
