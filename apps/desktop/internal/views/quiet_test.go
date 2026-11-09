package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func chEv(seq int64, origin protocol.Origin, kind string, body any) protocol.LogEvent {
	return protocol.NewEvent(seq, time.Now().UTC().Format(time.RFC3339), "default", "channel", origin, kind, body)
}

// While the user waits (D104): the partner's line shows the moment the
// message goes, follows each step, and is gone when the reply lands.
func TestPresenceWhileWaiting(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	app.SendMessage("帮我看下 #1592 的 CI")
	tt.Frame()
	if !tt.HasText("在想…") {
		t.Fatalf("no 在想… right after sending: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "帮我看下 #1592 的 CI", ClientID: app.pending[0].clientID})}})
	now := time.Now().UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "recalling", Since: now, StepSince: now}})
	tt.Frame()
	if !tt.HasText("在翻之前聊过的…") || tt.HasText("在想…") {
		t.Fatalf("the step didn't replace the line: %q", tt.Texts())
	}
	if tt.HasText("在想…") || tt.HasText("log_search") {
		t.Errorf("a tool name or a stale line shows: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(2, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: "好，我去查。", ReplyTo: 1})}})
	app.Receive(protocol.ServerFrame{T: "activity"})
	tt.Frame()
	if tt.HasText("在翻之前聊过的…") || !tt.HasText("好，我去查。") {
		t.Errorf("the line stays after the reply: %q", tt.Texts())
	}
}

// A turn that ends without a word (the partner asked instead) ends the
// waiting line too.
func TestPresenceEndsWithSilentTurn(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "hi"})}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !tt.HasText("Thinking…") {
		t.Fatalf("no Thinking… for an unanswered message: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "activity"})
	tt.Frame()
	if tt.HasText("Thinking…") {
		t.Errorf("Thinking… stays after the turn ended: %q", tt.Texts())
	}
}

// The living message, quiet (D104): no card heading, the ask due soonest
// carries the buttons, the rest gather in one line; a failure is one
// sentence; work under way is not listed.
func TestLivingQuiet(t *testing.T) {
	noRelayWait(t)
	app, _ := iaApp(t, i18n.EN)
	soon := time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)
	later := time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "Change the 3 calls now?", GoLabel: "change them", DefaultOption: "go", DefaultAt: later, Reversible: true}),
		chEv(2, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d2", TaskID: "t2", Question: "Rebase it?", GoLabel: "rebase", DefaultOption: "go", DefaultAt: soon, Reversible: true}),
		chEv(3, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t1", Kind: "decision", Title: "Upgrade OAR", Text: "Change the 3 calls now?", DecisionID: "d1"},
			{TaskID: "t2", Kind: "decision", Title: "Bring fix-ci up to date", Text: "Rebase it?", DecisionID: "d2"},
			{TaskID: "t3", Kind: "failed", Title: "Bump tokio to 1.41", Text: "4 places don't build."},
			{TaskID: "t4", Kind: "progress", Title: "Review this week's PRs", Text: "Read 2"},
		}}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"Rebase it?", "Rebase", "1 more waiting on you", "Go on all defaults · 2", "Bump tokio to 1.41 didn't work: 4 places don't build."} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	for _, not := range []string{"Change the 3 calls now?", "Review this week's PRs · Read 2", "2 need you"} {
		if tt.HasText(not) {
			t.Errorf("%q shows by default: %q", not, tt.Texts())
		}
	}
	if err := tt.Click("1 more waiting on you"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText("Change the 3 calls now?") || !tt.HasText("Change them") {
		t.Errorf("the gathered ask doesn't open: %q", tt.Texts())
	}
	// Details shown by default (Settings) brings back the status lines.
	app.Local.SetDetailsShown(true)
	defer app.Local.SetDetailsShown(false)
	tt.Frame()
	if !tt.HasText("Review this week's PRs · Read 2") {
		t.Errorf("Details shown doesn't list work under way: %q", tt.Texts())
	}
}
