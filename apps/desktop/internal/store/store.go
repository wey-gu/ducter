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

	"github.com/wey-gu/ducter/apps/desktop/internal/computer"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// Entry is one item of the conversation.
// PingGroup is an own agent's contact tests folded into one line (D418):
// how many, the earliest's send time, and which were answered.
type PingGroup struct {
	N        int
	Earliest time.Time
	Sent     map[string]bool
	Failed   map[string]bool
	Told     bool // the partner said it in a line of its own
}

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
	// Set (D385) is a set of to-dos found in the conversation; a later
	// todo_set with the same SetID (handed over) revises it in place.
	Set *protocol.TodoSet
	// Asks (D426), on a user's message: the several things it asked for,
	// line by line (the latest asks event for it).
	Asks *protocol.Asks
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
	// Elsewhere (D481): On hand says it is no longer open at the home and
	// this window missed how: closed here at once (Resolved holds a
	// stand-in) until the home's own resolution (asks_get) replaces it.
	Elsewhere bool
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
	// Media are the pictures sent with it (D206), shown until its echo.
	Media []protocol.MediaRef
	// Refs (D534): what its words refer to with @, sent again with a resend.
	Refs []protocol.Ref
}

// CheckpointAt is a checkpoint with its time.
type CheckpointAt struct {
	protocol.Checkpoint
	Seq int64
	TS  string
}

