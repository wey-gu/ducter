package protocol

// D165, D166 (design/connectors.md Part A): what Ducter notices in the
// accounts the person let it read, and how it says so. Mirrors
// packages/protocol/src/proactive.ts.

const (
	KindFinds     = "finds"
	KindFindState = "find_state"
)

// The proactive chips: 只说急的 · 每天最多 3 件 · 有用就说 · 不用主动找我.
var ProactiveModes = []string{"urgent", "three", "useful", "off"}

// FindHow is one mail, event or thread a find rests on (怎么知道的).
type FindHow struct {
	What string `json:"what"`
	At   string `json:"at"`
}

// FindView is one find in a note: at most two sentences, its evidence,
// and its one next step (a decision, default Hold).
type FindView struct {
	FindID     string    `json:"findId"`
	Kind       string    `json:"kind"`
	Text       string    `json:"text"`
	How        []FindHow `json:"how"`
	DecisionID string    `json:"decisionId,omitempty"`
	GoLabel    string    `json:"goLabel,omitempty"`
	DueAt      string    `json:"dueAt,omitempty"`
	Sender     string    `json:"sender,omitempty"`
}

// Finds is one note the partner said by itself: the morning note, a
// fold-in (Revises today's note), "now", before a meeting, or the
// first-account moment. Quiet: a silent day (no message; the header line
// changes). Ask: a question the note carries (first_look, cadence,
// keep_note); Answered: how it was answered.
type Finds struct {
	NoteID   string     `json:"noteId"`
	Rung     string     `json:"rung"`
	Opening  string     `json:"opening"`
	Finds    []FindView `json:"finds"`
	LeftOut  string     `json:"leftOut,omitempty"`
	Quiet    bool       `json:"quiet,omitempty"`
	Ask      string     `json:"ask,omitempty"`
	Revises  string     `json:"revises,omitempty"`
	Answered string     `json:"answered,omitempty"`
}

// FindState is a find's change: go, held, passed (过了), useful, muted.
type FindState struct {
	FindID string `json:"findId"`
	Kind   string `json:"kind"`
	State  string `json:"state"`
	TaskID string `json:"taskId,omitempty"`
	RuleID string `json:"ruleId,omitempty"`
}

// AppWatch is one app tile on an accounts card (D166).
type AppWatch struct {
	Service     string `json:"service"`
	Title       string `json:"title"`
	Account     string `json:"account,omitempty"`
	Watch       bool   `json:"watch"`
	Excluded    bool   `json:"excluded"`
	Unreachable bool   `json:"unreachable,omitempty"`
	LastReadAt  string `json:"lastReadAt,omitempty"`
}

// SourceLook is a source's watching today: the status line and the tiles.
type SourceLook struct {
	Watching   bool       `json:"watching"`
	ReadToday  int        `json:"readToday"`
	WorthToday int        `json:"worthToday"`
	BudgetPct  int        `json:"budgetPct"`
	Apps       []AppWatch `json:"apps"`
}

// ReadLine is one read today (看了哪些): no quote, no body.
type ReadLine struct {
	At      string `json:"at"`
	Service string `json:"service"`
	Account string `json:"account,omitempty"`
	Items   int    `json:"items"`
	What    string `json:"what"` // new | full | events | mentions
}

// AppWatchSet sets 自己留意 or 不让 Ducter 看这个 on one tile.
type AppWatchSet struct {
	T        string `json:"t"` // "app_watch"
	ID       string `json:"id"`
	Service  string `json:"service"`
	Account  string `json:"account,omitempty"`
	Watch    *bool  `json:"watch,omitempty"`
	Excluded *bool  `json:"excluded,omitempty"`
}

// ConnectionReadsReq asks for 看了哪些 / What it read today.
type ConnectionReadsReq struct {
	T  string `json:"t"` // "connection_reads"
	ID string `json:"id"`
}

// FindReact is 有用 or 这类不用告诉我 under a find.
type FindReact struct {
	T        string `json:"t"` // "find_react"
	FindID   string `json:"findId"`
	Reaction string `json:"reaction"` // useful | mute
}

// ProactiveAnswer answers a note's ask (first_look, keep_note).
type ProactiveAnswer struct {
	T      string `json:"t"` // "proactive_answer"
	NoteID string `json:"noteId"`
	Ask    string `json:"ask"`
	Yes    bool   `json:"yes"`
}
