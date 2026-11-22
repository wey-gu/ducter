package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D480: the same rules as apps/web/test/d480.test.ts.
func TestD480Apart(t *testing.T) {
	devs := func(server string) []protocol.DeviceView {
		return []protocol.DeviceView{{ID: "mac", Name: "MacBook Pro M3", Mem: &protocol.DeviceMemView{State: "ready", Server: server}}}
	}
	row := func() []reachRow {
		return []reachRow{{Harness: "claude-code", Tool: "Claude Code", Can: "yes", Device: "mac", Box: "closed"}}
	}
	got := withApart(row(), devs("cloud.nowledge.co"), "hel.siwei.info")
	if got[0].Theirs != "cloud.nowledge.co" || got[0].Ours != "hel.siwei.info" {
		t.Fatalf("apart not marked: %+v", got[0])
	}
	if w := reachWays(got[0]); w != (ways{"no", "no", "server"}) {
		t.Fatalf("ways %+v", w)
	}
	for _, c := range []struct{ theirs, ours string }{{"hel.siwei.info", "hel.siwei.info"}, {"", "hel.siwei.info"}, {"cloud.nowledge.co", ""}} {
		if r := withApart(row(), devs(c.theirs), c.ours)[0]; r.Theirs != "" {
			t.Fatalf("%+v: apart from an unknown or the same Mem", c)
		}
	}
	if w := reachWays(row()[0]); w != (ways{"yes", "no", "mailbox"}) {
		t.Fatalf("closed mailbox ways %+v", w)
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
}
