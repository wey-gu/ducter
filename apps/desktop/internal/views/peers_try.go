package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D321, D332: 和你的其他 agent 通信's 最近 / Recently and 试试看 / Try it once the link
// is on: what came and went lately (both ways), the exact words for the
// terminal (J1, X1) and for here (S2), each copyable; each agent that can't
// hear them yet. And the conversation's one-time note under the first
// message from another agent. The web's: PeersRecent, PeersTry and
// FirstPeerNote (apps/web/src).

// firstPeer is the first message another agent sent, nil when none came yet.
func (a *App) firstPeer() *protocol.BridgeMsg {
	for _, e := range a.S.Channel {
		if e.Peer != nil && e.Peer.Direction == "in" {
			return e.Peer
		}
	}
	return nil
}

// drawCopy is two overlapping rounded sheets: copy.
func drawCopy(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		x0, y0, x1, y1, k := cx-2.5, cy-2.5, cx+5.5, cy+5.5, float32(2)
		var m ui.Path
		m.MoveTo(x0+k, y0)
		m.LineTo(x1-k, y0)
		m.QuadTo(x1, y0, x1, y0+k)
		m.LineTo(x1, y1-k)
		m.QuadTo(x1, y1, x1-k, y1)
		m.LineTo(x0+k, y1)
		m.QuadTo(x0, y1, x0, y1-k)
		m.LineTo(x0, y0+k)
		m.QuadTo(x0, y0, x0+k, y0)
		m.Close()
		p.StrokePath(&m, 1.6, col)
		var n ui.Path
		n.MoveTo(cx+2.5, cy-4.5)
		n.LineTo(cx+2.5, cy-5)
		n.QuadTo(cx+2.5, cy-6.5, cx+1, cy-6.5)
		n.LineTo(cx-4, cy-6.5)
		n.QuadTo(cx-5.5, cy-6.5, cx-5.5, cy-5)
		n.LineTo(cx-5.5, cy)
		n.QuadTo(cx-5.5, cy+1.5, cx-4, cy+1.5)
		n.LineTo(cx-3.5, cy+1.5)
		p.StrokePath(&n, 1.6, col)
	}
}

// exchange is one example exchange (D332), a tiny conversation: who you
// say it to, the sentence in your own bubble with a small copy button
// (复制这句 → 已复制), a small arrow, then the partner and what it does.
func (a *App) exchange(c *ui.Context, key, to, words, then string) {
	t := a.T
	ps := &a.memPage
	copied := ps.copied == key && a.Now().Sub(ps.copiedAt) < 1600*time.Millisecond
	if copied {
		c.After(1600*time.Millisecond - a.Now().Sub(ps.copiedAt))
	}
	ui.Column(c.Key("ex:" + key)).Gap(6).Grow(1).Basis(240).MinWidth(0).Children(func() {
		ui.Text(c, to).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft)
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Row(c).Padding(t.S2+2, t.S3+2).Radius(t.RadiusLG).Background(t.UserBubble).Grow(1).Basis(0).MinWidth(0).Children(func() {
				ui.Text(c, autospace(words)).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.OnUserBubble).Selectable().Grow(1).Basis(0).MinWidth(0)
			})
			label, draw, ink := a.L.T("peers.try.copy"), drawCopy, t.InkMuted
			if copied {
				label, draw, ink = a.L.T("peers.try.copied"), drawCheck, t.Done.Ink
			}
			if a.iconButton(c, label, 32, btnText, func(ui.Color) func(p *ui.Painter, r ui.Rect) { return draw(ink) }) {
				c.WriteClipboard(words)
				ps.copied, ps.copiedAt = key, a.Now()
			}
		})
		ui.Box(c).Width(12).Height(16).Margin(0, 0, 0, t.S4).AccessHidden(true).Draw(drawDown(t.InkMuted))
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.avatar(c, theme.Idle, 22)
			ui.Text(c, then).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft).Grow(1).Basis(0).MinWidth(0)
		})
	})
}

