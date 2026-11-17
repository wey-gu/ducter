package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D321, D332: 终端里的 AI's 最近 / Recently and 试试看 / Try it once the link
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

// saySlab is one thing to say, exactly: what it does, then the words on a
// sunken slab (the prompt mark when they go to a terminal) and 复制.
func (a *App) saySlab(c *ui.Context, key, what, words string, terminal bool) {
	t := a.T
	ps := &a.memPage
	copied := ps.copied == key && a.Now().Sub(ps.copiedAt) < 2*time.Second
	if copied {
		c.After(2*time.Second - a.Now().Sub(ps.copiedAt))
	}
	ui.Column(c.Key("say:" + key)).Gap(6).Children(func() {
		ui.Text(c, what).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft)
		ui.Row(c).Gap(t.S2).Padding(t.S2, t.S2, t.S2, t.S3).MinHeight(48).AlignItems(ui.Center).
			Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
			if terminal {
				a.glyph(c, 16, drawPrompt(t.Accent))
			}
			ui.Text(c, autospace(words)).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.Ink).Selectable().Grow(1).Basis(0).MinWidth(0)
			label := a.L.T("peers.try.copy")
			if copied {
				label = a.L.T("peers.try.copied")
			}
			if a.quietButton(c, "say-copy:"+key, label, words, false, 0) {
				c.WriteClipboard(words)
				ps.copied, ps.copiedAt = key, a.Now()
			}
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
			if a.openRow(c, "handoff:"+itoa(h.Seq), a.toolTile(c, peerName(who)), autospace(h.Words), a.L.T("peers.recent."+h.Way, who), t.InkMuted, false, age) {
				if h.TaskID != "" {
					a.OpenTask(h.TaskID)
				} else {
					a.Route = RouteConversation
				}
			}
		}
	})
}

// peersTry is 试试看 (D321, D332): the exact words for the terminal (J1,
// X1) and for here (S2), each copyable, and each agent that can't hear them
// yet (Mem's plugin missing: 装上).
func (a *App) peersTry(c *ui.Context, name string) {
	t := a.T
	a.group(c, "peers-try", a.L.T("peers.try.title"), a.L.T("peers.try.note"), func() {
		a.textBlock(c, "try-terminal", func() {
			a.saySlab(c, "work", a.L.T("peers.try.work.what"), a.L.T("peers.try.work", name), true)
			a.saySlab(c, "ask", a.L.T("peers.try.ask.what"), a.L.T("peers.try.ask", name), true)
		})
		for _, x := range tryAgents(a.S.Devices) {
			x := x
			if x.Plugin == "on" {
				continue
			}
			tool := "Claude Code"
			if x.Harness == "codex" {
				tool = "Codex"
			}
			line := a.L.T("peers.try.plugin.unknown")
			if x.Plugin == "off" {
				line = a.L.T("peers.try.plugin.off", name)
			}
			var control func()
			if x.Plugin == "off" && x.Device != "" {
				control = func() {
					if a.buttonFor(c, a.L.T("peers.try.plugin.go"), x.DeviceName, btnSecondary, t.ControlSM, t.Surface) {
						a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: x.Device, Harness: x.Harness})
					}
				}
			}
			a.tileRow(c, "try-agent:"+x.Harness, a.toolTile(c, tool), tool, line, control)
		}
		a.textBlock(c, "try-here", func() {
			a.saySlab(c, "here", a.L.T("peers.try.here.what", name), a.L.T("peers.try.here"), false)
		})
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
