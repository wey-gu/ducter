// Package protocol mirrors packages/protocol/src/index.ts, the wire contract
// shared by core, runner, partner and clients. Field names and JSON tags are
// identical to the TypeScript types; JSON is the wire format. Change the TS
// file first (through the lead), then this one.
package protocol

import (
	"encoding/json"
	"fmt"
	"strings"
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
	// Handset (D238): the ask for the person's own phone (D339: it also
	// tells the task's head which phone the task works on).
	Handset *HandsetAsk `json:"handset,omitempty"`
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
	KindDecisionLater    = "decision_later"
	KindDecisionBack     = "decision_back"
	KindDecisionSeen     = "decision_seen"
	KindReadReceipt      = "read_receipt"
	KindTaskOpen         = "task_open"
	KindTaskState        = "task_state"
	KindTaskEvent        = "task_event"
	KindReport           = "report"
	KindCheckpoint       = "checkpoint"
	KindWaiter           = "waiter"
	KindWaiterLook       = "waiter_look"
	KindMemoryNoted      = "memory_noted"
	KindMemoryRecalled   = "memory_recalled"
	KindBridgeMsg        = "bridge_msg"
)

type UserMsg struct {
	Text     string `json:"text"`
	ClientID string `json:"clientId,omitempty"`
	// Media (D206): the pictures the user sent with it (Text may be empty then).
	Media []MediaRef `json:"media,omitempty"`
	// Reply (D236): the one message this answers, with its quote (core's).
	Reply *ReplyRef `json:"reply,omitempty"`
	// Via (D276/D277): the chat app the person wrote it in (slack |
	// telegram | imessage); "" = a Ducter app or the CLI.
	Via string `json:"via,omitempty"`
	// App (D405): about one of the person's apps, or that app's own ask.
	App *AppRef `json:"app,omitempty"`
}

type AIMsg struct {
	Text string `json:"text"`
	// Pings (D418): the own agent's contact tests this line tells about; it
	// stands in for their folded quiet line.
	Pings   []string `json:"pings,omitempty"`
	ReplyTo int64    `json:"replyTo,omitempty"`
	// DecisionID: a task's question in the partner's own words (D129); it
	// shows as that decision's question, not as a message of its own.
	DecisionID string `json:"decisionId,omitempty"`
	// Media (D206): what a task showed, relayed with the partner's words about it.
	Media []MediaRef `json:"media,omitempty"`
	// Cal (D222): the day glance the partner put under these words.
	Cal *CalGlance `json:"cal,omitempty"`
	// First (D298): the partner's first words, with what they offer.
	First *FirstWords `json:"first,omitempty"`
	// UI (D303): the blocks the partner put in its words, each standing in
	// for its plain text in Text.
	UI []RichUI `json:"ui,omitempty"`
	// App (D405): the app this message made or changed; AppAnswer: it answers an app's ask.
	App       *AppCard   `json:"app,omitempty"`
	AppAnswer *AppAnswer `json:"appAnswer,omitempty"`
	// Shelf (D410): the person asked where their apps are: a card that
	// opens 小应用 / Apps goes under these words.
	Shelf bool `json:"shelf,omitempty"`
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
	// Back (D382): a question back from 晚点再问我 / Ask me later (when it
	// came back): said once above it.
	Back string `json:"back,omitempty"`
}

type Decision struct {
	DecisionID    string `json:"decisionId"`
	TaskID        string `json:"taskId,omitempty"` // "" = a partner-level decision
	Question      string `json:"question"`
	GoLabel       string `json:"goLabel"`
	DefaultOption string `json:"defaultOption"` // go | hold
	DefaultAt     string `json:"defaultAt,omitempty"`
	Reversible    bool   `json:"reversible"`
	// Later and BackAt (D382) come on a task card's pendingDecision: put
	// off until Later (晚点再问我 / Ask me later), or back since BackAt.
	Later  string `json:"later,omitempty"`
	BackAt string `json:"backAt,omitempty"`
	// RoutineID marks a routine's proposal or review card (D114): Go
	// activates or keeps it.
	RoutineID string `json:"routineId,omitempty"`
	// SignIn marks a sign-in card (D151): Go is 好了 / Done in the live view of
	// Ducter's browser.
	SignIn *SignInAsk `json:"signIn,omitempty"`
	// Pay (D191): 付款 / Pay: merchant, amount, card; Go carries the code.
	Pay *PayAsk `json:"pay,omitempty"`
	// Checkout (D436): 去付款 / Go to checkout: the errand stopped at the
	// checkout; Go is 付好了 / I've paid (the person paid in the live view).
	Checkout *CheckoutAsk `json:"checkout,omitempty"`
	// Fill (D191): a saved sign-in or detail used on a site for the first time.
	Fill *FillAsk `json:"fill,omitempty"`
	// Key (D233): a task asks the person for a key; Go carries it (Hold is
	// 不给 / Don't give).
	Key *KeyAsk `json:"key,omitempty"`
	// Phone (D217): a tap on Ducter's phone that commits (Go taps it once),
	// or the user's own turn on the phone (Go = 好了 / Done).
	Phone *PhoneAsk `json:"phone,omitempty"`
	// Computer (D235): one action in the person's apps that commits (Go
	// does it once), or their own turn in an app (Go = 好了 / Done).
	Computer *ComputerAsk `json:"computer,omitempty"`
	// Handset (D238): may this task borrow the person's own phone now (Go
	// lends it; no default).
	Handset *HandsetAsk `json:"handset,omitempty"`
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
	// Offer (D453): an offer, not an ask: never needs-you, never on On hand,
	// the mini window or the menu bar; no Hold; it fades on its own.
	Offer bool `json:"offer,omitempty"`
	// Draft (D403): the find's reply is already written; away from its card
	// (On hand) show its first line and 看草稿, which opens the card; never Send.
	Draft *DecisionDraft `json:"draft,omitempty"`
	// Asker (D170): asked for one of the user's own agents through Bridge;
	// the answer goes back to it by Ducter's code.
	Asker *PeerAsk `json:"asker,omitempty"`
	// Trust (D170, X2): the offer to take an own agent's work without
	// asking; Go keeps the rule.
	Trust *TrustAsk `json:"trust,omitempty"`
	// Saying (D379): who does which work, said and never saved, just decided
	// a task; Go keeps it as a rule, Hold (只这次, the default) keeps nothing.
	Saying *SayingAsk `json:"saying,omitempty"`
	// Sender (D334): a teammate's agent wrote for the first time; Go
	// (答应) lets it through as questions, Hold (不理, the default) mutes it.
	Sender *SenderAsk `json:"sender,omitempty"`
	// HoldLabel (D334): Hold's own words when the card's code names them.
	HoldLabel string `json:"holdLabel,omitempty"`
	// Call (D189/D193): a phone call's Go card, or a question from the line.
	Call *CallAsk `json:"call,omitempty"`
	// Cal (D222): a calendar change (add, move, cancel, answer); its
	// outcome is the connection_call with this decision id.
	Cal *CalChange `json:"cal,omitempty"`
	// Src (D341): a card about a to-do bound to a task: a write-back to
	// its app, that it was closed there, or the standing go offered.
	Src *SourceAsk `json:"src,omitempty"`
	// Board (D407): 要不要把这些做成一个看板？ the offer to keep a repeating
	// task's rounds on a small app.
	Board *BoardAsk `json:"board,omitempty"`
	// Loop (D427): the keeper's one word about a late or failing task in
	// rounds; Move (D429): Go runs it on that awake computer instead.
	Loop *LoopAsk `json:"loop,omitempty"`
	// Look (D437): what another AI still found in what this Go sends.
	Look *DecisionLook `json:"look,omitempty"`
}

// LoopAsk is the task a loop card is about, and the computer its Go moves it to.
type LoopAsk struct {
	TaskID string `json:"taskId"`
	Move   string `json:"move,omitempty"`
}

// TrustAsk names the agent a standing-go offer is about.
type TrustAsk struct {
	Agent string `json:"agent"`
}

// SayingAsk is the person's own words about who does which work (D379).
type SayingAsk struct {
	Harness string   `json:"harness"`
	Never   bool     `json:"never,omitempty"`
	Kinds   []string `json:"kinds,omitempty"`
	Quote   string   `json:"quote"`
}

// SenderAsk is a teammate's agent's first message (D334): who sent it, as
// Ducter names it, the Space it came in, and the message.
type SenderAsk struct {
	From      string `json:"from"`
	Space     string `json:"space,omitempty"`
	MessageID string `json:"messageId"`
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
	// Step (D436): not a sign-in but another step that is the person's on
	// the page (a CAPTCHA, a code by text), in the task's words.
	Step string `json:"step,omitempty"`
}

// DecisionLater (D382): 晚点再问我 / Ask me later: the question is put off
// until Until; it stays open but out of Needs you, its countdown stopped.
type DecisionLater struct {
	DecisionID string `json:"decisionId"`
	Until      string `json:"until"`
	By         string `json:"by"`
}

// DecisionBack (D382): back in Needs you, at its time (By "time") or by
// 现在就定 / Decide now ("user"). DefaultAt comes only with Decide now: back
// at its time, no default runs until it is seen (DecisionSeen).
type DecisionBack struct {
	DecisionID string `json:"decisionId"`
	By         string `json:"by"`
	DefaultAt  string `json:"defaultAt,omitempty"`
}

// DecisionSeen (D382): back at its time and first seen on some client: its
// countdown runs from now, the length it was first given.
type DecisionSeen struct {
	DecisionID string `json:"decisionId"`
	DefaultAt  string `json:"defaultAt"`
}

