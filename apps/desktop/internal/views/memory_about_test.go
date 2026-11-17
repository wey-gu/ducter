package views

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
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
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	if handoffPhase("", now) != "waiting" || handoffPhase(now.Add(-time.Minute).Format(time.RFC3339), now) != "first" || handoffPhase(now.Add(-20*time.Minute).Format(time.RFC3339), now) != "none" {
		t.Errorf("handoffPhase")
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
