// Package protocol mirrors packages/protocol/src/index.ts, the wire contract
// shared by core, runner, partner and clients. Field names and JSON tags are
// identical to the TypeScript types; JSON is the wire format. Change the TS
// file first (through the lead), then this one.
package protocol

import (
	"encoding/json"
	"fmt"
)

// Version is PROTOCOL_VERSION.
const Version = 2

// ---------- States (design/focus-window-states.md) ----------

// Attention is a task's attention state.
type Attention string

const (
	Queued      Attention = "queued"
	Working     Attention = "working"
	NeedsYou    Attention = "needs_you"
	Blocked     Attention = "blocked" // shown as "Waiting"
	DoneClaimed Attention = "done_claimed"
	Done        Attention = "done"
	Failed      Attention = "failed"
	Dropped     Attention = "dropped"
	Superseded  Attention = "superseded"
)

// Residency is where a task's session lives.
type Residency string

const (
	Provisioning Residency = "provisioning"
	Hot          Residency = "hot"
	Warm         Residency = "warm"
	Parked       Residency = "parked"
	Archived     Residency = "archived"
	Offline      Residency = "offline"
)

// ---------- Places ----------

// Place is the TS union { kind: "none" | "repo" | "folder" | "browser" },
// flattened: only the fields of its kind are set.
type Place struct {
	Kind       string `json:"kind"`
	Device     string `json:"device,omitempty"`
	RepoPath   string `json:"repoPath,omitempty"`
	Worktree   string `json:"worktree,omitempty"`
	Branch     string `json:"branch,omitempty"`
	BaseBranch string `json:"baseBranch,omitempty"`
	Path       string `json:"path,omitempty"`
	Profile    string `json:"profile,omitempty"`
	// HasRemote: the repo has an origin to push to (nil: unknown, a task from before it).
	HasRemote *bool `json:"hasRemote,omitempty"`
}

// ---------- Log events ----------

// Origin is who wrote an event.
type Origin string

const (
	OriginUser     Origin = "user"
	OriginPartner  Origin = "partner"
	OriginTask     Origin = "task"
	OriginSystem   Origin = "system"
	OriginWaiter   Origin = "waiter"
	OriginSchedule Origin = "schedule"
	OriginPeer     Origin = "peer" // another agent, via Nowledge Bridge
)

type EvidenceRef struct {
	Kind  string `json:"kind"` // ci | diff | file | url | log | test
	Label string `json:"label"`
	Ref   string `json:"ref"`
	// Check is set by Ducter when a done report lands: verified | missing;
	// empty = not checkable, the task's word.
	Check string `json:"check,omitempty"`
}

type Question struct {
	ID         string `json:"id"`
	Text       string `json:"text"`
	Blocking   bool   `json:"blocking"`
	Default    string `json:"default,omitempty"`
	Reversible bool   `json:"reversible"`
}

// Event kinds (keyof Bodies).
const (
	KindUserMsg          = "user_msg"
	KindAIMsg            = "ai_msg"
	KindAck              = "ack"
	KindJobStatus        = "job_status"
	KindLivingMsg        = "living_msg"
	KindDecision         = "decision"
	KindDecisionResolved = "decision_resolved"
	KindReadReceipt      = "read_receipt"
	KindTaskOpen         = "task_open"
	KindTaskState        = "task_state"
	KindTaskEvent        = "task_event"
	KindReport           = "report"
	KindCheckpoint       = "checkpoint"
	KindWaiter           = "waiter"
	KindWaiterLook       = "waiter_look"
	KindMemoryNoted      = "memory_noted"
	KindBridgeMsg        = "bridge_msg"
)

type UserMsg struct {
	Text     string `json:"text"`
	ClientID string `json:"clientId,omitempty"`
	// Media (D206): the pictures the user sent with it (Text may be empty then).
	Media []MediaRef `json:"media,omitempty"`
}

type AIMsg struct {
	Text    string `json:"text"`
	ReplyTo int64  `json:"replyTo,omitempty"`
	// DecisionID: a task's question in the partner's own words (D129); it
	// shows as that decision's question, not as a message of its own.
	DecisionID string `json:"decisionId,omitempty"`
	// Media (D206): what a task showed, relayed with the partner's words about it.
	Media []MediaRef `json:"media,omitempty"`
	// Cal (D222): the day glance the partner put under these words.
	Cal *CalGlance `json:"cal,omitempty"`
}

type Ack struct {
	JobID   string `json:"jobId"`
	Text    string `json:"text"`
	ReplyTo int64  `json:"replyTo"`
}

type JobStatus struct {
	JobID  string `json:"jobId"`
	Text   string `json:"text"`
	State  string `json:"state"` // running | done | failed
	TaskID string `json:"taskId,omitempty"`
}

type LivingMsg struct {
	Items []LivingItem `json:"items"`
}

type LivingItem struct {
	TaskID     string        `json:"taskId"`
	Kind       string        `json:"kind"` // decision | blocked | done | progress | failed
	Title      string        `json:"title"`
	Text       string        `json:"text"`
	DecisionID string        `json:"decisionId,omitempty"`
	Evidence   []EvidenceRef `json:"evidence,omitempty"`
}

type Decision struct {
	DecisionID    string `json:"decisionId"`
	TaskID        string `json:"taskId,omitempty"` // "" = a partner-level decision
	Question      string `json:"question"`
	GoLabel       string `json:"goLabel"`
	DefaultOption string `json:"defaultOption"` // go | hold
	DefaultAt     string `json:"defaultAt,omitempty"`
	Reversible    bool   `json:"reversible"`
	// RoutineID marks a routine's proposal or review card (D114): Go
	// activates or keeps it.
	RoutineID string `json:"routineId,omitempty"`
	// SignIn marks a sign-in card (D151): Go is 好了 / Done in the live view of
	// Ducter's browser.
	SignIn *SignInAsk `json:"signIn,omitempty"`
	// Pay (D191): 付款 / Pay: merchant, amount, card; Go carries the code.
	Pay *PayAsk `json:"pay,omitempty"`
	// Fill (D191): a saved sign-in or detail used on a site for the first time.
	Fill *FillAsk `json:"fill,omitempty"`
	// Phone (D217): a tap on Ducter's phone that commits (Go taps it once),
	// or the user's own turn on the phone (Go = 好了 / Done).
	Phone *PhoneAsk `json:"phone,omitempty"`
	// Where (D157): wait for a computer (Hold, the default) or do it now on
	// another (Go).
	Where *WhereAsk `json:"where,omitempty"`
	// Closing (D157): 合上之前搬走 / Move before closing: Go (the default)
	// moves them.
	Closing *ClosingPlan `json:"closing,omitempty"`
	// MemPlugin (D169): put Nowledge Mem into this agent on that computer
	// (Go); 先不装 / Not now (Hold) is the default.
	MemPlugin *MemPluginAsk `json:"memPlugin,omitempty"`
	// FindID (D165): a find's one next step; shown inside its note, never
	// as a card of its own in the conversation.
	FindID string `json:"findId,omitempty"`
	// Asker (D170): asked for one of the user's own agents through Bridge;
	// the answer goes back to it by Ducter's code.
	Asker *PeerAsk `json:"asker,omitempty"`
	// Trust (D170, X2): the offer to take an own agent's work without
	// asking; Go keeps the rule.
	Trust *TrustAsk `json:"trust,omitempty"`
	// Call (D189/D193): a phone call's Go card, or a question from the line.
	Call *CallAsk `json:"call,omitempty"`
	// Cal (D222): a calendar change (add, move, cancel, answer); its
	// outcome is the connection_call with this decision id.
	Cal *CalChange `json:"cal,omitempty"`
}

// TrustAsk names the agent a standing-go offer is about.
type TrustAsk struct {
	Agent string `json:"agent"`
}

// PeerAsk is the agent a decision was asked for (D170): Go is the option it
// named first, Other its second (answered as a reply with that text).
type PeerAsk struct {
	MessageID string `json:"messageId"`
	Agent     string `json:"agent"`
	Mine      bool   `json:"mine,omitempty"`
	Where     string `json:"where,omitempty"`
	Suggests  bool   `json:"suggests,omitempty"`
	Other     string `json:"other,omitempty"`
}

// ClosingPlan is what moves to a computer that stays awake before one
// closes, and what can only run there (D157).
type ClosingPlan struct {
	Device string        `json:"device"`
	Name   string        `json:"name"`
	Moves  []ClosingMove `json:"moves"`
	Stays  []ClosingStay `json:"stays"`
}

type ClosingMove struct {
	TaskID  string `json:"taskId"`
	Title   string `json:"title"`
	To      string `json:"to"`
	ToName  string `json:"toName"`
	Harness string `json:"harness"`
	Model   string `json:"model,omitempty"`
}

type ClosingStay struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
	Why    string `json:"why"` // folder | only_here
}

// CloseComputer is 合上之前搬走 / Move before closing, from a computer's card.
type CloseComputer struct {
	T      string `json:"t"` // "close_computer"
	Device string `json:"device"`
}

// WhereAsk is the one line asked when the best computer for a task is
// asleep and another could start now with a visible difference, or the
// user's own pick waits on a computer that can't be reached (D157). Kind:
// asleep | pin. State: asleep | unreachable. Here / Uses: what the waiting
// computer / Other would use (chrome | ducter).
type WhereAsk struct {
	Kind       string `json:"kind"`
	Device     string `json:"device"`
	State      string `json:"state"`
	Other      string `json:"other"`
	Agent      string `json:"agent,omitempty"`
	OtherAgent string `json:"otherAgent,omitempty"`
	Site       string `json:"site,omitempty"`
	Here       string `json:"here,omitempty"`
	Uses       string `json:"uses,omitempty"`
	SignIn     bool   `json:"signIn,omitempty"`
	Widens     bool   `json:"widens,omitempty"`
}

// SignInAsk: 需要你登录一下 {Site} / Sign in to {Site} (D151).
type SignInAsk struct {
	Site string `json:"site"`
	URL  string `json:"url,omitempty"`
}

