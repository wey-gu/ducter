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

func TestV2SnapshotDecisionsAndWaiters(t *testing.T) {
	s := New()
	pd := &protocol.PendingDecision{Decision: protocol.Decision{DecisionID: "d9", TaskID: "t9", Question: "push?", DefaultOption: "go", Reversible: true}, AskedAt: "2026-11-09T00:00:00Z"}
	s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			{TaskID: "t9", Title: "Push", Attention: protocol.NeedsYou, PendingDecisionID: "d9", PendingDecision: pd, OpenedAt: "2026-11-08T23:00:00Z"},
			{TaskID: "t8", Title: "Other", Attention: protocol.NeedsYou, PendingDecision: &protocol.PendingDecision{Decision: protocol.Decision{DecisionID: "d8", TaskID: "t8", Question: "merge?"}, AskedAt: "2026-11-08T22:00:00Z"}},
		},
		Waiters: []protocol.Waiter{{WaiterID: "w1", Reason: "PR approval", At: "2026-11-09T08:00:00Z", State: "armed"}, {WaiterID: "w2", TaskID: "t9", Reason: "CI", State: "armed"}},
	}})
	// A decision only the card knows of (its event is older than the
	// replay) is still answerable.
	d := s.PendingDecision("t9")
	if d == nil || d.Question != "push?" || d.AskedAt == "" {
		t.Fatalf("pending from card %+v", d)
	}
	if s.Task("t9").OpenedAt != "2026-11-08T23:00:00Z" {
		t.Error("openedAt from card")
	}
	if open := s.OpenDecisions(); len(open) != 2 || open[0].DecisionID != "d8" {
		t.Errorf("open decisions %+v", open)
	}
	if w := s.ArmedWaiters(); len(w) != 2 || w[0].WaiterID != "w2" && w[0].At != "" {
		t.Errorf("waiters %+v", w)
	}
	if s.WaiterFor("t9") == nil {
		t.Error("task waiter")
	}
	// A fired waiter leaves; the next snapshot is authoritative.
	s.Apply(events(ev(1, "channel", protocol.KindWaiter, protocol.Waiter{WaiterID: "w2", TaskID: "t9", Reason: "CI", State: "fired"})))
	if s.WaiterFor("t9") != nil {
		t.Error("fired waiter still armed")
	}
	s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Waiters: []protocol.Waiter{}}})
	if len(s.ArmedWaiters()) != 0 {
		t.Error("snapshot did not clear waiters")
	}
}

// A retitle is a later task_open for the same task: the latest names it, the first dates it,
// whatever order the events arrive in (live push vs. history replay).
func TestRetitleByLaterTaskOpen(t *testing.T) {
	first := protocol.NewEvent(1, "2026-11-09T10:00:00Z", "ducter", "task:t1", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "修好分账测试"})
	second := protocol.NewEvent(9, "2026-11-09T11:00:00Z", "ducter", "task:t1", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "修好分账测试和退款取整"})
	for _, order := range [][]protocol.LogEvent{{first, second}, {second, first}} {
		s := New()
		for _, e := range order {
			s.Apply(events(e))
		}
		if got := s.Task("t1").Title(); got != "修好分账测试和退款取整" {
			t.Errorf("title %q", got)
		}
		if got := s.Task("t1").OpenedAt; got != "2026-11-09T10:00:00Z" {
			t.Errorf("openedAt %q", got)
		}
	}
}

