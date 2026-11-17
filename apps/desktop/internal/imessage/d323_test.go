package imessage

// D323: the setup's checks and what the code says about whose Messages
// this is. Fakes only: a fake store, a fake sender, a fake host, and a
// fixture chat.db in a temp directory.

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

const partnerAddr = "xiaoya.ducter@icloud.com"

type fakeHost struct {
	front  bool
	user   string
	icloud string
}

func (h *fakeHost) Front() bool                   { return h.front }
func (h *fakeHost) User() string                  { return h.user }
func (h *fakeHost) ICloud(context.Context) string { return h.icloud }

type accountSender struct {
	*fakeSender
	account string
}

func (s accountSender) Account(context.Context) (string, error) { return s.account, nil }

func TestPartnerCodeInTheThreadWithItselfLinksNoOne(t *testing.T) {
	r := newRig(t)
	if err := r.b.Enable(context.Background(), ModePartner); err != nil {
		t.Fatal(err)
	}
	code := r.b.Status().Code
	// The person's own Apple ID: the code they texted themselves comes in
	// at the address it was sent from.
	r.store.add(Row{Text: code, Handle: person, Dest: "p:" + person, Date: r.now})
	r.step()
	st := r.b.Status()
	if st.State != StateOwnID || st.Handle != "" || st.Code != "" {
		t.Fatalf("own Apple ID not seen: %+v", st)
	}
	if len(r.sender.sent) != 0 || len(r.relays) != 0 {
		t.Fatalf("it spoke or relayed: %v %v", r.sender.sent, r.relays)
	}
	// Switching to Message yourself starts over with a fresh code.
	if err := r.b.Enable(context.Background(), ModeSelf); err != nil {
		t.Fatal(err)
	}
	if st := r.b.Status(); st.State != StatePairing || st.Mode != ModeSelf {
		t.Fatalf("switch: %+v", st)
	}
}

func TestPartnerCodeLearnsThePartnersAddress(t *testing.T) {
	r := newRig(t)
	_ = r.b.Enable(context.Background(), ModePartner)
	r.store.add(Row{Text: r.b.Status().Code, Handle: person, Dest: "e:" + partnerAddr, Date: r.now})
	r.step()
	st := r.b.Status()
	if st.State != StateOn || st.Handle != person || st.Account != partnerAddr {
		t.Fatalf("linked: %+v", st)
	}
	r.open() // a restart keeps it
	if st := r.b.Status(); st.Account != partnerAddr {
		t.Fatalf("after a restart: %+v", st)
	}
}

func TestCheckSaysTheAccountTheICloudAndTheFrontUser(t *testing.T) {
	r := newRig(t)
	host := &fakeHost{front: false, user: "xiaoya", icloud: "wey@example.com"}
	var told []protocol.ChannelStatus
	r.b = New(Options{
		Store: r.store, Sender: accountSender{r.sender, "E:" + partnerAddr}, Host: host,
		Now: r.b.o.Now, Computer: func() string { return "Mac mini" },
		Report: func(s protocol.ChannelStatus) { told = append(told, s) },
	})
	st := r.b.Status()
	if !st.Background || st.User != "xiaoya" || st.Checked {
		t.Fatalf("before a check: %+v", st)
	}
	if err := r.b.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	st = r.b.Status()
	if !st.Checked || st.Account != partnerAddr || st.ICloud != "wey@example.com" || st.State != StateOff {
		t.Fatalf("after a check: %+v", st)
	}
	host.front = true
	if r.b.Status().Background {
		t.Error("front user still background")
	}
	r.b.report(true)
	if len(told) == 0 || told[len(told)-1].Computer != "Mac mini" || told[len(told)-1].State != "off" {
		t.Errorf("home told %+v", told)
	}
}

func TestACheckBeforeConnectingSaysWhyWithoutBackingOff(t *testing.T) {
	r := newRig(t)
	r.sender.probe = ErrNotSignedIn
	if err := r.b.Probe(context.Background()); err == nil {
		t.Fatal("no error")
	}
	st := r.b.Status()
	if st.State != StateOff || st.Err != StateNotSigned || st.Checked {
		t.Fatalf("check: %+v", st)
	}
	if len(r.reports) != 0 {
		t.Errorf("home told %v", r.reports)
	}
	r.sender.probe = ErrNoAutomation
	_ = r.b.Probe(context.Background())
	if st := r.b.Status(); st.Err != StateNeedsAuto || st.Automation {
		t.Fatalf("automation: %+v", st)
	}
	r.sender.probe = nil
	_ = r.b.Probe(context.Background())
	if st := r.b.Status(); st.Err != "" || !st.Checked || !st.Automation {
		t.Fatalf("given: %+v", st)
	}
}

func TestAddressShapes(t *testing.T) {
	for in, want := range map[string]string{
		"E:" + partnerAddr:  partnerAddr,
		"p:+8613800000000":  "+8613800000000",
		"+1 (415) 555-0100": "+1 (415) 555-0100",
		"iMessage":          "",
		"":                  "",
		"a b@c":             "",
		"12":                "",
	} {
		if got := Address(in); got != want {
			t.Errorf("Address(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSQLiteStoreReadsTheReceivingAddress(t *testing.T) {
	if _, err := os.Stat("/usr/bin/sqlite3"); err != nil {
		t.Skip("no /usr/bin/sqlite3 here")
	}
	for _, col := range []string{"destination_caller_id", "account"} {
		path, run := fixture(t)
		run(fmt.Sprintf(`ALTER TABLE message ADD COLUMN %s TEXT;
INSERT INTO message (guid, text, handle_id, service, date, is_from_me, %[1]s) VALUES ('g1', '123456', 1, 'iMessage', 0, 0, 'e:%[2]s');
INSERT INTO chat_message_join (chat_id, message_id) VALUES (1,1);`, col, partnerAddr))
		rows, err := (SQLiteStore{Path: path}).Since(context.Background(), 0, 10)
		if err != nil || len(rows) != 1 || rows[0].Dest != partnerAddr {
			t.Errorf("%s: %+v %v", col, rows, err)
		}
	}
}