type DecisionResolved struct {
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go | hold | reply
	Text       string `json:"text,omitempty"`
	By         string `json:"by"`            // user | default
	Now        bool   `json:"now,omitempty"` // D208: a call's Go given as Call now
}

type ReadReceipt struct {
	UpToSeq int64 `json:"upToSeq"`
}

type TaskOpen struct {
	TaskID     string `json:"taskId"`
	Title      string `json:"title"`
	Project    string `json:"project"`
	Place      Place  `json:"place"`
	Harness    string `json:"harness"`
	Model      string `json:"model,omitempty"`
	Effort     string `json:"effort,omitempty"` // D202
	Brief      string `json:"brief"`
	BodyReason string `json:"bodyReason,omitempty"`
	Language   string `json:"language,omitempty"` // "zh" | "en": the language the user reads its reports in
	// Origin "you" (D128): the user opened it themselves (New task, `ducter task`);
	// empty: the partner did.
	Origin string `json:"origin,omitempty"`
	// Media (D206): the pictures the brief carries.
	Media []MediaRef `json:"media,omitempty"`
}

type TaskState struct {
	TaskID    string    `json:"taskId"`
	Attention Attention `json:"attention"`
	Residency Residency `json:"residency"`
	Reason    string    `json:"reason,omitempty"`
}

type ToolCall struct {
	Name   string          `json:"name"`
	Input  json.RawMessage `json:"input,omitempty"`
	Output string          `json:"output,omitempty"`
	OK     *bool           `json:"ok,omitempty"`
}

// TaskEvent is one normalized harness record. Role "user" with From
// "user" is text the user sent straight into the task (logged by the
// runner); From "partner" is the partner talking to it.
type TaskEvent struct {
	TaskID string `json:"taskId"`
	Role   string `json:"role"`           // assistant | user | tool | system
	From   string `json:"from,omitempty"` // user | partner | runner
	Text   string `json:"text,omitempty"`
	// ClientID is the client's id for a user's task_send (resends are deduped by it).
	ClientID string     `json:"clientId,omitempty"`
	Media    []MediaRef `json:"media,omitempty"` // D206: pictures sent into the task with the text
	Tool     *ToolCall  `json:"tool,omitempty"`
	// Thinking is a stretch of the model's thinking, its headings only (D127).
	Thinking []string        `json:"thinking,omitempty"`
	Usage    *Usage          `json:"usage,omitempty"` // present on turn ends
	Raw      json.RawMessage `json:"raw,omitempty"`
}

// Usage is a turn's token use.
type Usage struct {
	InputTokens  int64 `json:"inputTokens,omitempty"`
	OutputTokens int64 `json:"outputTokens,omitempty"`
	CacheRead    int64 `json:"cacheRead,omitempty"`
	CacheWrite   int64 `json:"cacheWrite,omitempty"`
}

// Waiter is a cheap wait (D28, D112): a time (wait_until), or a condition
// compiled into a read-only check, a connection's event, or either plus a
// cheap model's judgement. A task-less waiter renders as a compact row on
// On hand; the On hand snapshot adds what it has seen so far.
type Waiter struct {
	WaiterID  string     `json:"waiterId"`
	TaskID    string     `json:"taskId,omitempty"`
	RoutineID string     `json:"routineId,omitempty"`
	At        string     `json:"at,omitempty"`
	Reason    string     `json:"reason"`
	State     string     `json:"state"`          // armed | fired | cancelled | expired
	Kind      string     `json:"kind,omitempty"` // timer | check | event | judge
	Check     *CheckSpec `json:"check,omitempty"`
	Event     *EventSpec `json:"event,omitempty"`
	Judge     string     `json:"judge,omitempty"`
	EveryMs   int64      `json:"everyMs,omitempty"`
	Until     string     `json:"until,omitempty"`
	Observed  string     `json:"observed,omitempty"`
	// Unmet (D145): it ended without its condition, and why, in the
	// user's words ("cancelled" with Unmet: it can't come true).
	Unmet string `json:"unmet,omitempty"`
	// EndedAt is set on OnHand.Missed entries: when it ended.
	EndedAt string `json:"endedAt,omitempty"`
	// From the On hand snapshot (WaiterView).
	ArmedAt     string `json:"armedAt,omitempty"`
	LastLookAt  string `json:"lastLookAt,omitempty"`
	LastSummary string `json:"lastSummary,omitempty"`
	Looks       int    `json:"looks,omitempty"`
	Changes     int    `json:"changes,omitempty"`
	NextLookAt  string `json:"nextLookAt,omitempty"`
}

// CheckSpec is a condition compiled into one read-only command and what
// counts as met (protocol/src/checks.ts).
type CheckSpec struct {
	Argv        []string  `json:"argv"`
	Device      string    `json:"device,omitempty"`
	Cwd         string    `json:"cwd,omitempty"`
	SucceedWhen Predicate `json:"succeedWhen"`
}

type Predicate struct {
	ExitCode *int   `json:"exitCode,omitempty"`
	Path     string `json:"path,omitempty"`
	Equals   any    `json:"equals,omitempty"`
	OneOf    []any  `json:"oneOf,omitempty"`
	Contains string `json:"contains,omitempty"`
	Matches  string `json:"matches,omitempty"`
	Any      bool   `json:"any,omitempty"`
}

// EventSpec is new items from a connection's trigger (OpenConnector).
type EventSpec struct {
	Connection string `json:"connection"`
	Service    string `json:"service"`
	Trigger    string `json:"trigger"`
	Contains   string `json:"contains,omitempty"`
}

// WaiterLook is one look of a check or event, logged when what it saw
// changed (on the task's stream for a task's wait).
type WaiterLook struct {
	WaiterID string `json:"waiterId"`
	TaskID   string `json:"taskId,omitempty"`
	OK       bool   `json:"ok"`
	Met      bool   `json:"met"`
	Summary  string `json:"summary"`
	Error    string `json:"error,omitempty"`
}

// Until is a task's keep-going loop with its tries (D113), for the try strip.
type Until struct {
	Condition string     `json:"condition"`
	MaxTries  int        `json:"maxTries"`
	State     string     `json:"state"` // on | met | stopped
	Stop      string     `json:"stop,omitempty"`
	Check     *CheckSpec `json:"check,omitempty"`
	Tries     []UntilTry `json:"tries"`
}

type UntilTry struct {
	// Progress is how much of a countable goal holds after the try (4 of 6 checks pass).
	Progress *Progress `json:"progress,omitempty"`
	N        int       `json:"n"`
	Verdict  string    `json:"verdict"` // met | better | same | worse | unknown
	Summary  string    `json:"summary"`
	By       string    `json:"by"`
	At       string    `json:"at,omitempty"`
}

// Progress is a countable goal's state: Done of Total.
type Progress struct {
	Done  int    `json:"done"`
	Total int    `json:"total"`
	Unit  string `json:"unit,omitempty"` // checks (default) | items
}

// Routine is a routine (例行, D114) as On hand shows it (RoutineView).
type Routine struct {
	RoutineID    string         `json:"routineId"`
	Name         string         `json:"name"`
	Trigger      RoutineTrigger `json:"trigger"`
	TriggerWords string         `json:"triggerWords"`
	Brief        string         `json:"brief"`
	Reports      string         `json:"reports"` // every | on_change | needs_you
	Effect       string         `json:"effect"`  // read_only | drafts | local_writes
	State        string         `json:"state"`   // proposed | active | paused | ended | dismissed
	DecisionID   string         `json:"decisionId,omitempty"`
	CreatedAt    string         `json:"createdAt"`
	ReviewAt     string         `json:"reviewAt"`
	PausedBy     string         `json:"pausedBy,omitempty"`
	PauseReason  string         `json:"pauseReason,omitempty"`
	NextAt       string         `json:"nextAt,omitempty"`
	Upcoming     []string       `json:"upcoming,omitempty"`
	DryRun       *RoutineDryRun `json:"dryRun,omitempty"`
	LastRun      *RoutineRun    `json:"lastRun,omitempty"`
	Running      string         `json:"running,omitempty"`
	// D185: set up by the user on the New task card, with its place.
	By      string `json:"by,omitempty"`
	Place   *Place `json:"place,omitempty"`
	Project string `json:"project,omitempty"`
}

type RoutineTrigger struct {
	Kind      string     `json:"kind"`            // time | condition
	Every     string     `json:"every,omitempty"` // day | weekday | week | month | hours | once
	Date      string     `json:"date,omitempty"`  // once (D185)
	Days      []int      `json:"days,omitempty"`
	Hours     int        `json:"hours,omitempty"`
	Time      string     `json:"time,omitempty"`
	Zone      string     `json:"zone,omitempty"`
	TZ        string     `json:"tz,omitempty"`
	Condition string     `json:"condition,omitempty"`
	Check     *CheckSpec `json:"check,omitempty"`
	Event     *EventSpec `json:"event,omitempty"`
}

type RoutineDryRun struct {
	Met     bool   `json:"met"`
	Summary string `json:"summary"`
	At      string `json:"at"`
}

type RoutineRun struct {
	RoutineID    string `json:"routineId"`
	RunID        string `json:"runId"`
	ScheduledFor string `json:"scheduledFor"`
	State        string `json:"state"` // started | skipped | done | failed
	TaskID       string `json:"taskId,omitempty"`
	At           string `json:"at,omitempty"`
}

// FromRoutine marks a routine's run task.
type FromRoutine struct {
	RoutineID string `json:"routineId"`
	Name      string `json:"name"`
}

// WaiterAction, RoutineAction and UntilAction are the work-over-time
// buttons (D112-D114), each answered with action_result.
type WaiterAction struct {
	T        string `json:"t"` // "waiter_action"
	WaiterID string `json:"waiterId"`
	Action   string `json:"action"` // look | cancel
}

type RoutineAction struct {
	T         string `json:"t"` // "routine_action"
	RoutineID string `json:"routineId"`
	Action    string `json:"action"` // pause | resume | end
}

type UntilAction struct {
	T      string `json:"t"` // "until_action"
	TaskID string `json:"taskId"`
	Action string `json:"action"` // stop
}