// Task is what the client knows of one task.
type Task struct {
	outside   []OutsideAct // Outside(), kept until the events change
	outsideAt outsideKey
	outsideOK bool

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
	// HistoryLoaded is set once its newest window arrived (D284: the
	// first ~200 events; older pages follow).
	HistoryLoaded bool
	// D284: HistFrom is the oldest seq from which every event of the task
	// up to its newest is held; HistMore, that the home has older ones.
	// HistStale: the socket was replaced since, so a gap may have opened
	// (live events go only to a socket that is up); the next open asks again.
	HistFrom  int64
	HistMore  bool
	HistStale bool
	// HistPending: a task_history request is on its way (histAsk events).
	HistPending bool
	histAsk     int
	// D320: the task's session index (one small row per turn, from the
	// home, kept live by the views with indexAdd); IndexStale: the socket
	// was replaced since, so it is asked again from its last turn;
	// IndexPending: a task_index request is on its way. Spans are the
	// stretches of its stream held whole (To SpanEnd: through the newest,
	// kept live); Events holds them (and live events of a task never opened).
	Index         *protocol.SessionIndex
	IndexStale    bool
	IndexPending  bool
	Spans         []protocol.Span
	lastReportSeq int64
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
	stateSeq  int64 // D456: seq of the task_state in State (or the cursor when a card set it)
	// Version bumps when Events change, for views that recompute (diff).
	Version int
	// Sends are the user's direct messages to the task, oldest first.
	Sends []*Send
	// Reads (D325) are the seqs of the person's steers the agent's next
	// step took in (the runner's raw.read); ReadLast, the newest of them.
	Reads    map[int64]bool
	ReadLast int64
	// Usage sums the token use of the turns seen.
	Usage protocol.Usage
	// Compactions is how many times the harness compacted the task's context (D135).
	Compactions int
	// Browser is what a browser task last looked at (task_event
	// {role: system, raw.browser: {host, url}}), nil until one.
	Browser *BrowserStatus
	// Recalled is what Ducter's own recall put in front of the first turn
	// (task_event raw {memory: "recall", recalled: [...]}), nil until one:
	// Mem's ids, one-line titles, Spaces and how each was found (D617).
	Recalled []protocol.RecalledMemory
	// Phone is the person's own phone the task asked to borrow (D339: from
	// the ask's report in its stream), nil when it never did.
	Phone *protocol.HandsetAsk
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

// PhoneDevice is the person's own phone this task works on (D339): the one
// lent or asked for now (its card), else the one its stream asked for; "".
func (t *Task) PhoneDevice() string {
	if t.Card != nil && t.Card.Handset != nil && t.Card.Handset.Device != "" {
		return t.Card.Handset.Device
	}
	if t.Phone != nil {
		return t.Phone.Device
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
	case t.Card != nil && t.Card.Mark != nil && t.Card.Mark.Name != "":
		return t.Card.Mark.Name // D285: the person's own name for it, everywhere
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

// Residency is where the task's session is now (provisioning while its place
// is being made).
func (t *Task) Residency() protocol.Residency {
	switch {
	case t.State != nil:
		return t.State.Residency
	case t.Card != nil:
		return t.Card.Residency
	}
	return ""
}

// Cant (D395) is why it couldn't start where it was to work, and what fixes
// it: the latest state's, else the card's.
func (t *Task) Cant() *protocol.CantStart {
	if t.State != nil {
		return t.State.Cant
	}
	if t.Card != nil {
		return t.Card.Cant
	}
	return nil
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
	// Partners are every partner on the home (D309); nil with one, or a
	// home without them. PartnerAnswer is the last partners frame that
	// answered this window's own add or set (its ClientID, WbError).
	Partners      []protocol.PartnerInfo
	PartnerAnswer *protocol.ServerFrame
	// Past is 做过的事 / Past tasks (D285, past.go).
	Past PastState
	// Mentions is the composers' @ and / lists (D534, mentions.go).
	Mentions MentionsState
	// Did is 替你做过的 / Done for you (D300, did.go).
	Did DidState
	// D591: the week's count (usage.go).
	Usage UsageState
	// KeepPages (D511) are the Keeps' pages this window read (keep_result),
	// by id; KeepsVersion counts their changes.
	KeepPages    map[string]*protocol.KeepPage
	KeepsVersion int
	// KeepChanged and KeepProposals (D533) are, by Keep, the last edit's
	// result (keep_changed) and the rules read from edited words (keep_proposal).
	KeepChanged   map[string]*protocol.KeepEditFrame
	KeepProposals map[string]*protocol.KeepEditFrame

	// SetAside counts, per sender and day ("from|2026-11-10"), the messages
	// over its daily quota (D163); one quiet line says how many.
	SetAside map[string]int
	// Pings folds an own agent's contact tests answered by code (D418) into
	// one line, by the first one's seq.
	Pings    map[int64]*PingGroup
	pingAt   map[string]int64
	lastPing struct {
		key string
		seq int64
		at  time.Time
	}
	// ActionResults are action_result frames not yet shown to the user.
	ActionResults []protocol.ServerFrame
	// First is the empty conversation's words from the home (D149); nil
	// from an older Ducter, which gets the client's own everyday ones.
	First *protocol.FirstScreen
	// KeyResults are key_add_result answers by clientId (D298).
	KeyResults  map[string]*protocol.KeyResult
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

	Channel []*Entry
	bySeq   map[int64]*Entry
	// Older is the conversation's paging back, a page at a time (D509, older.go).
	Older     OlderState
	Jobs      map[string]*Job
	Decisions map[string]*DecisionState
	// KeyCopies (D539): what a copy card's Go did, by decision: the
	// computers that got the key and those that didn't (why).
	KeyCopies map[string]*protocol.KeyCopy
	// KeptKeys (D539): the keys Ducter keeps on each computer, by device,
	// as it last answered (names only).
	KeptKeys map[string]*protocol.ServerFrame
	// sentReplies (D470 round 2): replies shown as sent, by the message answered and the words.
	sentReplies map[string]bool
	Tasks       map[string]*Task
	// FindStates are each find's latest change (D165), by find id.
	FindStates map[string]*protocol.FindState
	// FindSends are each drafted reply's sending (D403), apart from the reactions;
	// FindAsks the find's Go asked again (after 撤回 or a failed send).
	FindSends map[string]*protocol.FindState
	FindAsks  map[string]string
	// FindSeq is the seq of the note each find is in (D403: 看草稿 finds it).
	FindSeq map[string]int64
	// DecisionCalls are the latest connection_call of each decision's Go,
	// by decision id (D222: a calendar change settles from it).
	DecisionCalls map[string]*protocol.ConnectionCall
	// LastUserSeq is the user's latest message.
	LastUserSeq int64
	notes       map[string]*Entry
	sets        map[string]*Entry
	// asksWaiting (D426) holds lines that came before their message was
	// loaded (a history page), until it is.
	asksWaiting map[int64]*protocol.Asks
	// asksAsked, asksWanted (D481): the questions asked for (asks_get) on
	// this socket, and those to ask for now.
	asksAsked  map[string]bool
	asksWanted []string
	OnHand     *protocol.OnHand
	// AwayNow (D454) are the tasks and groups removed from Tasks in this
	// window, before the home's next On hand says so.
	AwayNow map[string]bool
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
	// UpdateAll is 全部更新 / Update all as the home last said it (D224):
	// the offer, what can't take part, and the plan under way; nil from a
	// home before it.
	UpdateAll *protocol.UpdateAllView
	// AbilityResults are ability_result frames not yet handled by the view.
	AbilityResults []protocol.ServerFrame
	// Live is the live view of Ducter's browser while the user signs in
	// (D151); nil when none is open. LiveClosed is the last close the view
	// has not said yet. BrowserSites is Devices › 上网's signed-in sites.
	Live         *LiveView
	LiveClosed   *protocol.ServerFrame
	BrowserSites *protocol.ServerFrame
	// Phone is Ducter's phone (D217): its live view, install sheet and results.
	Phone PhoneState
	// Saved is 设置 › 密码和银行卡 / Passwords & cards (D191): names, last four, where used; never a secret.
	Saved *protocol.ServerFrame
	// Channels is 设置 › 聊天软件 / Chat apps (D276); ChannelResults, the answers to
	// connect and code (the views read and drop them). Never a token.
	Channels       *protocol.ServerFrame
	ChannelResults []protocol.ServerFrame
	// Sources is 设置 › 待办来源 / To-do sources (D341), nil until asked;
	// SourceItems the latest pick list by its clientId; SourceResults the
	// answers to add, set and remove (the views read and drop them).
	Sources       *protocol.SourcesView
	SourceItems   map[string]*protocol.SourcesFrame
	SourceResults []protocol.SourcesFrame
	// PairCode is the newest pairing code the server minted for this app.
	PairCode *protocol.ServerFrame
	// Lend is 加一台做事的电脑 / Add a computer for tasks's code as last said (D347):
	// the waiting frame with its line, then joined and here for that code.
	Lend *protocol.ServerFrame
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
	// OwnAgents (D332): the AI agents the person runs themselves on the home.
	OwnAgents []string
	// Helpers (D494): the home's helpers, from the settings frame.
	Helpers []protocol.HelperView
	// BrainNow is what the partner thinks with right now (D150).
	BrainNow *protocol.BrainNow
	// BrainOptions is D536: what each partner's own 想事情用 may offer.
	BrainOptions []protocol.BrainOption
	// Connections (D96), once asked for; nil means not yet. Oo is what the
	// oo CLI is set up with. ConnResult is the last add/remove answer, for
	// the page to turn into one line.
	Connections []protocol.ConnectionView
	ConnAsked   bool
	// ConnReads is 看了哪些 / What it read today, by connection (D166).
	ConnReads map[string][]protocol.ReadLine
	// Day is 今天看了什么 / What it looked at today (D226), as last asked.
	Day        *protocol.ProactiveDay
	Oo         *protocol.OoDetect
	ConnResult *protocol.ServerFrame
	// SignIn is the device sign-in in progress or just ended (D193); nil
	// when none. VoiceResult is the last phone_voice answer, until the
	// phone card takes it.
	SignIn      *protocol.SignInView
	VoiceResult *protocol.ServerFrame
	// D218: the own-number card, and its last refusal (number, key, busy).
	OwnPhone  *protocol.OwnPhoneView
	OwnAnswer string
	// D278: a call sheet's dial on the person's phone, by call id: asking,
	// done (How: rang | dialer | note) or failed (Reason).
	Dials  map[string]*Dial
	Forgot *protocol.Forgot
	// Corrected is how the last memory_correct went (D304), until shown.
	Corrected *protocol.Forgot
	// D329: UndoFailed is the Noted line whose 撤销 Mem didn't take (0: none).
	UndoFailed int64
	// MemQuery is what Settings › 记忆's search asks now; MemFound is Mem's
	// answer to it (D321), nil until one comes.
	MemQuery string
	MemFound *protocol.MemFound
	// MemSettleFailed is the ask Nowledge Mem didn't take (D465): it's back, with a line.
	MemSettleFailed string
	// Recalled is the one 想起了 / Remembered line under a message, by the
	// seq of the message it stands under (D304).
	Recalled map[int64]*Recalled
	// OutOps (D433) is each outgoing Bridge message's latest word, by its op:
	// sending, sent, failed, unknown or unconfirmed, so 最近 / Recently can
	// say one that hasn't gone, not only the ones that did.
	OutOps map[string]*Entry
	// TaskPeers (D448) is a task's own exchanges with another agent that
	// never show in the conversation (its follow-ups with no card, the
	// answers that went into it), for 最近 / Recently.
	TaskPeers []*Entry
	// Rules are 你的规则 / Your rules, as last sent (nil until a rules
	// frame; RulesAt says one came). Candidates are who could do a task,
	// by task id, as last asked; SwitchResults the switch answers not yet
	// shown (D89).
	Rules []protocol.RuleView
	// RuleDefaults: the built-in default per kind of work (D372).
	RuleDefaults []protocol.KindDefault
	// Standing (D413): 不用问我的 / Without asking.
	Standing []protocol.StandingView
	RulesAt  time.Time
	// Pins are 置顶 / Pinned, newest first, as the home last sent (D381);
	// PinRefused is why the last pin didn't happen, until shown.
	Pins       []protocol.PinView
	PinRefused string
	// Apps (D405) are the person's apps (the default conversation's), newest change first.
	Apps []protocol.AppMeta
	// AppIdeas (D410): while there are no apps, first ones to say, from what the home knows.
	AppIdeas   []protocol.AppIdea
	Candidates map[string][]protocol.Candidate
	// AccountUsage is each agent's account limits as the home last
	// answered (D288), by harness.
	AccountUsage  map[string]AccountAnswer
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
	// FolderChange is the last folder_change answer (D611), until a row takes it.
	FolderChange *protocol.ServerFrame
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
		PersonaName:   "Ducter",
		bySeq:         map[int64]*Entry{},
		Jobs:          map[string]*Job{},
		Decisions:     map[string]*DecisionState{},
		Tasks:         map[string]*Task{},
		FindStates:    map[string]*protocol.FindState{},
		FindSends:     map[string]*protocol.FindState{},
		FindAsks:      map[string]string{},
		FindSeq:       map[string]int64{},
		DecisionCalls: map[string]*protocol.ConnectionCall{},
		notes:         map[string]*Entry{},
		Waiters:       map[string]*protocol.Waiter{},
		Missed:        map[string]*protocol.Waiter{},
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
		s.Older.Asked = 0                    // D509: a page asked on the old socket never comes
		s.asksAsked, s.asksWanted = nil, nil // D481: a new socket asks again for what it still lacks
		// D284: a new socket: what a task's history missed meanwhile is asked
		// again when it opens, and a request the old socket carried is gone.
		for _, t := range s.Tasks {
			t.HistStale = t.HistStale || t.HistoryLoaded
			t.HistPending, t.histAsk = false, 0
			// D320: live events may be missed until the next window: the
			// stretch through the newest ends at what is held, and the
			// index is asked again from its last turn.
			t.endLive()
			t.IndexStale = t.IndexStale || t.Index != nil
			t.IndexPending = false
		}
		if f.PersonaName != "" {
			s.PersonaName = f.PersonaName
		}
	case "partners":
		s.Partners = f.Partners
		if f.ClientID != "" {
			fc := f
			s.PartnerAnswer = &fc
		}
		for _, p := range f.Partners {
			if p.ID == f.Shown && p.Name != "" {
				s.PersonaName = p.Name
			}
		}
	case "first_screen":
		s.First = f.First
	case "key_add_result":
		if s.KeyResults == nil {
			s.KeyResults = map[string]*protocol.KeyResult{}
		}
		if f.KeyResult != nil {
			s.KeyResults[f.ClientID] = f.KeyResult
		}
	case "devices":
		for i := range f.Devices {
			dropStaleFailure(f.Devices[i].Update)
			for j := range f.Devices[i].Harnesses {
				dropStaleAgentUpdate(&f.Devices[i].Harnesses[j])
			}
		}
		// D291: a name from before shows as the model alone
		// ("iPad · Ducter" → "iPad"); the core renames them once too.
		for i := range f.Devices {
			f.Devices[i].Name = ShownDeviceName(f.Devices[i].Name)
		}
		if f.Reach != nil {
			for i := range f.Reach.Clients {
				f.Reach.Clients[i].Name = ShownDeviceName(f.Reach.Clients[i].Name)
			}
		}
		s.Devices, s.Reach, s.DevicesAt = f.Devices, f.Reach, time.Now()
		s.UpdateAll = f.UpdateAll
	case "ability_result":
		s.AbilityResults = append(s.AbilityResults, f)
	case "live", "live_frame", "live_turn", "live_doing":
		s.applyLive(f)
	case "phone_view", "phone_frame", "phone_doing", "phone_did", "phone_terms", "phone_install_result", "phone_erase_result":
		s.applyPhone(f)
	case "channels":
		fc := f
		s.Channels = &fc
	case "channel_result":
		s.ChannelResults = append(s.ChannelResults, f)
	case "sources":
		if f.Sources != nil && f.Sources.View != nil {
			s.Sources = f.Sources.View
		}
	case "source_items_result", "pile_items_result", "pile_result", "pile_find_result", "pile_how_result", "group_review_result": // D359, D385: the pile's answers by clientId too
		if f.Sources != nil {
			if s.SourceItems == nil {
				s.SourceItems = map[string]*protocol.SourcesFrame{}
			}
			s.SourceItems[f.Sources.ClientID] = f.Sources
		}
	case "source_result":
		if f.Sources != nil {
			s.SourceResults = append(s.SourceResults, *f.Sources)
		}
	case "saved":
		fc := f
		s.Saved = &fc
	case "kept_keys": // D539
		fc := f
		if s.KeptKeys == nil {
			s.KeptKeys = map[string]*protocol.ServerFrame{}
		}
		s.KeptKeys[f.Device] = &fc
	case "browser_sites":
		fc := f
		s.BrowserSites = &fc
	case "pair_code":
		fc := f
		s.PairCode = &fc
	case "lend":
		// D347: the asking window's frame carries the line; the later ones
		// for the same code keep it (they don't repeat it). Another
		// window's lend, never asked here, is left alone.
		fc := f
		if s.Lend != nil && s.Lend.Code == f.Code {
			if fc.LendLine == "" {
				fc.LendLine = s.Lend.LendLine
			}
			if fc.Address == "" {
				fc.Address, fc.SameNetwork = s.Lend.Address, s.Lend.SameNetwork
			}
			if fc.Check == "" {
				fc.Check = s.Lend.Check
			}
			s.Lend = &fc
		} else if f.State == "waiting" {
			s.Lend = &fc
		}
	case "rename_result":
		fc := f
		s.Renamed = &fc
	case "disconnect_result", "update_result", "agent_update_result", "agent_setup_result", "mem_setup_result", "records_allow_result", "mem_plugin_result", "anywhere_setup_result":
		fc := f
		s.DeviceResult = &fc
	case "settings":
		if f.Settings != nil {
			s.Settings = f.Settings
			// D309: the settings' name is the default partner's.
			if f.Settings.Name != "" && (s.Persona == "" || s.Persona == protocol.DefaultPartner) {
				s.PersonaName = f.Settings.Name
			}
		}
		if f.Mem != nil {
			s.Mem = f.Mem
		}
		s.BrainNow = f.BrainNow
		s.BrainOptions = f.BrainOptions
		s.Bridge = f.Bridge
		s.OwnAgents = f.OwnAgents
		s.Helpers = f.Helpers
		if f.Forgot != nil {
			s.Forgot = f.Forgot
		}
		if f.Corrected != nil {
			s.Corrected = f.Corrected
		}
		if f.Undid != nil && !f.Undid.OK {
			s.UndoFailed = f.Undid.Seq
		}
	case "proactive_day":
		s.Day = f.Day
	case "connection_reads":
		if s.ConnReads == nil {
			s.ConnReads = map[string][]protocol.ReadLine{}
		}
		s.ConnReads[f.ID] = append([]protocol.ReadLine{}, f.Reads...)
	case "connections":
		s.Connections, s.Oo, s.ConnAsked, s.OwnPhone = f.Connections, f.Oo, true, f.OwnPhone
		if s.Connections == nil {
			s.Connections = []protocol.ConnectionView{}
		}
	case "connection_result":
		fc := f
		s.ConnResult = &fc
	case "connection_signin":
		s.SignIn = f.SignIn
	case "handset_dial_result":
		if s.Dials == nil {
			s.Dials = map[string]*Dial{}
		}
		d := s.Dials[f.CallID]
		if d == nil {
			d = &Dial{}
			s.Dials[f.CallID] = d
		}
		if f.DialPhone != "" {
			d.Phone = f.DialPhone
		}
		if f.OK {
			d.Phase, d.How, d.Reason = "done", firstOr(f.How, "rang"), ""
		} else {
			d.Phase, d.Reason = "failed", firstOr(f.Reason, "failed")
		}
	case "own_phone_result":
		s.OwnAnswer = f.Reason
		if s.OwnAnswer == "" {
			s.OwnAnswer = "phone"
		}
	case "phone_voice_result":
		fc := f
		s.VoiceResult = &fc
	case "sent":
		if t := s.Tasks[f.TaskID]; t != nil {
			for i, sd := range t.Sends {
				if f.ClientID != "" && sd.ClientID != f.ClientID || f.ClientID == "" && (sd.Delivered != "" || sd.Failed != "") {
					continue
				}
				sd.Delivered = f.Delivered
				// D325: held at the home: a chip over the composer now
				// (the card's Held), not a bubble.
				if f.Delivered == protocol.DeliveryQueued && f.ClientID != "" && sd.Seq == 0 {
					t.Sends = append(t.Sends[:i:i], t.Sends[i+1:]...)
				}
				break
			}
		}
	case "folder_changes":
		if t := s.Tasks[f.TaskID]; t != nil {
			t.Folder = f.FolderChanges
		}
	case "rules":
		s.Rules, s.RuleDefaults, s.RulesAt = f.Rules, f.Defaults, time.Now()
		s.Standing = f.StandingList
	case "pins":
		s.Pins, s.PinRefused = f.Pins, f.Refused
	case "apps":
		if f.AppsF != nil {
			s.Apps, s.AppIdeas = f.AppsF.Apps, f.AppsF.Ideas
		}
	case "candidates":
		if s.Candidates == nil {
			s.Candidates = map[string][]protocol.Candidate{}
		}
		s.Candidates[f.TaskID] = f.Candidates
	case "account_usage":
		if s.AccountUsage == nil {
			s.AccountUsage = map[string]AccountAnswer{}
		}
		s.AccountUsage[f.Harness] = AccountAnswer{Usage: f.AccountUsage, Why: f.Why, At: time.Now()}
	case "task_new_options":
		fc := f
		s.NewTaskOptions = &fc
	case "task_new_result", "project_add_result", "project_clone_result", "project_new_result", "git_login_state":
		s.NewTaskResults = append(s.NewTaskResults, f)
	case "folder_browse_result":
		fc := f
		s.FolderBrowse = &fc
	case "folder_change_result":
		fc := f
		s.FolderChange = &fc
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
	case "channel_history":
		s.applyOlder(f) // D509 (older.go)
	case "task_history":
		t := s.task(f.TaskID)
		for _, ev := range f.Events {
			s.ApplyEvent(ev)
		}
		// A home before D284 says nothing of more: a full page may have more
		// (at worst one more page comes back empty).
		page := f
		if f.AfterSeq == nil {
			page.More = f.More || (t.histAsk > 0 && len(f.Events) >= t.histAsk)
		}
		t.HistPending, t.histAsk = false, 0
		if f.AfterSeq == nil && f.BeforeSeq == 0 {
			t.HistoryLoaded, t.HistStale = true, false
		}
		// D320: what the page holds whole joins the spans; a window that
		// meets what was held keeps the cache whole (D284).
		if sp, ok := protocol.SpanOfPage(page); ok {
			t.Spans = protocol.AddSpan(t.Spans, sp)
		}
		t.histFromTail()
	case "task_index":
		// D320: the task's session index; with FromSeq, its turns from
		// there replace the ones held.
		if f.Index == nil {
			return
		}
		t := s.task(f.TaskID)
		t.Index = protocol.JoinIndex(t.Index, f.Index, f.FromSeq)
		t.IndexStale, t.IndexPending = false, false
		t.Version++
	case "activity":
		switch {
		case f.Activity == nil:
			s.Activity = nil
			s.ActivityEndedAt = s.ChannelSeq
		case s.Activity == nil || s.Activity.Step != f.Activity.Step || s.Activity.About != f.Activity.About || s.Activity.Source != f.Activity.Source:
			s.Activity, s.ActivityAt = f.Activity, time.Now()
		}
	case "past_result", "past_marked", "ongoing_result", "outside_adopted", "outside_hidden":
		s.applyPast(f) // D285 (past.go)
	case "keep_result":
		if s.KeepPages == nil {
			s.KeepPages = map[string]*protocol.KeepPage{}
		}
		if f.Keep != nil {
			s.KeepPages[f.ID] = f.Keep
		} else {
			delete(s.KeepPages, f.ID)
		}
		s.KeepsVersion++
	case "keep_changed":
		if s.KeepChanged == nil {
			s.KeepChanged = map[string]*protocol.KeepEditFrame{}
		}
		if f.KeepEdit != nil {
			s.KeepChanged[f.ID] = f.KeepEdit
		}
		s.KeepsVersion++
	case "keep_proposal":
		if s.KeepProposals == nil {
			s.KeepProposals = map[string]*protocol.KeepEditFrame{}
		}
		if f.KeepEdit != nil {
			s.KeepProposals[f.ID] = f.KeepEdit
		}
		s.KeepsVersion++
	case "made_result":
		s.applyMade(f) // D383 (past.go)
	case "mention_list", "slash_list":
		s.applyMentions(f) // D534 (mentions.go)
	case "past_steps_result", "past_forked":
		s.applyPastSteps(f) // D391 (past.go)
	case "did_result":
		s.applyDid(f) // D300 (did.go)
	case "usage_days_result":
		s.applyUsage(f) // D591 (usage.go)
	case "mem_answered":
		// D465: Mem refused: the ask comes back with the settings frame, and a line says so.
		if f.MemAnswered != nil {
			if f.MemAnswered.OK {
				s.MemSettleFailed = ""
			} else {
				s.MemSettleFailed = f.MemAnswered.ID
			}
		}
	case "mem_found":
		// D321: only the answer to what is asked now (a later word replaced an earlier one).
		if f.MemFound != nil && f.MemFound.Q == s.MemQuery {
			s.MemFound = f.MemFound
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

// histFromTail says the stretch through the newest as D284's HistFrom and
// HistMore, for the rest of the app: from where every event to the newest
// is held, and whether the home has older ones.
func (t *Task) histFromTail() {
	for _, sp := range t.Spans {
		if sp.To != protocol.SpanEnd {
			continue
		}
		switch {
		case sp.From > 0:
			t.HistFrom, t.HistMore = sp.From, true
		case len(t.Events) > 0:
			t.HistFrom, t.HistMore = t.Events[0].Seq, false
		default:
			t.HistFrom, t.HistMore = 0, false
		}
	}
}

// endLive ends the stretch through the newest at the newest held (D320):
// a new socket may miss live events until the next window.
func (t *Task) endLive() {
	var last int64
	if n := len(t.Events); n > 0 {
		last = t.Events[n-1].Seq
	}
	var out []protocol.Span
	for _, sp := range t.Spans {
		if sp.To == protocol.SpanEnd {
			if last < sp.From {
				continue
			}
			sp.To = last
		}
		out = append(out, sp)
	}
	t.Spans = out
}

// IndexAsked notes a task_index request on its way (D320).
func (s *Store) IndexAsked(id string) { s.task(id).IndexPending = true }

// Evict lets go of every held event of the task outside keep and cuts its
// spans to it (D320: a window around what is on screen, and the newest).
// What an event added to the task (its report, its checkpoints) stays; one
// let go and loaded again is held again without being added twice.
func (s *Store) Evict(id string, keep []protocol.Span) {
	t := s.Tasks[id]
	if t == nil || len(keep) == 0 {
		return
	}
	out := t.Events[:0]
	for _, ev := range t.Events {
		if protocol.Covers(keep, ev.Seq, ev.Seq) {
			out = append(out, ev)
		}
	}
	if len(out) == len(t.Events) {
		return
	}
	clear(t.Events[len(out):])
	// A fresh array, so the far events' bodies are let go with the old one.
	t.Events = append([]protocol.LogEvent(nil), out...)
	t.Spans = protocol.CutSpans(t.Spans, keep)
	t.Version++
	t.histFromTail()
}

// Holds reports whether the task holds the event with seq.
func (t *Task) Holds(seq int64) bool {
	i := sort.Search(len(t.Events), func(i int) bool { return t.Events[i].Seq >= seq })
	return i < len(t.Events) && t.Events[i].Seq == seq
}

// HistoryAsked notes a task_history request on its way for limit events (D284).
func (s *Store) HistoryAsked(id string, limit int) {
	t := s.task(id)
	t.HistPending, t.histAsk = true, limit
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
			// D382: whether it is put off is the card's.
			d.Later = pd.Later
			if pd.BackAt != "" {
				d.BackAt = pd.BackAt
				d.DefaultAt = pd.DefaultAt // back, not seen yet: no countdown
			}
		}
		// A snapshot is newer than every task_state that arrived before it;
		// later task_state events override it again.
		// D472: with why it couldn't start, or the snapshot hides it (hel:
		// the page said 没成 with 再试一次 only, the reason nowhere).
		t.State = &protocol.TaskState{TaskID: card.TaskID, Attention: card.Attention, Residency: card.Residency, Reason: card.Reason, Cant: card.Cant}
		t.stateSeq = max(t.stateSeq, s.Cursor)
		if card.LastReport != nil {
			t.LastReport = card.LastReport
		}
	}
	if o.OpenAsks != nil {
		s.reconcileAsks(o.OpenAsks)
	}
}

// reconcileAsks (D481): On hand's openAsks is the one source of truth for
// "open". A question held open here that the home no longer has open,
// asked at or before the snapshot, closes now (its resolution was missed);
// one open at the home that isn't held here is asked for. Either way the
// home's own events follow (asks_get).
func (s *Store) reconcileAsks(a *protocol.OpenAsks) {
	open := map[string]bool{}
	for _, id := range a.IDs {
		open[id] = true
	}
	want := func(id string) {
		if s.asksAsked[id] {
			return
		}
		if s.asksAsked == nil {
			s.asksAsked = map[string]bool{}
		}
		s.asksAsked[id] = true
		s.asksWanted = append(s.asksWanted, id)
	}
	ids := make([]string, 0, len(s.Decisions))
	for id := range s.Decisions {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		d := s.Decisions[id]
		if d.Resolved != nil || open[id] || d.Seq > a.AsOf {
			continue
		}
		opt := d.Pending
		if opt == "" {
			opt = "hold"
		}
		d.Resolved = &protocol.DecisionResolved{DecisionID: id, Option: opt, By: "ended", Settled: true}
		d.Pending, d.Elsewhere = "", true
		want(id)
	}
	for _, id := range a.IDs {
		if d := s.Decisions[id]; d == nil || d.Question == "" {
			want(id)
		}
	}
}

// TakeAsksWanted (D481) are the questions to ask the home for now
// (asks_get), each once a socket.
func (s *Store) TakeAsksWanted() []string {
	out := s.asksWanted
	s.asksWanted = nil
	return out
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
		} else if !t.Holds(ev.Seq) {
			// D320: let go and loaded again: held again, added once.
			t.insert(ev, body)
		}
	}
	if w, ok := body.(*protocol.Waiter); ok {
		if w.State == protocol.WaiterFired && w.TaskID != "" && (w.Check != nil || w.Event != nil || w.Wakes == "task") {
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
	if kc, ok := body.(*protocol.KeyCopy); ok {
		if kc.DecisionID != "" {
			if s.KeyCopies == nil {
				s.KeyCopies = map[string]*protocol.KeyCopy{}
			}
			s.KeyCopies[kc.DecisionID] = kc
		}
		return
	}
	if cc, ok := body.(*protocol.ConnectionCall); ok {
		// D222: a decision's write, staged then run on Go; the latest wins.
		if cc.DecisionID != "" && cc.Op == "write" {
			if s.DecisionCalls == nil {
				s.DecisionCalls = map[string]*protocol.ConnectionCall{}
			}
			s.DecisionCalls[cc.DecisionID] = cc
		}
		if ev.Stream == "channel" {
			s.bySeq[ev.Seq] = nil
		}
		return
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
	s.heldChannel(ev.Seq) // D509: where paging back starts
	if ev.Kind != protocol.KindReadReceipt {
		s.ChannelSeq = max(s.ChannelSeq, ev.Seq)
	}
	switch b := body.(type) {
	case *protocol.UserMsg:
		s.LastUserSeq = max(s.LastUserSeq, ev.Seq)
		e := &Entry{Event: ev, User: b}
		if w := s.asksWaiting[ev.Seq]; w != nil {
			e.Asks = w
			delete(s.asksWaiting, ev.Seq)
		}
		s.add(e)
	case *protocol.Asks:
		// D426: the latest lines win, drawn under their message; the event
		// itself is no row.
		s.bySeq[ev.Seq] = nil
		if at := s.bySeq[b.MsgSeq]; at != nil && at.User != nil {
			at.Asks = b
			at.Revision++
			return
		}
		if s.asksWaiting == nil {
			s.asksWaiting = map[int64]*protocol.Asks{}
		}
		s.asksWaiting[b.MsgSeq] = b
	case *protocol.Finds:
		s.addFinds(ev, b)
	case *protocol.TodoSet:
		// D385: the latest per set wins, in the place it was first shown.
		if s.sets == nil {
			s.sets = map[string]*Entry{}
		}
		if old := s.sets[b.SetID]; old != nil {
			old.Set = b
			old.Revision++
			s.bySeq[ev.Seq] = old
			return
		}
		e := &Entry{Event: ev, Set: b}
		s.sets[b.SetID] = e
		s.add(e)
	case *protocol.FindState:
		if protocol.IsSendState(b.State) {
			s.FindSends[b.FindID] = b
		} else {
			s.FindStates[b.FindID] = b
		}
		if b.DecisionID != "" {
			s.FindAsks[b.FindID] = b.DecisionID
		}
		s.bySeq[ev.Seq] = nil
	case *protocol.AIMsg:
		// D418: the partner's line about an own agent's contact tests stands in
		// for their quiet line.
		for _, id := range b.Pings {
			if g := s.Pings[s.pingAt[id]]; g != nil {
				g.Told = true
			}
		}
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
	case *protocol.DecisionLater:
		s.ApplyLater(ev.TS, b)
		s.bySeq[ev.Seq] = nil
	case *protocol.DecisionBack:
		s.ApplyLater(ev.TS, b)
		s.bySeq[ev.Seq] = nil
	case *protocol.DecisionSeen:
		s.ApplyLater(ev.TS, b)
		s.bySeq[ev.Seq] = nil
	case *protocol.ReadReceipt:
		s.ReadUpTo = max(s.ReadUpTo, b.UpToSeq)
		s.bySeq[ev.Seq] = nil
	case *protocol.MemoryRecalled:
		// D304: not an entry: a quiet line under the message it names.
		if s.Recalled == nil {
			s.Recalled = map[int64]*Recalled{}
		}
		if _, had := s.Recalled[b.AboutSeq]; !had && b.MemoryID != "" && strings.TrimSpace(b.Title) != "" {
			s.Recalled[b.AboutSeq] = &Recalled{Seq: ev.Seq, MemoryRecalled: *b}
		}
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
		// D418: contact tests arriving together from one own agent are one line;
		// the answers Ducter sent are only its last word.
		if b.Direction == "in" && b.State == "ping" {
			if s.Pings == nil {
				s.Pings, s.pingAt = map[int64]*PingGroup{}, map[string]int64{}
			}
			key := b.Agent + "|" + b.From + "|" + b.Role + "|" + b.Host
			at := ParseTime(ev.TS)
			sent := ParseTime(b.SentAt)
			if g := s.Pings[s.lastPing.seq]; g != nil && s.lastPing.key == key && at.Sub(s.lastPing.at) <= 10*time.Minute {
				g.N++
				if !sent.IsZero() && (g.Earliest.IsZero() || sent.Before(g.Earliest)) {
					g.Earliest = sent
				}
				s.pingAt[b.MessageID] = s.lastPing.seq
				s.lastPing.at = at
				s.bySeq[ev.Seq] = nil
				return
			}
			s.Pings[ev.Seq] = &PingGroup{N: 1, Earliest: sent, Sent: map[string]bool{}, Failed: map[string]bool{}}
			s.pingAt[b.MessageID] = ev.Seq
			s.lastPing.key, s.lastPing.seq, s.lastPing.at = key, ev.Seq, at
			s.add(&Entry{Event: ev, Peer: b})
			return
		}
		// D470 round 2: one delivered message is one line. A second "sent" for the same op, or the same words
		// sent again in answer to the same message, is the Log saying it twice, never a second message.
		if b.Direction == "out" && b.State == "sent" {
			key := b.InReplyTo + "|" + b.Text
			if prev := s.OutOps[b.OpID]; (b.OpID != "" && prev != nil && prev.Peer.State == "sent") || (b.InReplyTo != "" && s.sentReplies[key]) {
				s.bySeq[ev.Seq] = nil
				return
			}
			if b.InReplyTo != "" {
				if s.sentReplies == nil {
					s.sentReplies = map[string]bool{}
				}
				s.sentReplies[key] = true
			}
		}
		if b.Direction == "out" && !b.Ack && b.OpID != "" && b.Text != "" {
			switch b.State {
			case "sending", "sent", "failed", "unknown", "unconfirmed":
				if s.OutOps == nil {
					s.OutOps = map[string]*Entry{}
				}
				s.OutOps[b.OpID] = &Entry{Event: ev, Peer: b}
			}
		}
		if b.Direction == "out" && b.Ack {
			if seq, ok := s.pingAt[b.InReplyTo]; ok && b.InReplyTo != "" {
				if g := s.Pings[seq]; g != nil {
					switch b.State {
					case "sent":
						g.Sent[b.InReplyTo] = true
						delete(g.Failed, b.InReplyTo)
					case "failed", "unconfirmed":
						g.Failed[b.InReplyTo] = true
					}
				}
			}
			s.bySeq[ev.Seq] = nil
			return
		}
		// D448: a task's own follow-up to an agent (no card) is the task's, never a conversation line.
		if (b.Direction == "in" && b.State == "task") || (b.By == "task" && b.State == "sent" && b.DecisionID == "") {
			s.TaskPeers = append(s.TaskPeers, &Entry{Event: ev, Peer: b})
		}
		show := (b.Direction == "in" && b.State == "" && b.InReplyTo == "") || (b.Direction == "out" && b.State == "sent" && b.Text != "" && !(b.By == "task" && b.DecisionID == ""))
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
	if e.FirstSeq == 0 { // an older page's row keeps the place it was first shown at (D509)
		e.FirstSeq = e.Event.Seq
	}
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
	for _, f := range b.Finds {
		if _, ok := s.FindSeq[f.FindID]; !ok {
			s.FindSeq[f.FindID] = ev.Seq
		}
	}
	if b.Quiet {
		s.bySeq[ev.Seq] = nil
		return
	}
	if b.Revises != "" {
		if old := s.notes[b.Revises]; old != nil {
			old.Finds = b
			for _, f := range b.Finds {
				s.FindSeq[f.FindID] = old.Event.Seq
			}
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

// OpenAsk is the one predicate behind the needs-you count and every list
// (D617): an offer (D453) never needs the person, a question put off with
// 晚点再问我 (D382) is not open now, and neither is one whose default has come
// due. A Go default applies only on a reversible card; a Hold default applies
// even when it is not reversible (the morning's picks). The TypeScript side is
// packages/protocol/src/open-asks.ts; both read fixtures/open-asks.json.
func OpenAsk(d *DecisionState, now time.Time) bool {
	if d == nil || d.Resolved != nil || d.Pending != "" || d.Later != "" || d.Question == "" || d.Offer {
		return false
	}
	if d.DefaultAt != "" && (d.Reversible || d.DefaultOption == "hold") {
		if at, err := time.Parse(time.RFC3339, d.DefaultAt); err == nil && !at.After(now) {
			return false
		}
	}
	return true
}

// OpenDecisions are the unresolved decisions the user has not acted on,
// oldest first.
func (s *Store) OpenDecisions() []*DecisionState {
	var out []*DecisionState
	now := time.Now()
	for _, d := range s.Decisions {
		if OpenAsk(d, now) {
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
	d.Elsewhere = false
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

// insert holds ev in the task's events, in seq order.
func (t *Task) insert(ev protocol.LogEvent, body any) {
	i := sort.Search(len(t.Events), func(i int) bool { return t.Events[i].Seq > ev.Seq })
	if i == len(t.Events) {
		ev.KeepTyped(body)
		t.Events = append(t.Events, ev)
	} else {
		t.Events = append(t.Events, protocol.LogEvent{})
		copy(t.Events[i+1:], t.Events[i:])
		ev.KeepTyped(body)
		t.Events[i] = ev
	}
	t.Version++
}

func (s *Store) applyTask(t *Task, ev protocol.LogEvent, body any) {
	t.insert(ev, body)
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
		// D456: an older page landing after the newest never turns a done task back to working.
		if ev.Seq >= t.stateSeq {
			t.State, t.stateSeq = b, ev.Seq
		}
	case *protocol.TaskEvent:
		if b.Role == "system" && len(b.Raw) > 0 {
			var raw struct {
				Browser     *BrowserStatus            `json:"browser"`
				Kind        string                    `json:"kind"`
				Outcome     string                    `json:"outcome"`
				Compactions int                       `json:"compactions"`
				Read        []int64                   `json:"read"`
				Memory      string                    `json:"memory"`
				Recalled    []protocol.RecalledMemory `json:"recalled"`
			}
			if json.Unmarshal(b.Raw, &raw) == nil && raw.Browser != nil && raw.Browser.Host != "" &&
				(t.Browser == nil || t.Browser.Seq < ev.Seq) {
				raw.Browser.Seq = ev.Seq
				t.Browser = raw.Browser
			}
			// D617: what memory brought into the first turn, once.
			if raw.Memory == "recall" && len(raw.Recalled) > 0 {
				t.Recalled = raw.Recalled
			}
			// D325: the agent took these steers in.
			for _, n := range raw.Read {
				if t.Reads == nil {
					t.Reads = map[int64]bool{}
				}
				t.Reads[n] = true
				t.ReadLast = max(t.ReadLast, n)
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
		// D320: a page of older history never takes the latest report's place.
		if ev.Seq >= t.lastReportSeq {
			t.LastReport, t.lastReportSeq = b, ev.Seq
		}
		t.Evidence = mergeEvidence(t.Evidence, b.Evidence)
		// D339: the ask for the person's own phone says the task works on it.
		for _, q := range b.Questions {
			if q.Handset != nil && q.Handset.Kind != "record" && q.Handset.Device != "" {
				t.Phone = q.Handset
			}
		}
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

// ApplyLater is what 晚点再问我 / Ask me later's events do to a card (D382):
// put off; back (its countdown paused until seen, or at once by Decide
// now); seen. The phone does the same on the same fixture
// (packages/protocol/fixtures/later-events.json).
func (s *Store) ApplyLater(ts string, body any) {
	switch b := body.(type) {
	case *protocol.DecisionLater:
		if d := s.Decisions[b.DecisionID]; d != nil {
			d.Later, d.BackAt = b.Until, ""
		}
	case *protocol.DecisionBack:
		if d := s.Decisions[b.DecisionID]; d != nil {
			d.Later = ""
			if b.By == "time" {
				d.BackAt = ts
			}
			d.DefaultAt = b.DefaultAt // "" back at its time: no default on a card nobody saw
		}
	case *protocol.DecisionSeen:
		if d := s.Decisions[b.DecisionID]; d != nil {
			d.DefaultAt = b.DefaultAt
		}
	}
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
	// D454: what the person removed (移走) stays off On hand; a task the
	// snapshot doesn't hold still shows (just opened), but one that finished
	// over a day ago left On hand at the home and isn't kept here from the stream.
	away := map[string]bool{}
	for k := range s.AwayNow {
		away[k] = true
	}
	now := time.Now()
	if s.OnHand != nil {
		for _, id := range s.OnHand.Away {
			away[id] = true
		}
	}
	stale := func(t *Task) bool {
		if s.OnHand == nil || !Finished(t.Attention()) {
			return false
		}
		at := t.FinishedAt()
		return !at.IsZero() && now.Sub(at) > 24*time.Hour
	}
	var extra []*Task
	for id, t := range s.Tasks {
		if !seen[id] && (t.Open != nil || t.Card != nil) && !stale(t) {
			extra = append(extra, t)
		}
	}
	sort.Slice(extra, func(i, j int) bool { return extra[i].firstSeq() > extra[j].firstSeq() })
	tasks = append(extra, tasks...)
	for _, t := range tasks {
		if away[t.ID] {
			continue
		}
		if l := LaneOf(t.Attention()); l != LaneHidden {
			b.Lanes[l] = append(b.Lanes[l], t)
		}
	}
	// D310: done today by the one rule, over the live lane (the snapshot's count
	// is the same rule at the home, but older than what the stream says).
	b.Counts = protocol.Counts{NeedsYou: len(b.Lanes[LaneNeedsYou]), Working: len(b.Lanes[LaneWorking]), Waiting: len(b.Lanes[LaneWaiting]), DoneToday: DoneToday(b.Lanes[LaneDone], time.Now())}
	return b
}

// Finished is a task that came back: done, done but not merged, or didn't work out (On hand's 今天做完).
func Finished(a protocol.Attention) bool {
	return a == protocol.Done || a == protocol.DoneClaimed || a == protocol.Failed
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

// Dial is where one call sheet's dial on the person's phone stands (D278).
type Dial struct {
	Phase  string // asking | done | failed
	Phone  string
	How    string // rang | dialer | note
	Reason string // no_phone | no_sheet | failed | timeout
}

func firstOr(s, or string) string {
	if s != "" {
		return s
	}
	return or
}

// ShownDeviceName is a device's name as the person sees it (D291): a
// phone or iPad paired through the Ducter app before D291 was named
// "<model> · Ducter"; the art and the platform already say it is the
// app, so the suffix is dropped. A computer paired before D310 by its host
// name shows it without the network's domain ("Mac.lan" → "Mac").
func ShownDeviceName(name string) string {
	return computer.Undomained(strings.TrimSuffix(name, " · Ducter"))
}

// AccountAnswer is the home's answer about an agent's account limits
// (D288): its usage, or Why it has none (unsupported, signed_out,
// unavailable).
type AccountAnswer struct {
	Usage *protocol.AccountUsage
	Why   string
	At    time.Time
}
