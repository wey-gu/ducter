package protocol

// D359: the pile (design/task-sources.md §9): the person's open to-dos sorted
// by the cheapest model into a few honest groups (do, decide, close, later),
// each counted by code; handed over into a queue of a few at a time; the
// closable ones closed in one reviewed batch behind the Go given on the sheet;
// a PR waiting for review pre-read with drafted comments. The same frames as
// packages/protocol/src/task-sources.ts.

// PileCap is how many handed-over to-dos run at once; PileHandDefault how
// many 交给{name} ticks by default.
const (
	PileCap         = 3
	PileHandDefault = 6
)

// PileQueue is the handed-over to-dos: working now, waiting in line.
type PileQueue struct {
	Running int `json:"running"`
	Waiting int `json:"waiting"`
	Cap     int `json:"cap"`
}

// PileSorting is a sort running: read so far, of how many.
type PileSorting struct {
	Read int `json:"read"`
	Of   int `json:"of"`
}

// PileView is the pile as On hand draws it. Groups: do | decide | close | later.
// Failed: no_model | budget | error.
type PileView struct {
	Open             int            `json:"open"`
	AtLeast          bool           `json:"atLeast,omitempty"`
	ClearedToday     int            `json:"clearedToday"`
	ClearedYesterday int            `json:"clearedYesterday,omitempty"`
	Sorting          *PileSorting   `json:"sorting,omitempty"`
	SortedAt         string         `json:"sortedAt,omitempty"`
	Read             int            `json:"read"`
	Unread           int            `json:"unread"`
	Groups           map[string]int `json:"groups"`
	Queue            PileQueue      `json:"queue"`
	Failed           string         `json:"failed,omitempty"`
	// D385: 讲的是 / Subjects, past 20 open, each of 3 or more; SubjectsMore past the shown.
	Subjects     []PileSubject `json:"subjects,omitempty"`
	SubjectsMore int           `json:"subjectsMore,omitempty"`
}

// PileItem is one open to-do as the sort left it. Size small | medium |
// large; Pick (decide's suggestion) and Chosen hand | close | later (| keep).
type PileItem struct {
	Item    SourceItem `json:"item"`
	Group   string     `json:"group"`
	Why     string     `json:"why"`
	Size    string     `json:"size,omitempty"`
	Ask     string     `json:"ask,omitempty"`
	Pick    string     `json:"pick,omitempty"`
	Comment string     `json:"comment,omitempty"`
	Chosen  string     `json:"chosen,omitempty"`
	Queued  bool       `json:"queued,omitempty"`
	// D385: what it is about, in the person's language.
	Subject string `json:"subject,omitempty"`
}

// PreReadSummary is what a review request's card says: 我看过了 with its
// counts. State drafted | sent | dropped.
type PreReadSummary struct {
	Problems    int    `json:"problems"`
	Suggestions int    `json:"suggestions"`
	At          string `json:"at"`
	State       string `json:"state"`
}

// PreReadNote is one drafted comment: problem | suggestion, where, the words.
type PreReadNote struct {
	Kind string `json:"kind"`
	Path string `json:"path,omitempty"`
	Line int    `json:"line,omitempty"`
	Text string `json:"text"`
}

// PreRead is a PR's pre-read whole.
type PreRead struct {
	PreReadSummary
	Ref   string        `json:"ref"`
	Title string        `json:"title"`
	URL   string        `json:"url,omitempty"`
	Notes []PreReadNote `json:"notes"`
	Gist  string        `json:"gist,omitempty"`
}

// PileReq is pile_sort (T only).
type PileReq struct {
	T string `json:"t"`
}

// PileItemsReq asks one group's to-dos (pile_items).
type PileItemsReq struct {
	T        string `json:"t"`
	Group    string `json:"group"`
	ClientID string `json:"clientId,omitempty"`
}

// PileRefsReq is pile_hand or pile_close: these to-dos.
type PileRefsReq struct {
	T        string   `json:"t"`
	Refs     []string `json:"refs"`
	ClientID string   `json:"clientId,omitempty"`
}

// PileChooseReq answers a decide, or keeps a closable one open.
type PileChooseReq struct {
	T    string `json:"t"` // "pile_choose"
	Ref  string `json:"ref"`
	Pick string `json:"pick"`
}

// PreReadReq is pre_read; PreReadSendReq is pre_read_send with the notes kept.
type PreReadReq struct {
	T        string `json:"t"`
	Ref      string `json:"ref"`
	ClientID string `json:"clientId,omitempty"`
}

type PreReadSendReq struct {
	T        string `json:"t"` // "pre_read_send"
	Ref      string `json:"ref"`
	Keep     []int  `json:"keep"`
	ClientID string `json:"clientId,omitempty"`
}