// MemoryNoted is the partner saving something durable to the user's
// long-term memory. It shows as one quiet line: "记下了 · <title>".
type MemoryNoted struct {
	Title    string `json:"title"`
	MemoryID string `json:"memoryId,omitempty"`
	ReplyTo  int64  `json:"replyTo,omitempty"`
}

// Waiter states.
const (
	WaiterArmed     = "armed"
	WaiterFired     = "fired"
	WaiterCancelled = "cancelled"
	WaiterExpired   = "expired"
)

// EndedUnmet is a task-less wait that ended without its condition: it
// can't come true, or it ran out of time (D145).
func (w *Waiter) EndedUnmet() bool {
	return w.TaskID == "" && w.RoutineID == "" && (w.State == WaiterExpired || (w.State == WaiterCancelled && w.Unmet != ""))
}

type Report struct {
	TaskID    string        `json:"taskId"`
	State     string        `json:"state"` // progress | needs_input | blocked | done | failed
	Summary   string        `json:"summary"`
	Questions []Question    `json:"questions"`
	Evidence  []EvidenceRef `json:"evidence"`
	// Branch is set by Ducter when the report is logged: what the task's
	// branch holds that its base doesn't. Nil when unknown.
	Branch *BranchChanges `json:"branch,omitempty"`
	// Folder is set by Ducter on a done or failed report of a non-git
	// folder task (D142).
	Folder *FolderSummary `json:"folder,omitempty"`
	// Media (D206): what the task chose to show the user.
	Media []MediaRef `json:"media,omitempty"`
}

// BranchChanges is a task branch against its base: commits only it has,
// and work not yet committed.
type BranchChanges struct {
	Commits     int  `json:"commits"`
	Uncommitted bool `json:"uncommitted"`
	// D128: the diff since the branch left its base (nil: not counted).
	Files *int `json:"files,omitempty"`
	Adds  *int `json:"adds,omitempty"`
	Dels  *int `json:"dels,omitempty"`
}

// HasBranchChanges is false only when Ducter checked and the branch holds
// nothing its base doesn't. Unknown counts as changes.
func HasBranchChanges(r *Report) bool {
	return r == nil || r.Branch == nil || r.Branch.Commits > 0 || r.Branch.Uncommitted
}

type Checkpoint struct {
	TaskID string `json:"taskId"`
	Text   string `json:"text"`
	GitRef string `json:"gitRef,omitempty"`
}

// LogEvent is one event of the Log. Body stays raw until a typed accessor
// decodes it, so unknown kinds pass through untouched.
type LogEvent struct {
	Seq        int64           `json:"seq"`
	TS         string          `json:"ts"`
	Persona    string          `json:"persona"`
	Stream     string          `json:"stream"` // "channel" | "task:<id>"
	Origin     Origin          `json:"origin"`
	Kind       string          `json:"kind"`
	Body       json.RawMessage `json:"body"`
	Supersedes int64           `json:"supersedes,omitempty"`
}

// Decode decodes the event's body into v.
func (e LogEvent) Decode(v any) error {
	if err := json.Unmarshal(e.Body, v); err != nil {
		return fmt.Errorf("event %d (%s): %w", e.Seq, e.Kind, err)
	}
	return nil
}

// Typed returns the body decoded into its Go type, by kind, or nil for an
// unknown kind.
func (e LogEvent) Typed() (any, error) {
	var v any
	switch e.Kind {
	case KindUserMsg:
		v = &UserMsg{}
	case KindAIMsg:
		v = &AIMsg{}
	case KindAck:
		v = &Ack{}
	case KindJobStatus:
		v = &JobStatus{}
	case KindLivingMsg:
		v = &LivingMsg{}
	case KindDecision:
		v = &Decision{}
	case KindDecisionResolved:
		v = &DecisionResolved{}
	case KindReadReceipt:
		v = &ReadReceipt{}
	case KindTaskOpen:
		v = &TaskOpen{}
	case KindTaskState:
		v = &TaskState{}
	case KindTaskEvent:
		v = &TaskEvent{}
	case KindReport:
		v = &Report{}
	case KindCheckpoint:
		v = &Checkpoint{}
	case KindMemoryNoted:
		v = &MemoryNoted{}
	case KindWaiter:
		v = &Waiter{}
	case KindBridgeMsg:
		v = &BridgeMsg{}
	case KindBodySelected:
		v = &BodySelected{}
	case KindFinds:
		v = &Finds{}
	case KindFindState:
		v = &FindState{}
	case KindPhoneCall:
		v = &CallBody{}
	case KindConnectionCall:
		v = &ConnectionCall{}
	default:
		return nil, nil
	}
	if err := e.Decode(v); err != nil {
		return nil, err
	}
	return v, nil
}

// BridgeMsg is a Nowledge Bridge message in or out (DUCTER_BRIDGE=1). Direction "in" text is
// untrusted: it comes from another agent, not the user. Not rendered yet (design/bridge.md).
type BridgeMsg struct {
	Direction  string `json:"direction"`
	MessageID  string `json:"messageId"`
	From       string `json:"from,omitempty"`
	To         string `json:"to,omitempty"`
	Text       string `json:"text"`
	InReplyTo  string `json:"inReplyTo,omitempty"`
	SentAt     string `json:"sentAt,omitempty"`
	TaskID     string `json:"taskId,omitempty"`
	DecisionID string `json:"decisionId,omitempty"`
	Agent      string `json:"agent,omitempty"`
	Mine       bool   `json:"mine,omitempty"`
	State      string `json:"state,omitempty"` // out: pending|held|sending|sent|failed|unknown|unconfirmed|followed; in: early|set_aside|muted; empty = sent / to read
	OpID       string `json:"opId,omitempty"`
	Contact    string `json:"contact,omitempty"`
	Operation  string `json:"operation,omitempty"`
}

// NewEvent builds an event with body encoded from v (for the mock server
// and tests).
func NewEvent(seq int64, ts, persona, stream string, origin Origin, kind string, body any) LogEvent {
	raw, _ := json.Marshal(body)
	return LogEvent{Seq: seq, TS: ts, Persona: persona, Stream: stream, Origin: origin, Kind: kind, Body: raw}
}

// ---------- On hand snapshot ----------

type TaskCard struct {
	TaskID            string    `json:"taskId"`
	Persona           string    `json:"persona"`
	Title             string    `json:"title"`
	Project           string    `json:"project"`
	Place             Place     `json:"place"`
	Harness           string    `json:"harness"`
	Model             string    `json:"model,omitempty"`
	Effort            string    `json:"effort,omitempty"` // D202: picked by the user, else the model's own
	BodyReason        string    `json:"bodyReason,omitempty"`
	Body              *TaskBody `json:"body,omitempty"` // who does it now and why (D89)
	Attention         Attention `json:"attention"`
	Residency         Residency `json:"residency"`
	Reason            string    `json:"reason,omitempty"`
	LastReport        *Report   `json:"lastReport,omitempty"`
	PendingDecisionID string    `json:"pendingDecisionId,omitempty"`
	// PendingDecision is the open decision, for On hand.
	PendingDecision *PendingDecision `json:"pendingDecision,omitempty"`
	OpenedAt        string           `json:"openedAt"`
	UpdatedAt       string           `json:"updatedAt"`
	Until           *Until           `json:"until,omitempty"`       // D113
	FromRoutine     *FromRoutine     `json:"fromRoutine,omitempty"` // D114
	OpenedBy        string           `json:"openedBy,omitempty"`    // D128: "you" = the user opened it
	Changes         *DiffStat        `json:"changes,omitempty"`     // D128: repo tasks, once counted
	Folder          *FolderSummary   `json:"folder,omitempty"`      // D142: non-git folder tasks
	Browsing        *Browsing        `json:"browsing,omitempty"`    // D190: holds Ducter's browser there
	// D216: its latest step or words (a task_event, long fields cut), and a
	// merge or a draft PR the user made from Ducter.
	Latest     *LogEvent   `json:"latest,omitempty"`
	Integrated *Integrated `json:"integrated,omitempty"`
	Phoning    *Browsing   `json:"phoning,omitempty"` // D217: is using Ducter's phone there
}

// Integrated is what the user did with a task's branch from Ducter (D216):
// Act "merge" (Ref: the commit) or "open_pr" (Ref: the PR's address).
type Integrated struct {
	Act string `json:"act"`
	Ref string `json:"ref,omitempty"`
	At  string `json:"at"`
}

// Browsing says a task holds Ducter's own browser on a computer ("local" or
// a device id), so its tab can be watched (D190).
type Browsing struct {
	Device string `json:"device"`
}

// PendingDecision is Bodies["decision"] & { askedAt }.
type PendingDecision struct {
	Decision
	AskedAt string `json:"askedAt"`
}

type Counts struct {
	NeedsYou  int `json:"needs_you"`
	Working   int `json:"working"`
	Waiting   int `json:"waiting"`
	DoneToday int `json:"done_today"`
}

type OnHand struct {
	Tasks  []TaskCard `json:"tasks"`
	Counts Counts     `json:"counts"`
	// Waiters are the armed waiters; task-less ones render as compact
	// rows.
	Waiters []Waiter `json:"waiters"`
	// Routines (D114), proposed ones included (their proposal card).
	Routines []Routine `json:"routines,omitempty"`
	// Missed (D145) are the task-less waits that ended unmet today: the
	// finished area keeps them, with Keep waiting.
	Missed []Waiter `json:"missed,omitempty"`
	// Projects (D186) the user added by hand, shown before any task.
	Projects []ProjectView `json:"projects,omitempty"`
	// Calls (D193): live, waiting for Go, or ended today; newest first.
	Calls []CallBody `json:"calls,omitempty"`
}