func TestDirectSendsAndDelivery(t *testing.T) {
	s := New()
	s.Apply(events(ev(1, "task:t1", protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "x"})))
	sd := s.AddSend("t1", "use the fixture", "")
	s.Apply(protocol.ServerFrame{T: "sent", TaskID: "t1", Delivered: protocol.DeliveryQueued})
	if sd.Delivered != protocol.DeliveryQueued {
		t.Fatalf("delivery %+v", sd)
	}
	s.Apply(events(ev(2, "task:t1", protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t1", Role: "user", From: "user", Text: "use the fixture"})))
	if sd.Seq != 2 || s.Task("t1").SendFor(2) != sd {
		t.Errorf("echo %+v", sd)
	}
	s.Apply(events(ev(3, "task:t1", protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t1", Role: "assistant", Text: "ok", Usage: &protocol.Usage{InputTokens: 10, OutputTokens: 2}})))
	if u := s.Task("t1").Usage; u.InputTokens != 10 || u.OutputTokens != 2 {
		t.Errorf("usage %+v", u)
	}
	sd2 := s.AddSend("t1", "again", "")
	s.Apply(protocol.ServerFrame{T: "error", Message: "task_send: runner is not available"})
	if sd2.Failed == "" {
		t.Error("refused send not failed")
	}
}

// Two sends with the same text: the echo carrying a clientId marks its own.
func TestDirectSendEchoByClientID(t *testing.T) {
	s := New()
	a := s.AddSend("t1", "go on", "k1")
	b := s.AddSend("t1", "go on", "k2")
	s.Apply(events(ev(5, "task:t1", protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t1", Role: "user", From: "user", Text: "go on", ClientID: "k2"})))
	if a.Seq != 0 || b.Seq != 5 {
		t.Errorf("a %+v b %+v", a, b)
	}
}

// The Log's record of a merge settles an action whose result was lost.
func TestActedFromLogClearsActingAndUnsure(t *testing.T) {
	s := New()
	tk := s.task("t1")
	tk.Acting = "merge"
	ok := protocol.NewEvent(3, "2026-11-09T20:00:00Z", "ducter", "channel", protocol.OriginUser, protocol.KindJobStatus,
		protocol.JobStatus{JobID: "act_t1_merge", TaskID: "t1", State: "done", Text: "merged"})
	s.Apply(events(ok))
	if tk.Acting != "" || tk.Acted == nil || tk.Acted.Action != "merge" {
		t.Errorf("acting %q acted %+v", tk.Acting, tk.Acted)
	}
	tk.Unsure = "open_pr"
	s.Apply(protocol.ServerFrame{T: "action_result", TaskID: "t1", Action: "open_pr", OK: false, Message: "no remote"})
	if tk.Unsure != "" {
		t.Errorf("a real result keeps unsure %q", tk.Unsure)
	}
}

func TestStaleWelcomeResets(t *testing.T) {
	s := New()
	s.Apply(events(ev(40, "channel", protocol.KindAIMsg, protocol.AIMsg{Text: "hi"})))
	if !s.Stale(protocol.ServerFrame{T: "welcome", HeadSeq: 3}) || s.Stale(protocol.ServerFrame{T: "welcome", HeadSeq: 40}) {
		t.Fatal("stale")
	}
	s.Reset()
	if s.Cursor != 0 || len(s.Channel) != 0 || s.Tasks == nil {
		t.Error("reset")
	}
}

func TestUserActionStatusMarksTaskActed(t *testing.T) {
	s := New()
	s.Tasks["t1"] = &Task{ID: "t1", seqs: map[int64]bool{}}
	ev := protocol.LogEvent{Seq: 9, Stream: "channel", Origin: protocol.OriginUser, Kind: "job_status",
		Body: []byte(`{"jobId":"act_t1_merge","taskId":"t1","state":"done","text":"merged"}`)}
	s.ApplyEvent(ev)
	if a := s.Tasks["t1"].Acted; a == nil || a.Action != "merge" || !a.OK {
		t.Fatalf("Acted = %+v, want merge ok", a)
	}
	for _, e := range s.Channel {
		if e != nil && e.Job != nil && e.Job.Status != nil && e.Job.Status.JobID == "act_t1_merge" {
			t.Fatal("a user action must not become a conversation entry")
		}
	}
}

// On a reconnect the channel replays before on_hand lists the tasks: a merge
// done earlier must survive, or the result offers Merge again.
func TestUserActionBeforeOnHandSurvives(t *testing.T) {
	s := New()
	s.Apply(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{{Seq: 29, Stream: "channel", Origin: protocol.OriginUser, Kind: "job_status",
		Body: []byte(`{"jobId":"act_t1_merge","taskId":"t1","state":"done","text":"merged"}`)}}})
	s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t1", Title: "fix", Attention: protocol.Done}}}})
	if a := s.Tasks["t1"].Acted; a == nil || a.Action != "merge" {
		t.Fatalf("Acted = %+v after on_hand, want merge", a)
	}
}

// Live: merged, then a follow-up went to the same task and came back done on
// the same branch. That new work is not merged: Merge comes back.
func TestNewWorkAfterAMergeIsNotMerged(t *testing.T) {
	s := New()
	act := protocol.LogEvent{Seq: 29, Stream: "channel", Origin: protocol.OriginUser, Kind: "job_status",
		Body: []byte(`{"jobId":"act_t1_merge","taskId":"t1","state":"done","text":"merged"}`)}
	done := func(seq int64) protocol.LogEvent {
		return ev(seq, "channel", protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: "t1", Kind: "done", Text: "ok"}}})
	}
	s.Apply(events(done(20), act))
	if s.Tasks["t1"].Acted == nil {
		t.Fatal("merge lost")
	}
	// A revision carrying the old done item along with another task's line: still merged.
	rev := ev(30, "channel", protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: "t1", Kind: "done", Text: "ok"}, {TaskID: "t2", Kind: "progress"}}})
	rev.Supersedes = 20
	s.Apply(events(rev))
	if s.Tasks["t1"].Acted == nil {
		t.Fatal("a revision cleared the merge")
	}
	s.Apply(events(done(48)))
	if s.Tasks["t1"].Acted != nil {
		t.Fatal("new work after the merge still shows as merged")
	}
}

func TestMemoryNotedIsOneQuietEntry(t *testing.T) {
	s := New()
	s.Apply(events(
		ev(1, "channel", protocol.KindUserMsg, protocol.UserMsg{Text: "以后测试都用假时钟"}),
		ev(2, "channel", protocol.KindAIMsg, protocol.AIMsg{Text: "好，以后都这样。", ReplyTo: 1}),
		ev(3, "channel", protocol.KindMemoryNoted, protocol.MemoryNoted{Title: "测试统一用假时钟", ReplyTo: 1}),
		ev(4, "channel", protocol.KindMemoryNoted, protocol.MemoryNoted{Title: " "}),
	))
	if len(s.Channel) != 3 {
		t.Fatalf("%d entries, want 3 (an empty title shows nothing)", len(s.Channel))
	}
	if n := s.Channel[2].Noted; n == nil || n.Title != "测试统一用假时钟" {
		t.Errorf("noted entry %+v", s.Channel[2])
	}
}

// D170: the user's other agents are quiet lines: a request in, a reply out,
// one line a day for a sender set aside; steps and early messages show nothing.
func TestBridgeMessagesAreQuietLines(t *testing.T) {
	s := New()
	in := protocol.BridgeMsg{Direction: "in", MessageID: "m1", From: "terminal-claude", Agent: "terminal-claude", Mine: true, Text: "push now?"}
	s.Apply(events(
		ev(1, "channel", protocol.KindBridgeMsg, in),
		ev(2, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "in", MessageID: "m0", From: "x", State: "early"}),
		ev(3, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "out", MessageID: "", To: "terminal-claude", Text: "用户选了：「等」", InReplyTo: "m1", State: "sending"}),
		ev(4, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "out", MessageID: "m2", To: "terminal-claude", Text: "用户选了：「等」", InReplyTo: "m1", State: "sent"}),
		ev(5, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "in", MessageID: "s1", From: "reviewer", State: "set_aside"}),
		ev(6, "channel", protocol.KindBridgeMsg, protocol.BridgeMsg{Direction: "in", MessageID: "s2", From: "reviewer", State: "set_aside"}),
	))
	if len(s.Channel) != 3 {
		t.Fatalf("%d entries, want 3 (request, reply, one set-aside line)", len(s.Channel))
	}
	if s.Channel[0].Peer == nil || s.Channel[1].Peer.State != "sent" || s.Channel[2].Peer.State != "set_aside" {
		t.Errorf("entries %+v", s.Channel)
	}
	if n := s.SetAside["reviewer|"+dayOfTS(s.Channel[2].Event.TS)]; n != 2 {
		t.Errorf("set aside %d, want 2", n)
	}
}

