// Package store is the client's model of the Log: the conversation as
// entries (with living messages revised in place and jobs folded into
// their acks), decisions, tasks with their streams, and the On hand
// snapshot. It is pure data, applied on the UI thread, and tested without
// a window.
package store

import (
	"sort"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Entry is one item of the conversation.
type Entry struct {
	Event protocol.LogEvent
	// One of these is set, by Event.Kind.
	User     *protocol.UserMsg
	AI       *protocol.AIMsg
	Job      *Job // for ack and orphan job_status entries
	Living   *protocol.LivingMsg
	Decision *protocol.Decision
	// Revision counts how often a living message was superseded in place,
	// for the re-settle motion.
	Revision int
	// FirstSeq is the seq the entry was first shown at: a revised living
	// message keeps its place and its key.
	FirstSeq int64
}

// Job is an ack and the latest status line of its job.
type Job struct {
	ID     string
	Ack    *protocol.Ack
	Status *protocol.JobStatus
}

// DecisionState is a decision and how it was resolved, if it was.
type DecisionState struct {
	protocol.Decision
	Seq      int64
	Resolved *protocol.DecisionResolved
	// Pending is set when the user acted and the server has not resolved
	// it yet.
	Pending string
}

// CheckpointAt is a checkpoint with its time.
type CheckpointAt struct {
	protocol.Checkpoint
	Seq int64
	TS  string
}

// Task is what the client knows of one task.
type Task struct {
	ID          string
	Open        *protocol.TaskOpen
	State       *protocol.TaskState
	LastReport  *protocol.Report
	Card        *protocol.TaskCard
	Checkpoints []CheckpointAt
	Evidence    []protocol.EvidenceRef
	// Events is the task's stream, in seq order.
	Events []protocol.LogEvent
	seqs   map[int64]bool
	// HistoryLoaded is set once a task_history frame arrived.
	HistoryLoaded bool
	// OpenedAt is the time of task_open, when known.
	OpenedAt string
	// Version bumps when Events change, for views that recompute (diff).
	Version int
}

// Title is the task's title.
func (t *Task) Title() string {
	switch {
	case t.Open != nil && t.Open.Title != "":
		return t.Open.Title
	case t.Card != nil:
		return t.Card.Title
	}
	return ""
}

// Attention is the task's live attention state.
func (t *Task) Attention() protocol.Attention {
	switch {
	case t.State != nil:
		return t.State.Attention
	case t.Card != nil:
		return t.Card.Attention
	}
	return protocol.Queued
}

// Reason is why the task is in its state.
func (t *Task) Reason() string {
	switch {
	case t.State != nil && t.State.Reason != "":
		return t.State.Reason
	case t.Card != nil:
		return t.Card.Reason
	}
	return ""
}

// Place is where the task works.
func (t *Task) Place() protocol.Place {
	switch {
	case t.Open != nil:
		return t.Open.Place
	case t.Card != nil:
		return t.Card.Place
	}
	return protocol.Place{Kind: "none"}
}

// Report is the last report known.
func (t *Task) Report() *protocol.Report {
	if t.LastReport != nil {
		return t.LastReport
	}
	if t.Card != nil {
		return t.Card.LastReport
	}
	return nil
}

// Harness, Model, Project, BodyReason come from task_open or the card.
func (t *Task) Harness() string {
	if t.Open != nil {
		return t.Open.Harness
	}
	if t.Card != nil {
		return t.Card.Harness
	}
	return ""
}

func (t *Task) Model() string {
	if t.Open != nil && t.Open.Model != "" {
		return t.Open.Model
	}
	if t.Card != nil {
		return t.Card.Model
	}
	return ""
}

func (t *Task) Project() string {
	if t.Open != nil {
		return t.Open.Project
	}
	if t.Card != nil {
		return t.Card.Project
	}
	return ""
}

func (t *Task) BodyReason() string {
	if t.Open != nil && t.Open.BodyReason != "" {
		return t.Open.BodyReason
	}
	if t.Card != nil {
		return t.Card.BodyReason
	}
	return ""
}

// Store is the client's state.
type Store struct {
	Persona     string
	PersonaName string
	HeadSeq     int64
	// Cursor is the highest seq applied from the live stream.
	Cursor int64
	// ReadUpTo is the last read receipt.
	ReadUpTo int64

	Channel   []*Entry
	bySeq     map[int64]*Entry
	Jobs      map[string]*Job
	Decisions map[string]*DecisionState
	Tasks     map[string]*Task
	OnHand    *protocol.OnHand
	// Errors are the server's error frames, newest last.
	Errors []string
}

// New makes an empty store.
func New() *Store {
	return &Store{
		PersonaName: "Ducter",
		bySeq:       map[int64]*Entry{},
		Jobs:        map[string]*Job{},
		Decisions:   map[string]*DecisionState{},
		Tasks:       map[string]*Task{},
	}
}

// Apply applies one server frame.
func (s *Store) Apply(f protocol.ServerFrame) {
	switch f.T {
	case "welcome":
		s.Persona, s.HeadSeq = f.Persona, f.HeadSeq
		if f.PersonaName != "" {
			s.PersonaName = f.PersonaName
		}
	case "events":
		for _, ev := range f.Events {
			s.ApplyEvent(ev)
			s.Cursor = max(s.Cursor, ev.Seq)
		}
	case "on_hand":
		if f.OnHand != nil {
			s.applyOnHand(f.OnHand)
		}
	case "task_history":
		t := s.task(f.TaskID)
		for _, ev := range f.Events {
			s.ApplyEvent(ev)
		}
		t.HistoryLoaded = true
	case "error":
		s.Errors = append(s.Errors, f.Message)
	}
}

func (s *Store) task(id string) *Task {
	t := s.Tasks[id]
	if t == nil {
		t = &Task{ID: id, seqs: map[int64]bool{}}
		s.Tasks[id] = t
	}
	return t
}

// Task returns a task, or nil.
func (s *Store) Task(id string) *Task { return s.Tasks[id] }

func (s *Store) applyOnHand(o *protocol.OnHand) {
	s.OnHand = o
	for i := range o.Tasks {
		card := o.Tasks[i]
		t := s.task(card.TaskID)
		t.Card = &card
		// A snapshot is newer than every task_state that arrived before it;
		// later task_state events override it again.
		t.State = &protocol.TaskState{TaskID: card.TaskID, Attention: card.Attention, Residency: card.Residency, Reason: card.Reason}
		if card.LastReport != nil {
			t.LastReport = card.LastReport
		}
	}
}

// ApplyEvent applies one Log event, from the live stream or a history.
// Events seen before are ignored.
func (s *Store) ApplyEvent(ev protocol.LogEvent) {
	body, err := ev.Typed()
	if err != nil || body == nil {
		return
	}
	if taskID := taskOf(ev, body); taskID != "" {
		t := s.task(taskID)
		if !t.seqs[ev.Seq] {
			t.seqs[ev.Seq] = true
			s.applyTask(t, ev, body)
		}
	}
	if ev.Stream != "channel" {
		// Decisions may be logged on a task's stream too.
		if d, ok := body.(*protocol.Decision); ok {
			s.addDecision(ev, d)
		}
		if r, ok := body.(*protocol.DecisionResolved); ok {
			s.resolve(r)
		}
		return
	}
	if _, dup := s.bySeq[ev.Seq]; dup {
		return
	}
	switch b := body.(type) {
	case *protocol.UserMsg:
		s.add(&Entry{Event: ev, User: b})
	case *protocol.AIMsg:
		s.add(&Entry{Event: ev, AI: b})
	case *protocol.Ack:
		j := s.job(b.JobID)
		j.Ack = b
		s.add(&Entry{Event: ev, Job: j})
	case *protocol.JobStatus:
		j := s.Jobs[b.JobID]
		if j == nil {
			j = s.job(b.JobID)
			j.Status = b
			s.add(&Entry{Event: ev, Job: j})
			return
		}
		j.Status = b
		s.bySeq[ev.Seq] = nil // seen, not an entry of its own
	case *protocol.LivingMsg:
		if old := s.bySeq[ev.Supersedes]; ev.Supersedes != 0 && old != nil && old.Living != nil {
			old.Event, old.Living = ev, b
			old.Revision++
			s.bySeq[ev.Seq] = old
			return
		}
		s.add(&Entry{Event: ev, Living: b})
	case *protocol.Decision:
		s.addDecision(ev, b)
		s.add(&Entry{Event: ev, Decision: b})
	case *protocol.DecisionResolved:
		s.resolve(b)
		s.bySeq[ev.Seq] = nil
	case *protocol.ReadReceipt:
		s.ReadUpTo = max(s.ReadUpTo, b.UpToSeq)
		s.bySeq[ev.Seq] = nil
	default:
		s.bySeq[ev.Seq] = nil
	}
}

func (s *Store) add(e *Entry) {
	e.FirstSeq = e.Event.Seq
	s.bySeq[e.Event.Seq] = e
	// Keep seq order even when a history or a reconnect delivers late.
	i := sort.Search(len(s.Channel), func(i int) bool { return s.Channel[i].FirstSeq > e.FirstSeq })
	s.Channel = append(s.Channel, nil)
	copy(s.Channel[i+1:], s.Channel[i:])
	s.Channel[i] = e
}

func (s *Store) job(id string) *Job {
	j := s.Jobs[id]
	if j == nil {
		j = &Job{ID: id}
		s.Jobs[id] = j
	}
	return j
}

func (s *Store) addDecision(ev protocol.LogEvent, d *protocol.Decision) {
	if old := s.Decisions[d.DecisionID]; old != nil {
		old.Decision = *d
		return
	}
	s.Decisions[d.DecisionID] = &DecisionState{Decision: *d, Seq: ev.Seq}
}

func (s *Store) resolve(r *protocol.DecisionResolved) {
	d := s.Decisions[r.DecisionID]
	if d == nil {
		d = &DecisionState{Decision: protocol.Decision{DecisionID: r.DecisionID}}
		s.Decisions[r.DecisionID] = d
	}
	d.Resolved = r
	d.Pending = ""
}

func taskOf(ev protocol.LogEvent, body any) string {
	switch b := body.(type) {
	case *protocol.TaskOpen:
		return b.TaskID
	case *protocol.TaskState:
		return b.TaskID
	case *protocol.TaskEvent:
		return b.TaskID
	case *protocol.Report:
		return b.TaskID
	case *protocol.Checkpoint:
		return b.TaskID
	}
	if len(ev.Stream) > 5 && ev.Stream[:5] == "task:" {
		return ev.Stream[5:]
	}
	return ""
}

func (s *Store) applyTask(t *Task, ev protocol.LogEvent, body any) {
	i := sort.Search(len(t.Events), func(i int) bool { return t.Events[i].Seq > ev.Seq })
	t.Events = append(t.Events, protocol.LogEvent{})
	copy(t.Events[i+1:], t.Events[i:])
	t.Events[i] = ev
	t.Version++
	switch b := body.(type) {
	case *protocol.TaskOpen:
		t.Open = b
		t.OpenedAt = ev.TS
	case *protocol.TaskState:
		t.State = b
	case *protocol.Report:
		t.LastReport = b
		t.Evidence = mergeEvidence(t.Evidence, b.Evidence)
	case *protocol.Checkpoint:
		t.Checkpoints = append(t.Checkpoints, CheckpointAt{Checkpoint: *b, Seq: ev.Seq, TS: ev.TS})
		sort.Slice(t.Checkpoints, func(i, j int) bool { return t.Checkpoints[i].Seq < t.Checkpoints[j].Seq })
	}
}

func mergeEvidence(have, add []protocol.EvidenceRef) []protocol.EvidenceRef {
	for _, e := range add {
		dup := false
		for _, h := range have {
			if h.Ref == e.Ref && h.Label == e.Label {
				dup = true
				break
			}
		}
		if !dup {
			have = append(have, e)
		}
	}
	return have
}

// Unread reports whether an entry came after the last read receipt.
func (s *Store) Unread(e *Entry) bool { return e.Event.Seq > s.ReadUpTo }

// LatestLiving is the newest living message entry, or nil.
func (s *Store) LatestLiving() *Entry {
	for i := len(s.Channel) - 1; i >= 0; i-- {
		if s.Channel[i].Living != nil {
			return s.Channel[i]
		}
	}
	return nil
}

// DecisionShownInLiving reports whether a living message carries the
// decision, so the conversation does not show it twice.
func (s *Store) DecisionShownInLiving(id string) bool {
	for _, e := range s.Channel {
		if e.Living == nil {
			continue
		}
		for _, it := range e.Living.Items {
			if it.DecisionID == id {
				return true
			}
		}
	}
	return false
}

// PendingDecision is the unresolved decision of a task, or nil.
func (s *Store) PendingDecision(taskID string) *DecisionState {
	var best *DecisionState
	for _, d := range s.Decisions {
		if d.TaskID == taskID && d.Resolved == nil && (best == nil || d.Seq > best.Seq) {
			best = d
		}
	}
	if best == nil {
		if t := s.Tasks[taskID]; t != nil && t.Card != nil && t.Card.PendingDecisionID != "" {
			if d := s.Decisions[t.Card.PendingDecisionID]; d != nil && d.Resolved == nil {
				return d
			}
		}
	}
	return best
}

// Lane is where a task goes on the On hand board.
type Lane int

const (
	LaneNeedsYou Lane = iota
	LaneWorking
	LaneWaiting
	LaneDone
	LaneHidden
)

// LaneOf returns a task's lane by its attention state.
func LaneOf(a protocol.Attention) Lane {
	switch a {
	case protocol.NeedsYou:
		return LaneNeedsYou
	case protocol.Working, protocol.Queued:
		return LaneWorking
	case protocol.Blocked:
		return LaneWaiting
	case protocol.Done, protocol.DoneClaimed, protocol.Failed:
		return LaneDone
	}
	return LaneHidden
}

// Board is the On hand board: tasks by lane, newest first, and the counts.
type Board struct {
	Lanes  [4][]*Task
	Counts protocol.Counts
}

// Board builds the board from the snapshot's tasks, with their live
// states; tasks seen only in the stream join it too.
func (s *Store) Board() Board {
	var b Board
	seen := map[string]bool{}
	var tasks []*Task
	if s.OnHand != nil {
		for _, c := range s.OnHand.Tasks {
			if t := s.Tasks[c.TaskID]; t != nil && !seen[t.ID] {
				seen[t.ID] = true
				tasks = append(tasks, t)
			}
		}
	}
	var extra []*Task
	for id, t := range s.Tasks {
		if !seen[id] && (t.Open != nil || t.Card != nil) {
			extra = append(extra, t)
		}
	}
	sort.Slice(extra, func(i, j int) bool { return extra[i].firstSeq() > extra[j].firstSeq() })
	tasks = append(extra, tasks...)
	for _, t := range tasks {
		if l := LaneOf(t.Attention()); l != LaneHidden {
			b.Lanes[l] = append(b.Lanes[l], t)
		}
	}
	b.Counts = protocol.Counts{NeedsYou: len(b.Lanes[LaneNeedsYou]), Working: len(b.Lanes[LaneWorking]), Waiting: len(b.Lanes[LaneWaiting]), DoneToday: len(b.Lanes[LaneDone])}
	if s.OnHand != nil && len(extra) == 0 && s.OnHand.Counts.DoneToday > b.Counts.DoneToday {
		b.Counts.DoneToday = s.OnHand.Counts.DoneToday
	}
	return b
}

func (t *Task) firstSeq() int64 {
	if len(t.Events) > 0 {
		return t.Events[0].Seq
	}
	return 0
}

// ParseTime parses an ISO time, zero when empty or bad.
func ParseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}
	}
	return t
}