// ---------- Client <-> main process WebSocket ----------
// Semantics (as in index.ts):
//   - hello.cursor: the server replies welcome, then replays channel events
//     with seq > cursor (cursor omitted = the last 200 channel events), then
//     on_hand, then streams live events. Task streams are never pushed in
//     bulk; clients pull them with task_history and receive live
//     task_event/task_state for every task afterwards.
//   - read.upToSeq: the user has seen the channel up to this seq. The living
//     message is frozen once read: the next update appends a new living_msg
//     instead of superseding.
//   - task_send: delivered to the task as steer when it is mid-turn and the
//     harness supports it, otherwise as the next turn ("prompted") or queued
//     behind the current turn. The server acks it with a "sent" frame.

// ---------- Client -> server frames ----------

type Hello struct {
	T       string `json:"t"` // "hello"
	Persona string `json:"persona,omitempty"`
	Cursor  *int64 `json:"cursor,omitempty"`
	Locale  string `json:"locale,omitempty"` // zh | en
	TZ      string `json:"tz,omitempty"`     // IANA zone; personal routines follow it (D114)
	// Client: "desktop" | "web" | "cli" (D128: open_task goes to the apps).
	Client string `json:"client,omitempty"`
	// Version is the app's own Ducter version: newer than the home's latest
	// release, the home reads GitHub again.
	Version string `json:"version,omitempty"`
}

type Send struct {
	T        string `json:"t"` // "send"
	Text     string `json:"text"`
	ClientID string `json:"clientId"`
	// Media (D206): ids from POST /api/media; Text may be empty then.
	Media []string `json:"media,omitempty"`
}

type Decide struct {
	T          string `json:"t"` // "decide"
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go | hold | reply
	Text       string `json:"text,omitempty"`
}

type TaskSend struct {
	T      string `json:"t"` // "task_send"
	TaskID string `json:"taskId"`
	Text   string `json:"text"`
	// ClientID makes a resend safe: the server delivers it once.
	ClientID string   `json:"clientId,omitempty"`
	Media    []string `json:"media,omitempty"` // D206
}

type TaskAction struct {
	T      string `json:"t"` // "task_action"
	TaskID string `json:"taskId"`
	Action string `json:"action"` // interrupt | drop | undrop | reopen | merge | open_pr | undo | keep
	// undo (D142): Path puts back only that entry; Force undoes even though
	// the folder changed after the task finished.
	Path  string `json:"path,omitempty"`
	Force bool   `json:"force,omitempty"`
}

type Read struct {
	T       string `json:"t"` // "read"
	UpToSeq int64  `json:"upToSeq"`
}

