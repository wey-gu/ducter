package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D321: the Memory page's groups and sources, and 试试看's live row and
// agents, the web's rules (apps/web/src/mem-view.ts).
func TestAboutRules(t *testing.T) {
	gs := aboutGroups([]protocol.MemItem{{ID: "f", Kind: "fact"}, {ID: "p", Kind: "preference"}, {ID: "x", Kind: "plan"}, {ID: "d", Kind: "decision"}, {ID: "p2", Kind: "preference"}})
	got := ""
	for _, g := range gs {
		got += g.Kind + ":"
		for _, x := range g.Items {
			got += x.ID + ","
		}
		got += " "
	}
	if got != "preference:p,p2, decision:d, fact:f, other:x, " {
		t.Errorf("aboutGroups = %q", got)
	}
	for _, c := range []struct {
		in   protocol.MemItem
		key  string
		args int
	}{
		{protocol.MemItem{By: "tool", From: "Codex"}, "mem.by.tool", 1},
		{protocol.MemItem{By: "tool"}, "mem.by.you", 0},
		{protocol.MemItem{By: "said"}, "mem.by.said", 0},
		{protocol.MemItem{By: "mem"}, "mem.by.mem", 0},
		{protocol.MemItem{By: "you"}, "mem.by.you", 0},
	} {
		if k, a := bySource(c.in); k != c.key || len(a) != c.args {
			t.Errorf("bySource(%+v) = %q %v", c.in, k, a)
		}
	}
	h := func(id string, in, signed bool, mem string) protocol.DeviceHarness {
		x := protocol.DeviceHarness{Harness: id, Installed: in, LoggedIn: signed}
		if mem != "" {
			x.Mem = &protocol.MemPluginView{State: mem}
		}
		return x
	}
	ds := []protocol.DeviceView{
		{ID: "w1", Name: "mini", Harnesses: []protocol.DeviceHarness{h("codex", true, true, "absent"), h("claude-code", true, true, "installed")}},
		{ID: "local", Name: "MacBook", Home: true, Harnesses: []protocol.DeviceHarness{h("codex", true, true, "absent"), h("pi", true, true, "")}},
	}
	ag := tryAgents(ds)
	if len(ag) != 2 || ag[0] != (tryAgent{Harness: "claude-code", Plugin: "on"}) || ag[1] != (tryAgent{Harness: "codex", Plugin: "off", Device: "local", DeviceName: "MacBook"}) {
		t.Errorf("tryAgents = %+v", ag)
	}
	if got := tryAgents([]protocol.DeviceView{{Harnesses: []protocol.DeviceHarness{h("codex", true, false, ""), h("claude-code", true, true, "")}}}); len(got) != 1 || got[0].Plugin != "" {
		t.Errorf("tryAgents unknown = %+v", got)
	}
}

// D332: 终端里的 AI's rules, the web's (apps/web/test/peers.test.ts): what the
// pane is about, who sees it, and what came and went lately.
func TestPeersRules(t *testing.T) {
	bv := func(st string) *protocol.BridgeView { return &protocol.BridgeView{State: st, Identity: "ducter"} }
	for _, c := range []struct {
		b    *protocol.BridgeView
		on   bool
		want string
	}{
		{nil, true, "none"},
		{bv("connected"), true, "on"},
		{bv("connected"), false, "on"},
		{bv("disconnecting"), false, "off"},
		{bv("ready"), false, "off"},
		{bv("install_mem"), true, "getting"},
		{bv("update_mem"), true, "getting"},
		{bv("signing_in"), true, "getting"},
		{bv("ready"), true, "joining"},
		{bv("connecting"), true, "joining"},
		{bv("elsewhere"), true, "problem"},
		{bv("refused"), true, "problem"},
		{bv("local_mem"), true, "problem"},
	} {
		if got := peersPhase(c.b, c.on); got != c.want {
			t.Errorf("peersPhase(%v, %v) = %q, want %q", c.b, c.on, got, c.want)
		}
	}
	none := &protocol.Peers{Reach: "own"}
	if peersShown(nil, bv("connected"), true, true) || peersShown(none, bv("ready"), false, false) || peersShown(none, nil, false, false) {
		t.Errorf("peersShown: shown to someone without agents of their own")
	}
	if !peersShown(none, bv("install_mem"), false, true) || !peersShown(none, bv("connected"), false, false) || !peersShown(none, nil, true, false) || !peersShown(&protocol.Peers{Reach: "own", Muted: []string{"Codex"}}, nil, false, false) {
		t.Errorf("peersShown: hidden from someone it is for")
	}
	if ownsAgents(nil, nil) || !ownsAgents([]string{"codex"}, nil) || !ownsAgents(nil, []protocol.DeviceView{{Harnesses: []protocol.DeviceHarness{{Harness: "codex", Mem: &protocol.MemPluginView{State: "installed"}}}}}) {
		t.Errorf("ownsAgents")
	}
	ev := func(seq int64, p protocol.BridgeMsg) *store.Entry {
		return &store.Entry{Event: protocol.LogEvent{Seq: seq, TS: "2026-11-17T10:00:00Z"}, Peer: &p}
	}
	ch := []*store.Entry{
		ev(1, protocol.BridgeMsg{Direction: "in", Agent: "Claude Code", Text: "fix  the\nCI"}),
		ev(2, protocol.BridgeMsg{Direction: "in", Agent: "Codex", Text: "old", State: "early"}),
		ev(3, protocol.BridgeMsg{Direction: "out", To: "Codex", Text: "draft", State: "pending", DecisionID: "d1"}),
		ev(4, protocol.BridgeMsg{Direction: "out", To: "Codex", Text: "can the PR go tonight?", State: "sent", DecisionID: "d1"}),
		ev(5, protocol.BridgeMsg{Direction: "out", Agent: "Claude Code", Text: "on it", TaskID: "t1"}),
		{Event: protocol.LogEvent{Seq: 6}},
	}
	got := recentHandoffs(ch, 5)
	if len(got) != 3 || got[0].Way != "replied" || got[0].TaskID != "t1" || got[1].Way != "sent" || got[1].Agent != "Codex" || got[2].Way != "in" || got[2].Words != "fix the CI" {
		t.Errorf("recentHandoffs = %+v", got)
	}
	if len(recentHandoffs(ch, 1)) != 1 {
		t.Errorf("recentHandoffs limit")
	}
}