func dayOfTS(ts string) string { return firstN(ts, 10) }

// Merge / Open draft PR are offered only when the task's branch holds
// something its base doesn't (core's check at report time).
func TestCanIntegrateFollowsTheBranchCheck(t *testing.T) {
	s := New()
	place := protocol.Place{Kind: "repo", Device: "local", RepoPath: "/r", Worktree: "/w", Branch: "ducter/look", BaseBranch: "main"}
	s.Apply(events(ev(1, "task:tm", protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "tm", Title: "look", Place: place, Harness: "claude-code", Brief: "b"})))
	report := func(seq int64, b *protocol.BranchChanges) protocol.LogEvent {
		return ev(seq, "task:tm", protocol.KindReport, protocol.Report{TaskID: "tm", State: "done", Summary: "no files changed", Branch: b})
	}
	s.Apply(events(report(2, &protocol.BranchChanges{Commits: 0})))
	task := s.Tasks["tm"]
	if task == nil || task.CanIntegrate() {
		t.Fatalf("a branch with nothing on it offers Merge: %+v", task)
	}
	s.Apply(events(report(3, &protocol.BranchChanges{Commits: 1})))
	if !task.CanIntegrate() {
		t.Fatal("a branch with a commit offers no Merge")
	}
	s.Apply(events(report(4, nil)))
	if !task.CanIntegrate() {
		t.Fatal("unknown (an older core) should keep the actions")
	}
}