type TaskHistoryReq struct {
	T         string `json:"t"` // "task_history"
	TaskID    string `json:"taskId"`
	BeforeSeq int64  `json:"beforeSeq,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

// DevicesReq asks for Your devices and abilities, and keeps this socket
// subscribed: a fresh devices frame comes whenever something changes.
type DevicesReq struct {
	T string `json:"t"` // "devices"
	// Refresh probes the harness sign-ins again now (after signing in or
	// out from the app).
	Refresh bool `json:"refresh,omitempty"`
}

// AbilityReq adds (On, 装上) or removes (取下) an ability on a device. The
// server answers ability_result, then a fresh devices frame.
type AbilityReq struct {
	T       string `json:"t"` // "ability"
	Device  string `json:"device"`
	Ability string `json:"ability"`
	On      bool   `json:"on"`
}

// PairCodeReq asks for a one-time pairing code (远程打开 / Reach from
// anywhere, D54); the server answers a pair_code frame.
type PairCodeReq struct {
	T string `json:"t"` // "pair_code"
}

// RenameDeviceReq is 改名字 / Rename for a paired device (another
// computer; D84). The server answers rename_result, then a fresh devices
// frame. The machine Ducter lives on keeps its own name.
type RenameDeviceReq struct {
	T      string `json:"t"` // "rename_device"
	Device string `json:"device"`
	Name   string `json:"name"`
}

// DisconnectDeviceReq is 断开 / Disconnect on a device's card (D148): the
// same revoke as `ducter devices disconnect`. Answered with
// disconnect_result, then a fresh devices frame.
type DisconnectDeviceReq struct {
	T      string `json:"t"` // "disconnect_device"
	Device string `json:"device"`
}

// DeviceUpdateReq is 更新 / Update on a device's card (D148). Check only
// reads the latest release again. Answered with update_result; progress
// comes as fresh devices frames.
type DeviceUpdateReq struct {
	T      string `json:"t"` // "device_update"
	Device string `json:"device"`
	Check  bool   `json:"check,omitempty"`
}

// UpdateAllReq is 全部更新 / Update all (D224): the home makes one plan
// (its own Ducter first, then the other computers, then each computer's AI
// agents at a safe point) and runs it. Stop: 停止剩下的; Dismiss: put a
// finished plan away. Answered with update_all_result; progress comes as
// fresh devices frames (UpdateAll.Plan).
type UpdateAllReq struct {
	T       string `json:"t"` // "update_all"
	Stop    bool   `json:"stop,omitempty"`
	Dismiss bool   `json:"dismiss,omitempty"`
	By      string `json:"by,omitempty"` // user | cli
}

// AgentUpdateReq is 更新 / Update on an AI agent's row (D156). Answered with
// agent_update_result; progress comes as fresh devices frames.
type AgentUpdateReq struct {
	T       string `json:"t"` // "agent_update"
	Device  string `json:"device"`
	Harness string `json:"harness"`
	Check   bool   `json:"check,omitempty"`
}

// MemPluginInstall is 装上 / Install on an agent's Nowledge Mem line (D169):
// one task on that device follows Mem's own setup guide. Answered with
// mem_plugin_result (OK, TaskID, Reason).
type MemPluginInstall struct {
	T       string `json:"t"` // "mem_plugin_install"
	Device  string `json:"device"`
	Harness string `json:"harness"`
}

// ---------- Connections (D96: the user's OpenConnector or other MCP servers) ----------

// ConnectionsReq asks for the user's connections and keeps this socket told
// of every change.
type ConnectionsReq struct {
	T string `json:"t"` // "connections"
}

// ConnectionAdd checks an address and token, then saves the connection.
// The token goes to the server once and is never sent back.
type ConnectionAdd struct {
	T     string `json:"t"` // "connection_add"
	URL   string `json:"url"`
	Token string `json:"token,omitempty"`
	Name  string `json:"name,omitempty"`
}

// ConnectionRemove removes one connection (and its token).
type ConnectionRemove struct {
	T  string `json:"t"` // "connection_remove"
	ID string `json:"id"`
}

// ConnectionOo is the one tap: with oo signed in, the server reads the
// accounts through the oo CLI itself (D122; oo's sign-in never leaves oo);
// otherwise the self-hosted OpenConnector oo is set up with, read only now.
type ConnectionOo struct {
	T string `json:"t"` // "connection_oo"
}

// ConnectionView is one connection, without any secret. Source: "oomol"
// (OOMOL Hosted: mail and sign-ins pass through OOMOL), "self" (the user's
// own OpenConnector), "mcp" (another MCP server), "oo" (the accounts in
// the user's oo, read through oo itself; mail passes through OOMOL).
type ConnectionView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	Source    string `json:"source"`
	AddedAt   string `json:"addedAt"`
	Via       string `json:"via"`   // "manual" | "oo"
	State     string `json:"state"` // "ok" | "unreachable" | "unauthorized" | "unknown"
	CheckedAt string `json:"checkedAt,omitempty"`
	// Apps: what it can read, as oo last listed it (source "oo"), or the
	// accounts connected in an OpenConnector (D158).
	Apps []OoApp `json:"apps,omitempty"`
	// Look (D166): its watching today, the status line and the tiles.
	Look *SourceLook `json:"look,omitempty"`
	// SignIn (D193): signed in on the provider's own page, not a pasted key.
	SignIn bool `json:"signIn,omitempty"`
	// Phone (D193): a calling connection: the phone card, not the mailbox.
	Phone *PhoneView `json:"phone,omitempty"`
}

// OoApp is one service connected in oo and its accounts' own labels.
type OoApp struct {
	Service  string   `json:"service"`
	Title    string   `json:"title"`
	Accounts []string `json:"accounts"`
}

// OoDetect is what the oo CLI is set up with, without its secrets.
// Account: signed in to OOMOL in oo; then the one tap reads through oo
// itself (D122), and Apps lists what it has once oo has answered.
type OoDetect struct {
	Installed  bool `json:"installed"`
	SelfHosted *struct {
		URL      string `json:"url"`
		HasToken bool   `json:"hasToken"`
	} `json:"selfHosted,omitempty"`
	Account bool    `json:"account"`
	Apps    []OoApp `json:"apps,omitempty"`
}

// ---------- Settings (D71: the Partner page and Settings) ----------

// SettingsReq asks for the partner's settings and keeps this socket told
// of every change.
type SettingsReq struct {
	T string `json:"t"` // "settings"
}

// SettingsSet changes some settings; the server answers with a fresh
// settings frame (to every subscriber).
type SettingsSet struct {
	T     string        `json:"t"` // "settings_set"
	Patch SettingsPatch `json:"patch"`
}

// MemoryForget forgets one 记下了 / Noted line, by its seq.
type MemoryForget struct {
	T   string `json:"t"` // "memory_forget"
	Seq int64  `json:"seq"`
}

// QuietHours is 免打扰 / Quiet hours: "23:00" to "08:00" in a zone.
type QuietHours struct {
	Start string `json:"start"`
	End   string `json:"end"`
	TZ    string `json:"tz"`
}

// Settings are the partner's settings, as the server keeps them.
type Settings struct {
	Name            string      `json:"name"`
	Language        string      `json:"language"` // auto | zh | en
	Memory          bool        `json:"memory"`
	Notify          bool        `json:"notify"`
	Quiet           *QuietHours `json:"quiet"`
	DefaultAfterMin int         `json:"defaultAfterMin"`
	// Brain is what the partner thinks with (D89); TaskAccounts are the
	// Use it for tasks switches (a missing entry is on).
	Brain        *Brain                 `json:"brain,omitempty"`
	TaskAccounts map[string]TaskAccount `json:"taskAccounts,omitempty"`
	// AutoUpdate: update at night, in quiet hours, when nothing is working (D148).
	AutoUpdate bool `json:"autoUpdate,omitempty"`
	// Proactive (D165): when it notices something; "" = never answered
	// (nothing watches).
	Proactive string `json:"proactive,omitempty"`
	// Peers: who of the user's other agents may reach the partner (D170).
	Peers *Peers `json:"peers,omitempty"`
}

// SettingsPatch is a change to some settings. Quiet is sent as given, so
// a patch that sets ClearQuiet sends "quiet": null.
type SettingsPatch struct {
	Name            *string                `json:"name,omitempty"`
	Language        string                 `json:"language,omitempty"`
	Memory          *bool                  `json:"memory,omitempty"`
	Notify          *bool                  `json:"notify,omitempty"`
	Quiet           *QuietHours            `json:"-"`
	ClearQuiet      bool                   `json:"-"`
	DefaultAfterMin int                    `json:"defaultAfterMin,omitempty"`
	Brain           *Brain                 `json:"brain,omitempty"`
	TaskAccounts    map[string]TaskAccount `json:"taskAccounts,omitempty"`
	AutoUpdate      *bool                  `json:"autoUpdate,omitempty"`
	Proactive       string                 `json:"proactive,omitempty"`
	Peers           *Peers                 `json:"peers,omitempty"`
}

// Peers is who of the user's other agents may reach the partner (D170):
// reach own | team | off; Trusted, own agents whose work starts without
// asking; Muted, agents the user stopped listening to.
type Peers struct {
	Reach   string   `json:"reach"`
	Trusted []string `json:"trusted"`
	Muted   []string `json:"muted"`
}

// MarshalJSON writes Quiet only when it is set or cleared.
func (p SettingsPatch) MarshalJSON() ([]byte, error) {
	type plain SettingsPatch
	b, err := json.Marshal(plain(p))
	if err != nil || (p.Quiet == nil && !p.ClearQuiet) {
		return b, err
	}
	q := []byte("null")
	if p.Quiet != nil {
		if q, err = json.Marshal(p.Quiet); err != nil {
			return nil, err
		}
	}
	out := append([]byte{}, b[:len(b)-1]...)
	if len(b) > 2 {
		out = append(out, ',')
	}
	out = append(out, []byte(`"quiet":`)...)
	out = append(out, q...)
	return append(out, '}'), nil
}

// Noted is one 记下了 / Noted line the partner saved.
type Noted struct {
	Seq      int64  `json:"seq"`
	Title    string `json:"title"`
	At       string `json:"at"`
	MemoryID string `json:"memoryId,omitempty"`
}

// MemView is what the partner remembers, as far as this Ducter can tell:
// State is connected, missing (no Nowledge Mem) or off.
type MemView struct {
	State string  `json:"state"`
	Noted []Noted `json:"noted"`
	// KeptUnder is the name its memories are kept under in Mem (D141).
	KeptUnder string `json:"keptUnder,omitempty"`
}

// BridgeView is Settings › 伙伴's row for the persona's own connection with
// the user's other AI agents (D205). State: update_mem (Home's Mem needs
// updating), ready, no_space, connecting, connected, disconnecting, refused
// (Reason), failed (Detail), unconfirmed. Pinned: DUCTER_BRIDGE=1 on the home.
//
// D225, the home's own Mem command line first: install_mem / installing,
// update_mem / updating (CanRun: one tap does it; else Need: "pipx", "app",
// "other"), sign_in / signing_in (a one-time connect link; SignIn: "used",
// "bad", "failed"), local_mem (Mem here isn't a cloud workspace).
type BridgeView struct {
	State    string       `json:"state"`
	Identity string       `json:"identity"`
	Space    *BridgeSpace `json:"space,omitempty"`
	Home     string       `json:"home,omitempty"`
	Reason   string       `json:"reason,omitempty"`
	Detail   string       `json:"detail,omitempty"`
	Pinned   bool         `json:"pinned,omitempty"`
	CanRun   bool         `json:"canRun,omitempty"`
	Need     string       `json:"need,omitempty"`
	SignIn   string       `json:"signIn,omitempty"`
	Version  string       `json:"version,omitempty"`
}

// BridgeSpace is the user's own place in Mem ("Only me"): label and exact id.
type BridgeSpace struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// BridgeAction is 连上 / Connect or 断开 / Disconnect (D205): T is
// "bridge_connect" or "bridge_disconnect"; fresh settings frames answer.
type BridgeAction struct {
	T string `json:"t"`
}

// BridgeMemSignIn is D225's 登录: a one-time connect link for the home's
// nmem (T "bridge_mem_sign_in"); BridgeAction{T: "bridge_mem_install"} is
// 装上 / 更新.
type BridgeMemSignIn struct {
	T    string `json:"t"`
	Link string `json:"link"`
}

// BrainNow is the brain in use, and why when it isn't the one set.
type BrainNow struct {
	Brain
	// Auto: the user never chose; core picked it. Why: the reason when it
	// isn't the setting ("only_codex"; "only_signed_in" for another agent, D177).
	Auto bool   `json:"auto"`
	Why  string `json:"why,omitempty"`
	// Models are the ones it may think with on the home (D150); none: its
	// own default model.
	Models []BrainModel `json:"models,omitempty"`
}

// BrainModel is one model the partner may think with: smart or fast.
type BrainModel struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
}

// Forgot says how a memory_forget went: "mem" (Mem forgot it) or
// "hidden" (only no longer shown here).
type Forgot struct {
	Seq int64  `json:"seq"`
	How string `json:"how"`
}

// DefaultAfterChoices are the choices for Settings.DefaultAfterMin.
var DefaultAfterChoices = []int{10, 30, 60, 120}

// ---------- Devices and abilities (D43, D51) ----------

// Ability ids: web 上网 · computer 用电脑 · remote 远程打开 · phone 用手机 ·
// call 打电话.
const (
	AbilityWeb      = "web"
	AbilityComputer = "computer"
	AbilityRemote   = "remote"
	AbilityPhone    = "phone"
	AbilityCall     = "call"
)

// Ability states: later = not in this version (locked, "以后会有");
// unavailable = can't be added here (Reason says why).
const (
	AbilityOn          = "on"
	AbilityOff         = "off"
	AbilityUnavailable = "unavailable"
	AbilityLater       = "later"
)

// Device states (glossary: 醒着 / 睡着了 / 连不上).
const (
	DeviceAwake       = "awake"
	DeviceAsleep      = "asleep"
	DeviceUnreachable = "unreachable"
)

// Allowance is what a harness reported of its quota; never estimated.
type Allowance struct {
	Left     float64 `json:"left"` // 0..1
	ResetsAt string  `json:"resetsAt,omitempty"`
	SharedBy int     `json:"sharedBy,omitempty"`
}

type DeviceHarness struct {
	Harness   string     `json:"harness"`
	Installed bool       `json:"installed"`
	LoggedIn  bool       `json:"loggedIn"`
	Allowance *Allowance `json:"allowance,omitempty"`
	// Models this account offers, when it lists them; CanBePartner: it can
	// be what the partner thinks with here; Billing: plan | usage.
	Models       []HarnessModel `json:"models,omitempty"`
	CanBePartner bool           `json:"canBePartner"`
	Billing      string         `json:"billing,omitempty"`
	// D156: the installed version, how it was installed (npm, brew,
	// installer, app, ducter, unknown), the newest on that channel, whether
	// it can be updated from here, where it stands against the versions
	// Ducter verified, and an update under way.
	Version        string       `json:"version,omitempty"`
	How            string       `json:"how,omitempty"`
	Latest         string       `json:"latest,omitempty"`
	Available      bool         `json:"available,omitempty"`
	Standing       string       `json:"standing,omitempty"`
	LatestVerified *bool        `json:"latestVerified,omitempty"`
	Update         *AgentUpdate `json:"update,omitempty"`
	// D169: Nowledge Mem's plugin for this agent, for the user's own use of
	// it outside Ducter; nil when memory is off or the check can't tell.
	Mem *MemPluginView `json:"mem,omitempty"`
}

// MemPluginView is one agent's Nowledge Mem line (D169), from Mem's own
// local check: installed (Version; never "working": the check doesn't
// prove the agent loads it), absent, update, or review (Why: multiple |
// unclear). TaskID: a setup task for it is open now.
type MemPluginView struct {
	State     string `json:"state"`
	Version   string `json:"version,omitempty"`
	Why       string `json:"why,omitempty"`
	TaskID    string `json:"taskId,omitempty"`
	CheckedAt string `json:"checkedAt,omitempty"`
}

// MemPluginAsk is Ducter's one card offering Nowledge Mem for an agent on a
// computer (D169): Go installs it by a task there; Hold (先不装) is the default.
type MemPluginAsk struct {
	Device     string `json:"device"`
	DeviceName string `json:"deviceName"`
	Harness    string `json:"harness"`
}

// AgentUpdate is one AI agent's update on a device (D156): waiting,
// updating, checking, done or failed with a reason.
type AgentUpdate struct {
	Phase      string `json:"phase"`
	From       string `json:"from"`
	To         string `json:"to,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Detail     string `json:"detail,omitempty"`
	RolledBack bool   `json:"rolledBack,omitempty"`
	At         string `json:"at,omitempty"`
	By         string `json:"by,omitempty"`
}

// Running reports an agent update under way.
func (u *AgentUpdate) Running() bool {
	return u != nil && (u.Phase == "waiting" || u.Phase == "updating" || u.Phase == "checking")
}

type DeviceAbility struct {
	ID     string `json:"id"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"` // cua_missing | cua_old | env_off | home_only | no_address | unknown_device | failed | worker_old | offline
	Detail string `json:"detail,omitempty"`
	// web only (D130): where browser tasks run. WhereChrome = the user's own Chrome through an
	// AI agent's own browser tools (no cua-driver needed); WhereDucter = Ducter's own browser.
	Where string `json:"where,omitempty"`
	// Setup (D151): "installing" while Ducter installs its own browser here
	// (and D217: its phone).
	Setup string `json:"setup,omitempty"`
	// Step (D217): how far installing the phone is.
	Step *PhoneInstallStep `json:"step,omitempty"`
	// Running (D217): Ducter's phone is on right now.
	Running bool `json:"running,omitempty"`
}

