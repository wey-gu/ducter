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
// changes). Ask: a question the note carries (first_look, cadence, note_again,
// keep_note); Answered: how it was answered.
type Finds struct {
	NoteID   string     `json:"noteId"`
	Rung     string     `json:"rung"`
	Opening  string     `json:"opening"`
	Finds    []FindView `json:"finds"`
	LeftOut  string     `json:"leftOut,omitempty"` // the partner's, said only when asked (D173); never drawn
	Quiet    bool       `json:"quiet,omitempty"`
	Ask      string     `json:"ask,omitempty"`
	Revises  string     `json:"revises,omitempty"`
	Answered string     `json:"answered,omitempty"`
	// Added: on a fold-in, how many finds at the end are new in this revision.
	Added int `json:"added,omitempty"`
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
	// Calendars (D222): a calendar account's calendars, and which it
	// reads (nil until it listed them).
	Calendars []CalendarRow `json:"calendars,omitempty"`
}

// SourceLook is a source's watching today: the status line and the tiles.
type SourceLook struct {
	Watching   bool       `json:"watching"`
	Paused     bool       `json:"paused,omitempty"`
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

// ProactiveAnswer answers a note's ask (first_look, keep_note, note_again).
type ProactiveAnswer struct {
	T      string `json:"t"` // "proactive_answer"
	NoteID string `json:"noteId"`
	Ask    string `json:"ask"`
	Yes    bool   `json:"yes"`
}

// ProactiveDayReq asks for 今天看了什么 / What it looked at today (D226).
type ProactiveDayReq struct {
	T string `json:"t"` // "proactive_day"
}

// ProactiveDay is one day of watching (D226): counts only, never a subject
// or a sender, and what it held back by reason.
type ProactiveDay struct {
	Day     string       `json:"day"`
	Looked  DayLooked    `json:"looked"`
	Skipped DaySkipped   `json:"skipped"`
	Read    int          `json:"read"`
	Noted   int          `json:"noted"`
	Said    int          `json:"said"`
	Held    []DayHeld    `json:"held"`
	Problem *ReadProblem `json:"problem,omitempty"`
	// NextNote is the next morning note (ISO), when the mode has one.
	NextNote   string `json:"nextNote,omitempty"`
	PushOff    bool   `json:"pushOff,omitempty"`
	CatchingUp bool   `json:"catchingUp,omitempty"`
}

// DayLooked is what the watchers looked at today.
type DayLooked struct {
	Mail     int `json:"mail"`
	Events   int `json:"events"`
	Mentions int `json:"mentions"`
}

// DaySkipped is what rules left before any model.
type DaySkipped struct {
	Notices int `json:"notices"`
	Promo   int `json:"promo"`
	Muted   int `json:"muted"`
}

// DayHeld is how many open things wait for one reason: not_urgent |
// for_morning | below_bar | cap | muted | budget | night.
type DayHeld struct {
	Reason string `json:"reason"`
	N      int    `json:"n"`
}

// ReadProblem is reading closely failing: no_agent | not_installed |
// signed_out | failed, with the agent's name.
type ReadProblem struct {
	Why     string `json:"why"`
	Agent   string `json:"agent,omitempty"`
	Since   string `json:"since"`
	Waiting int    `json:"waiting"`
}