type DecisionResolved struct {
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go | hold | reply
	Text       string `json:"text,omitempty"`
	By         string `json:"by"`            // user | default
	Now        bool   `json:"now,omitempty"` // D208: a call's Go given as Call now
	// MsgSeq (D236): the reply message that answered it (its words show as
	// that bubble, not on the card).
	MsgSeq int64 `json:"msgSeq,omitempty"`
	// Settled (D375): closed by what happened, not by an answer (D169's
	// offer once Mem's check sees the plugin in): it reads as done.
	Settled bool `json:"settled,omitempty"`
	// Posted (D413): settled because its drafts went under a standing permission.
	Posted bool `json:"posted,omitempty"`
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
	Language   string `json:"language,omitempty"` // D292: a BCP 47 tag ("ko", "zh-Hant"; old "zh" / "en" are tags too), the language the user reads its reports in
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
	// Cant (D395): why it couldn't start where it was to work.
	Cant *CantStart `json:"cant,omitempty"`
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
	// D135, D288: the context reading, the window it fills, where it compacts, this turn alone.
	ContextTokens int64       `json:"contextTokens,omitempty"`
	ContextWindow int64       `json:"contextWindow,omitempty"`
	CompactAt     int64       `json:"compactAt,omitempty"`
	Turn          *TurnTokens `json:"turn,omitempty"`
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
	// Wakes is "task" when a timer wakes its task (D267), not the partner.
	Wakes string `json:"wakes,omitempty"`
	// Limit (D297): the task's agent hit its usage limit; the task rests
	// until At (the reset, plus a minute's grace, or the next try).
	Limit *LimitWait `json:"limit,omitempty"`
	// LimitAuto (D297, from the On hand snapshot): the person chose to hand
	// a task to another agent right away when a limit runs out.
	LimitAuto bool   `json:"limitAuto,omitempty"`
	EveryMs   int64  `json:"everyMs,omitempty"`
	Until     string `json:"until,omitempty"`
	Observed  string `json:"observed,omitempty"`
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

// LimitWait is a wait on an AI agent's usage limit (D297): whose limit,
// whether At is the reset it named, another signed-in agent that could take
// the task now, and how many times in a row it met the limit.
type LimitWait struct {
	Harness    string  `json:"harness"`
	ResetKnown bool    `json:"resetKnown"`
	HandTo     *HandTo `json:"handTo,omitempty"`
	Tell       bool    `json:"tell,omitempty"`
	Tries      int     `json:"tries,omitempty"`
}

// HandTo is who a limit wait's task could go to now (D297).
type HandTo struct {
	Harness string `json:"harness"`
	Model   string `json:"model,omitempty"`
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
	// D245: kept from running by an account error; it tries again by itself.
	Backoff *RoutineBackoff `json:"backoff,omitempty"`
}

// RoutineBackoff is a routine spaced out by account errors (D245).
type RoutineBackoff struct {
	Trouble   string `json:"trouble"` // signin | quota
	NextTryAt string `json:"nextTryAt"`
	Failures  int    `json:"failures"`
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
	Judge     string     `json:"judge,omitempty"`
	// D245: a "when something changes" watch; only its presence matters here.
	Watch map[string]any `json:"watch,omitempty"`
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
	LateMin      int    `json:"lateMin,omitempty"` // D245: started this late (>= 15 min)
	RetryAt      string `json:"retryAt,omitempty"` // D245: a failed run tried again then
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
	// D329: Replaced is the partner's own earlier memory this one took the
	// place of; Waiting the outbox key while Mem was down.
	Replaced *NotedReplaced `json:"replaced,omitempty"`
	Waiting  string         `json:"waiting,omitempty"`
}

// NotedReplaced is the memory a save superseded (D329).
type NotedReplaced struct {
	ID    string `json:"id,omitempty"`
	Title string `json:"title"`
}

// MemoryUndo is 撤销 / Undo on a fresh Noted line (D329), by its seq.
type MemoryUndo struct {
	T   string `json:"t"` // "memory_undo"
	Seq int64  `json:"seq"`
}

// MemoryRecalled is the one memory a reply leaned on (D304): a quiet source
// line under the message AboutSeq. By: "said" (the person told the partner),
// "tool" (another AI tool saved it; From is its name), "you" (they saved it).
type MemoryRecalled struct {
	MemoryID string `json:"memoryId"`
	Title    string `json:"title"`
	By       string `json:"by"`
	From     string `json:"from,omitempty"`
	Date     string `json:"date,omitempty"`
	AboutSeq int64  `json:"aboutSeq"`
	ReplyTo  int64  `json:"replyTo,omitempty"`
	// Thread (D433): a past conversation with another AI tool (From), not a memory.
	Thread bool `json:"thread,omitempty"`
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
	// Look (D437): set by Ducter: another AI read this result once before
	// it went out; Left is what is still so (said on the card).
	Look *FreshLook `json:"look,omitempty"`
	// Doc (D439): set by Ducter: the document it shows was checked page by
	// page; Left is what is still so (said under the result).
	Doc *DocCheck `json:"doc,omitempty"`
}

// DocCheck (D439) is what Ducter's page check found in a document to send:
// Left is what is still so after the task's fix, in the person's language.
type DocCheck struct {
	Pages int      `json:"pages,omitempty"`
	Left  []string `json:"left"`
}

// FreshLook (D437) is what another AI found when it looked a result
// over: Found the first time, Left after the task's fix.
type FreshLook struct {
	By    string   `json:"by"`
	Model string   `json:"model,omitempty"`
	Found []string `json:"found"`
	Left  []string `json:"left"`
}

// DecisionLook (D437) is what another AI still found in what a Go sends.
type DecisionLook struct {
	By   string   `json:"by"`
	Left []string `json:"left"`
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
	// typed is a task_event's body decoded once (D284: a task's transcript
	// is made again as older pages land; decoding each event every time
	// was a fifth of it). Read-only once kept.
	typed any
}

// KeepTyped keeps a task_event's decoded body with the event, for Typed.
func (e *LogEvent) KeepTyped(v any) {
	if e.Kind == KindTaskEvent {
		e.typed = v
	}
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
	if e.typed != nil {
		return e.typed, nil
	}
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
	case KindDecisionLater:
		v = &DecisionLater{}
	case KindDecisionBack:
		v = &DecisionBack{}
	case KindDecisionSeen:
		v = &DecisionSeen{}
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
	case KindMemoryRecalled:
		v = &MemoryRecalled{}
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
	case KindTodoSet:
		v = &TodoSet{}
	case KindAsks:
		v = &Asks{}
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
	Host       string `json:"host,omitempty"` // the tool it runs in ("Claude Code"), when it has no name of its own
	Mine       bool   `json:"mine,omitempty"`
	State      string `json:"state,omitempty"` // out: pending|held|sending|sent|failed|unknown|unconfirmed|followed; in: early|set_aside|muted; empty = sent / to read
	OpID       string `json:"opId,omitempty"`
	Contact    string `json:"contact,omitempty"`
	Operation  string `json:"operation,omitempty"`
	// D418: one of the person's own agents named by its own words ("我是 Wey 的
	// Mem 协作 Codex"): Agent is its tool, Role the rest (你的 Codex（Mem 协作）).
	SelfNamed bool   `json:"selfNamed,omitempty"`
	Role      string `json:"role,omitempty"`
	// D418: the first message any agent sent this persona (the one-time note).
	First bool `json:"first,omitempty"`
	// D418: an own agent's contact test answered by code (in: State "ping";
	// out: Ack), folded into one quiet line.
	Ack bool `json:"ack,omitempty"`
	// D444, in: what it hands over from Nowledge Mem, read once when it came.
	Refs []BridgeRef `json:"refs,omitempty"`
	// D448, out: By "task" = the task TaskID wrote it and Ducter carried it (Head:
	// the line naming the task that went before Text); in: State "task" = an
	// answer to it, delivered into that task.
	By   string `json:"by,omitempty"`
	Head string `json:"head,omitempty"`
}

// BridgeRef is one thing a message handed over from Nowledge Mem (D444):
// Mem's title for it, its kind (memory, artifact, thread, plan, other), and
// Read false when Mem didn't open it. Its words are for the partner only.
type BridgeRef struct {
	URI   string `json:"uri,omitempty"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
	Read  *bool  `json:"read,omitempty"`
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
	Latest     *LogEvent    `json:"latest,omitempty"`
	Integrated *Integrated  `json:"integrated,omitempty"`
	Phoning    *Browsing    `json:"phoning,omitempty"`   // D217: is using Ducter's phone there
	Computing  *Computing   `json:"computing,omitempty"` // D235: is using the person's apps there
	Handset    *HandsetCard `json:"handset,omitempty"`   // D238: is using the person's own phone (device id, app id); D331: paused, or a Go waiting
	// D285: the person's marks (their name is already Title; Original keeps
	// the task's own), and the task it was seeded from.
	Mark     *PastMark `json:"mark,omitempty"`
	Original string    `json:"original,omitempty"`
	From     *PastFrom `json:"from,omitempty"`
	// Held (D325) is what the person held for after this turn, in order.
	Held []HeldMsg `json:"held,omitempty"`
	// Source (D341): the outside to-do it is bound to, how it stands there
	// and what Ducter wrote there.
	Source *TaskSource `json:"source,omitempty"`
	// Cant (D395): it couldn't start where it was to work: why, and what
	// fixes it. Absent once it starts.
	Cant *CantStart `json:"cant,omitempty"`
	// Mending (D473, D471): Ducter is mending it right now; On hand stands
	// it at work, never as a failure.
	Mending *Mending `json:"mending,omitempty"`
}

// Mending is a repair under way: its class, what it does and where.
type Mending struct {
	Cls  string `json:"cls"`
	How  string `json:"how,omitempty"`
	Name string `json:"name,omitempty"`
}

// CantStart (D395) is why a task couldn't start where it was to work (Why:
// no_repo, no_folder, clone_failed), on which computer, what (the repository's
// or folder's name), and the fixes core found: another computer's copy
// (Elsewhere) and whether it can be cloned where it was (CloneHere).
type CantStart struct {
	Why       string         `json:"why"`
	Computer  string         `json:"computer"`
	What      string         `json:"what"`
	Path      string         `json:"path,omitempty"`
	Elsewhere *CantElsewhere `json:"elsewhere,omitempty"`
	CloneHere bool           `json:"cloneHere,omitempty"`
	// D415: busy: the lock git left can be cleared (清掉旧的再试).
	ClearLock bool `json:"clearLock,omitempty"`
	// D415: agent: the agent's own words for why, one line.
	Detail string `json:"detail,omitempty"`
	// D472: that computer's device id ("local" the home's), the task's agent,
	// whether a folder already on that computer can be chosen there
	// (选 X 上的文件夹), and for "other" what the start said (看看为什么).
	Device   string `json:"device,omitempty"`
	Harness  string `json:"harness,omitempty"`
	PickHere bool   `json:"pickHere,omitempty"`
	More     string `json:"more,omitempty"`
}

// CantElsewhere is another computer that has the task's repository.
type CantElsewhere struct {
	Device string `json:"device"`
	Name   string `json:"name"`
}

// HeldMsg is one message the person held for after this turn (D325): ID is
// the client id it was sent with.
type HeldMsg struct {
	ID    string     `json:"id"`
	Text  string     `json:"text"`
	At    string     `json:"at"`
	Media []MediaRef `json:"media,omitempty"`
}

// TaskHeld (D325) changes one held message (op "edit" with Text), takes it
// back ("drop"), or says it now ("now": steered in while it works, else the
// next turn). The card's next on_hand answers it.
type TaskHeld struct {
	T      string `json:"t"` // "task_held"
	TaskID string `json:"taskId"`
	ID     string `json:"id"`
	Op     string `json:"op"`
	Text   string `json:"text,omitempty"`
}

// NoSteer lists the agents that can't take words in the middle of a turn
// (D325; packages/protocol/src/harnesses.ts `steer`). By OAR 0.95.1 Claude
// Code, Codex, pi and DeepSeek Harness all can, so it is empty today.
var NoSteer = map[string]bool{}

// HarnessSteers says whether an agent takes a steer; one that can't has
// what is sent while it works held for after its turn instead.
func HarnessSteers(h string) bool { return !NoSteer[h] }

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
	// Asks (D312): with more than one partner, every partner's own open
	// questions; a window lists the other partners' in On hand.
	Asks []PartnerAsk `json:"asks,omitempty"`
	// Groups (D360): tasks that are one piece of work, with the parts
	// still held in line.
	Groups []TaskGroup `json:"groups,omitempty"`
	// Away (D454) are the tasks the person removed from On hand (移走):
	// a window that also builds its board from the stream leaves them out.
	Away []string `json:"away,omitempty"`
}

// TaskGroup (D360) is several tasks that are one piece of work: one card on
// On hand; parts in one folder run one after another (the later ones held
// by the home until the one before is done).
type TaskGroup struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Order     string        `json:"order"` // "one_by_one" | "side_by_side"
	By        string        `json:"by"`
	Persona   string        `json:"persona"`
	Members   []GroupMember `json:"members"`
	Stopped   *GroupStopped `json:"stopped,omitempty"`
	CreatedAt string        `json:"createdAt"`
	// Hand (D385): made by a hand-over of to-dos: its note, shape, plan and review.
	Hand *GroupHandView `json:"hand,omitempty"`
}

// GroupMember is a task (TaskID) or a part held in line (Key, Title).
type GroupMember struct {
	TaskID string `json:"taskId,omitempty"`
	Key    string `json:"key,omitempty"`
	Title  string `json:"title,omitempty"`
	At     string `json:"at,omitempty"`
	Device string `json:"device,omitempty"`
}

// GroupStopped: a part ended without being done; what is held after it
// waits for the person.
type GroupStopped struct {
	TaskID string `json:"taskId"`
	Why    string `json:"why"` // "failed" | "dropped"
}

// TaskGroupFrame makes, renames, reorders or takes apart a group, or moves
// a stopped line on (D360).
// OnHandAway (D454) is 移走 / Remove: a finished card's tasks, or a finished
// group, taken off On hand on every device; Back puts them back (撤销).
type OnHandAway struct {
	T       string   `json:"t"` // "onhand_away"
	TaskIDs []string `json:"taskIds,omitempty"`
	GroupID string   `json:"groupId,omitempty"`
	Back    bool     `json:"back,omitempty"`
}

type TaskGroupFrame struct {
	T       string   `json:"t"` // "task_group"
	Op      string   `json:"op"`
	GroupID string   `json:"groupId,omitempty"`
	Name    string   `json:"name,omitempty"`
	TaskIDs []string `json:"taskIds,omitempty"`
	Member  string   `json:"member,omitempty"`
	To      *int     `json:"to,omitempty"`
	Order   string   `json:"order,omitempty"`
}

// PartnerAsk (D312) is one partner's own open question, as On hand lists it.
type PartnerAsk struct {
	Persona    string `json:"persona"`
	DecisionID string `json:"decisionId"`
	Question   string `json:"question"`
	At         string `json:"at"`
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
	// Gzip (D284): this client reads a frame over 16 KB sent as one binary
	// message, its JSON gzipped (a task's history over a slow link).
	Gzip bool `json:"gzip,omitempty"`
}

type Send struct {
	T        string `json:"t"` // "send"
	Text     string `json:"text"`
	ClientID string `json:"clientId"`
	// Media (D206): ids from POST /api/media; Text may be empty then.
	Media []string `json:"media,omitempty"`
	// Reply (D236): the one message this answers; core fills the quote.
	Reply *ReplyWant `json:"reply,omitempty"`
	// App (D405): the words were typed in that app's own window (its id).
	App string `json:"app,omitempty"`
	// Via (D277): "imessage" when the Mac app's iMessage bridge relays it.
	Via string `json:"via,omitempty"`
}

// ChannelStatus (D277) is how the Mac app's iMessage bridge stands: on |
// needs_permission | not_signed_in | off | error. While one says on and the
// person last wrote from iMessage, the home's push stays quiet.
type ChannelStatus struct {
	T       string `json:"t"`       // "channel_status"
	Channel string `json:"channel"` // "imessage"
	State   string `json:"state"`
	// Computer is this Mac's name (D323), so the home can tell the
	// person's other devices which Mac carries iMessage.
	Computer string `json:"computer,omitempty"`
}

// IMessageCarrier is a Mac carrying iMessage for the home (D323), on the
// channels frame: its computer name, how its bridge stands, and Here when
// it is this app's own.
type IMessageCarrier struct {
	Computer string `json:"computer"`
	State    string `json:"state"`
	Here     bool   `json:"here,omitempty"`
}

type Decide struct {
	T          string `json:"t"` // "decide"
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go | hold | reply
	Text       string `json:"text,omitempty"`
}

// Later (D382) puts a question off to Until (RFC 3339); a nil Until brings
// it back now (现在就定 / Decide now).
type Later struct {
	T          string  `json:"t"` // "later"
	DecisionID string  `json:"decisionId"`
	Until      *string `json:"until"`
}

type TaskSend struct {
	T      string `json:"t"` // "task_send"
	TaskID string `json:"taskId"`
	Text   string `json:"text"`
	// ClientID makes a resend safe: the server delivers it once.
	ClientID string   `json:"clientId,omitempty"`
	Media    []string `json:"media,omitempty"` // D206
	// Mode (D268): "steer" (sent while it works, read at its next step) or
	// "queue" (after this turn); empty for the runner's own choice.
	Mode string `json:"mode,omitempty"`
}

type TaskAction struct {
	T      string `json:"t"` // "task_action"
	TaskID string `json:"taskId"`
	Action string `json:"action"` // interrupt | drop | undrop | reopen | merge | open_pr | undo | keep | start_at | clone_here (D395) | clear_lock (D415) | start_in (D472)
	// undo (D142): Path puts back only that entry; Force undoes even though
	// the folder changed after the task finished.
	Path  string `json:"path,omitempty"`
	Force bool   `json:"force,omitempty"`
	// Device (D395, start_at): the computer whose copy a task that couldn't
	// start starts on.
	Device string `json:"device,omitempty"`
	// Place (D472, start_in): the folder the person chose for a task that
	// couldn't start (D455's sheet).
	Place *Place `json:"place,omitempty"`
}

type Read struct {
	T       string `json:"t"` // "read"
	UpToSeq int64  `json:"upToSeq"`
}

type TaskHistoryReq struct {
	T         string `json:"t"` // "task_history"
	TaskID    string `json:"taskId"`
	BeforeSeq int64  `json:"beforeSeq,omitempty"`
	// AfterSeq (D320): the page after a far stretch the client holds.
	AfterSeq *int64 `json:"afterSeq,omitempty"`
	Limit    int    `json:"limit,omitempty"`
}

// TaskIndexReq asks for a task's session index (D320): all of it, or its
// turns from FromSeq on (the first seq of the last turn the client holds).
type TaskIndexReq struct {
	T       string `json:"t"` // "task_index"
	TaskID  string `json:"taskId"`
	FromSeq int64  `json:"fromSeq,omitempty"`
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
	// Named: a tunnel the person made in Cloudflare's dashboard, for
	// 从外面连 (D228).
	Named *NamedTunnel `json:"named,omitempty"`
}

// NamedTunnel is a Cloudflare tunnel of the person's own: its token and the
// hostname it serves (D228).
type NamedTunnel struct {
	Token    string `json:"token"`
	Hostname string `json:"hostname"`
}

// AnywhereSetupReq is 从外面连's guided setup (D228): Op "begin" opens
// the task (让 Ducter 帮我设好), "cancel" stops setting up.
type AnywhereSetupReq struct {
	T  string `json:"t"` // "anywhere_setup"
	Op string `json:"op"`
}

// PairCodeReq asks for a one-time pairing code (远程打开 / Reach from
// anywhere, D54); the server answers a pair_code frame.
type PairCodeReq struct {
	T string `json:"t"` // "pair_code"
}

// LendCodeReq asks for 加一台做事的电脑 / Add a computer for tasks's code and line
// (D347); the server answers a lend frame (waiting), then lend frames to
// every client as the computer joins and arrives.
type LendCodeReq struct {
	T string `json:"t"` // "lend_code"
}

// RenameDeviceReq is 改名字 / Rename for a paired device (another
// computer; D84). The server answers rename_result, then a fresh devices
// frame. The machine Ducter runs on keeps its own name.
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

// NotesSeenReq says the person opened a version's full notes from an
// update card (D344): the partner's line about that update stays unsaid
// that day. No answer.
type NotesSeenReq struct {
	T       string `json:"t"` // "notes_seen"
	Version string `json:"version"`
	TZ      string `json:"tz,omitempty"`
}

// ChangelogURL is a release's full notes on the website, one anchor per
// version (D344; packages/protocol/src/version.ts changelogUrl).
func ChangelogURL(v string) string {
	return "https://ducter.ai/changelog#" + strings.TrimPrefix(strings.TrimSpace(v), "v")
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
	// D362: 停止 on one slow AI agent step (its key); the rest goes on.
	StopItem string `json:"stopItem,omitempty"`
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
// Mem's own `nmem connect --tool` there where Mem has one for that agent and
// its plugin is absent (D375), else one task on that device follows Mem's
// own setup guide. Answered with mem_plugin_result (OK, TaskID, Reason).
type MemPluginInstall struct {
	T       string `json:"t"` // "mem_plugin_install"
	Device  string `json:"device"`
	Harness string `json:"harness"`
	// D470: "mailbox" = 打开它的信箱 / Open its mailbox (one task there through the agent's own Mem plugin).
	What string `json:"what,omitempty"`
	// D480: Space, with What "mailbox": the Nowledge Mem Space the person chose in place (its exact id and label).
	Space *MailboxSpaceRef `json:"space,omitempty"`
}

// MailboxSpaceRef is the Space a mailbox opens in, as the person chose it (D480).
type MailboxSpaceRef struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// MailboxLookReq is mailbox_look (D480): look at that computer's Mem for this agent's mailbox (read only).
type MailboxLookReq struct {
	T       string `json:"t"` // "mailbox_look"
	Device  string `json:"device"`
	Harness string `json:"harness"`
}

// MailboxLook is what the in-place choice shows for one agent's mailbox (D480, packages/protocol/src/mailbox.ts):
// choose (Spaces, Recommend), apart (Theirs and Ours, Mem servers' hosts), no_mem, away, old, failed.
type MailboxLook struct {
	State     string         `json:"state"`
	Spaces    []MailboxSpace `json:"spaces,omitempty"`
	Recommend string         `json:"recommend,omitempty"`
	Theirs    string         `json:"theirs,omitempty"`
	Ours      string         `json:"ours,omitempty"`
	Detail    string         `json:"detail,omitempty"`
}

// MailboxSpace is one Nowledge Mem Space a mailbox can open in (D480).
type MailboxSpace struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Kind    string `json:"kind"`
	Readers int    `json:"readers,omitempty"`
	Partner bool   `json:"partner,omitempty"`
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

// PartnerInfo is one partner (D309, packages/protocol/src/partners.ts):
// Look is a token ("sand", "sage", "sky", "plum", "apricot"), never a
// colour; Asks its own conversation's open questions.
type PartnerInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Look string `json:"look"`
	Asks int    `json:"asks"`
}

// PartnerLooks are the looks, in the order the pickers show them.
var PartnerLooks = []string{"sand", "sage", "sky", "plum", "apricot"}

// DefaultPartner is the partner every home starts with.
const DefaultPartner = "default"

// PartnersAsk asks for the partners frame (D309).
type PartnersAsk struct {
	T string `json:"t"` // "partners"
}

// PartnerAdd makes a partner (D309): a name and a look.
type PartnerAdd struct {
	T        string `json:"t"` // "partner_add"
	Name     string `json:"name"`
	Look     string `json:"look,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// PartnerSet renames a partner or changes its look (D309).
type PartnerSet struct {
	T        string `json:"t"` // "partner_set"
	ID       string `json:"id"`
	Name     string `json:"name,omitempty"`
	Look     string `json:"look,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// NeedsAcross is the one needs-you count across partners (D309): what this
// window counts already plus every other partner's own open questions.
func NeedsAcross(here int, partners []PartnerInfo, shown string) int {
	for _, p := range partners {
		if p.ID != shown {
			here += p.Asks
		}
	}
	return here
}

// SettingsSet changes some settings; the server answers with a fresh
// settings frame (to every subscriber).
type SettingsSet struct {
	T     string        `json:"t"` // "settings_set"
	Patch SettingsPatch `json:"patch"`
}

// MemoryConfirm says a noted line is right (D304, 这周记下的).
type MemoryConfirm struct {
	T   string `json:"t"` // "memory_confirm"
	Seq int64  `json:"seq"`
}

// MemoryCorrect corrects a noted line's words (D304); written back to Mem when it can.
type MemoryCorrect struct {
	T     string `json:"t"` // "memory_correct"
	Seq   int64  `json:"seq"`
	Title string `json:"title"`
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
	Name     string `json:"name"`
	Language string `json:"language"` // TalkLanguage: "auto" (Follow me) or any BCP 47 tag it always replies in (D292)
	Memory   bool   `json:"memory"`
	// MemoryPinned: the home was started with DUCTER_MEMORY=off, so the switch
	// can't turn memory on (D348).
	MemoryPinned    bool        `json:"memoryPinned,omitempty"`
	Notify          bool        `json:"notify"`
	Quiet           *QuietHours `json:"quiet"`
	DefaultAfterMin int         `json:"defaultAfterMin"`
	// Brain is what the partner thinks with (D89); TaskAccounts are the
	// Use it for tasks switches (a missing entry is on).
	Brain        *Brain                 `json:"brain,omitempty"`
	TaskAccounts map[string]TaskAccount `json:"taskAccounts,omitempty"`
	// AutoUpdate: update at night, in quiet hours, when nothing is working (D148).
	AutoUpdate bool `json:"autoUpdate,omitempty"`
	// Proactive (D165): when it notices something. D250: a current core
	// always sends it (never chosen is "three" with ProactiveBy "default");
	// "" only from an older core (nothing watches).
	Proactive string `json:"proactive,omitempty"`
	// ProactiveBy (D250): "default", "chosen" or "keep_note"; "" = chosen
	// before the source was kept.
	ProactiveBy string `json:"proactiveBy,omitempty"`
	// Peers: who of the user's other agents may reach the partner (D170).
	Peers *Peers `json:"peers,omitempty"`
	// LimitHandoff (D297): hand a task to another agent right away when a
	// usage limit runs out (chosen on the task's limit card).
	LimitHandoff bool `json:"limitHandoff,omitempty"`
	// Met are the first-time lines already met on any device (D451); nil
	// from a home too old to keep them (then none is ever shown).
	Met []string `json:"met"`
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
	LimitHandoff    *bool                  `json:"limitHandoff,omitempty"`
	// Met adds first-time lines met here (D451); never removes.
	Met []string `json:"met,omitempty"`
}

// Peers is the partner's link with the person's own agents (D332, one
// switch): reach own (on) | off; Trusted, own agents whose work starts
// without asking (a learned rule, never shown); Muted, agents the user
// stopped listening to.
type Peers struct {
	Reach   string   `json:"reach"`
	Trusted []string `json:"trusted"`
	Muted   []string `json:"muted"`
	// D334: teammates' agents let through (D470: 不再听它的 moves one to Muted; nil = unchanged).
	Allowed []string `json:"allowed"`
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
	// D304: the person said it is right, or corrected its words.
	Confirmed bool `json:"confirmed,omitempty"`
	Corrected bool `json:"corrected,omitempty"`
}

// MemView is what the partner remembers, as far as this Ducter can tell:
// State is connected, missing (no Nowledge Mem) or off.
type MemView struct {
	State string  `json:"state"`
	Noted []Noted `json:"noted"`
	// D304: the 想起了 lines the person had it forget (their seqs).
	Forgotten []int64 `json:"forgotten,omitempty"`
	// D329: Undone are the Noted lines taken back with 撤销; Waiting the
	// ones still waiting for Mem in the outbox (their seqs).
	Undone  []int64 `json:"undone,omitempty"`
	Waiting []int64 `json:"waiting,omitempty"`
	// KeptUnder is the name its memories are kept under in Mem (D141).
	KeptUnder string `json:"keptUnder,omitempty"`
	// D295: Glance is a look at Mem itself when it answers: how many
	// memories it holds and the latest ones other AI tools saved there.
	Glance *MemGlance `json:"glance,omitempty"`
	// D375: Health is what Mem's own doctor on the home says, once read.
	Health *MemHealth `json:"health,omitempty"`
	// D465: Check is what Nowledge Mem would like settled, and the rules on.
	Check *MemCheck `json:"check,omitempty"`
}

// MemCheck is what Nowledge Mem would like the person to settle (D465): Asks
// (contradictions newest first, then learned rules), More (other suggestions
// best seen in Mem, never counted) and Rules (the ones on, read by every AI
// tool connected to Mem at a new conversation).
type MemCheck struct {
	Asks  []MemCheckItem `json:"asks"`
	More  bool           `json:"more,omitempty"`
	Rules []MemRule      `json:"rules"`
}

// MemCheckItem is one of Mem's asks (D465): Kind contradiction (Pair, earlier
// first, titles and days only) or rule (Title and Body, a learned draft);
// Suggest is Mem's own answer, the default; Answers the ones offered
// (newer, older, both; use, not).
type MemCheckItem struct {
	ID      string        `json:"id"`
	Kind    string        `json:"kind"`
	Pair    []MemPairItem `json:"pair,omitempty"`
	Title   string        `json:"title,omitempty"`
	Body    string        `json:"body,omitempty"`
	Suggest string        `json:"suggest,omitempty"`
	Answers []string      `json:"answers"`
	At      string        `json:"at,omitempty"`
}

// MemPairItem is one of two memories that may disagree (D465).
type MemPairItem struct {
	Title string `json:"title"`
	At    string `json:"at,omitempty"`
}

// MemRule is a rule on in Nowledge Mem (D465).
type MemRule struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Body  string `json:"body,omitempty"`
}

// MemAnswer settles one of Mem's asks, or turns an on rule off with "not"
// (D465); answered by mem_answered.
type MemAnswer struct {
	T      string `json:"t"` // "mem_answer"
	ID     string `json:"id"`
	Answer string `json:"answer"`
}

// MemAnswered is whether Mem took the answer (OK false: the ask is back).
type MemAnswered struct {
	ID     string `json:"id"`
	Answer string `json:"answer"`
	OK     bool   `json:"ok"`
}

func decodeMemAnswered(data []byte, f ServerFrame) (ServerFrame, error) {
	var m MemAnswered
	if err := json.Unmarshal(data, &m); err != nil {
		return f, err
	}
	f.MemAnswered = &m
	return f, nil
}

// MemHealth is what Nowledge Mem's own `nmem doctor` says is wrong on a
// computer (D375): Issue old (no doctor in this nmem) | unreachable |
// signed_out (Fresh: never signed in there) | plugin (Agents, harness ids,
// aren't connected to it); no Issue: all well.
type MemHealth struct {
	Issue     string   `json:"issue,omitempty"`
	Fresh     bool     `json:"fresh,omitempty"`
	Agents    []string `json:"agents,omitempty"`
	CheckedAt string   `json:"checkedAt,omitempty"`
}

// MemHealthReq is 再看一次 / Check again on Settings › 记忆 (D375): read
// Mem's doctor on the home now; the settings frame follows.
type MemHealthReq struct {
	T string `json:"t"` // "mem_health"
}

// MemGlance is Mem's count, what it knows about the person by Mem's own kinds
// (D321), and the other AI tools that wrote to the same Mem this week, as a
// count only (More: at least that many), never their working notes' titles.
type MemGlance struct {
	Total int       `json:"total"`
	About []MemItem `json:"about"`
	Tools []MemTool `json:"tools"`
}

// MemItem is one memory as Settings › 记忆 shows it (D321): its title, Kind
// (preference, decision, fact, other), By (said, tool, you, mem), From (the
// tool's own name, for By tool) and when.
type MemItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
	By    string `json:"by"`
	From  string `json:"from,omitempty"`
	At    string `json:"at,omitempty"`
}

// MemTool is another AI tool on the same Mem, and how many working notes it
// saved in the last 7 days (D321).
type MemTool struct {
	From  string `json:"from"`
	Count int    `json:"count"`
	More  bool   `json:"more,omitempty"`
}

// MemForget forgets one memory on Settings › 记忆 by Mem's id (D321).
type MemForget struct {
	T  string `json:"t"` // "mem_forget"
	ID string `json:"id"`
}

// MemFix fixes one memory's words on Settings › 记忆 by Mem's id (D321).
type MemFix struct {
	T     string `json:"t"` // "mem_fix"
	ID    string `json:"id"`
	Title string `json:"title"`
}

// MemFind searches Mem for Settings › 记忆 (D321); answered by mem_found.
type MemFind struct {
	T string `json:"t"` // "mem_find"
	Q string `json:"q"`
}

// MemFound is what Mem found for a search (OK false: Mem didn't answer).
type MemFound struct {
	Q     string    `json:"q"`
	OK    bool      `json:"ok"`
	Items []MemItem `json:"items"`
}

func decodeMemFound(data []byte, f ServerFrame) (ServerFrame, error) {
	var m MemFound
	if err := json.Unmarshal(data, &m); err != nil {
		return f, err
	}
	f.SavedItems = nil
	f.MemFound = &m
	return f, nil
}

// BridgeView is Settings › 伙伴's row for the persona's own connection with
// the user's other AI agents (D205). State: update_mem (Home's Mem needs
// updating), ready, no_space, connecting, connected, disconnecting, refused
// (Reason), failed (Detail), unconfirmed. Pinned: DUCTER_BRIDGE=1 on the home.
//
// D225, the home's own Mem command line first: install_mem / installing,
// update_mem / updating (CanRun: one tap does it; else Need: "pipx", "app",
// "other"), sign_in / signing_in (a one-time connect link; SignIn: "used",
// "bad", "failed"), mem_closed (D329: the Mem app on the home is closed;
// BridgeAction{T: "bridge_mem_open"} opens it), local_mem (Mem here isn't a cloud workspace).
type BridgeView struct {
	State    string       `json:"state"`
	Identity string       `json:"identity"`
	Space    *BridgeSpace `json:"space,omitempty"`
	Home     string       `json:"home,omitempty"`
	Reason   string       `json:"reason,omitempty"`
	Detail   string       `json:"detail,omitempty"`
	Pinned   bool         `json:"pinned,omitempty"`
	CanRun   bool         `json:"canRun,omitempty"`
	// D340: Asks: on ready, this home connects only when asked (not the
	// person's own home), so the switch shows off until it is flipped.
	Asks bool `json:"asks,omitempty"`
	// D329: CanOpen: on mem_closed, the home can open the Nowledge Mem app.
	CanOpen bool   `json:"canOpen,omitempty"`
	Need    string `json:"need,omitempty"`
	// D432: Cmd: on need pipx, the one command that puts it in on the home.
	Cmd     string `json:"cmd,omitempty"`
	SignIn  string `json:"signIn,omitempty"`
	Version string `json:"version,omitempty"`
	// D295: Where Mem keeps the memories: cloud, local (the Mem app or a
	// Vault on the home), or server (the person's own Mem server).
	Where string `json:"where,omitempty"`
	// D257: Newer is Mem's own word that a newer nmem is out: its version,
	// or "" when Mem didn't name it; nil when none is.
	Newer *string `json:"newer,omitempty"`
	// D229: Upkeep is the one quiet thing worth doing to the home's Mem
	// (Kind "move" or "update"); Done what was just done ("installed",
	// "updated", "moved"); Kept: it failed and the old copy still works.
	Upkeep *BridgeUpkeep `json:"upkeep,omitempty"`
	Done   string        `json:"done,omitempty"`
	Kept   bool          `json:"kept,omitempty"`
	// D324: Others are other homes' active connections for the same
	// identity: on "elsewhere" the home that answers now, on "connected" a
	// second reader of the same mailbox.
	Others []BridgeOther `json:"others,omitempty"`
	// D369: Stuck, on "connected": Mem said the partner's mailbox can't be
	// read until Mem sorts it out on its side; Code is Mem's own.
	Stuck *BridgeStuck `json:"stuck,omitempty"`
	// D400: Notices, on "connected": Nowledge Mem itself also tells the
	// person about mail to the partner's identity (bridge notices status).
	Notices bool `json:"notices,omitempty"`
	// D444: Mailboxes, on "connected": the person's own agents in Mem's
	// grouped contact list, by tool, and whether each mailbox takes messages.
	Mailboxes []BridgeMailbox `json:"mailboxes,omitempty"`
	// D480: Server, the Mem server the partner's own connection talks to (host).
	Server string `json:"server,omitempty"`
}

// BridgeMailbox is one tool's mailbox as Mem's contact list says (D444).
type BridgeMailbox struct {
	Harness string `json:"harness"`
	Open    bool   `json:"open"`
	At      int64  `json:"at,omitempty"`
}

// BridgeStuck is Mem's word that a mailbox needs sorting out on its side (D369).
type BridgeStuck struct {
	Code string `json:"code"`
}

// BridgeOther is another home's connection (D324): Label as Mem lists it,
// Home the computer it names ("" for a label from before D324), Stuck when
// Mem wouldn't end it from here (it is ended on that computer).
type BridgeOther struct {
	Label string `json:"label"`
	Home  string `json:"home,omitempty"`
	Stuck bool   `json:"stuck,omitempty"`
	// SeenAt (D433): when Mem last saw that computer (ms), when it says.
	SeenAt int64 `json:"seenAt,omitempty"`
}

// BridgeUpkeep is D229's quiet upkeep of the home's Mem: Kind "move" or
// "update"; Detail and Kept when the last try didn't work.
type BridgeUpkeep struct {
	Kind   string `json:"kind"`
	Detail string `json:"detail,omitempty"`
	Kept   bool   `json:"kept,omitempty"`
}

// BridgeSpace is the user's own place in Mem ("Only me"): label and exact id.
type BridgeSpace struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// BridgeAction is 连上 / Connect or 断开 / Disconnect (D205): T is
// "bridge_connect" or "bridge_disconnect"; fresh settings frames answer.
// D324: "bridge_only_here" is 改由这台收 / 只留这台 (connect here if needed,
// then end the other homes' connections).
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
	// Held is D435: its own agent ran out (or its turns fail) and is held
	// until Until; Why "held" when another agent answers meanwhile.
	Held *BrainHeld `json:"held,omitempty"`
	// Budget is D449: it thinks on a free key; about how many requests
	// are left today, and when the provider's day comes back.
	Budget *FreeBudget `json:"budget,omitempty"`
}

// FreeBudget is a free key's day (D449): Provider ("openrouter",
// "google"), its daily cap when known (Limit), about how many are left
// (Left, nil when unknown), when it comes back (ResetsAt), and Out when
// the day's cap is spent.
type FreeBudget struct {
	Provider string `json:"provider"`
	Limit    *int   `json:"limit,omitempty"`
	Left     *int   `json:"left,omitempty"`
	ResetsAt string `json:"resetsAt"`
	Out      bool   `json:"out,omitempty"`
}

// FreeTierName is the provider's own name for a free tier (D449).
func FreeTierName(p string) string {
	switch p {
	case "openrouter":
		return "OpenRouter"
	case "google":
		return "Gemini"
	}
	return p
}

// BrainHeld is the partner's own agent held after a turn failed on it
// (D435): From, held for Why ("quota", "rate_limited", "error") until
// Until (the reset when ResetKnown, else Ducter's next try). Waits: no
// other agent can answer, so messages are answered at Until, in order.
type BrainHeld struct {
	From       string `json:"from"`
	Why        string `json:"why"`
	Until      string `json:"until"`
	ResetKnown bool   `json:"resetKnown"`
	Waits      bool   `json:"waits,omitempty"`
	// Free is D449: the cap is a free tier's ("openrouter", "google"),
	// said with the provider's name and its own reset.
	Free string `json:"free,omitempty"`
}

// BrainModel is one model the partner may think with: Kind smart or fast
// where Ducter's tier table knows it, empty for a model only the agent's
// live list names (D390); Default: what the agent runs when none is named.
type BrainModel struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Kind    string `json:"kind,omitempty"`
	Default bool   `json:"default,omitempty"`
}

// Forgot says how a memory_forget went: "mem" (Mem forgot it) or
// "hidden" (only no longer shown here).
type Forgot struct {
	Seq int64  `json:"seq"`
	How string `json:"how"`
}

// Undid is how a memory_undo went when it didn't (D329): Mem didn't answer.
type Undid struct {
	Seq int64 `json:"seq"`
	OK  bool  `json:"ok"`
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
	// D363: Ducter can put it on that device from here (安装); putting it
	// there now (or why it didn't); its sign-in running there now.
	Installable bool             `json:"installable,omitempty"`
	Setup       *AgentSetupState `json:"setup,omitempty"`
	Login       *AgentLoginState `json:"login,omitempty"`
	// D416: why it can't run although something of it is there.
	Trouble *AgentTrouble `json:"trouble,omitempty"`
}

// AgentTrouble is an agent partly there (D416): too_old (Need: the version
// it must reach), broken (its command line doesn't answer), app_only (only
// its desktop app App, no command line).
type AgentTrouble struct {
	Kind string `json:"kind"`
	Need string `json:"need,omitempty"`
	App  string `json:"app,omitempty"`
}

// AgentSetupState is an agent being put on a device (D363): queued |
// installing | failed, with why it failed (network | space | unsupported |
// failed) and the installer's last line.
type AgentSetupState struct {
	Phase  string `json:"phase"`
	Pct    int    `json:"pct,omitempty"`
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// AgentLoginState is an agent's own sign-in running on that device (D363):
// starting | waiting (URL, Codex's Code; Paste: Claude's page gives a code
// to paste back) | checking | done | failed | expired | terminal (pi: what to
// run there). Reason: device_off | wrong_code | wrong_key | no_balance |
// offline | failed. D371: Key, DeepSeek Harness signs in with a DeepSeek API
// key pasted here (URL: where one is made); App, the app Ducter just opened on
// that Mac to sign in with the DeepSeek account.
type AgentLoginState struct {
	State   string `json:"state"`
	URL     string `json:"url,omitempty"`
	Code    string `json:"code,omitempty"`
	Paste   bool   `json:"paste,omitempty"`
	Key     bool   `json:"key,omitempty"`
	App     string `json:"app,omitempty"`
	Reason  string `json:"reason,omitempty"`
	Command string `json:"command,omitempty"`
}

// AgentSetupReq is 安装, 登录, a pasted code, 不登录了 or a look again on a
// device's agents (D363). Answered with agent_setup_result only when the
// device can't take it; progress comes as fresh devices frames.
type AgentSetupReq struct {
	T         string   `json:"t"` // "agent_setup"
	Device    string   `json:"device"`
	Action    string   `json:"action"` // install | login | code | cancel | look
	Harnesses []string `json:"harnesses,omitempty"`
	Harness   string   `json:"harness,omitempty"`
	Code      string   `json:"code,omitempty"`
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
	// D375: Busy: Mem's own `nmem connect --tool` is putting it in now;
	// Fresh: just put in by it (the agent uses it once restarted).
	Busy  bool `json:"busy,omitempty"`
	Fresh bool `json:"fresh,omitempty"`
	// D466: Available: update, the newer version Mem's own `plugins check`
	// offers (from Version to it); Versions: review "multiple", each copy's
	// version, oldest first.
	Available string   `json:"available,omitempty"`
	Versions  []string `json:"versions,omitempty"`
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
	AgentProgress
}

// AgentProgress is D362's live part of a running agent update: Step
// "downloading" (Got/Size bytes; Size 0 when the source doesn't say) or
// "installing", Since (ISO) when the updater began, and SlowMs after which
// it is slower than usual there. The same on an Update all step.
type AgentProgress struct {
	Step   string `json:"step,omitempty"`
	Got    int64  `json:"got,omitempty"`
	Size   int64  `json:"size,omitempty"`
	Since  string `json:"since,omitempty"`
	SlowMs int64  `json:"slowMs,omitempty"`
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
	// Perms (D235): macOS's two switches for cua-driver on that Mac.
	Perms *ComputerPerms `json:"perms,omitempty"`
}

const (
	WhereChrome = "chrome"
	WhereDucter = "ducter"
)

type DeviceView struct {
	ID        string          `json:"id"` // "local" for the machine Ducter runs on
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
	// Via is how a connected worker reaches the home now (D293).
	Via *DeviceVia `json:"via,omitempty"`
	// Mem is Nowledge Mem on a computer for tasks (D366): only on a worker,
	// only while memory is on and the home's Mem is connected.
	Mem *DeviceMemView `json:"mem,omitempty"`
	// Records is the person's own AI agents' records on a computer for tasks
	// (D377): only on a worker that says it, while looking is on at the home.
	Records *DeviceRecordsView `json:"records,omitempty"`
}

// DeviceRecordsView is the person's own AI agents' records on a computer for
// tasks (D377): State unasked | on | off (the person's yes, saved on that
// computer); Agents: the agents that kept records there, and when each last
// wrote (file times alone).
type DeviceRecordsView struct {
	State  string               `json:"state"`
	Agents []DeviceRecordsAgent `json:"agents"`
}

// DeviceRecordsAgent is one agent on DeviceRecordsView.
type DeviceRecordsAgent struct {
	Agent  string `json:"agent"`
	LastAt string `json:"lastAt"`
}

// RecordsAllowReq is 读它们留下的记录 (On) or 别再看了 for the person's own
// agents' records on a computer for tasks (D377). Answered with
// records_allow_result only when the computer can't take it.
type RecordsAllowReq struct {
	T      string `json:"t"` // "records_allow"
	Device string `json:"device"`
	On     bool   `json:"on"`
}

// DeviceMemView is Nowledge Mem on a computer for tasks (D366): State absent
// (no Mem command line there) | sign_in | ready; Agents: the AI agents there
// Mem's check says are connected to it; Step: installing | connecting |
// failed now (Reason network | space | unsupported | bad_link | used |
// unreachable | refused | old | failed), nil when idle.
type DeviceMemView struct {
	State       string         `json:"state"`
	Installable bool           `json:"installable,omitempty"`
	Version     string         `json:"version,omitempty"`
	Agents      []string       `json:"agents,omitempty"`
	Step        *DeviceMemStep `json:"step,omitempty"`
	// D375: Health is what Mem's own doctor there says is wrong; Ours: its
	// command line there is Ducter's own copy, so Ducter can update it.
	Health *MemHealth `json:"health,omitempty"`
	Ours   bool       `json:"ours,omitempty"`
	// D386: Theirs is the person's own nmem there when it is too old to sign
	// in (Ducter never changes it); How: pipx | uv | pip, when its install says.
	Theirs *DeviceMemTheirs `json:"theirs,omitempty"`
	// D393: Carried: the home carries Mem to the tasks there from its own one
	// connection; this computer's own Mem then concerns only the person's own
	// sessions there, offered quietly.
	Carried bool `json:"carried,omitempty"`
	// D480: Server, the Mem server this computer's own Mem connection talks to (host).
	Server string `json:"server,omitempty"`
}

// DeviceMemTheirs is the person's own Mem command line on a computer for
// tasks, too old to sign in (D386).
type DeviceMemTheirs struct {
	Old bool   `json:"old"`
	How string `json:"how,omitempty"`
}

// DeviceMemStep is the step under way on DeviceMemView, or how it ended.
type DeviceMemStep struct {
	Phase  string `json:"phase"`
	Pct    int    `json:"pct,omitempty"`
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// MemSetupReq is 装上 or 登录 (with the pasted one-time link, never kept)
// or 接上 for Nowledge Mem on a computer for tasks (D366). Answered with
// mem_setup_result only when the computer can't take it.
type MemSetupReq struct {
	T      string `json:"t"` // "mem_setup"
	Device string `json:"device"`
	Action string `json:"action"` // install | connect | look (D375)
	Link   string `json:"link,omitempty"`
}

// DeviceVia is how a device reaches the home now (D293): Kind is "local"
// (the home's own computer), "lan", "tailnet", "domain" or "tunnel"; Sealed
// says nobody in between can read it (false through Cloudflare, or plain
// http on a network).
type DeviceVia struct {
	Kind   string `json:"kind"`
	Sealed bool   `json:"sealed"`
}

// ReachWay is one way to reach the home (D293): its kind, its address,
// whether pairing links lead with it, and whether it answers ("up", "down",
// "unknown").
type ReachWay struct {
	Kind      string `json:"kind"`
	URL       string `json:"url"`
	Primary   bool   `json:"primary,omitempty"`
	State     string `json:"state,omitempty"`
	CheckedAt string `json:"checkedAt,omitempty"`
}

// HomeKey is the home's key as devices pin it (D293): the raw Ed25519
// public key and its fingerprint, both base64url.
type HomeKey struct {
	Key string `json:"key"`
	FP  string `json:"fp"`
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
	AgentProgress
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
	// Handset is 用这台手机 / Use this phone on an Android phone (D238).
	Handset *HandsetView `json:"handset,omitempty"`
	// Shape is what a handheld is shaped like (D263): "phone", "tablet" or
	// "foldable", as it last said; absent from a home before D263.
	Shape string `json:"shape,omitempty"`
	// Via is how it reaches the home now, while connected (D293).
	Via *DeviceVia `json:"via,omitempty"`
}

// ClientShape is the client's shape as the apps draw it (D263): what it
// said, else an "iPad …" name (D176), else a phone. The web's clientShape
// (packages/protocol) is the same rule.
func (c *ReachClient) ClientShape() string {
	switch c.Shape {
	case "phone", "tablet", "foldable":
		return c.Shape
	}
	if c.Name == "iPad" || strings.HasPrefix(c.Name, "iPad ") {
		return "tablet"
	}
	return "phone"
}

// Reach is who can reach this Ducter from elsewhere, and the address.
type Reach struct {
	Address string        `json:"address,omitempty"`
	Clients []ReachClient `json:"clients"`
	// Anywhere is 从外面连 / From outside on the home (D228); nil = off.
	Anywhere *Anywhere `json:"anywhere,omitempty"`
	// Ways is every way to reach the home, with up or down, and Home its key
	// (D293); a home before D293 sends neither.
	Ways []ReachWay `json:"ways,omitempty"`
	Home *HomeKey   `json:"home,omitempty"`
}

// Anywhere is 从外面连 on the home (D228). How is "own" (an address set
// up some other way, D143) or "cloudflare" (the person's own Cloudflare
// tunnel to their own domain, which Ducter runs). State is "off" (turned off,
// the tunnel kept), "setup" (Setup says how far), "starting", "on" or
// "failed" (Reason: download, unsupported, login, taken, cloudflare,
// unreachable, failed).
type Anywhere struct {
	How      string         `json:"how"`
	State    string         `json:"state"`
	Hostname string         `json:"hostname,omitempty"`
	Reason   string         `json:"reason,omitempty"`
	Detail   string         `json:"detail,omitempty"`
	Since    string         `json:"since,omitempty"`
	Setup    *AnywhereSetup `json:"setup,omitempty"`
}

// AnywhereSetup is the guided setup's progress: each step's state (todo,
// doing, waiting, done, failed), the sign-in link while signing in, and the
// address chosen.
type AnywhereSetup struct {
	TaskID   string         `json:"taskId,omitempty"`
	Steps    []AnywhereStep `json:"steps"`
	Login    *AnywhereLogin `json:"login,omitempty"`
	Hostname string         `json:"hostname,omitempty"`
	Zone     string         `json:"zone,omitempty"`
}

// AnywhereStep is one step of the setup.
type AnywhereStep struct {
	ID     string `json:"id"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// AnywhereStepResult is what one setup step answers its agent.
type AnywhereStepResult struct {
	Step     string `json:"step"`
	State    string `json:"state"`
	Waiting  string `json:"waiting,omitempty"`
	URL      string `json:"url,omitempty"`
	Hostname string `json:"hostname,omitempty"`
	Zone     string `json:"zone,omitempty"`
	Reason   string `json:"reason,omitempty"`
	Detail   string `json:"detail,omitempty"`
	Next     string `json:"next,omitempty"`
}

// AnywhereLogin is the Cloudflare sign-in link (Opened: cloudflared opened it
// in this computer's browser).
type AnywhereLogin struct {
	URL    string   `json:"url"`
	Opened bool     `json:"opened"`
	QR     []string `json:"qr,omitempty"`
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
	Version    string         `json:"version,omitempty"` // notes_seen
}

// ---------- Server -> client frames ----------

// ServerFrame is any server -> client frame. Fields of all variants share
// one struct; T tells which are set.
type ServerFrame struct {
	T           string `json:"t"` // welcome | events | on_hand | task_history | sent | error
	Persona     string `json:"persona,omitempty"`
	PersonaName string `json:"personaName,omitempty"`
	Machine     string `json:"machine,omitempty"` // welcome: hash of the machine the main runs on
	// Ping (welcome, D293): the home answers {t:"ping"} with {t:"pong"}, so
	// a socket silent for 45 s may be closed and dialled again.
	Ping bool `json:"ping,omitempty"`
	// FP (welcome, ways) is the home's key fingerprint; HomeKey and Ways
	// (ways) its public key and its ways to be reached (D293).
	FP      string     `json:"fp,omitempty"`
	HomeKey string     `json:"key,omitempty"`
	Ways    []ReachWay `json:"ways,omitempty"`
	HeadSeq int64      `json:"headSeq,omitempty"`
	Events  []LogEvent `json:"events,omitempty"`
	OnHand  *OnHand    `json:"onHand,omitempty"`
	TaskID  string     `json:"taskId,omitempty"`
	// task_history (D284): the beforeSeq the page was asked with (0 the
	// newest window); More (below) says older events remain.
	BeforeSeq int64 `json:"beforeSeq,omitempty"`
	// task_history (D320): the afterSeq a far page was asked with; More
	// then says newer events remain. task_index: the index, and the
	// FromSeq it was asked from (its turns from there replace the client's).
	AfterSeq  *int64        `json:"afterSeq,omitempty"`
	Index     *SessionIndex `json:"index,omitempty"`
	FromSeq   int64         `json:"fromSeq,omitempty"`
	Delivered Delivery      `json:"delivered,omitempty"` // sent: how a task_send was delivered
	Message   string        `json:"message,omitempty"`
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
	// file_open (D356): the linked file the home now keeps (ID, OK, File),
	// or why it couldn't (WbError: missing | outside | too_big | offline |
	// unsupported | failed, and Message).
	File *MediaRef `json:"file,omitempty"`
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
	// lend (D347, 加一台做事的电脑 / Add a computer for tasks): Code, ExpiresAt,
	// State (waiting | joined | here), Address, SameNetwork, LendLine (the
	// one line to paste, only to the window that asked), Check (the
	// reachability one-liner), Device and Name once a computer joined.
	SameNetwork bool   `json:"sameNetwork,omitempty"`
	LendLine    string `json:"line,omitempty"`
	Check       string `json:"check,omitempty"`
	// partners (D309): every partner on the home, the default first, and
	// the one this socket shows; a refused add or set says why in WbError.
	Partners []PartnerInfo `json:"partners,omitempty"`
	Shown    string        `json:"shown,omitempty"`
	// settings: the partner's settings, its memory, and how a forget went.
	Settings *Settings `json:"settings,omitempty"`
	Mem      *MemView  `json:"mem,omitempty"`
	// BrainNow is what the partner thinks with right now (D150): Brain,
	// unless core runs it on a signed-in agent instead (Why "only_codex", "only_signed_in").
	BrainNow *BrainNow `json:"brainNow,omitempty"`
	Forgot   *Forgot   `json:"forgot,omitempty"`
	// D304: how a memory_correct went: "mem" (Mem took it) or "here" (only here).
	Corrected *Forgot `json:"corrected,omitempty"`
	// D329: Undid says a 撤销 / Undo didn't go through (OK false).
	Undid *Undid `json:"undid,omitempty"`
	// Bridge is the persona's own connection row (D205); nil: nothing to show.
	Bridge *BridgeView `json:"bridge,omitempty"`
	// OwnAgents (D332): the AI agents the person runs themselves on the
	// home (their records' file times); 和你的其他 agent 通信 shows for them.
	OwnAgents []string `json:"ownAgents,omitempty"`
	// rules: Your rules. candidates: who could do TaskID, best first.
	Rules []RuleView `json:"rules,omitempty"`
	// pins (D381): what is pinned, newest first; Refused: why a pin didn't
	// happen (full, gone, kind), to the asking socket only.
	Pins    []PinView `json:"pins,omitempty"`
	Refused string    `json:"refused,omitempty"`
	// Defaults: the built-in default per kind of work (rules frame, D372).
	Defaults []KindDefault `json:"defaults,omitempty"`
	// StandingList (D413): 不用问我的 / Without asking (rules frame).
	StandingList []StandingView `json:"standing,omitempty"`
	Candidates   []Candidate    `json:"candidates,omitempty"`
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
	// D272: project_new_result too (a folder of that name was there).
	Existed bool `json:"existed,omitempty"`
	// D272: git_login_state: Host (github.com), State (signed_in |
	// signed_out | no_gh | code | failed | cancelled | offline | old),
	// Account, Code and URL (the one-time code and where to enter it),
	// Reason (expired | denied | bad_token | network | install |
	// unsupported | failed), Message. Never a token. D345: State installing
	// (gh being put on the home); GhInstall: on no_gh, how the home would
	// put it there (nil: it can't); GhProgress: the download, 0-100.
	GhInstall  *GhInstallPlan `json:"install,omitempty"`
	GhProgress *float64       `json:"progress,omitempty"`
	Account    string         `json:"account,omitempty"`
	GitHost    string         `json:"host,omitempty"`
	ClientID   string         `json:"clientId,omitempty"`
	Card       *TaskCard      `json:"card,omitempty"`
	Apps       int            `json:"apps,omitempty"`
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
	// InRepo (D455): the repo the listed folder is in; Roots: the folders
	// that computer allows, when it sets more than its home folder.
	InRepo *BrowseRepo `json:"inRepo,omitempty"`
	Roots  []string    `json:"roots,omitempty"`
	// More: browse, more folders; task_history (D284), older events remain.
	More bool `json:"more,omitempty"`
	// update_result (D148): Device, OK, Reason, Detail, and with a check the
	// device's Update. disconnect_result: Device, OK, Reason.
	Update *DeviceUpdate `json:"update,omitempty"`
	// agent_update_result (D156): Device, Harness, OK, Reason, Detail.
	// mem_plugin_result (D169): Device, Harness, OK, TaskID, Reason.
	Harness string `json:"harness,omitempty"`
	// account_usage (D288): Harness, its usage, or Why it has none.
	AccountUsage *AccountUsage `json:"usage,omitempty"`
	Why          string        `json:"why,omitempty"`
	// first_screen (D149): the empty conversation's words from the home.
	First *FirstScreen `json:"first,omitempty"`
	// key_add_result (D298): ClientID and what the pasted key came to.
	KeyResult *KeyResult `json:"result,omitempty"`
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
	// D248: phone_view: Taking (My turn waits for the step in flight);
	// phone_did: what the task did on the phone, newest last.
	Taking bool       `json:"taking,omitempty"`
	Did    []PhoneDid `json:"did,omitempty"`
	// saved (D191): the Autofill list (Items, Details, Uses, KeptIn; OK and
	// Reason after a save).
	SavedItems   []SavedView  `json:"items,omitempty"`
	SavedDetails []DetailView `json:"details,omitempty"`
	Uses         []SavedUse   `json:"uses,omitempty"`
	KeptIn       string       `json:"keptIn,omitempty"`
	// D233: 密钥 / Keys, and 让任务向我要密钥 (nil = on).
	SavedKeys []KeyView `json:"keys,omitempty"`
	AskKeys   *bool     `json:"askKeys,omitempty"`
	// D193: connection_signin (the device sign-in); phone_voice_result uses
	// Action, OK, URL, Reason, Message.
	SignIn *SignInView `json:"signIn,omitempty"`
	// handset_dial_result (D278): CallID, OK, DialPhone (the phone's name),
	// How (rang | dialer | note), Reason (no_phone | no_sheet | failed | timeout).
	CallID    string `json:"callId,omitempty"`
	DialPhone string `json:"phone,omitempty"`
	How       string `json:"how,omitempty"`
	// D218: the own-number card (with connections); own_phone_result: Action, Reason.
	OwnPhone *OwnPhoneView `json:"ownPhone,omitempty"`
	// Step is one step's answer of 从外面连's setup (anywhere_setup_result, D228).
	Step *AnywhereStepResult `json:"step,omitempty"`
	// D242: media_keys, fresh keys for media ids this app asked about.
	MediaKeys map[string]string `json:"mediaKeys,omitempty"`
	// D276: channels (聊天软件 / Chat apps, channels.go): each chat app and the
	// Slack manifest; channel_result: ChannelKind, Op, OK, Reason, Code, Link, ExpiresAt.
	Channels      []ChannelView `json:"channels,omitempty"`
	SlackManifest string        `json:"slackManifest,omitempty"`
	// IMessageAt (D323, channels): the Macs carrying iMessage now.
	IMessageAt  []IMessageCarrier `json:"imessage,omitempty"`
	ChannelKind string            `json:"kind,omitempty"`
	Op          string            `json:"op,omitempty"`
	// D285: past_result and past_marked (past.go), decoded on their own.
	Past *PastFrame `json:"-"`
	// D391: past_steps_result and past_forked (past.go), decoded on their own.
	PastSteps *PastStepsFrame `json:"-"`
	// D383: made_result (made.go), decoded on its own.
	Made *MadeFrame `json:"-"`
	// D405: apps, app_open, app_data, app_ask_refused (apps.go), decoded on their own.
	AppsF *AppsFrame `json:"-"`
	// D300: did_result (did.go), decoded on its own.
	DidFor *DidFrame `json:"-"`
	// MemFound is mem_found (D321), decoded on its own (its items aren't SavedItems).
	MemFound *MemFound `json:"-"`
	// MemAnswered is mem_answered (D465), decoded on its own (its answer is a word, not a WbAnswer).
	MemAnswered *MemAnswered `json:"-"`
	// Sources (D341): sources, source_items_result and source_result, decoded on their own.
	Sources *SourcesFrame `json:"-"`
	// D480: mailbox_look's answer (with Device and Harness).
	Look *MailboxLook `json:"look,omitempty"`
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
	// Looks (D298): the home may read this computer's agents' records for
	// its first words; NoBrain: nothing there can think yet (offer a key).
	Looks   *bool `json:"looks,omitempty"`
	NoBrain bool  `json:"noBrain,omitempty"`
	// KeyRoutes (D440): with nothing to think with, the fastest ways to a
	// key from where the home is, best first.
	KeyRoutes []KeyRoute `json:"keyRoutes,omitempty"`
	// OutsideHidden (D307): the agents whose own conversations Past tasks
	// doesn't show (D299), for Settings' way back.
	OutsideHidden []string `json:"outsideHidden,omitempty"`
	// OutsideFolders (D327): the folders left out (~/…), for Settings.
	OutsideFolders []string `json:"outsideFolders,omitempty"`
	// Computer (D327): the home's name, whose agents' records these are.
	Computer string `json:"computer,omitempty"`
	// LookDone (D327): the person already asked to look and was answered.
	LookDone bool `json:"lookDone,omitempty"`
}

// Looking is whether the home may read the agents' records (D298): on
// unless the home said off, as the web reads it.
func (f *FirstScreen) Looking() bool { return f == nil || f.Looks == nil || *f.Looks }

// SetLooking keeps the person's choice until the home says it again.
func (f *FirstScreen) SetLooking(on bool) { f.Looks = &on }

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
	// About is the step's object in the person's own words, when they
	// know it already (a task's title, a web look's question); Source is
	// where a looking step looks: calendar | todos | accounts (D425).
	About  string `json:"about,omitempty"`
	Source string `json:"source,omitempty"`
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
	// D385: pile_how_result's "how" is an object, not the string other frames
	// carry under that name: it is read on its own, past the shared struct.
	var head struct {
		T string `json:"t"`
	}
	if json.Unmarshal(data, &head) == nil && head.T == "pile_how_result" {
		return decodeSources(data, ServerFrame{T: head.T})
	}
	// D405: the apps frames (their "apps" is a list where the shared struct's is a count).
	switch head.T {
	case "apps", "app_open", "app_data", "app_ask_refused":
		return decodeApps(data, ServerFrame{T: head.T})
	case "mem_answered":
		// D465: its "answer" is a word where the shared struct's is the workbench's.
		return decodeMemAnswered(data, ServerFrame{T: head.T})
	}
	var f ServerFrame
	if err := json.Unmarshal(data, &f); err != nil {
		// D391: past_forked's step is a number where ServerFrame's "step" is
		// the anywhere setup's: read it on its own.
		var head struct {
			T string `json:"t"`
		}
		if json.Unmarshal(data, &head) == nil && (head.T == "past_steps_result" || head.T == "past_forked") {
			return decodePastSteps(data, ServerFrame{T: head.T})
		}
		return f, err
	}
	switch f.T {
	// Every frame the core sends (ServerFrame in packages/protocol/src/index.ts);
	// TestEveryServerFrameDecodes reads that union, so a new one can't be
	// dropped here unseen (the live view's live / live_frame were, from D151 to
	// D172: 试一下 sat at 正在打开 example.com…… forever).
	case "welcome", "events", "on_hand", "task_history", "sent", "action_result", "error",
		"devices", "ability_result", "pair_code", "lend", "rename_result", "disconnect_result", "update_result", "agent_update_result", "agent_setup_result", "mem_setup_result", "records_allow_result", "update_all_result", "mem_plugin_result", "mailbox_look", "anywhere_setup_result", "settings", "connections", "connection_result", "rules", "candidates", "account_usage", "activity",
		"task_new_options", "task_new_result", "open_task", "open_result", "project_add_result", "project_clone_result", "folder_browse_result",
		"project_new_result", "git_login_state",
		"first_screen", "folder_changes", "close_result", "live", "live_frame", "live_turn", "live_doing", "phone_terms", "phone_install_result", "phone_erase_result", "phone_view", "phone_frame", "phone_doing", "browser_sites", "browser_check", "connection_reads", "proactive_day", "media_keys", "saved", "phone_did",
		"connection_signin", "phone_voice_result", "own_phone_result", "wb", "file_open", "channels", "channel_result",
		"handset_dial_result", "ways", "pong", "key_add_result", "partners", "task_index", "pins":
	case "past_result", "past_marked", "outside_adopted", "outside_hidden":
		return decodePast(data, f)
	case "past_steps_result", "past_forked":
		return decodePastSteps(data, f)
	case "ongoing_result":
		return decodeOngoing(data, f)
	case "made_result":
		return decodeMade(data, f)
	case "did_result":
		return decodeDid(data, f)
	case "mem_found":
		return decodeMemFound(data, f)
	case "mem_answered":
		return decodeMemAnswered(data, f)
	case "sources", "source_items_result", "source_result", "pile_items_result", "pile_result", "pile_find_result", "pile_how_result", "group_review_result":
		return decodeSources(data, f)
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
	// Remote (D455): a repo's origin, normalized (host/owner/repo).
	Remote string `json:"remote,omitempty"`
}

// BrowseRepo (D455) is the repo a listed folder is in (itself or a
// folder above it): adding there adds that repo.
type BrowseRepo struct {
	Root   string `json:"root"`
	Name   string `json:"name"`
	Remote string `json:"remote,omitempty"`
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

// ProjectNew makes <Ducter folder>/projects/<Name> on that computer and
// adds it as a project, git or not (D272, 新建一个文件夹). Answered with
// project_new_result.
type ProjectNew struct {
	T        string `json:"t"` // "project_new"
	Name     string `json:"name"`
	Device   string `json:"device,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// GitLogin is one step of a GitHub sign-in on that computer (D272):
// Action status | start | token | cancel | install (D345, the home only:
// put gh there, then start); Token only with token (it goes
// to that computer's gh, never kept). Answered with git_login_state.
type GitLogin struct {
	T        string `json:"t"` // "git_login"
	Action   string `json:"action"`
	Device   string `json:"device,omitempty"`
	Token    string `json:"token,omitempty"`
	ClientID string `json:"clientId,omitempty"`
	// For "todos" (D345): 待办来源's 连上 / Connect; once signed in the home
	// adds GitHub as a source by itself.
	For string `json:"for,omitempty"`
}

// GhInstallPlan is how the home would put gh there (D345): How brew (the
// Mac's Homebrew) or release (GitHub's own build into Ducter's folder,
// Where).
type GhInstallPlan struct {
	How   string `json:"how"`
	Where string `json:"where"`
}

// TokenNewURL makes a fine-grained token for Ducter on GitHub's own page,
// its permissions filled in (D345; the same as the protocol's TOKEN_NEW_URL).
const TokenNewURL = "https://github.com/settings/personal-access-tokens/new?name=Ducter&description=Ducter%3A+issues+assigned+to+you%2C+pull+requests+and+clones&expires_in=90&contents=write&issues=write&pull_requests=write&metadata=read"

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
	// Remote (D455): a repo's origin; one repo on two computers is one project.
	Remote string `json:"remote,omitempty"`
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
	From     string       `json:"from,omitempty"`  // D285: New task from this: that task's id
	// Item (D341): the to-do picked from 待办来源, bound to the task.
	Item *SourceItemRef `json:"item,omitempty"`
	// Handed (D357): handed over from On hand (交给{name}): no place was
	// picked, so the home finds the repository's own folder.
	Handed bool `json:"handed,omitempty"`
}

// OpenTask asks the apps to show a task (`ducter open <task>`).
type OpenTask struct {
	T      string `json:"t"` // "open_task"
	TaskID string `json:"taskId"`
}