const (
	WhereChrome = "chrome"
	WhereDucter = "ducter"
)

type DeviceView struct {
	ID        string          `json:"id"` // "local" for the machine Ducter lives on
	Name      string          `json:"name"`
	Kind      string          `json:"kind"` // laptop | mini | server | phone
	Home      bool            `json:"home"`
	State     string          `json:"state"`
	LastSeen  string          `json:"lastSeen,omitempty"`
	Version   string          `json:"version,omitempty"`
	Harnesses []DeviceHarness `json:"harnesses"`
	Abilities []DeviceAbility `json:"abilities"`
	// Update is where its Ducter stands against the latest release (D148).
	Update   *DeviceUpdate `json:"update,omitempty"`
	Platform string        `json:"platform,omitempty"` // linux-x64, darwin-arm64…
	// Computer is the computer it runs on (D155): an app window and the
	// command line on it fold into its card.
	Computer string `json:"computer,omitempty"`
	// AlwaysOn: it doesn't sleep (a server, a desktop Mac), so long work
	// keeps going there (D157).
	AlwaysOn bool `json:"alwaysOn,omitempty"`
}

// DeviceUpdate is a device's version against the latest release, and an
// update under way (D148). How: self (it updates itself, a Linux server) |
// app (through Ducter.app on that Mac) | source (run from source) | manual
// (too old to update from here). Phase: downloading | verifying | waiting |
// restarting | done | failed; empty when idle.
type DeviceUpdate struct {
	Current   string `json:"current"`
	Latest    string `json:"latest,omitempty"`
	Available bool   `json:"available"`
	// NotesBy is what's new per language ("zh", "en"), short whole lines;
	// a card shows its own language's and none otherwise (D172).
	NotesBy  map[string][]string `json:"notesBy,omitempty"`
	Security bool                `json:"security,omitempty"`
	How      string              `json:"how"`
	// FromHere (D187): how "app", and that Mac's Ducter asks its app to
	// update when any client taps 更新.
	FromHere   bool    `json:"fromHere,omitempty"`
	Phase      string  `json:"phase,omitempty"`
	Progress   float64 `json:"progress,omitempty"`
	From       string  `json:"from,omitempty"`
	To         string  `json:"to,omitempty"`
	Reason     string  `json:"reason,omitempty"`
	Detail     string  `json:"detail,omitempty"`
	RolledBack bool    `json:"rolledBack,omitempty"`
	At         string  `json:"at,omitempty"`
	CheckedAt  string  `json:"checkedAt,omitempty"`
}

// UpdateAllItem is one step of Update all (D224): a computer's Ducter
// (Kind "ducter") or one AI agent on a computer ("agent"). State: queued |
// waiting (Busy tasks use it there) | running (Phase, Progress) | done |
// failed (Reason, RolledBack) | skipped (Reason home | offline | stopped).
type UpdateAllItem struct {
	Key        string  `json:"key"`
	Kind       string  `json:"kind"`
	Device     string  `json:"device"`
	DeviceName string  `json:"deviceName"`
	Harness    string  `json:"harness,omitempty"`
	From       string  `json:"from"`
	To         string  `json:"to"`
	State      string  `json:"state"`
	Phase      string  `json:"phase,omitempty"`
	Progress   float64 `json:"progress,omitempty"`
	Busy       int     `json:"busy,omitempty"`
	Wait       string  `json:"wait,omitempty"` // D227: "ducter" (waiting) · "reconnect" (running)
	Retried    bool    `json:"retried,omitempty"`
	Reason     string  `json:"reason,omitempty"`
	Detail     string  `json:"detail,omitempty"`
	RolledBack bool    `json:"rolledBack,omitempty"`
	At         string  `json:"at"`
}

// Final reports a step that is over (done, failed or skipped).
func (i *UpdateAllItem) Final() bool {
	return i.State == "done" || i.State == "failed" || i.State == "skipped"
}

// UpdateAllNotNow is what is behind but can't be part of Update all now.
// Why: offline | app_old | source | manual.
type UpdateAllNotNow struct {
	Device     string `json:"device"`
	DeviceName string `json:"deviceName"`
	Why        string `json:"why"`
	Items      int    `json:"items"`
}

// UpdateAllPlan is the plan under way, or the last one while it's shown.
type UpdateAllPlan struct {
	ID         string          `json:"id"`
	By         string          `json:"by"`
	StartedAt  string          `json:"startedAt"`
	FinishedAt string          `json:"finishedAt,omitempty"`
	Stopped    bool            `json:"stopped,omitempty"`
	Items      []UpdateAllItem `json:"items"`
}

// UpdateAllView is the devices frame's Update all (D224).
type UpdateAllView struct {
	Offer  []UpdateAllItem   `json:"offer"`
	NotNow []UpdateAllNotNow `json:"notNow"`
	Plan   *UpdateAllPlan    `json:"plan,omitempty"`
}

// Running reports an update under way (not yet done or failed).
func (u *DeviceUpdate) Running() bool {
	return u != nil && (u.Phase == "downloading" || u.Phase == "verifying" || u.Phase == "waiting" || u.Phase == "restarting")
}

// Ability returns the device's ability by id, or nil.
func (d *DeviceView) Ability(id string) *DeviceAbility {
	for i := range d.Abilities {
		if d.Abilities[i].ID == id {
			return &d.Abilities[i]
		}
	}
	return nil
}

type ReachClient struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Platform  string `json:"platform"`
	Connected bool   `json:"connected"`
	LastSeen  string `json:"lastSeen,omitempty"`
	// Form is what kind of client it is (D155): "cli" for the command line
	// on a computer; "app", "web", "ios" or empty for an app.
	Form string `json:"form,omitempty"`
	// Computer is the computer it runs on (its host name), when it said.
	Computer string `json:"computer,omitempty"`
}

// Reach is who can reach this Ducter from elsewhere, and the address.
type Reach struct {
	Address string        `json:"address,omitempty"`
	Clients []ReachClient `json:"clients"`
}

// ClientFrame is any client -> server frame, decoded by its tag (for the
// mock server). Fields of all variants share one struct.
type ClientFrame struct {
	T          string         `json:"t"`
	Persona    string         `json:"persona,omitempty"`
	Cursor     *int64         `json:"cursor,omitempty"`
	Locale     string         `json:"locale,omitempty"`
	Text       string         `json:"text,omitempty"`
	ClientID   string         `json:"clientId,omitempty"`
	DecisionID string         `json:"decisionId,omitempty"`
	Option     string         `json:"option,omitempty"`
	TaskID     string         `json:"taskId,omitempty"`
	Action     string         `json:"action,omitempty"`
	UpToSeq    int64          `json:"upToSeq,omitempty"`
	BeforeSeq  int64          `json:"beforeSeq,omitempty"`
	Limit      int            `json:"limit,omitempty"`
	Device     string         `json:"device,omitempty"`
	Ability    string         `json:"ability,omitempty"`
	On         bool           `json:"on,omitempty"`
	Name       string         `json:"name,omitempty"` // rename_device
	ID         string         `json:"id,omitempty"`   // rule_remove
	Harness    string         `json:"harness,omitempty"`
	Model      string         `json:"model,omitempty"` // task_switch
	Patch      *SettingsPatch `json:"patch,omitempty"`
	Stop       bool           `json:"stop,omitempty"`    // update_all
	Dismiss    bool           `json:"dismiss,omitempty"` // update_all
}

// ---------- Server -> client frames ----------

