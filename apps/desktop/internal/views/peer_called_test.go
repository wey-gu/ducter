package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// An agent is called by its name in Mem, else the tool it runs in, else
// unnamed (web: mem-about.test.ts, the same order).
func TestPeerCalled(t *testing.T) {
	zh := &App{L: i18n.New(i18n.ZH)}
	en := &App{L: i18n.New(i18n.EN)}
	cases := []struct {
		b      protocol.BridgeMsg
		zh, en string
	}{
		{protocol.BridgeMsg{Direction: "in", Agent: "Claude 收尾协调", From: "Claude 收尾协调 (Wey)", Host: "Claude Code"}, "Claude 收尾协调", "Claude 收尾协调"},
		{protocol.BridgeMsg{Direction: "in", From: "reviewer (dev team)"}, "reviewer (dev team)", "reviewer (dev team)"},
		{protocol.BridgeMsg{Direction: "in", From: "another agent", Host: "Codex"}, "Codex 里的 agent", "an agent in Codex"},
		{protocol.BridgeMsg{Direction: "in", From: "another agent"}, "一个没留名字的 agent", "an unnamed agent"},
		{protocol.BridgeMsg{Direction: "out", To: "Codex", From: "x"}, "Codex", "Codex"},
	}
	for _, c := range cases {
		b := c.b
		if got := zh.peerWhoOf(&b); got != c.zh {
			t.Errorf("zh %+v = %q, want %q", c.b, got, c.zh)
		}
		if got := en.peerWhoOf(&b); got != c.en {
			t.Errorf("en %+v = %q, want %q", c.b, got, c.en)
		}
	}
	// D470: a thread's origin line names it the same way.
	if got := capPeer(en.L.T("peer.origin", en.peerCalledText("", "Codex"))); got != "From an agent in Codex" {
		t.Errorf("peer.origin = %q", got)
	}
	if got := capPeer(en.L.T("peer.asks", en.peerCalledText("", ""))); got != "An unnamed agent asks you" {
		t.Errorf("peer.asks = %q", got)
	}
	// 最近 keeps the tool for the unnamed one; its tile is then the tool's.
	ev := func(seq int64, p protocol.BridgeMsg) *store.Entry {
		return &store.Entry{Event: protocol.LogEvent{Seq: seq, TS: "2026-11-17T10:00:00Z"}, Peer: &p}
	}
	got := recentHandoffs([]*store.Entry{
		ev(1, protocol.BridgeMsg{Direction: "in", From: "another agent", Text: "a"}),
		ev(2, protocol.BridgeMsg{Direction: "in", From: "another agent", Host: "Claude Code", Text: "b"}),
	}, 5)
	if len(got) != 2 || got[0].Agent != "" || got[0].Host != "Claude Code" || got[1].Agent != "" || got[1].Host != "" {
		t.Errorf("recentHandoffs = %+v", got)
	}
}
