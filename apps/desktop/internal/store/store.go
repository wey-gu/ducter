// Package store is the client's model of the Log: the conversation as
// entries (with living messages revised in place and jobs folded into
// their acks), decisions, tasks with their streams, and the On hand
// snapshot. It is pure data, applied on the UI thread, and tested without
// a window.
package store

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
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
	Noted    *protocol.MemoryNoted // something the partner remembered
	// Finds is a note the partner said by itself (D165); a fold-in or an
	// answer revises it in place.
	Finds *protocol.Finds
	Peer  *protocol.BridgeMsg // D170: one quiet line about the user's other agents
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
	// AnsweredAt is when the user acted on it here.
	AnsweredAt time.Time
	// AskedAt is when the decision was asked, when known (the event's
	// time, or the card's pendingDecision.askedAt).
	AskedAt string
	// Said is a task's question in the partner's own words (D129), once
	// the partner has said it; the task's wording stays in Question.
	Said string
}

// Send is text the user sent straight into a task, and how it was
// delivered once the server acked it.
type Send struct {
	Text string
	// ClientID is the id it was sent with; a resend uses the same one.
	ClientID  string
	Delivered protocol.Delivery // "" until the "sent" ack
	// Seq is the logged task_event that echoes it, once it arrived.
	Seq int64
	// Failed holds the server's error, if it refused the send.
	Failed string
	// At is when the user sent it (set by the app).
	At time.Time
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
	// Body is who does it now and why (the latest body_selected, D89).
	Body    *protocol.TaskBody
	bodySeq int64
	// OpenedAt is the time of task_open, when known.
	OpenedAt string
	// D157: when the task was placed on its computer (its first task_open,
	// or the one that moved it), and the computer it came from on a move.
	PlacedAt  string
	MovedFrom string
	openSeq   int64 // seq of the task_open in Open (a retitle is a later one)
	// Version bumps when Events change, for views that recompute (diff).
	Version int
	// Sends are the user's direct messages to the task, oldest first.
	Sends []*Send
	// Usage sums the token use of the turns seen.
	Usage protocol.Usage
	// Compactions is how many times the harness compacted the task's context (D135).
	Compactions int
	// Browser is what a browser task last looked at (task_event
	// {role: system, raw.browser: {host, url}}), nil until one.
	Browser *BrowserStatus
	// Acting is the task_action awaiting its action_result ("" when none).
	Acting string
	// Unsure is a merge or open_pr whose result was lost with the socket
	// and that the Log doesn't show done: it may or may not have happened
	// ("Not sure it went through — check"). Never shown as a failure.
	Unsure string
	// Acted is the last action_result for this task, and the seq it was
	// logged at (the head seq for a live result). New work reported after
	// it (a follow-up done on the same branch) clears it: that work isn't
	// merged.
	Acted    *protocol.ServerFrame
	ActedSeq int64
	// Folder is the list behind a non-git folder task's Changes (D142),
	// from the last folder_changes frame; nil until asked.
	Folder *protocol.FolderChanges
}

// BrowserStatus is where a browser task's browser is.
type BrowserStatus struct {
	Host string `json:"host"`
	URL  string `json:"url"`
	// Own: the task works in the user's own Chrome, with the harness's own tools (D126).
	Own bool  `json:"own,omitempty"`
	Seq int64 `json:"-"`
}

// BrowsingKey is the i18n key for the line that says where it is looking.
func (t *Task) BrowsingKey() string {
	if t.Browser != nil && t.Browser.Own {
		return "browser.looking.own"
	}
	return "browser.looking"
}

// Browsing is the host a running task's browser is on, or "".
func (t *Task) Browsing() string {
	if t.Browser == nil {
		return ""
	}
	switch t.Attention() {
	case protocol.Working, protocol.Queued, protocol.NeedsYou, protocol.Blocked:
		return t.Browser.Host
	}
	return ""
}

