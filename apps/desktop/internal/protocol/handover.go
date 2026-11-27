package protocol

// D385: handing several over (design/handover.md). One sheet from every door:
// what (the ticked set, found by words and by meaning), 给{name}的话 / A note
// for {name} (and one per item), and how (a shape, 在哪儿做 / Where, 谁来做 /
// Who does it). Go makes a D360 group for 2+; plan first is its first part, a
// read-only task that reports a typed plan; 一起过目 / Review together sends
// every comment of a finished group behind one Go. The same shapes as
// packages/protocol/src/handover.ts.

// KindTodoSet is a set of to-dos found in the conversation (todos do=find),
// drawn as a tickable card; logged again with GroupID once it was handed
// over (the latest per SetID wins).
const KindTodoSet = "todo_set"

// HandShapes are the four shapes, in the order the sheet offers them:
// plan | one | one_by_one | side_by_side.
var HandShapes = []string{"plan", "one", "one_by_one", "side_by_side"}

// HandCap is how many of a side-by-side hand-over run at once.
const HandCap = 3

// PileSubject is one 讲的是 / Subjects chip: a subject and its count.
type PileSubject struct {
	Name string `json:"name"`
	N    int    `json:"n"`
	// D415: one the person made or named (分类): drawn first, on any pile.
	Own bool `json:"own,omitempty"`
}

// PileSubjectReq (D415) changes the person's own subjects: put (these
// to-dos in it, made if new), take (out of every subject), rename (To; into
// an existing one merges), remove, make. Answered by pile_result op
// "subject" (Done: how many are in it now; Name: as kept).
type PileSubjectReq struct {
	T        string   `json:"t"` // "pile_subject"
	Op       string   `json:"op"`
	Name     string   `json:"name"`
	To       string   `json:"to,omitempty"`
	Refs     []string `json:"refs,omitempty"`
	ClientID string   `json:"clientId,omitempty"`
}

// FindSummary is the find's line as separate facts: 找到 n 个讲{subject}的,
// 标题里写着的 n 个, 说的是同一回事的 n 个. NoMeaning: no_model | error.
type FindSummary struct {
	N         int    `json:"n"`
	Subject   string `json:"subject,omitempty"`
	InTitle   int    `json:"inTitle"`
	ByLabel   int    `json:"byLabel"`
	ByMeaning int    `json:"byMeaning"`
	NoMeaning string `json:"noMeaning,omitempty"`
	// D428: the ones the reading's hard facts left; sure ones past the
	// tick cap (not ticked); unsure ones (shown, never ticked).
	Within *int `json:"within,omitempty"`
	Cut    int  `json:"cut,omitempty"`
	Maybe  int  `json:"maybe,omitempty"`
	// D454: found, but already handed over (their own group, never ticked).
	Handed int `json:"handed,omitempty"`
}

// FindGuess is a name one edit from exactly one login, read as that login
// at once (D454): 按 100gle 找的, with 不是 100gle (drop "guess:<said>").
type FindGuess struct {
	Said  string `json:"said"`
	Login string `json:"login"`
}

// HandedItem is a found to-do already handed over (D454): its task and what
// became of it (doing | waiting | failed | done).
type HandedItem struct {
	FoundItem
	Handed struct {
		TaskID string `json:"taskId,omitempty"`
		State  string `json:"state"`
	} `json:"handed"`
}

// FindFacet is one fact read out of the sentence (D428), shown as its own
// chip: 「100gle 提的」「分给你的」「关于 UI 走查」. Kind: person | mine | repo |
// label | ref | since | pr | about. Tapping one drops it (PileFindReq.Drop).
type FindFacet struct {
	Key  string `json:"key"`
	Kind string `json:"kind"`
	Text string `json:"text"`
	Said string `json:"said"`
	By   string `json:"by"`
}

// FindUnknown is a name the pile doesn't have, with the closest logins.
type FindUnknown struct {
	Said    string   `json:"said"`
	Closest []string `json:"closest"`
}

// FindSaid is how core heard the words (D396): what it looked for (About)
// and the note taken out of them, by code or the cheapest model.
type FindSaid struct {
	About string `json:"about"`
	Note  string `json:"note,omitempty"`
	By    string `json:"by"`
	// D428: the reading, one chip per fact (the about last); names it
	// couldn't find; the chips the person dropped.
	Facets  []FindFacet   `json:"facets,omitempty"`
	Unknown []FindUnknown `json:"unknown,omitempty"`
	Dropped []string      `json:"dropped,omitempty"`
	Guessed []FindGuess   `json:"guessed,omitempty"`
}

// TickMax is how many found ones are ticked without asking (D428).
const TickMax = 10

// FoundItem is one to-do in a find, and how it was found:
// title | label | meaning | subject | ref.
type FoundItem struct {
	PileItem
	By string `json:"by"`
	// D428: why it is here in a few words; high (ticked) or maybe (never ticked).
	Because string `json:"because,omitempty"`
	Sure    string `json:"sure,omitempty"`
}

