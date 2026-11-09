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
	KindMemoryNoted      = "memory_noted"
	KindBridgeMsg        = "bridge_msg"
)

type UserMsg struct {
	Text     string `json:"text"`
	ClientID string `json:"clientId,omitempty"`
}

type AIMsg struct {
	Text    string `json:"text"`
	ReplyTo int64  `json:"replyTo,omitempty"`
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
}

type DecisionResolved struct {
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go | hold | reply
	Text       string `json:"text,omitempty"`
	By         string `json:"by"` // user | default
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
	Brief      string `json:"brief"`
	BodyReason string `json:"bodyReason,omitempty"`
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
	ClientID string          `json:"clientId,omitempty"`
	Tool     *ToolCall       `json:"tool,omitempty"`
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

// Waiter is a cheap wait that wakes the partner (wait_until). A task-less
// waiter renders as a compact row on On hand.
type Waiter struct {
	WaiterID string `json:"waiterId"`
	TaskID   string `json:"taskId,omitempty"`
	At       string `json:"at,omitempty"`
	Reason   string `json:"reason"`
	State    string `json:"state"` // armed | fired | cancelled
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
)

type Report struct {
	TaskID    string        `json:"taskId"`
	State     string        `json:"state"` // progress | needs_input | blocked | done | failed
	Summary   string        `json:"summary"`
	Questions []Question    `json:"questions"`
	Evidence  []EvidenceRef `json:"evidence"`
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
	Direction string `json:"direction"`
	MessageID string `json:"messageId"`
	From      string `json:"from,omitempty"`
	To        string `json:"to,omitempty"`
	Text      string `json:"text"`
	InReplyTo string `json:"inReplyTo,omitempty"`
	SentAt    string `json:"sentAt,omitempty"`
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
}

type Send struct {
	T        string `json:"t"` // "send"
	Text     string `json:"text"`
	ClientID string `json:"clientId"`
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
	ClientID string `json:"clientId,omitempty"`
}

type TaskAction struct {
	T      string `json:"t"` // "task_action"
	TaskID string `json:"taskId"`
	Action string `json:"action"` // interrupt | drop | undrop | reopen | merge | open_pr
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
}

type DeviceAbility struct {
	ID     string `json:"id"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"` // cua_missing | cua_old | env_off | home_only | no_address | unknown_device | failed
	Detail string `json:"detail,omitempty"`
}

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
	// devices: Your devices and abilities.
	Devices []DeviceView `json:"devices,omitempty"`
	Reach   *Reach       `json:"reach,omitempty"`
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
	Forgot   *Forgot   `json:"forgot,omitempty"`
	// rules: Your rules. candidates: who could do TaskID, best first.
	Rules      []RuleView  `json:"rules,omitempty"`
	Candidates []Candidate `json:"candidates,omitempty"`
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
	case "welcome", "events", "on_hand", "task_history", "sent", "action_result", "error",
		"devices", "ability_result", "pair_code", "rename_result", "settings", "rules", "candidates":
	default:
		return f, fmt.Errorf("unknown server frame %q", f.T)
	}
	return f, nil
}

// TaskStream is the stream name of a task.
func TaskStream(taskID string) string { return "task:" + taskID }