// ServerFrame is any server -> client frame. Fields of all variants share
// one struct; T tells which are set.
type ServerFrame struct {
	T           string     `json:"t"` // welcome | events | on_hand | task_history | sent | error
	Persona     string     `json:"persona,omitempty"`
	PersonaName string     `json:"personaName,omitempty"`
	Machine     string     `json:"machine,omitempty"` // welcome: hash of the machine the main runs on
	HeadSeq     int64      `json:"headSeq,omitempty"`
	Events      []LogEvent `json:"events,omitempty"`
	OnHand      *OnHand    `json:"onHand,omitempty"`
	TaskID      string     `json:"taskId,omitempty"`
	Delivered   Delivery   `json:"delivered,omitempty"` // sent: how a task_send was delivered
	Message     string     `json:"message,omitempty"`
	// action_result: the outcome of a task_action (merge, open_pr, ...).
	Action string `json:"action,omitempty"`
	OK     bool   `json:"ok,omitempty"`
	Ref    string `json:"ref,omitempty"` // merge commit or PR URL
	// action_result of an undo (D142): the folder changed after the task
	// finished; these would be lost.
	Confirm *UndoConfirm `json:"confirm,omitempty"`
	// folder_changes (D142): the list behind a folder task's Changes.
	FolderChanges *FolderChanges `json:"changes,omitempty"`
	// wb (D214): a workbench answer (ID, OK, Answer) or its refusal (WbError).
	Answer  *WbAnswer `json:"answer,omitempty"`
	WbError string    `json:"error,omitempty"`
	// devices: Your devices and abilities.
	Devices []DeviceView `json:"devices,omitempty"`
	Reach   *Reach       `json:"reach,omitempty"`
	// UpdateAll (D224): 全部更新 / Update all: the offer, what can't be part
	// of it, and the plan under way. update_all_result: OK, Reason
	// (nothing | running | failed), Detail, ID (the plan).
	UpdateAll *UpdateAllView `json:"updateAll,omitempty"`
	// ability_result: Device, Ability, On, OK, Reason, Detail.
	// rename_result: Device, OK, Name, Reason (unknown_device | empty |
	// name_taken | home).
	Name    string `json:"name,omitempty"`
	Device  string `json:"device,omitempty"`
	Ability string `json:"ability,omitempty"`
	On      bool   `json:"on,omitempty"`
	Reason  string `json:"reason,omitempty"`
	Detail  string `json:"detail,omitempty"`
	// pair_code: a one-time code, its expiry, and the address, link and QR
	// (rows of "1" dark and "0" light) when a public address is set.
	Code      string   `json:"code,omitempty"`
	ExpiresAt string   `json:"expiresAt,omitempty"`
	Address   string   `json:"address,omitempty"`
	Link      string   `json:"link,omitempty"`
	QR        []string `json:"qr,omitempty"`
	// settings: the partner's settings, its memory, and how a forget went.
	Settings *Settings `json:"settings,omitempty"`
	Mem      *MemView  `json:"mem,omitempty"`
	// BrainNow is what the partner thinks with right now (D150): Brain,
	// unless core runs it on a signed-in agent instead (Why "only_codex", "only_signed_in").
	BrainNow *BrainNow `json:"brainNow,omitempty"`
	Forgot   *Forgot   `json:"forgot,omitempty"`
	// Bridge is the persona's own connection row (D205); nil: nothing to show.
	Bridge *BridgeView `json:"bridge,omitempty"`
	// rules: Your rules. candidates: who could do TaskID, best first.
	Rules      []RuleView  `json:"rules,omitempty"`
	Candidates []Candidate `json:"candidates,omitempty"`
	// connections: the user's connections and what oo is set up with;
	// connection_result: OK, ID, Reason, and Readable (D158): what the
	// added connection can read now; non-nil and empty means connected, but
	// no account there yet; nil means not known.
	Connections []ConnectionView `json:"connections,omitempty"`
	Oo          *OoDetect        `json:"oo,omitempty"`
	ID          string           `json:"id,omitempty"`
	Readable    []OoApp          `json:"readable,omitempty"`
	// connection_reads (D166): 看了哪些 for connection ID.
	Reads []ReadLine `json:"reads,omitempty"`
	// proactive_day (D226): 今天看了什么 / What it looked at today.
	Day *ProactiveDay `json:"day,omitempty"`
	// activity: what the partner is doing while the user waits (D104); nil
	// when its turn ended. Never logged.
	Activity *PartnerActivity `json:"activity,omitempty"`
	// D128 New task. task_new_options: Places and Candidates; task_new_result:
	// OK, ClientID, TaskID, Card, Reason, Message; open_task: TaskID (show it);
	// open_result: TaskID, OK, Apps.
	Places []PlaceChoice `json:"places,omitempty"`
	Models []AgentModels `json:"models,omitempty"` // D202: each agent's models, for the card
	// D204: each computer's Ducter folder (where a clone there goes) or that
	// it is too old to say (task_new_options).
	DucterFolders []DucterFolderView `json:"ducterFolders,omitempty"`
	// D204: project_clone_result: the project was already there (same origin).
	Existed  bool      `json:"existed,omitempty"`
	ClientID string    `json:"clientId,omitempty"`
	Card     *TaskCard `json:"card,omitempty"`
	Apps     int       `json:"apps,omitempty"`
	// D185: task_new_result for a start later or on a schedule: the
	// routine it made (no TaskID). D186: project_add_result: the Place
	// the card then offers.
	RoutineID string       `json:"routineId,omitempty"`
	Routine   *Routine     `json:"routine,omitempty"`
	Place     *PlaceChoice `json:"place,omitempty"`
	// folder_browse_result (D203): OK, ClientID, Device, the folder listed
	// (Path), that computer's home folder (HomeDir), the one above (Parent,
	// "" at home), its subfolders (repos first) and More when there were
	// more; or Reason (outside | not_found | offline | failed), Message.
	Path    string         `json:"path,omitempty"`
	HomeDir string         `json:"home,omitempty"`
	Parent  string         `json:"parent,omitempty"`
	Folders []BrowseFolder `json:"folders,omitempty"`
	More    bool           `json:"more,omitempty"`
	// update_result (D148): Device, OK, Reason, Detail, and with a check the
	// device's Update. disconnect_result: Device, OK, Reason.
	Update *DeviceUpdate `json:"update,omitempty"`
	// agent_update_result (D156): Device, Harness, OK, Reason, Detail.
	// mem_plugin_result (D169): Device, Harness, OK, TaskID, Reason.
	Harness string `json:"harness,omitempty"`
	// first_screen (D149): the empty conversation's words from the home.
	First *FirstScreen `json:"first,omitempty"`
	// D151 live view: live (ID, DecisionID, State open|closed, Site, URL, Title,
	// Width, Height, Reason, Message) and live_frame (ID, Seq, Data = a base64
	// JPEG, Width, Height, URL). browser_sites: Ready, Sites (and OK, Message
	// after a sign-out).
	DecisionID string `json:"decisionId,omitempty"`
	State      string `json:"state,omitempty"`
	Site       string `json:"site,omitempty"`
	URL        string `json:"url,omitempty"`
	Title      string `json:"title,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	Seq        int64  `json:"seq,omitempty"`
	Data       string `json:"data,omitempty"`
	// D217, Ducter's phone: phone_view (ID, State starting|open|closed, Mode,
	// Turn, Here, Device, TaskID, Task, DecisionID, Reason, Message),
	// phone_frame (ID, Seq, Data, Width, Height, App), phone_doing (ID,
	// Doing), phone_terms (OK, Reason, Message, Download, Disk, Packages,
	// Licenses), phone_install_result and phone_erase_result (OK, Reason, Message).
	Mode     string         `json:"mode,omitempty"`
	App      string         `json:"app,omitempty"`
	Download int64          `json:"download,omitempty"`
	Disk     int64          `json:"disk,omitempty"`
	Packages []PhonePackage `json:"packages,omitempty"`
	Licenses []PhoneLicense `json:"licenses,omitempty"`
	Ready    bool           `json:"ready,omitempty"`
	Sites    []SiteView     `json:"sites,omitempty"`
	// D154: live (open) says which browser it is.
	Browser *BrowserAbout `json:"browser,omitempty"`
	// D190: live (open) and live_turn: whose turn (agent | you) and whether
	// this window holds the user's; Task: the task whose tab a watch shows.
	// live_doing: what the task just did (nil: nothing just now).
	Turn  string     `json:"turn,omitempty"`
	Here  bool       `json:"here,omitempty"`
	Task  *LiveTask  `json:"task,omitempty"`
	Doing *LiveDoing `json:"doing,omitempty"`
	// saved (D191): the Autofill list (Items, Details, Uses, KeptIn; OK and
	// Reason after a save).
	SavedItems   []SavedView  `json:"items,omitempty"`
	SavedDetails []DetailView `json:"details,omitempty"`
	Uses         []SavedUse   `json:"uses,omitempty"`
	KeptIn       string       `json:"keptIn,omitempty"`
	// D193: connection_signin (the device sign-in); phone_voice_result uses
	// Action, OK, URL, Reason, Message.
	SignIn *SignInView `json:"signIn,omitempty"`
	// D218: the own-number card (with connections); own_phone_result: Action, Reason.
	OwnPhone *OwnPhoneView `json:"ownPhone,omitempty"`
}

// Words are the same words in both languages: the client shows its own.
type Words struct {
	ZH string `json:"zh"`
	EN string `json:"en"`
}

// FirstScreen is the empty conversation (D149), worked out on the home
// from names and metadata it already has (core/src/first-screen.ts). The
// client greets by its own clock in the partner's name and shows these.
type FirstScreen struct {
	Visit    string     `json:"visit"` // first | returning
	Line     Words      `json:"line"`
	News     *FirstNews `json:"news,omitempty"`
	Starters []Starter  `json:"starters"`
	// Today (D222): what is still on today, from the last look.
	Today *CalToday `json:"today,omitempty"`
}

// FirstNews is one timely line for a returning person: needs_you | missed
// | done. It opens TaskID, else On hand.
type FirstNews struct {
	Kind   string `json:"kind"`
	Words  Words  `json:"words"`
	TaskID string `json:"taskId,omitempty"`
}

// Starter is one thing to say; a tap fills the composer, never sends.
type Starter struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Words Words  `json:"words"`
}

// SiteView is a site signed in to in Ducter's browser (D151); Cookies 0 =
// the site signed it out.
// BrowserAbout is which browser Ducter's own browser is (D154): on which
// machine, Chrome for Testing and its version, the persona's profile.
type BrowserAbout struct {
	Device  string `json:"device"`
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
	Profile string `json:"profile"`
}

// TryLive is the decisionId of a 试一下 / Try it live view (no card).
const TryLive = "try"

// WatchLive is the decisionId of a 看它上网 / Watch it browse view (D190).
const WatchLive = "watch"

// LiveTask is the task whose tab a live view shows (D190).
type LiveTask struct {
	Title   string `json:"title"`
	Harness string `json:"harness"`
}

// LiveDoing is one step a task just took in its tab (D190); X, Y are where
// it clicked, as fractions of the page (nil: not said).
type LiveDoing struct {
	Kind  string   `json:"kind"`
	Host  string   `json:"host,omitempty"`
	App   string   `json:"app,omitempty"` // D217: the phone's step (open: which app)
	Label string   `json:"label,omitempty"`
	Key   string   `json:"key,omitempty"`
	X     *float64 `json:"x,omitempty"`
	Y     *float64 `json:"y,omitempty"`
}

// LiveTurnReq is 换我来 / My turn (Mine) or 还给它 / Hand it back (D190).
type LiveTurnReq struct {
	T    string `json:"t"` // "live_turn"
	ID   string `json:"id"`
	Mine bool   `json:"mine"`
}

// LivePauseReq stops frames while the view is out of sight (D190).
type LivePauseReq struct {
	T      string `json:"t"` // "live_pause"
	ID     string `json:"id"`
	Paused bool   `json:"paused"`
}

type SiteView struct {
	Site       string `json:"site"`
	SignedInAt string `json:"signedInAt"`
	Cookies    int    `json:"cookies"`
}

// LiveOpenReq opens the live view for a sign-in card (D151).
type LiveOpenReq struct {
	T          string  `json:"t"` // "live_open"
	DecisionID string  `json:"decisionId"`
	Width      int     `json:"width,omitempty"`
	Height     int     `json:"height,omitempty"`
	Scale      float64 `json:"scale,omitempty"`
	// Try (D154): 试一下 / Try it, a harmless page with no card (DecisionID TryLive).
	Try bool `json:"try,omitempty"`
	// D190: TaskID with DecisionID WatchLive watches that task's tab; Device is
	// whose browser Try it opens ("local" or a device id).
	TaskID string `json:"taskId,omitempty"`
	Device string `json:"device,omitempty"`
}

// LiveInput is one pointer, wheel, text, key or nav input; X, Y are fractions
// of the frame.
type LiveInput struct {
	Kind   string  `json:"kind"`           // mouse | wheel | text | key | nav | resize
	Type   string  `json:"type,omitempty"` // mouse: down | up | move
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Button string  `json:"button,omitempty"`
	Clicks int     `json:"clicks,omitempty"`
	DX     float64 `json:"dx,omitempty"`
	DY     float64 `json:"dy,omitempty"`
	Text   string  `json:"text,omitempty"`
	Key    string  `json:"key,omitempty"`
	Shift  bool    `json:"shift,omitempty"`
	Action string  `json:"action,omitempty"` // nav: back | forward | reload
	URL    string  `json:"url,omitempty"`    // go (D190): a typed web address
	Width  int     `json:"width,omitempty"`  // resize
	Height int     `json:"height,omitempty"` // resize
	Scale  float64 `json:"scale,omitempty"`  // resize
}

// LiveInputReq, LiveAckReq and LiveCloseReq drive a live view (D151).
type LiveInputReq struct {
	T     string    `json:"t"` // "live_input"
	ID    string    `json:"id"`
	Input LiveInput `json:"input"`
}

type LiveAckReq struct {
	T   string `json:"t"` // "live_ack"
	ID  string `json:"id"`
	Seq int64  `json:"seq"`
}

type LiveCloseReq struct {
	T    string `json:"t"` // "live_close"
	ID   string `json:"id"`
	Done bool   `json:"done,omitempty"`
}

// BrowserSitesReq asks for, signs out of (Site), or clears (T
// browser_sites_clear) the signed-in sites of Ducter's browser (D151).
type BrowserSitesReq struct {
	T    string `json:"t"` // browser_sites | browser_site_signout | browser_sites_clear
	Site string `json:"site,omitempty"`
}

// PartnerActivity is the step of a partner turn the user waits on (D104):
// thinking | recalling | checking_task | opening_task | messaging_task |
// planning | looking. Clients word it; tool names never reach them.
type PartnerActivity struct {
	Step      string `json:"step"`
	Since     string `json:"since"`
	StepSince string `json:"stepSince"`
}

// Delivery is how a task_send reached its task: steered in mid-turn, as
// the next turn ("prompted"), or queued behind the current turn.
type Delivery string

const (
	DeliverySteered  Delivery = "steered"
	DeliveryPrompted Delivery = "prompted"
	DeliveryQueued   Delivery = "queued"
)

// DecodeServerFrame decodes one server frame.
func DecodeServerFrame(data []byte) (ServerFrame, error) {
	var f ServerFrame
	if err := json.Unmarshal(data, &f); err != nil {
		return f, err
	}
	switch f.T {
	// Every frame the core sends (ServerFrame in packages/protocol/src/index.ts);
	// TestEveryServerFrameDecodes reads that union, so a new one can't be
	// dropped here unseen (the live view's live / live_frame were, from D151 to
	// D172: 试一下 sat at 正在打开 example.com…… forever).
	case "welcome", "events", "on_hand", "task_history", "sent", "action_result", "error",
		"devices", "ability_result", "pair_code", "rename_result", "disconnect_result", "update_result", "agent_update_result", "update_all_result", "mem_plugin_result", "settings", "connections", "connection_result", "rules", "candidates", "activity",
		"task_new_options", "task_new_result", "open_task", "open_result", "project_add_result", "project_clone_result", "folder_browse_result",
		"first_screen", "folder_changes", "close_result", "live", "live_frame", "live_turn", "live_doing", "phone_terms", "phone_install_result", "phone_erase_result", "phone_view", "phone_frame", "phone_doing", "browser_sites", "browser_check", "connection_reads", "proactive_day", "saved",
		"connection_signin", "phone_voice_result", "own_phone_result", "wb":
	default:
		return f, fmt.Errorf("unknown server frame %q", f.T)
	}
	return f, nil
}

// TaskStream is the stream name of a task.
func TaskStream(taskID string) string { return "task:" + taskID }

// ---------- New task (D128) ----------

// DiffStat is what a task changed so far: files, lines added and removed
// ("改动 · 3 个文件 +42 −7"), counted by core and cached.
type DiffStat struct {
	Files int    `json:"files"`
	Adds  int    `json:"adds"`
	Dels  int    `json:"dels"`
	At    string `json:"at"`
}

// PlaceChoice is one place the New task card offers. Kind "none" is
// 不用特定的地方 / No particular place (always last).
type PlaceChoice struct {
	Place         Place    `json:"place"`
	Name          string   `json:"name"`
	UsedAt        string   `json:"usedAt,omitempty"`
	DefaultBranch string   `json:"defaultBranch,omitempty"`
	Branches      []string `json:"branches,omitempty"`
	// Added: a project the user added by hand (D186).
	Added bool `json:"added,omitempty"`
	// Computer: the computer it is on, only when the places span more
	// than one (D197).
	Computer string `json:"computer,omitempty"`
	// Remote: a repo's origin, normalized (host/owner/repo), so its copy
	// on another computer is found (D202).
	Remote string `json:"remote,omitempty"`
	// Found: a repo that computer reported, no task there yet and not
	// added (D203); its branches come when it is asked for as the place.
	Found bool `json:"found,omitempty"`
}

// BrowseFolder is one subfolder in a folder_browse_result (D203): its
// name, its path there, and whether it is a git repo.
type BrowseFolder struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Repo bool   `json:"repo,omitempty"`
}

// FolderBrowse asks for a folder's subfolders on that computer (D203,
// 找一个文件夹… / Find a folder…): Device "" is the home's own, else a
// worker's id; Path "" is its home folder. Answered with
// folder_browse_result.
type FolderBrowse struct {
	T        string `json:"t"` // "folder_browse"
	Device   string `json:"device,omitempty"`
	Path     string `json:"path,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// ModelChoice is one model an AI agent offers on one computer, as the New
// task card lists it (D202): Suggested is Ducter's pick (推荐), Default
// what the agent runs when no model is named; Efforts its reasoning
// levels (none: no effort row), DefaultEffort its own default (默认).
type ModelChoice struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Suggested     bool     `json:"suggested,omitempty"`
	Default       bool     `json:"default,omitempty"`
	Efforts       []string `json:"efforts,omitempty"`
	DefaultEffort string   `json:"defaultEffort,omitempty"`
}