// HandWhere is 在哪儿做 / Where: a computer and why it was chosen
// (note | rule | repo | home | picked).
type HandWhere struct {
	Device  string `json:"device"`
	Name    string `json:"name"`
	Why     string `json:"why"`
	Said    string `json:"said,omitempty"`
	HasRepo bool   `json:"hasRepo,omitempty"`
}

// HandWho is 谁来做 / Who does it: an agent (Harness), or "" for the usual
// choice per task. Why rule | usual | picked.
type HandWho struct {
	Harness string `json:"harness,omitempty"`
	Why     string `json:"why"`
	Said    string `json:"said,omitempty"`
}

// HandAddTo is a live group on the same subject (加进「{group}」).
type HandAddTo struct {
	GroupID  string `json:"groupId"`
	Name     string `json:"name"`
	N        int    `json:"n"`
	Planning bool   `json:"planning"`
}

// HandHow is the sheet's how, made by core from the set and the note.
type HandHow struct {
	Shape   string      `json:"shape,omitempty"`
	Shapes  []string    `json:"shapes"`
	Repo    string      `json:"repo,omitempty"`
	AddTo   *HandAddTo  `json:"addTo,omitempty"`
	Where   HandWhere   `json:"where"`
	Wheres  []HandWhere `json:"wheres"`
	Who     HandWho     `json:"who"`
	Whos    []string    `json:"whos"`
	Cap     int         `json:"cap"`
	Lasting bool        `json:"lasting,omitempty"`
}

// TodoSet is a set found in the conversation, as its card draws it.
type TodoSet struct {
	SetID   string      `json:"setId"`
	Query   string      `json:"query,omitempty"`
	Subject string      `json:"subject,omitempty"`
	Found   FindSummary `json:"found"`
	Refs    []string    `json:"refs"`
	Ticked  []string    `json:"ticked"`
	Rows    []FoundItem `json:"rows"`
	GroupID string      `json:"groupId,omitempty"`
	// D396: the how-to part of the words it was found by: the hand-over's note.
	Note string `json:"note,omitempty"`
	// D428: the reading's chips.
	Facets []FindFacet `json:"facets,omitempty"`
}

// PlanPart is one part of a plan: one task for these to-dos.
type PlanPart struct {
	ID    string   `json:"id"`
	Refs  []string `json:"refs"`
	Title string   `json:"title"`
	Why   string   `json:"why"`
	Step  int      `json:"step,omitempty"`
}

// PlanFixed is a to-do already fixed: only to close.
type PlanFixed struct {
	Ref     string `json:"ref"`
	Where   string `json:"where"`
	Comment string `json:"comment,omitempty"`
}

// PlanLater is one left for now, with why.
type PlanLater struct {
	Ref string `json:"ref"`
	Why string `json:"why"`
}

// PlanRead is what the plan read: n to-dos and a repository's code.
type PlanRead struct {
	N    int    `json:"n"`
	Repo string `json:"repo,omitempty"`
}

// HandPlan is plan first's typed plan.
type HandPlan struct {
	Fixed  []PlanFixed `json:"fixed"`
	One    []PlanPart  `json:"one"`
	Line   []PlanPart  `json:"line"`
	Side   []PlanPart  `json:"side"`
	Later  []PlanLater `json:"later"`
	Limits []string    `json:"limits"`
	Read   PlanRead    `json:"read"`
}

// Parts are the plan's parts in run order.
func (p *HandPlan) Parts() []PlanPart {
	out := append([]PlanPart{}, p.One...)
	out = append(out, p.Line...)
	return append(out, p.Side...)
}

// GroupPlanView is the plan's state on its group:
// planning | ready | held | going | failed.
type GroupPlanView struct {
	TaskID     string            `json:"taskId"`
	State      string            `json:"state"`
	Plan       *HandPlan         `json:"plan,omitempty"`
	DecisionID string            `json:"decisionId,omitempty"`
	Notes      map[string]string `json:"notes,omitempty"`
	Summary    string            `json:"summary,omitempty"`
}

// HandDevice is the computer a hand-over runs on.
type HandDevice struct {
	Device string `json:"device"`
	Name   string `json:"name"`
}

// GroupHandView is what a hand-over group carries (TaskGroup.Hand). Review
// ready | sent.
type GroupHandView struct {
	Shape   string              `json:"shape"`
	Items   []SourceItemRef     `json:"items"`
	Note    string              `json:"note,omitempty"`
	Subject string              `json:"subject,omitempty"`
	Where   *HandDevice         `json:"where,omitempty"`
	Harness string              `json:"harness,omitempty"`
	Plan    *GroupPlanView      `json:"plan,omitempty"`
	Fixed   []PlanFixed         `json:"fixed,omitempty"`
	Review  string              `json:"review,omitempty"`
	Cap     int                 `json:"cap,omitempty"`
	Parts   map[string][]string `json:"parts,omitempty"`
	// D638: Go was answered and opening failed: the card says why; the to-dos are back.
	Error string `json:"error,omitempty"`
}

