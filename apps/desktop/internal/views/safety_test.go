package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func TestLooksSecret(t *testing.T) {
	for _, s := range []string{
		"my token is ghp_abcdefghijklmnopqrstu",
		"github_pat_11ABCDEFG0123456789_xyz",
		"sk-ant-api03-abcdefghijkl",
		"OPENAI=sk-proj-abcdefghijklmnopqrstuvwx",
		"AKIAIOSFODNN7EXAMPLE",
		"xoxb-123456-abcdef",
		"-----BEGIN OPENSSH PRIVATE KEY-----\nabc",
	} {
		if !LooksSecret(s) {
			t.Errorf("missed %q", s)
		}
	}
	for _, s := range []string{"fix the flaky test", "sk-short", "ask about the AKIA prefix", "git push ducter/fix-ci"} {
		if LooksSecret(s) {
			t.Errorf("flagged %q", s)
		}
	}
}

// A key is held, not sent; Don't send keeps the draft, Send anyway sends.
func TestComposerHoldsKeys(t *testing.T) {
	theme.LoadFonts()
	var sent []any
	app := New(store.New(), theme.Pebble(), i18n.New(i18n.ZH))
	app.Send = func(f any) error { sent = append(sent, f); return nil }
	app.S.Welcomed, app.Status = true, client.Connected
	if app.SendMessage("here: ghp_abcdefghijklmnopqrstu") || len(sent) != 0 || app.held == nil {
		t.Fatalf("not held: sent %v", sent)
	}
	app.draft = "here: ghp_abcdefghijklmnopqrstu"
	app.SendHeld()
	if len(sent) != 1 || app.held != nil || app.draft != "" {
		t.Fatalf("send anyway: %v held %v draft %q", sent, app.held, app.draft)
	}
	if f, ok := sent[0].(protocol.Send); !ok || f.Text == "" {
		t.Errorf("frame %+v", sent[0])
	}
	if app.SendToTask("t1", "AKIAIOSFODNN7EXAMPLE") || app.held == nil || app.held.taskID != "t1" {
		t.Error("task send not held")
	}
}

// A message typed before Ducter answered is kept, shown, and sent once the
// server says welcome; nothing is dropped.
func TestSendBeforeWelcomeWaits(t *testing.T) {
	var sent []any
	app := New(store.New(), theme.Pebble(), i18n.New(i18n.EN))
	app.Send = func(f any) error { sent = append(sent, f); return nil }
	if !app.SendMessage("a long first message, typed while Ducter was still starting") {
		t.Fatal("not accepted")
	}
	if len(sent) != 0 || len(app.pending) != 1 {
		t.Fatalf("sent %v before welcome; pending %d", sent, len(app.pending))
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "p", HeadSeq: 0})
	if len(sent) != 1 {
		t.Fatalf("not sent on welcome: %v", sent)
	}
	if f, ok := sent[0].(protocol.Send); !ok || f.ClientID != app.pending[0].clientID {
		t.Errorf("frame %+v", sent[0])
	}
}
