package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func connectedApp(t *testing.T) (*App, *[]any) {
	t.Helper()
	var sent []any
	app := New(store.New(), theme.Pebble(), i18n.New(i18n.EN))
	app.Send = func(f any) error { sent = append(sent, f); return nil }
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "p", HeadSeq: 0})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	sent = nil
	return app, &sent
}

// reconnect is the socket going away and a new one saying welcome, then
// replaying the channel and the On hand snapshot.
func reconnect(app *App, head int64, replay ...protocol.LogEvent) {
	app.Status = client.Disconnected
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "p", HeadSeq: head})
	app.Receive(protocol.ServerFrame{T: "events", Events: replay})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
}

func userMsgEv(seq int64, text, clientID string) protocol.LogEvent {
	return protocol.NewEvent(seq, "2026-11-09T20:00:00Z", "p", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: text, ClientID: clientID})
}

func pendingRows(app *App) (users, pending int) {
	for _, r := range app.rows() {
		switch {
		case r.pending != nil:
			pending++
		case r.entry != nil && r.entry.User != nil:
			users++
		}
	}
	return
}

// A message sent on a socket that died before its echo is sent again, in
// order, after the next welcome; the server's echo (of either copy) shows
// it once.
func TestResendUnechoedAfterReconnect(t *testing.T) {
	app, sent := connectedApp(t)
	app.SendMessage("first")
	app.SendMessage("second")
	if len(*sent) != 2 {
		t.Fatalf("sent %v", *sent)
	}
	first := (*sent)[0].(protocol.Send)
	second := (*sent)[1].(protocol.Send)
	*sent = nil
	// The server had the first (its echo was lost with the socket), not the second.
	reconnect(app, 1, userMsgEv(1, "first", first.ClientID))
	if len(*sent) != 2 {
		t.Fatalf("resent %v", *sent)
	}
	for i, want := range []protocol.Send{first, second} {
		if f, ok := (*sent)[i].(protocol.Send); !ok || f.ClientID != want.ClientID || f.Text != want.Text {
			t.Errorf("resend %d = %+v, want %+v", i, (*sent)[i], want)
		}
	}
	// The server dedupes the first: it re-sends the same event, and appends the second.
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{userMsgEv(1, "first", first.ClientID)}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{userMsgEv(2, "second", second.ClientID)}})
	if u, p := pendingRows(app); u != 2 || p != 0 {
		t.Fatalf("bubbles: %d echoed, %d pending; want 2, 0", u, p)
	}
	// Echoed: a further reconnect sends nothing again.
	*sent = nil
	reconnect(app, 2)
	if len(*sent) != 0 {
		t.Errorf("resent echoed messages: %v", *sent)
	}
}

// While the socket is down a message waits in pending (shown once) and
// goes out once after the welcome, not twice from an outbox too.
func TestSendWhileDisconnectedGoesOnce(t *testing.T) {
	app, sent := connectedApp(t)
	app.Status = client.Disconnected
	app.SendMessage("typed offline")
	if len(*sent) != 0 {
		t.Fatalf("sent while down: %v", *sent)
	}
	if _, p := pendingRows(app); p != 1 {
		t.Fatalf("pending bubbles %d", p)
	}
	reconnect(app, 0)
	if len(*sent) != 1 {
		t.Fatalf("sent %v", *sent)
	}
}

// A direct message to a task is resent with its clientId until "sent".
func TestTaskSendResentUntilAcked(t *testing.T) {
	app, sent := connectedApp(t)
	app.SendToTask("t1", "also the docs")
	f := (*sent)[0].(protocol.TaskSend)
	if f.ClientID == "" {
		t.Fatal("no clientId")
	}
	*sent = nil
	reconnect(app, 0)
	if len(*sent) != 1 || (*sent)[0].(protocol.TaskSend).ClientID != f.ClientID {
		t.Fatalf("resent %v", *sent)
	}
	app.Receive(protocol.ServerFrame{T: "sent", TaskID: "t1", Delivered: "steered"})
	*sent = nil
	reconnect(app, 0)
	if len(*sent) != 0 {
		t.Errorf("resent an acked send: %v", *sent)
	}
	if sends := app.S.Task("t1").Sends; len(sends) != 1 || sends[0].Delivered != "steered" {
		t.Errorf("sends %+v", sends)
	}
}

func actedEv(seq int64, taskID, action string) protocol.LogEvent {
	return protocol.NewEvent(seq, "2026-11-09T20:00:00Z", "p", "channel", protocol.OriginUser, protocol.KindJobStatus,
		protocol.JobStatus{JobID: "act_" + taskID + "_" + action, TaskID: taskID, State: "done", Text: "the user merged this task's branch"})
}

// A merge whose action_result was lost with the socket: done if the Log
// says so, otherwise "not sure", never a failure; Try again sends it once.
func TestActingResolvesFromLog(t *testing.T) {
	app, sent := connectedApp(t)
	app.S.Apply(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, "2026-11-09T20:00:00Z", "p", "task:t1", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "a"}),
		protocol.NewEvent(2, "2026-11-09T20:00:00Z", "p", "task:t2", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t2", Title: "b"}),
	}})
	t1 := app.S.Task("t1")
	tb := app.S.Task("t2")
	t1.Acting, tb.Acting = "merge", "open_pr"
	app.TaskAction("t1", "merge")
	app.TaskAction("t2", "open_pr")
	if len(*sent) != 2 {
		t.Fatalf("sent %v", *sent)
	}
	*sent = nil
	// The main died mid-action: the merge made it into the Log, the PR didn't.
	reconnect(app, 3, actedEv(3, "t1", "merge"))
	if t1.Acting != "" || t1.Unsure != "" || t1.Acted == nil || !t1.Acted.OK || t1.Acted.Action != "merge" {
		t.Errorf("t1: acting %q unsure %q acted %+v", t1.Acting, t1.Unsure, t1.Acted)
	}
	if tb.Acting != "" || tb.Unsure != "open_pr" || tb.Acted != nil {
		t.Errorf("t2: acting %q unsure %q acted %+v", tb.Acting, tb.Unsure, tb.Acted)
	}
	if len(app.S.ActionResults) != 0 {
		t.Errorf("a result toast was invented: %+v", app.S.ActionResults)
	}
	if len(*sent) != 0 {
		t.Errorf("an action was resent on its own: %v", *sent)
	}
	app.RetryAction(tb)
	if len(*sent) != 1 || tb.Acting != "open_pr" || tb.Unsure != "" {
		t.Fatalf("retry: sent %v acting %q unsure %q", *sent, tb.Acting, tb.Unsure)
	}
	// A late Log line (the socket dropped but the main lived) settles it too.
	tb.Acting, tb.Unsure = "", "open_pr"
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{actedEv(4, "t2", "open_pr")}})
	if tb.Unsure != "" || tb.Acted == nil {
		t.Errorf("late log: unsure %q acted %+v", tb.Unsure, tb.Acted)
	}
}

func TestUnsureCopy(t *testing.T) {
	if got := i18n.New(i18n.ZH).T("result.unsure"); got != "不确定成功了没有，你看一眼" {
		t.Errorf("zh %q", got)
	}
	if got := i18n.New(i18n.EN).T("result.unsure"); got != "Not sure it went through — check" {
		t.Errorf("en %q", got)
	}
}
