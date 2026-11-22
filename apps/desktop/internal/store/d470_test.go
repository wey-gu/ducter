package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D470 round 2: hel's Log (2026-11-22, read only) held one reply to the person's own Claude Code as two
// bridge_msg out events six seconds apart (same words, same inReplyTo) while Mem held one delivered reply.
// One delivered message is one line, whether the second is the same op or another (web: d470.test.ts).
func TestD470OneDeliveredReplyOneLine(t *testing.T) {
	for _, second := range []string{"bo1", "bo2"} {
		s := New()
		req := protocol.BridgeMsg{Direction: "in", MessageID: "m-cc", From: "another agent", Agent: "Claude Code", Mine: true, SelfNamed: true, Text: "联络测试：你那边现在几点？"}
		reply := func(op, state string) protocol.BridgeMsg {
			return protocol.BridgeMsg{Direction: "out", To: "another agent", Agent: "Claude Code", Mine: true, SelfNamed: true, Text: "现在 01:52，手上 0 个任务在跑。", InReplyTo: "m-cc", OpID: op, State: state}
		}
		s.Apply(events(
			ev(1, "channel", protocol.KindBridgeMsg, req),
			ev(2, "channel", protocol.KindBridgeMsg, reply("bo1", "sending")),
			ev(3, "channel", protocol.KindBridgeMsg, reply("bo1", "sent")),
			ev(4, "channel", protocol.KindBridgeMsg, reply(second, "sent")),
		))
		outs := 0
		for _, e := range s.Channel {
			if e.Peer != nil && e.Peer.Direction == "out" {
				outs++
			}
		}
		if outs != 1 {
			t.Fatalf("second %s: %d reply lines, want 1", second, outs)
		}
	}
}
