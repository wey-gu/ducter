package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D560: the author's loop on hel (2026-11-25): Claude Code's plugin 0.7.38 readies each new session by
// itself, yet the row said its mailbox was closed (a closed identity whose name says "Claude") and
// offered the same tap again and again. Now the row is Mem's facts: an older home's "closed" is dropped,
// and with no session connected yet the row says the next one will hear back, with nothing to tap.
func TestD560AuthorsLoop(t *testing.T) {
	devs := []protocol.DeviceView{
		{ID: "local", Name: "hel", Home: true, Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.38"}}}},
	}
	rows := reachRows(devs, nil, nil, protocol.BridgeMailbox{Harness: "claude-code", Open: false})
	if len(rows) != 1 || rows[0].Box != "" || rows[0].Back != "next" {
		t.Fatalf("rows %+v: want no box and the next session", rows)
	}
	if w := reachWays(rows[0]); w != (ways{"yes", "soon", ""}) {
		t.Fatalf("ways %+v: want the next session, no fix", w)
	}
	if st := standing(rows[0]); st != "next" {
		t.Fatalf("standing %s", st)
	}
	// Once a Claude Code session connects (Mem's connection labelled claude-code), both ways.
	rows = reachRows(devs, nil, nil, protocol.BridgeMailbox{Harness: "claude-code", Open: true})
	if standing(rows[0]) != "both" {
		t.Fatalf("open: %+v", rows[0])
	}
	// A message that came from one of its sessions (Mem's sender.host) is the same fact.
	rows = reachRows(devs, nil, []handoff{{Host: "Claude Code", Agent: "Claude Code", At: "2026-11-25T01:00:00Z"}})
	if standing(rows[0]) != "both" {
		t.Fatalf("heard: %+v", rows[0])
	}
}

// D560: a plugin older than the one whose sessions receive: its update is the one button, where Mem offers it.
func TestD560OldPlugin(t *testing.T) {
	old := func(state string) []protocol.DeviceView {
		return []protocol.DeviceView{{ID: "mac", Name: "MacBook Pro M3", Harnesses: []protocol.DeviceHarness{{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: state, Version: "0.1.40"}}}}}
	}
	r := reachRows(old("update"), nil, nil)[0]
	if r.Back != "old" || !r.Update || r.Device != "mac" {
		t.Fatalf("%+v", r)
	}
	if w := reachWays(r); w != (ways{"yes", "no", "update"}) {
		t.Fatalf("ways %+v", w)
	}
	// Mem offers no newer one there: said, with no button.
	if w := reachWays(reachRows(old("installed"), nil, nil)[0]); w != (ways{"yes", "no", ""}) {
		t.Fatalf("no update: %+v", w)
	}
	if memSessions("claude-code", "0.7.35") != "auto" || memSessions("claude-code", "0.7.34") != "old" || memSessions("codex", "0.1.53") != "auto" || memSessions("antigravity", "0.1.7") != "" {
		t.Fatal("memSessions")
	}
}

// D489, D560: each agent said as what the person gets, the same as the web's standing (apps/web/test/d480.test.ts).
func TestD489Standing(t *testing.T) {
	cases := []struct {
		r    reachRow
		want string
	}{
		{reachRow{Harness: "codex", Can: "yes", Box: "open"}, "both"},
		{reachRow{Harness: "claude-code", Can: "yes", Box: "closed", Device: "mac"}, "to"},
		{reachRow{Harness: "claude-code", Can: "yes", Back: "next", Device: "mac"}, "next"},
		{reachRow{Harness: "codex", Can: "yes", Back: "old", Update: true, Device: "mac"}, "old"},
		{reachRow{Harness: "codex", Can: "yes"}, "to"},
		{reachRow{Harness: "codex", Can: "install", Device: "mac"}, "install"},
		{reachRow{Harness: "codex", Can: "unknown"}, "unknown"},
		{reachRow{Harness: "pi", Can: "relay"}, "relay"},
		{reachRow{Harness: "antigravity", Can: "none"}, "none"},
	}
	for _, c := range cases {
		if got := standing(c.r); got != c.want {
			t.Errorf("%+v: %s, want %s", c.r, got, c.want)
		}
	}
}
