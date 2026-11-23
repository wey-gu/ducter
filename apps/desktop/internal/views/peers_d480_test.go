package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D480 round 2: the author's case (Claude Code on the Mac, its mailbox closed; every computer on the
// one Mem, tasks there through the home's relay) is one way with the Space choice, never "another Mem".
func TestD480AuthorsCase(t *testing.T) {
	devs := []protocol.DeviceView{
		{ID: "local", Name: "hel", Home: true},
		{ID: "mac", Name: "MacBook Pro M3", Mem: &protocol.DeviceMemView{State: "ready", Carried: true}, Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}}}},
	}
	rows := reachRows(devs, nil, nil, protocol.BridgeMailbox{Harness: "claude-code", Open: false})
	if len(rows) != 1 || rows[0].Device != "mac" {
		t.Fatalf("rows %+v", rows)
	}
	if w := reachWays(rows[0]); w != (ways{"yes", "no", "mailbox"}) {
		t.Fatalf("ways %+v: want one way with the mailbox fix", w)
	}
}

func TestD480Looked(t *testing.T) {
	a := &App{}
	a.mailboxChoosing = &mailboxChoice{Device: "mac", Harness: "claude-code"}
	look := &protocol.MailboxLook{State: "choose", Recommend: "personal", Spaces: []protocol.MailboxSpace{{ID: "personal", Label: "Only me", Kind: "personal", Partner: true}, {ID: "all", Label: "Everyone", Kind: "commons"}}}
	// An answer for another row is ignored; this row's chooses the suggested Space first.
	a.mailboxLooked(protocol.ServerFrame{T: "mailbox_look", Device: "mac", Harness: "codex", Look: look})
	if a.mailboxChoosing.Look != nil {
		t.Fatal("took another agent's answer")
	}
	a.mailboxLooked(protocol.ServerFrame{T: "mailbox_look", Device: "mac", Harness: "claude-code", Look: look})
	if a.mailboxChoosing.Pick != "personal" {
		t.Fatalf("pick %q", a.mailboxChoosing.Pick)
	}
	// D489: without Ducter's suggestion nothing is picked for the person (Mem picks no Space, nor does Ducter).
	a.mailboxChoosing = &mailboxChoice{Device: "mac", Harness: "claude-code"}
	a.mailboxLooked(protocol.ServerFrame{T: "mailbox_look", Device: "mac", Harness: "claude-code", Look: &protocol.MailboxLook{State: "choose", Spaces: []protocol.MailboxSpace{{ID: "all", Kind: "commons"}}}})
	if a.mailboxChoosing.Pick != "" {
		t.Fatalf("picked %q without a suggestion", a.mailboxChoosing.Pick)
	}
}

// D489: each agent said as what the person gets, the same as the web's standing (apps/web/test/d480.test.ts).
func TestD489Standing(t *testing.T) {
	cases := []struct {
		r    reachRow
		want string
	}{
		{reachRow{Harness: "codex", Can: "yes", Box: "open"}, "both"},
		{reachRow{Harness: "claude-code", Can: "yes", Box: "closed", Device: "mac"}, "oneway"},
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