// handoffDot is the live row's mark while it waits: the working dot,
// breathing (still under Reduce Motion).
func (a *App) handoffDot(c *ui.Context) func() {
	t := a.T
	return func() {
		alpha := float32(1)
		if !c.Preferences().ReduceMotion {
			ph := float64(a.Now().UnixMilli()%2400) / 2400
			alpha = float32(0.35 + 0.65*(0.5-0.5*math.Cos(2*math.Pi*ph)))
			c.After(80 * time.Millisecond)
		}
		ui.Box(c.Key("handoff-dot")).Size(10, 10).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			p.Fill(r, t.Working.Dot.Alpha(alpha), 5)
		})
	}
}

// peersRecent is 最近 / Recently (D332): the latest exchanges both ways,
// newest first, each opening its task or the conversation; before the
// first one, a calm row that waits for it.
func (a *App) peersRecent(c *ui.Context, name string) {
	t := a.T
	list := recentHandoffs(a.S.Channel, 5)
	a.group(c, "peers-recent", a.L.T("peers.recent.title"), "", func() {
		if len(list) == 0 {
			a.tileRow(c, "peers-wait", a.handoffDot(c), a.L.T("peers.wait.title"), a.L.T("peers.wait.line"), nil)
			return
		}
		for _, h := range list {
			h := h
			var age func()
			if s := a.agoLong(h.At); s != "" {
				age = func() { ui.Text(c, s).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted).SingleLine() }
			}
			who := a.peerWho(h.Agent)
			if a.openRow(c, "handoff:"+itoa(h.Seq), a.toolTile(c, peerName(who)), autospace(h.Words), a.L.T("peers.recent."+h.Way, who, name), t.InkMuted, false, age) {
				if h.TaskID != "" {
					a.OpenTask(h.TaskID)
				} else {
					a.Route = RouteConversation
				}
			}
		}
	})
}

// peersTry is 试试看 (D321, D332): two example exchanges, one each way, as
// a tiny conversation; then each agent missing Mem's plugin, one row with
// its fix (装上), in a group of its own.
func (a *App) peersTry(c *ui.Context, name string) {
	t := a.T
	a.group(c, "peers-try", a.L.T("peers.try.title"), "", func() {
		a.textBlock(c, "try-ex", func() {
			ui.Row(c).Gap(t.S4).Wrap().AlignItems(ui.Start).Children(func() {
				a.exchange(c, "work", a.L.T("peers.try.work.to"), a.L.T("peers.try.work", name), a.L.T("peers.try.work.then", name))
				a.exchange(c, "here", a.L.T("peers.try.here.to", name), a.L.T("peers.try.here"), a.L.T("peers.try.here.then", name))
			})
		})
	})
	var missing []tryAgent
	for _, x := range tryAgents(a.S.Devices) {
		if x.Plugin == "off" && x.Device != "" {
			missing = append(missing, x)
		}
	}
	if len(missing) == 0 {
		return
	}
	a.group(c, "peers-plugin", "", "", func() {
		for _, x := range missing {
			x := x
			tool := "Claude Code"
			if x.Harness == "codex" {
				tool = "Codex"
			}
			a.tileRow(c, "try-agent:"+x.Harness, a.toolTile(c, tool), tool, a.L.T("peers.try.plugin.off", name), func() {
				if a.buttonFor(c, a.L.T("peers.try.plugin.go"), x.DeviceName, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: x.Device, Harness: x.Harness})
				}
			})
		}
	})
}

// firstPeerNote is the conversation's one-time note under the first message
// from another agent (or before its card): who, how, and where answers go.
func (a *App) firstPeerNote(c *ui.Context, b *protocol.BridgeMsg) {
	t := a.T
	who := a.peerWho(firstNonEmpty(b.Agent, b.From))
	ui.Row(c.Key("peer-first")).Justify(ui.Center).Padding(t.S2, 0, t.S3, 0).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Start).MaxWidth(560).Padding(t.S3, t.S4).Radius(t.RadiusLG).Background(t.SurfaceSunken).Children(func() {
			a.toolTile(c, peerName(who))()
			ui.Text(c, autospace(a.L.T("peer.first.note", who, a.personaName()))).FontSize(t.SM).LineHeight(a.leading(1.6)).TextColor(t.InkSoft).Grow(1).Basis(0).MinWidth(0)
		})
	})
}
