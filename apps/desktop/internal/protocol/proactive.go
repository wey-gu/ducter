package protocol

// D165, D166 (design/connectors.md Part A): what Ducter notices in the
// accounts the person let it read, and how it says so. Mirrors
// packages/protocol/src/proactive.ts.

const (
	KindFinds     = "finds"
	KindFindState = "find_state"
)

// The proactive chips: 只说急的 · 每天最多 3 条 · 有用就说 · 不用主动找我.
var ProactiveModes = []string{"urgent", "three", "useful", "off"}

// FindHow is one mail, event or thread a find rests on (怎么知道的).
type FindHow struct {
	What string `json:"what"`
	From string `json:"from,omitempty"`
	At   string `json:"at"`
	// D388: where it was read (calendar, mail, chat, github, you, web), what
	// that source says, and the page a web claim was read on.
	Src  string `json:"src,omitempty"`
	Says string `json:"says,omitempty"`
	URL  string `json:"url,omitempty"`
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
	// D388: what it doesn't know yet, and what it did not change.
	Unknown   string `json:"unknown,omitempty"`
	Untouched string `json:"untouched,omitempty"`
	// D403: a reply already written for a 在等你回 find (editable; Go sends it after the undo window).
	Draft *FindDraft `json:"draft,omitempty"`
	// D453: said as an offer (quiet; no Hold; fades at the next morning).
	Offer bool `json:"offer,omitempty"`
	// D458: where an offer from past the accounts came from, in the person's language.
	Origin string `json:"origin,omitempty"`
}

// FindDraft is the reply a cheap model wrote from the thread, in its
// language and the person's voice (D403).
type FindDraft struct {
	Text    string `json:"text"`
	To      string `json:"to"`
	From    string `json:"from,omitempty"`
	Subject string `json:"subject,omitempty"`
	Lang    string `json:"lang"`
	Check   string `json:"check,omitempty"`
}

// OfferShown is how many offers a note shows before 还有几条 / A few more (D453).
const OfferShown = 3

// SendUndoMs is how long a reply waits after Go, with 撤回 / Undo (D403, D61 GQ3).
const SendUndoMs = 30_000

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
	// D304: the week's first morning note offers to show what it noted this week.
	Learned *Learned `json:"learned,omitempty"`
	// D674: once a week, the review of what it noticed and didn't say (shadow.go).
	ShadowReview *ShadowOffer `json:"shadowReview,omitempty"`
}

// Learned is how many things it noted about the person in the last 7 days.
type Learned struct {
	Count int `json:"count"`
}

// FindState is a find's change: go, held, passed (过了), useful, muted; and
// a drafted reply's sending, sent, unsent, send_failed (D403: Until is when
// it goes; DecisionID the find's Go asked again; Error why it didn't go).
type FindState struct {
	FindID     string `json:"findId"`
	Kind       string `json:"kind"`
	State      string `json:"state"`
	TaskID     string `json:"taskId,omitempty"`
	RuleID     string `json:"ruleId,omitempty"`
	Until      string `json:"until,omitempty"`
	DecisionID string `json:"decisionId,omitempty"`
	Error      string `json:"error,omitempty"`
}

// IsSendState says whether a find state is a drafted reply's sending (D403).
func IsSendState(s string) bool {
	return s == "sending" || s == "sent" || s == "unsent" || s == "send_failed"
}

// FindUndo is 撤回 / Undo on a drafted reply inside its window (D403).
type FindUndo struct {
	T      string `json:"t"` // "find_undo"
	FindID string `json:"findId"`
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
	// Trouble (D402): why Ducter stopped looking at it by itself:
	// "unsupported" (the source can't read what the watch needs) or
	// "reconnect" (the source says to connect the account again).
	Trouble string `json:"trouble,omitempty"`
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

// FindOpen says the person opened 怎么知道的 under a find ("how"), or 还有几条
// brought these finds into view ("more"): the home logs each once, for
// ducter proactive week (D464). Never a learning signal.
type FindOpen struct {
	T       string   `json:"t"` // "find_open"
	FindIDs []string `json:"findIds"`
	What    string   `json:"what"` // how | more
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

// DecisionDraft is a drafted reply's first line, for its ask away from the card (D403).
type DecisionDraft struct {
	First string `json:"first"`
}
