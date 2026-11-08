package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func ev(seq int64, stream, kind string, body any) protocol.LogEvent {
	return protocol.NewEvent(seq, "2026-11-08T20:00:00Z", "ducter", stream, protocol.OriginPartner, kind, body)
}

func events(evs ...protocol.LogEvent) protocol.ServerFrame {
	return protocol.ServerFrame{T: "events", Events: evs}
}

func TestLivingMessageRevisedInPlace(t *testing.T) {
	s := New()
	s.Apply(events(
		ev(1, "channel", protocol.KindUserMsg, protocol.UserMsg{Text: "hi"}),
		ev(2, "channel", protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: "t1", Kind: "decision", Text: "rebase?", DecisionID: "d1"}}}),
		ev(3, "channel", protocol.KindAIMsg, protocol.AIMsg{Text: "later"}),
	))
	if len(s.Channel) != 3 {
		t.Fatalf("%d entries", len(s.Channel))
	}
	rev := ev(4, "channel", protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: "t1", Kind: "done", Text: "green"}}})
	rev.Supersedes = 2
	s.Apply(events(rev))
	if len(s.Channel) != 3 {
		t.Fatalf("a revision added an entry: %d", len(s.Channel))
	}
	e := s.Channel[1]
	if e.Living == nil || e.Living.Items[0].Kind != "done" || e.Revision != 1 || e.Event.Seq != 4 || e.FirstSeq != 2 {
		t.Errorf("revised entry %+v", e)
	}
	// A revision of the revision chains.
	rev2 := ev(5, "channel", protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: "t1", Kind: "done", Text: "merged"}}})
	rev2.Supersedes = 4
	s.Apply(events(rev2))
	if len(s.Channel) != 3 || s.Channel[1].Living.Items[0].Text != "merged" || s.Channel[1].Revision != 2 {
		t.Errorf("second revision %+v", s.Channel[1])
	}
	if s.LatestLiving() != s.Channel[1] {
		t.Error("latest living message")
	}
	// Unread until a read receipt covers it.
	if !s.Unread(s.Channel[1]) {
		t.Error("read before a receipt")
	}
	s.Apply(events(ev(6, "channel", protocol.KindReadReceipt, protocol.ReadReceipt{UpToSeq: 5})))
	if s.Unread(s.Channel[1]) {
		t.Error("unread after a receipt")
	}
	// A new living message after it was seen starts a fresh entry.
	s.Apply(events(ev(7, "channel", protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{Kind: "progress", Text: "x"}}})))
	if len(s.Channel) != 4 || s.Cursor != 7 {
		t.Errorf("%d entries, cursor %d", len(s.Channel), s.Cursor)
	}
}

func TestJobsFoldIntoTheirAck(t *testing.T) {
	s := New()
	s.Apply(events(
		ev(1, "channel", protocol.KindAck, protocol.Ack{JobID: "j1", Text: "on it", ReplyTo: 0}),
		ev(2, "channel", protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "working", State: "running", TaskID: "t1"}),
		ev(3, "channel", protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "done", State: "done", TaskID: "t1"}),
	))
	if len(s.Channel) != 1 || s.Channel[0].Job.Status.State != "done" {
		t.Fatalf("entries %+v", s.Channel)
	}
	// Duplicates (a reconnect replaying) change nothing.
	s.Apply(events(ev(2, "channel", protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "working", State: "running"})))
	if s.Channel[0].Job.Status.State != "done" {
		t.Error("a replayed event applied again")
	}
}

func TestTasksBoardAndDecisions(t *testing.T) {
	s := New()
	s.Apply(events(
		ev(1, "task:t1", protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "Fix CI", Harness: "codex", Place: protocol.Place{Kind: "none"}}),
		ev(2, "task:t1", protocol.KindTaskState, protocol.TaskState{TaskID: "t1", Attention: protocol.Working, Residency: protocol.Hot}),
		ev(3, "task:t1", protocol.KindCheckpoint, protocol.Checkpoint{TaskID: "t1", Text: "cp1"}),
		ev(4, "channel", protocol.KindDecision, protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "rebase?", DefaultOption: "go"}),
		ev(5, "task:t1", protocol.KindTaskState, protocol.TaskState{TaskID: "t1", Attention: protocol.NeedsYou, Residency: protocol.Warm}),
	))
	b := s.Board()
	if len(b.Lanes[LaneNeedsYou]) != 1 || b.Counts.NeedsYou != 1 {
		t.Fatalf("board %+v", b.Counts)
	}
	if d := s.PendingDecision("t1"); d == nil || d.Question != "rebase?" {
		t.Fatalf("pending %+v", d)
	}
	task := s.Task("t1")
	if task.Title() != "Fix CI" || len(task.Checkpoints) != 1 || len(task.Events) != 4 {
		t.Errorf("task %+v", task)
	}
	s.Apply(events(ev(6, "channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d1", Option: "go", By: "user"})))
	if s.PendingDecision("t1") != nil {
		t.Error("resolved decision still pending")
	}
	// History merges without duplicates.
	s.Apply(protocol.ServerFrame{T: "task_history", TaskID: "t1", Events: []protocol.LogEvent{
		ev(1, "task:t1", protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "Fix CI"}),
		ev(3, "task:t1", protocol.KindCheckpoint, protocol.Checkpoint{TaskID: "t1", Text: "cp1"}),
	}})
	if len(task.Events) != 4 || len(task.Checkpoints) != 1 || !task.HistoryLoaded {
		t.Errorf("history duplicated: %d events, %d checkpoints", len(task.Events), len(task.Checkpoints))
	}
	// A snapshot is authoritative for states.
	s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t1", Title: "Fix CI", Attention: protocol.Done}}}})
	if b := s.Board(); len(b.Lanes[LaneDone]) != 1 {
		t.Errorf("after snapshot %+v", b.Counts)
	}
}
