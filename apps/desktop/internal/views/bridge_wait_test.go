package views

// D656 (research/243 Brief D): a task waiting for another agent's answer has not stopped.
// Its sent bridge message is the fact On hand reads: the row keeps saying 在等{who}回话, stays
// under 在等, and the answer removes the wait. The web's bridge-wait-243.test.ts reads the same.

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestBridgeWaitOnHand(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		y, m, d := time.Now().Date()
		now := time.Date(y, m, d, 15, 0, 0, 0, time.Local)
		app.Now = func() time.Time { return now }
		iso := func(dd time.Duration) string { return now.Add(dd).UTC().Format(time.RFC3339Nano) }
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{
			TaskID: "t1", Title: "Fix the Linux runner tests", Place: protocol.Place{Kind: "none"}, Harness: "pi",
			Attention: protocol.Blocked, OpenedAt: iso(-3 * time.Hour), UpdatedAt: iso(-2 * time.Hour),
		}}}})
		app.S.ApplyEvent(protocol.NewEvent(2, iso(-2*time.Hour), "default", "channel", protocol.OriginPartner, protocol.KindBridgeMsg, map[string]any{
			"direction": "out", "messageId": "bm-o1", "opId": "bo-1", "operation": "op-1", "by": "task", "taskId": "t1",
			"decisionId": "d1", "contact": "ct-codex", "to": "Codex", "agent": "Codex", "mine": true,
			"text": "Why skip open?", "state": "sent",
		}))
		if app.S.BridgeWaitFor("t1") == nil {
			t.Fatalf("%s: the task's unanswered question is not a wait", lang)
		}
		if app.stoppedWait(app.S.Task("t1")) {
			t.Fatalf("%s: a task waiting on an answer is a stop", lang)
		}
		want := "在等 Codex 回话"
		if lang == i18n.EN {
			want = "Waiting for Codex to answer"
		}
		if got := app.storyOf(app.S.Task("t1")).words; got != want {
			t.Fatalf("%s: row says %q, want %q", lang, got, want)
		}
		// The answer settles it: no wait, and an old task with nothing left is the person's stop.
		app.S.ApplyEvent(protocol.NewEvent(3, iso(-time.Hour), "default", "channel", protocol.OriginPeer, protocol.KindBridgeMsg, map[string]any{
			"direction": "in", "messageId": "bm-a1", "inReplyTo": "bm-o1", "state": "task", "taskId": "t1",
			"from": "Codex", "agent": "Codex", "mine": true, "text": "It didn't.",
		}))
		if app.S.BridgeWaitFor("t1") != nil {
			t.Fatalf("%s: the answered question is still a wait", lang)
		}
		if !app.stoppedWait(app.S.Task("t1")) {
			t.Fatalf("%s: an answered wait with nothing running is not a stop", lang)
		}
	}
}
