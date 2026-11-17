package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D321: 连上的 AI agent's 试试看 / Try it once the link is on: the exact words
// for the terminal (J1, X1) and for here (S2), each copyable; whether each
// agent can hear them (Mem's plugin in it); a live row that waits for the
// first hand-off, then says it worked (with the way to it), then is gone.
// And the conversation's one-time note under the first message from another
// agent. The web's: PeersTry and FirstPeerNote (apps/web/src).

// firstPeer is the first message another agent sent, nil when none came yet.
func (a *App) firstPeer() *protocol.BridgeMsg {
	for _, e := range a.S.Channel {
		if e.Peer != nil && e.Peer.Direction == "in" {
			return e.Peer
		}
	}
	return nil
}

// firstPeerAt is when that first message came ("" when none).
func (a *App) firstPeerAt() string {
	for _, e := range a.S.Channel {
		if e.Peer != nil && e.Peer.Direction == "in" {
			return e.Event.TS
		}
	}
	return ""
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

// peersTry is 试试看 under the link's group.
func (a *App) peersTry(c *ui.Context, name string) {
	t := a.T
	first := a.firstPeerAt()
	phase := handoffPhase(first, a.Now())
	if phase == "first" {
		if at, err := time.Parse(time.RFC3339Nano, first); err == nil {
			c.After(at.Add(firstFresh).Sub(a.Now()) + time.Second)
		}
	}
	a.group(c, "peers-try", a.L.T("peers.try.title"), a.L.T("peers.try.note"), func() {
		a.textBlock(c, "try-terminal", func() {
			a.saySlab(c, "work", a.L.T("peers.try.work.what"), a.L.T("peers.try.work", name), true)
			a.saySlab(c, "ask", a.L.T("peers.try.ask.what"), a.L.T("peers.try.ask", name), true)
		})
		for _, x := range tryAgents(a.S.Devices) {
			x := x
			tool := "Claude Code"
			if x.Harness == "codex" {
				tool = "Codex"
			}
			line := a.L.T("peers.try.plugin.unknown")
			switch x.Plugin {
			case "on":
				line = a.L.T("peers.try.plugin.on")
			case "off":
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
		switch phase {
		case "waiting":
			a.tileRow(c, "try-wait", a.handoffDot(c), a.L.T("peers.wait.title"), a.L.T("peers.wait.line"), nil)
		case "first":
			who := a.peerWho("")
			if m := a.firstPeer(); m != nil {
				who = a.peerWho(firstNonEmpty(m.Agent, m.From))
			}
			a.tileRow(c, "try-first", a.glyphTile(c, 18, drawCheck(t.Done.Ink)), a.L.T("peers.first.title", who, name), a.L.T("peers.first.line"), func() {
				if a.button(c, a.L.T("peers.first.open"), btnSecondary, t.ControlSM, t.Surface) {
					a.Route = RouteConversation
				}
			})
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