// AgentModels is one AI agent's models on one computer (Device: its id,
// only with two or more computers). From "live": the account's own list;
// "tiers": Ducter's table (the list couldn't be read).
type AgentModels struct {
	Harness string        `json:"harness"`
	Device  string        `json:"device,omitempty"`
	Models  []ModelChoice `json:"models"`
	From    string        `json:"from"`
}

// NewTaskWhen is when a task the user opens by hand starts (D185): "now"
// (or nil), "at" (Date, Time), "every" (Every, Days, Hours, Time),
// "when" and "until" (Condition). Times are wall clock in TZ.
type NewTaskWhen struct {
	Kind      string `json:"kind"`
	Date      string `json:"date,omitempty"`
	Time      string `json:"time,omitempty"`
	TZ        string `json:"tz,omitempty"`
	Every     string `json:"every,omitempty"` // day | weekday | week | hours
	Days      []int  `json:"days,omitempty"`
	Hours     int    `json:"hours,omitempty"`
	Condition string `json:"condition,omitempty"`
}

// DucterFolderView is a computer's Ducter folder as the New task card
// says it (D204): Device "local" (the home) or a worker's id; Path the
// real folder (~/ducter, or the fallback); Old: that worker's Ducter is
// too old to list, look through or clone there.
type DucterFolderView struct {
	Device string `json:"device"`
	Path   string `json:"path,omitempty"`
	Old    bool   `json:"old,omitempty"`
}

// ProjectClone clones a Git address on that computer into its Ducter
// folder and adds it as a project (D204, 从 Git 地址加…): Device "" is
// the home's own. Answered with project_clone_result.
type ProjectClone struct {
	T        string `json:"t"` // "project_clone"
	Address  string `json:"address"`
	Device   string `json:"device,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// ProjectAdd adds a folder on the home's computer as a project (D186);
// answered with project_add_result. Device (D197): the folder is on that
// worker (this Mac's, when the home is elsewhere) and is read there.
type ProjectAdd struct {
	T        string `json:"t"` // "project_add"
	Path     string `json:"path"`
	Device   string `json:"device,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// ProjectView is a project the user added (D186).
type ProjectView struct {
	Name    string `json:"name"`
	Place   Place  `json:"place"`
	AddedAt string `json:"addedAt"`
}

// TaskNewOptions asks what the New task card offers at Place (nil: this
// machine); answered with a task_new_options frame.
type TaskNewOptions struct {
	T     string `json:"t"` // "task_new_options"
	Place *Place `json:"place,omitempty"`
}

// TaskNew opens a task with the user's words as they are (no rewrite).
// Harness/Model only when the user picked someone other than the top
// candidate. Answered with task_new_result.
type TaskNew struct {
	T       string `json:"t"` // "task_new"
	Words   string `json:"words"`
	Place   *Place `json:"place,omitempty"`
	Harness string `json:"harness,omitempty"`
	Model   string `json:"model,omitempty"`
	// Effort (D202): one of the model's own levels, only when it isn't the
	// model's default; one it doesn't list is dropped, never sent.
	Effort   string       `json:"effort,omitempty"`
	ClientID string       `json:"clientId,omitempty"`
	When     *NewTaskWhen `json:"when,omitempty"`
	Media    []string     `json:"media,omitempty"` // D206: pictures dropped on the What row
}

// OpenTask asks the apps to show a task (`ducter open <task>`).
type OpenTask struct {
	T      string `json:"t"` // "open_task"
	TaskID string `json:"taskId"`
}
