package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D418: an own agent's contact tests answered by code are one line: how
// many, the earliest's send time, which answers went; the partner's line
// about them stands in for it (Told).
func TestOwnAgentPingsFoldIntoOneLine(t *testing.T) {
	s := New()
	in := func(seq int64, id, sent string) protocol.LogEvent {
		return ev(seq, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "in", MessageID: id, From: "another agent", Agent: "Codex", Role: "Mem 协作", SelfNamed: true, Mine: true, Text: "联络测试", SentAt: sent, State: "ping"})
	}
	out := func(seq int64, id, state string) protocol.LogEvent {
		return ev(seq, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "out", To: "another agent", Agent: "Codex", Mine: true, Text: "Ducter 已收到", InReplyTo: id, State: state, Ack: true})
	}
	s.Apply(events(
		in(1, "p1", "2026-11-17T07:40:00Z"), in(2, "p2", "2026-11-18T02:00:00Z"), in(3, "p3", "2026-11-19T09:00:00Z"),
		out(4, "p1", "sending"), out(5, "p1", "sent"), out(6, "p2", "sent"), out(7, "p3", "failed"),
	))
	if len(s.Channel) != 1 || s.Channel[0].Peer == nil {
		t.Fatalf("%d entries, want the one folded line", len(s.Channel))
	}
	g := s.Pings[s.Channel[0].Event.Seq]
	if g == nil || g.N != 3 || len(g.Sent) != 2 || len(g.Failed) != 1 || g.Earliest.Format("2006-01-02") != "2026-11-17" {
		t.Fatalf("group %+v", g)
	}
	s.Apply(events(ev(8, "channel", protocol.KindAIMsg, protocol.AIMsg{Text: "你的 Codex（Mem 协作）的 3 条联络测试刚到…", Pings: []string{"p1", "p2", "p3"}})))
	if !g.Told {
		t.Errorf("the partner's line should stand in for the quiet one")
	}
}