// SendFor returns the user's send that a logged task_event echoes, or nil.
func (t *Task) SendFor(seq int64) *Send {
	for _, s := range t.Sends {
		if s.Seq == seq {
			return s
		}
	}
	return nil
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

// CanIntegrate is whether Merge into main / Open draft PR make sense: a
// repo task with a branch that holds something its base doesn't (core
// checks at report time; unknown counts as yes). Never on a failed task.
func (t *Task) CanIntegrate() bool {
	p := t.Place()
	return t.Attention() != protocol.Failed && p.Kind == "repo" && p.Branch != "" && protocol.HasBranchChanges(t.Report())
}

// Who returns who does the task now and why: the latest body_selected,
// else the card's, else nil (a task from before D89).
func (t *Task) Who() *protocol.TaskBody {
	if t.Body != nil {
		return t.Body
	}
	if t.Card != nil {
		return t.Card.Body
	}
	return nil
}

// Harness, Model, Project, BodyReason come from who does it now, task_open
// or the card.
func (t *Task) Harness() string {
	if w := t.Who(); w != nil {
		return w.Harness
	}
	if t.Open != nil {
		return t.Open.Harness
	}
	if t.Card != nil {
		return t.Card.Harness
	}
	return ""
}

// Effort is the reasoning effort the task runs at, when the user picked one (D202).
func (t *Task) Effort() string {
	if w := t.Who(); w != nil {
		return w.Effort
	}
	if t.Open != nil && t.Open.Effort != "" {
		return t.Open.Effort
	}
	if t.Card != nil {
		return t.Card.Effort
	}
	return ""
}

func (t *Task) Model() string {
	if w := t.Who(); w != nil {
		return w.Model
	}
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

// deviceOfPlace is the computer a place names ("local" for the home).
func deviceOfPlace(p protocol.Place) string {
	if p.Device == "" {
		return "local"
	}
	return p.Device
}

// Store is the client's state.
type Store struct {
	// SetAside counts, per sender and day ("from|2026-11-10"), the messages
	// over its daily quota (D163); one quiet line says how many.
	SetAside map[string]int
	// ActionResults are action_result frames not yet shown to the user.
	ActionResults []protocol.ServerFrame
	// First is the empty conversation's words from the home (D149); nil
	// from an older Ducter, which gets the client's own everyday ones.
	First       *protocol.FirstScreen
	Persona     string
	PersonaName string
	// Machine is the welcome's hash of the machine the main runs on ("" from
	// an older Ducter): it says whether place paths are on this computer.
	Machine string
	HeadSeq int64
	// Cursor is the highest seq applied from the live stream.
	Cursor int64
	// ReadUpTo is the last read receipt.
	ReadUpTo int64
	// ChannelSeq is the newest channel event the user can see (read
	// receipts don't count, or reading would never settle).
	ChannelSeq int64

	Channel   []*Entry
	bySeq     map[int64]*Entry
	Jobs      map[string]*Job
	Decisions map[string]*DecisionState
	Tasks     map[string]*Task
	// FindStates are each find's latest change (D165), by find id.
	FindStates map[string]*protocol.FindState
	// LastUserSeq is the user's latest message.
	LastUserSeq int64
	notes       map[string]*Entry
	OnHand      *protocol.OnHand
	// Waiters are the waiters known, by id (from waiter events and the
	// snapshot's armed list).
	Waiters map[string]*protocol.Waiter
	// Missed are the task-less waits that ended unmet (D145), by id.
	Missed map[string]*protocol.Waiter
	// Arrived is when a task's wait came true (D115): its card pops and glides into Working.
	Arrived map[string]time.Time
	// Errors are the server's error frames, newest last.
	Errors []string
	// Welcomed is set once the server said welcome on this store.
	Welcomed bool

	// Devices is Your devices and abilities, as the server last sent it;
	// DevicesAt is when (zero until the first devices frame).
	Devices   []protocol.DeviceView
	Reach     *protocol.Reach
	DevicesAt time.Time
	// AbilityResults are ability_result frames not yet handled by the view.
	AbilityResults []protocol.ServerFrame
	// Live is the live view of Ducter's browser while the user signs in
	// (D151); nil when none is open. LiveClosed is the last close the view
	// has not said yet. BrowserSites is Devices › 上网's signed-in sites.
	Live         *LiveView
	LiveClosed   *protocol.ServerFrame
	BrowserSites *protocol.ServerFrame
	// Saved is 设置 › 自动填充 / Autofill (D191): names, last four, where used; never a secret.
	Saved *protocol.ServerFrame
	// PairCode is the newest pairing code the server minted for this app.
	PairCode *protocol.ServerFrame
	// Renamed is the server's answer to the last 改名字 / Rename.
	Renamed *protocol.ServerFrame
	// DeviceResult is the server's answer to the last 断开 / Disconnect or
	// 更新 / Update on a device's card (D148).
	DeviceResult *protocol.ServerFrame
	// Settings and Mem are the partner's settings and memory, as last sent
	// (nil until the first settings frame); Forgot the last forget's
	// outcome, until the view shows it.
	Settings *protocol.Settings
	Mem      *protocol.MemView
	// Bridge is the persona's own connection row (D205), as last sent.
	Bridge *protocol.BridgeView
	// BrainNow is what the partner thinks with right now (D150).
	BrainNow *protocol.BrainNow
	// Connections (D96), once asked for; nil means not yet. Oo is what the
	// oo CLI is set up with. ConnResult is the last add/remove answer, for
	// the page to turn into one line.
	Connections []protocol.ConnectionView
	ConnAsked   bool
	// ConnReads is 看了哪些 / What it read today, by connection (D166).
	ConnReads  map[string][]protocol.ReadLine
	Oo         *protocol.OoDetect
	ConnResult *protocol.ServerFrame
	// SignIn is the device sign-in in progress or just ended (D193); nil
	// when none. VoiceResult is the last phone_voice answer, until the
	// phone card takes it.
	SignIn      *protocol.SignInView
	VoiceResult *protocol.ServerFrame
	Forgot      *protocol.Forgot
	// Rules are 你的规则 / Your rules, as last sent (nil until a rules
	// frame; RulesAt says one came). Candidates are who could do a task,
	// by task id, as last asked; SwitchResults the switch answers not yet
	// shown (D89).
	Rules         []protocol.RuleView
	RulesAt       time.Time
	Candidates    map[string][]protocol.Candidate
	SwitchResults []protocol.ServerFrame

	// Activity is what the partner is doing while the user waits on its
	// reply (D104), nil between turns; ActivityAt is when this app first
	// saw that step (its own clock, so a skewed server can't make it look
	// slow); ActivityEndedAt is the channel seq at which a turn last ended:
	// a user message at or before it has had its turn.
	Activity        *protocol.PartnerActivity
	ActivityAt      time.Time
	ActivityEndedAt int64

	// New task (D128): what the card offers, as last sent (nil until asked);
	// NewTaskResults the task_new answers and OpenRequests the open_task
	// frames (`ducter open`) the view has not taken yet.
	NewTaskOptions *protocol.ServerFrame
	NewTaskResults []protocol.ServerFrame
	// FolderBrowse is the last folder_browse answer (D203, Find a folder…).
	FolderBrowse *protocol.ServerFrame
	OpenRequests []string
}

// Device returns a device of Your devices and abilities by id, or nil.
func (s *Store) Device(id string) *protocol.DeviceView {
	for i := range s.Devices {
		if s.Devices[i].ID == id {
			return &s.Devices[i]
		}
	}
	return nil
}

// New makes an empty store.
func New() *Store {
	return &Store{
		PersonaName: "Ducter",
		bySeq:       map[int64]*Entry{},
		Jobs:        map[string]*Job{},
		Decisions:   map[string]*DecisionState{},
		Tasks:       map[string]*Task{},
		FindStates:  map[string]*protocol.FindState{},
		notes:       map[string]*Entry{},
		Waiters:     map[string]*protocol.Waiter{},
		Missed:      map[string]*protocol.Waiter{},
	}
}

// Stale reports whether a welcome comes from a Log that no longer holds
// what this store has seen (the backend's data was reset): its head is
// behind the cursor. The store must then start over.
func (s *Store) Stale(f protocol.ServerFrame) bool {
	return f.T == "welcome" && s.Cursor > 0 && f.HeadSeq < s.Cursor
}

// Reset forgets everything, for a Log that started over.
func (s *Store) Reset() {
	*s = *New()
}

// Apply applies one server frame.
func (s *Store) Apply(f protocol.ServerFrame) {
	switch f.T {
	case "welcome":
		s.Persona, s.HeadSeq, s.Machine = f.Persona, f.HeadSeq, f.Machine
		s.Welcomed = true
		if f.PersonaName != "" {
			s.PersonaName = f.PersonaName
		}
	case "first_screen":
		s.First = f.First
	case "devices":
		for i := range f.Devices {
			dropStaleFailure(f.Devices[i].Update)
			for j := range f.Devices[i].Harnesses {
				dropStaleAgentUpdate(&f.Devices[i].Harnesses[j])
			}
		}
		s.Devices, s.Reach, s.DevicesAt = f.Devices, f.Reach, time.Now()
	case "ability_result":
		s.AbilityResults = append(s.AbilityResults, f)
	case "live", "live_frame", "live_turn", "live_doing":
		s.applyLive(f)
	case "saved":
		fc := f
		s.Saved = &fc
	case "browser_sites":
		fc := f
		s.BrowserSites = &fc
	case "pair_code":
		fc := f
		s.PairCode = &fc
	case "rename_result":
		fc := f
		s.Renamed = &fc
	case "disconnect_result", "update_result", "agent_update_result", "mem_plugin_result":
		fc := f
		s.DeviceResult = &fc
	case "settings":
		if f.Settings != nil {
			s.Settings = f.Settings
			if f.Settings.Name != "" {
				s.PersonaName = f.Settings.Name
			}
		}
		if f.Mem != nil {
			s.Mem = f.Mem
		}
		s.BrainNow = f.BrainNow
		s.Bridge = f.Bridge
		if f.Forgot != nil {
			s.Forgot = f.Forgot
		}
	case "connection_reads":
		if s.ConnReads == nil {
			s.ConnReads = map[string][]protocol.ReadLine{}
		}
		s.ConnReads[f.ID] = append([]protocol.ReadLine{}, f.Reads...)
	case "connections":
		s.Connections, s.Oo, s.ConnAsked = f.Connections, f.Oo, true
		if s.Connections == nil {
			s.Connections = []protocol.ConnectionView{}
		}
	case "connection_result":
		fc := f
		s.ConnResult = &fc
	case "connection_signin":
		s.SignIn = f.SignIn
	case "phone_voice_result":
		fc := f
		s.VoiceResult = &fc
	case "sent":
		if t := s.Tasks[f.TaskID]; t != nil {
			for _, sd := range t.Sends {
				if sd.Delivered == "" && sd.Failed == "" {
					sd.Delivered = f.Delivered
					break
				}
			}
		}
	case "folder_changes":
		if t := s.Tasks[f.TaskID]; t != nil {
			t.Folder = f.FolderChanges
		}
	case "rules":
		s.Rules, s.RulesAt = f.Rules, time.Now()
	case "candidates":
		if s.Candidates == nil {
			s.Candidates = map[string][]protocol.Candidate{}
		}
		s.Candidates[f.TaskID] = f.Candidates
	case "task_new_options":
		fc := f
		s.NewTaskOptions = &fc
	case "task_new_result", "project_add_result", "project_clone_result":
		s.NewTaskResults = append(s.NewTaskResults, f)
	case "folder_browse_result":
		fc := f
		s.FolderBrowse = &fc
	case "open_task":
		if f.TaskID != "" {
			s.OpenRequests = append(s.OpenRequests, f.TaskID)
		}
	case "action_result":
		// A switch is not a task action the result line shows (Merge stays as it was).
		if f.Action == "switch" {
			s.SwitchResults = append(s.SwitchResults, f)
			return
		}
		if t := s.Tasks[f.TaskID]; t != nil {
			fc := f
			t.Acting, t.Unsure, t.Acted, t.ActedSeq = "", "", &fc, s.HeadSeq
		}
		s.ActionResults = append(s.ActionResults, f)
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
	case "activity":
		switch {
		case f.Activity == nil:
			s.Activity = nil
			s.ActivityEndedAt = s.ChannelSeq
		case s.Activity == nil || s.Activity.Step != f.Activity.Step:
			s.Activity, s.ActivityAt = f.Activity, time.Now()
		}
	case "error":
		s.Errors = append(s.Errors, f.Message)
		// A refused task_send fails the oldest unacked send.
		if strings.HasPrefix(f.Message, "task_send:") {
			for _, t := range s.Tasks {
				for _, sd := range t.Sends {
					if sd.Delivered == "" && sd.Failed == "" {
						sd.Failed = strings.TrimSpace(strings.TrimPrefix(f.Message, "task_send:"))
						return
					}
				}
			}
		}
	}
}

// AddSend records text the user is sending straight into a task.
func (s *Store) AddSend(taskID, text, clientID string) *Send {
	t := s.task(taskID)
	sd := &Send{Text: text, ClientID: clientID}
	t.Sends = append(t.Sends, sd)
	return sd
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
	if o.Waiters != nil {
		// The snapshot lists the armed waiters: any other armed one we hold
		// has fired or been cancelled meanwhile.
		armed := map[string]bool{}
		for i := range o.Waiters {
			w := o.Waiters[i]
			armed[w.WaiterID] = true
			s.Waiters[w.WaiterID] = &w
		}
		for id, w := range s.Waiters {
			if w.State == protocol.WaiterArmed && !armed[id] {
				delete(s.Waiters, id)
			}
		}
	}
	if o.Missed != nil {
		s.Missed = map[string]*protocol.Waiter{}
		for i := range o.Missed {
			w := o.Missed[i]
			s.Missed[w.WaiterID] = &w
		}
	}
	for i := range o.Tasks {
		card := o.Tasks[i]
		t := s.task(card.TaskID)
		t.Card = &card
		if t.OpenedAt == "" {
			t.OpenedAt = card.OpenedAt
		}
		if pd := card.PendingDecision; pd != nil {
			d := s.Decisions[pd.DecisionID]
			if d == nil {
				d = &DecisionState{Decision: pd.Decision}
				s.Decisions[pd.DecisionID] = d
			}
			if d.AskedAt == "" {
				d.AskedAt = pd.AskedAt
			}
			if d.Question == "" {
				d.Decision = pd.Decision
			}
		}
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
	if w, ok := body.(*protocol.Waiter); ok {
		if w.State == protocol.WaiterFired && w.TaskID != "" && (w.Check != nil || w.Event != nil) {
			if s.Arrived == nil {
				s.Arrived = map[string]time.Time{}
			}
			s.Arrived[w.TaskID] = time.Now()
		}
		// A routine's watch lives on its routine card (D114), not as a wait.
		if w.State == protocol.WaiterArmed && w.RoutineID == "" {
			if prev := s.Waiters[w.WaiterID]; prev != nil {
				w.LastLookAt, w.LastSummary, w.Looks, w.Changes = prev.LastLookAt, prev.LastSummary, prev.Looks, prev.Changes
			}
			s.Waiters[w.WaiterID] = w
		} else {
			delete(s.Waiters, w.WaiterID)
		}
		if w.State == protocol.WaiterArmed {
			delete(s.Missed, w.WaiterID)
		} else if w.EndedUnmet() {
			m := *w
			m.EndedAt = ev.TS
			s.Missed[w.WaiterID] = &m
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
	if ev.Kind != protocol.KindReadReceipt {
		s.ChannelSeq = max(s.ChannelSeq, ev.Seq)
	}
	switch b := body.(type) {
	case *protocol.UserMsg:
		s.LastUserSeq = max(s.LastUserSeq, ev.Seq)
		s.add(&Entry{Event: ev, User: b})
	case *protocol.Finds:
		s.addFinds(ev, b)
	case *protocol.FindState:
		s.FindStates[b.FindID] = b
		s.bySeq[ev.Seq] = nil
	case *protocol.AIMsg:
		// A task's question in the partner's words (D129) is that question's
		// words, not a message of its own.
		if b.DecisionID != "" {
			d := s.Decisions[b.DecisionID]
			if d == nil {
				d = &DecisionState{Decision: protocol.Decision{DecisionID: b.DecisionID}}
				s.Decisions[b.DecisionID] = d
			}
			d.Said = b.Text
			s.bySeq[ev.Seq] = nil
			return
		}
		s.add(&Entry{Event: ev, AI: b})
	case *protocol.Ack:
		j := s.job(b.JobID)
		j.Ack = b
		s.add(&Entry{Event: ev, Job: j})
	case *protocol.JobStatus:
		// A "body_<task>_…" note tells the partner the user switched who does a task; the
		// task's own line already says it (D89).
		if ev.Origin == protocol.OriginUser && strings.HasPrefix(b.JobID, "body_") {
			s.bySeq[ev.Seq] = nil
			return
		}
		// A user-origin "act_<task>_<action>" status records what the user did by button
		// (merge, open_pr): the durable form of an action_result, so it survives restarts.
		if ev.Origin == protocol.OriginUser && b.TaskID != "" && strings.HasPrefix(b.JobID, "act_"+b.TaskID+"_") {
			// On (re)connect the channel replays before on_hand lists the task: keep the
			// action on a task that only on_hand will fill in, or Merge comes back.
			t := s.task(b.TaskID)
			action := strings.TrimPrefix(b.JobID, "act_"+b.TaskID+"_")
			t.Acted = &protocol.ServerFrame{T: "action_result", TaskID: b.TaskID, Action: action, OK: true}
			// The Log says it happened: an action whose result was lost resolves here.
			if t.Acting == action {
				t.Acting = ""
			}
			if t.Unsure == action {
				t.Unsure = ""
			}
			t.ActedSeq = ev.Seq
			s.bySeq[ev.Seq] = nil
			return
		}
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
		var before *protocol.LivingMsg
		if old := s.bySeq[ev.Supersedes]; ev.Supersedes != 0 && old != nil {
			before = old.Living
		}
		s.newWorkAfterAction(ev.Seq, before, b)
		if old := s.bySeq[ev.Supersedes]; ev.Supersedes != 0 && old != nil && old.Living != nil {
			old.Event, old.Living = ev, b
			old.Revision++
			s.bySeq[ev.Seq] = old
			return
		}
		s.add(&Entry{Event: ev, Living: b})
	case *protocol.Decision:
		s.addDecision(ev, b)
		if b.FindID != "" {
			// A find's next step lives inside its note (D165).
			s.bySeq[ev.Seq] = nil
			return
		}
		s.add(&Entry{Event: ev, Decision: b})
	case *protocol.DecisionResolved:
		s.resolve(b)
		s.bySeq[ev.Seq] = nil
	case *protocol.ReadReceipt:
		s.ReadUpTo = max(s.ReadUpTo, b.UpToSeq)
		s.bySeq[ev.Seq] = nil
	case *protocol.MemoryNoted:
		if strings.TrimSpace(b.Title) == "" {
			s.bySeq[ev.Seq] = nil
			return
		}
		s.add(&Entry{Event: ev, Noted: b})
	case *protocol.BridgeMsg:
		// D170 (J-Q5's lines): a request in, a reply or a message out, and one
		// line a day for a sender set aside. Steps, answers to ours and what
		// predates Bridge show nothing.
		if b.Direction == "in" && b.State == "set_aside" {
			key := b.From + "|" + firstN(ev.TS, 10)
			if s.SetAside == nil {
				s.SetAside = map[string]int{}
			}
			s.SetAside[key]++
			if s.SetAside[key] > 1 {
				s.bySeq[ev.Seq] = nil
				return
			}
			s.add(&Entry{Event: ev, Peer: b})
			return
		}
		show := (b.Direction == "in" && b.State == "" && b.InReplyTo == "") || (b.Direction == "out" && b.State == "sent" && b.Text != "")
		if !show {
			s.bySeq[ev.Seq] = nil
			return
		}
		s.add(&Entry{Event: ev, Peer: b})
	default:
		s.bySeq[ev.Seq] = nil
	}
}

// firstN is s's first n bytes (a timestamp's date).
func firstN(s string, n int) string {
	if len(s) < n {
		return s
	}
	return s[:n]
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

// addFinds adds a note, or revises the one it revises in place (a fold-in,
// an answered ask). A quiet morning (D173) is nothing at all: no message,
// no header line.
func (s *Store) addFinds(ev protocol.LogEvent, b *protocol.Finds) {
	if b.Quiet {
		s.bySeq[ev.Seq] = nil
		return
	}
	if b.Revises != "" {
		if old := s.notes[b.Revises]; old != nil {
			old.Finds = b
			old.Revision++
			s.notes[b.NoteID] = old
			s.bySeq[ev.Seq] = old
			return
		}
	}
	e := &Entry{Event: ev, Finds: b}
	s.notes[b.NoteID] = e
	s.add(e)
}

func (s *Store) addDecision(ev protocol.LogEvent, d *protocol.Decision) {
	if old := s.Decisions[d.DecisionID]; old != nil {
		old.Decision = *d
		if old.Seq == 0 {
			old.Seq, old.AskedAt = ev.Seq, ev.TS
		}
		return
	}
	s.Decisions[d.DecisionID] = &DecisionState{Decision: *d, Seq: ev.Seq, AskedAt: ev.TS}
}

// OpenDecisions are the unresolved decisions the user has not acted on,
// oldest first.
func (s *Store) OpenDecisions() []*DecisionState {
	var out []*DecisionState
	for _, d := range s.Decisions {
		if d.Resolved == nil && d.Pending == "" && d.Question != "" {
			if t := s.Tasks[d.TaskID]; t != nil && LaneOf(t.Attention()) == LaneHidden {
				continue // its task was dropped or handed off
			}
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].AskedAt != out[j].AskedAt {
			return out[i].AskedAt < out[j].AskedAt
		}
		return out[i].DecisionID < out[j].DecisionID
	})
	return out
}

// ArmedWaiters are the armed waiters, soonest first; task-less ones are
// what On hand shows as compact rows.
func (s *Store) ArmedWaiters() []*protocol.Waiter {
	var out []*protocol.Waiter
	for _, w := range s.Waiters {
		if w.State == protocol.WaiterArmed {
			out = append(out, w)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].At != out[j].At {
			return out[i].At < out[j].At
		}
		return out[i].WaiterID < out[j].WaiterID
	})
	return out
}

// MissedToday are the waits that ended unmet on now's day, newest first
// (D145).
func (s *Store) MissedToday(now time.Time) []*protocol.Waiter {
	var out []*protocol.Waiter
	y, m, d := now.Date()
	for _, w := range s.Missed {
		at := ParseTime(w.EndedAt).In(now.Location())
		if ay, am, ad := at.Date(); ay == y && am == m && ad == d {
			out = append(out, w)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].EndedAt > out[j].EndedAt })
	return out
}

// WaiterFor is the armed waiter of a task, or nil.
func (s *Store) WaiterFor(taskID string) *protocol.Waiter {
	for _, w := range s.ArmedWaiters() {
		if w.TaskID == taskID {
			return w
		}
	}
	return nil
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

// newWorkAfterAction clears a task's merge (or draft PR) once a done item
// for it appears in the living message after that action: the task did
// more work on its branch, and that work isn't merged. A revision that
// only carries an earlier done item along changes nothing.
func (s *Store) newWorkAfterAction(seq int64, before, after *protocol.LivingMsg) {
	had := map[string]bool{}
	if before != nil {
		for _, it := range before.Items {
			if it.Kind == "done" {
				had[it.TaskID] = true
			}
		}
	}
	for _, it := range after.Items {
		if it.Kind != "done" || had[it.TaskID] {
			continue
		}
		if t := s.Tasks[it.TaskID]; t != nil && t.Acted != nil && seq > t.ActedSeq {
			t.Acted = nil
		}
	}
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
	case *protocol.BodySelected:
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
		// The partner retitles a task by appending another task_open: the latest one names
		// the task, the first one dates it.
		if t.Open == nil || ev.Seq >= t.openSeq {
			// D157: a later task_open on another computer is a move (E3): the parcel goes home and out again.
			if t.Open == nil {
				t.PlacedAt = ev.TS
			} else if from, to := deviceOfPlace(t.Open.Place), deviceOfPlace(b.Place); from != to {
				t.PlacedAt, t.MovedFrom = ev.TS, from
			}
			t.Open, t.openSeq = b, ev.Seq
		}
		if t.OpenedAt == "" || ev.TS < t.OpenedAt {
			t.OpenedAt = ev.TS
		}
	case *protocol.TaskState:
		t.State = b
	case *protocol.TaskEvent:
		if b.Role == "system" && len(b.Raw) > 0 {
			var raw struct {
				Browser     *BrowserStatus `json:"browser"`
				Kind        string         `json:"kind"`
				Outcome     string         `json:"outcome"`
				Compactions int            `json:"compactions"`
			}
			if json.Unmarshal(b.Raw, &raw) == nil && raw.Browser != nil && raw.Browser.Host != "" &&
				(t.Browser == nil || t.Browser.Seq < ev.Seq) {
				raw.Browser.Seq = ev.Seq
				t.Browser = raw.Browser
			}
			// D135: the runner numbers each compaction of the task's context.
			if raw.Kind == "compaction_ended" && (raw.Outcome == "" || raw.Outcome == "completed") {
				t.Compactions = max(t.Compactions+1, raw.Compactions)
			}
		}
		if u := b.Usage; u != nil {
			t.Usage.InputTokens += u.InputTokens
			t.Usage.OutputTokens += u.OutputTokens
			t.Usage.CacheRead += u.CacheRead
			t.Usage.CacheWrite += u.CacheWrite
		}
		// The runner logs what the user sent straight in: it echoes the
		// oldest matching send.
		if b.Role == "user" && b.From != "partner" {
			for _, sd := range t.Sends {
				if sd.Seq == 0 && ((b.ClientID != "" && sd.ClientID == b.ClientID) || (b.ClientID == "" && sd.Text == b.Text)) {
					sd.Seq = ev.Seq
					break
				}
			}
		}
	case *protocol.Report:
		t.LastReport = b
		t.Evidence = mergeEvidence(t.Evidence, b.Evidence)
		if t.Acted != nil && ev.Seq > t.ActedSeq {
			t.Acted = nil
		}
	case *protocol.BodySelected:
		if t.Body == nil || ev.Seq >= t.bodySeq {
			t.Body, t.bodySeq = &protocol.TaskBody{Harness: b.Harness, Model: b.Model, Effort: b.Effort, Why: b.Why}, ev.Seq
		}
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

// dropStaleFailure clears a "didn't update" the device has moved past (D167):
// a failure stands only while the device still runs what it started from
// (or, its start unknown, is still below the target). A home that predates
// this rule can send one; the card never says "didn't update" on the target.
func dropStaleFailure(u *protocol.DeviceUpdate) {
	if u == nil || u.Phase != "failed" || u.To == "" {
		return
	}
	// "Nothing newer is out" is never a failure.
	stands := update.Compare(u.Current, u.To) != 0 && u.Reason != "no_release"
	if stands && update.Compare(u.From, "0.0.0") >= 0 {
		stands = update.Compare(u.Current, u.From) == 0
	} else if stands {
		stands = update.Compare(u.Current, u.To) < 0
	}
	if !stands {
		u.Phase, u.From, u.To, u.Reason, u.Detail, u.RolledBack, u.At = "", "", "", "", "", false, ""
	}
}

// dropStaleAgentUpdate is the same rule for an AI agent's own update (D156):
// judged against the version installed now. On the target it is done
// whatever was said; still on where it started, a failure stands; anywhere
// else (updated since, by hand) it is gone. "Nothing newer" (no_update) is
// never a failure. A home older than the rule can still send one.
func dropStaleAgentUpdate(h *protocol.DeviceHarness) {
	u := h.Update
	if u == nil || (u.Phase != "failed" && u.Phase != "done") || h.Version == "" {
		return
	}
	switch {
	case u.To != "" && update.Compare(h.Version, u.To) == 0:
		if u.Phase == "failed" {
			h.Update = &protocol.AgentUpdate{Phase: "done", From: u.From, To: u.To, At: u.At, By: u.By}
		}
	case u.Phase == "failed" && u.Reason != "no_update" && u.From != "" && update.Compare(h.Version, u.From) == 0:
		// still where it started: it didn't update
	default:
		h.Update = nil
	}
}

// Calls are the phone calls On hand lists (D193): live, waiting for Go,
// or ended today, newest first, as the last snapshot said.
func (s *Store) Calls() []protocol.CallBody {
	if s.OnHand == nil {
		return nil
	}
	return s.OnHand.Calls
}

// Call returns one call of the last On hand, or nil.
func (s *Store) Call(id string) *protocol.CallBody {
	for i, c := range s.Calls() {
		if c.CallID == id {
			return &s.OnHand.Calls[i]
		}
	}
	return nil
}