// ReviewChecks is a PR's checks: passed | failed (Failed of them) | running.
type ReviewChecks struct {
	State  string `json:"state"`
	Failed int    `json:"failed,omitempty"`
}

// ReviewPR is a part's PR: its address and #n.
type ReviewPR struct {
	URL   string `json:"url,omitempty"`
	Label string `json:"label"`
}

// ReviewSize is a part's lines added and removed.
type ReviewSize struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// ReviewRow is one part in review together.
type ReviewRow struct {
	TaskID  string          `json:"taskId,omitempty"`
	Items   []SourceItemRef `json:"items"`
	PR      *ReviewPR       `json:"pr,omitempty"`
	FixedIn string          `json:"fixedIn,omitempty"`
	Checks  *ReviewChecks   `json:"checks,omitempty"`
	Size    *ReviewSize     `json:"size,omitempty"`
	Result  string          `json:"result,omitempty"`
	Comment string          `json:"comment"`
	Close   bool            `json:"close"`
	// Merged: the item's own PR is merged (read from GitHub), so its
	// "fixed" comment is true. Absent on older rows; false: not sent.
	Merged *bool  `json:"merged,omitempty"`
	Why    string `json:"why,omitempty"`
}

// GroupReview is a done group's review together.
type GroupReview struct {
	GroupID string      `json:"groupId"`
	Name    string      `json:"name"`
	Rows    []ReviewRow `json:"rows"`
	PRs     int         `json:"prs"`
	Fixed   int         `json:"fixed"`
}

// SourceAskItem is one to-do of a batch card, with the line it gets.
type SourceAskItem struct {
	Item SourceItemRef `json:"item"`
	Text string        `json:"text,omitempty"`
}

// ---------- client → home ----------

// PileHandReq is 交给{name}这 n 个 / Hand these n to {name}: the ticked
// to-dos, the note (给{name}的话), a note per to-do, the shape, where and
// who; Group: into that live group; SetID: the set card it came from.
type PileHandReq struct {
	T         string            `json:"t"` // "pile_hand"
	Refs      []string          `json:"refs"`
	ClientID  string            `json:"clientId,omitempty"`
	Note      string            `json:"note,omitempty"`
	Notes     map[string]string `json:"notes,omitempty"`
	Shape     string            `json:"shape,omitempty"`
	Group     string            `json:"group,omitempty"`
	Device    string            `json:"device,omitempty"`
	Harness   string            `json:"harness,omitempty"`
	Subject   string            `json:"subject,omitempty"`
	BySubject bool              `json:"bySubject,omitempty"`
	SetID     string            `json:"setId,omitempty"`
	// D638: this Go came from the sheet: core answers at once, even for one to-do.
	Sheet bool `json:"sheet,omitempty"`
}

// PileFindReq finds across the pile by words and meaning (Query), a 讲的是
// chip's Subject, or a set card's SetID.
type PileFindReq struct {
	T     string `json:"t"` // "pile_find"
	Query string `json:"query,omitempty"`
	// D396: the person's whole sentence; core splits what to find from the note.
	Words    string `json:"words,omitempty"`
	Subject  string `json:"subject,omitempty"`
	SetID    string `json:"setId,omitempty"`
	ClientID string `json:"clientId,omitempty"`
	// D428: the reading's chips the person removed (their keys).
	Drop []string `json:"drop,omitempty"`
}

// PileHowReq asks the sheet's how for the ticked set and the note so far.
type PileHowReq struct {
	T         string   `json:"t"` // "pile_how"
	Refs      []string `json:"refs"`
	Note      string   `json:"note,omitempty"`
	BySubject bool     `json:"bySubject,omitempty"`
	Subject   string   `json:"subject,omitempty"`
	ClientID  string   `json:"clientId,omitempty"`
}

// PlanAnswerReq answers a plan card: go (with the notes said on its parts),
// hold, or reply (Text, to the plan's own task).
type PlanAnswerReq struct {
	T        string            `json:"t"` // "plan_answer"
	GroupID  string            `json:"groupId"`
	Option   string            `json:"option"`
	Text     string            `json:"text,omitempty"`
	Notes    map[string]string `json:"notes,omitempty"`
	ClientID string            `json:"clientId,omitempty"`
}

// GroupReviewReq reads a done group's review together; GroupReviewSendReq
// sends its comments (Keep: the to-dos whose line goes out).
type GroupReviewReq struct {
	T        string `json:"t"` // "group_review"
	GroupID  string `json:"groupId"`
	ClientID string `json:"clientId,omitempty"`
}

type GroupReviewSendReq struct {
	T        string   `json:"t"` // "group_review_send"
	GroupID  string   `json:"groupId"`
	Keep     []string `json:"keep"`
	ClientID string   `json:"clientId,omitempty"`
}
