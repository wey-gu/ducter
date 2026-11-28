package protocol

import "encoding/json"

// D511: 照看 / Looking after (packages/protocol/src/keeps.ts). A Keep is
// something the person asked Ducter to look after over time: a routine, a task
// in rounds and a helper are each one. On hand gives each Keep on or paused
// its own sheet (OnHand.Keeps); a tap opens its page (keep → keep_result).

// KeepWake is what brings a Keep back: every (EveryMs), at (Words: times on
// the clock), arrives (work handed to its address), changes (Words: a watched
// fact; none: the PRs it holds).
type KeepWake struct {
	Kind    string `json:"kind"`
	EveryMs int64  `json:"everyMs,omitempty"`
	Words   string `json:"words,omitempty"`
}

// KeepItem is one thing a Keep holds now: At is work, rest, you (waits for
// the person) or ready (its PR can merge: the merge is theirs).
type KeepItem struct {
	TaskID string  `json:"taskId"`
	Title  string  `json:"title"`
	At     string  `json:"at"`
	Yours  string  `json:"yours,omitempty"`
	PR     string  `json:"pr,omitempty"`
	Said   *PRSaid `json:"said,omitempty"`
}

// PrWake is what changed on one pull request (D560): its number ("#11093") and
// which kind of change: commits, checks, reviews, comments or state.
type PrWake struct {
	PR   string `json:"pr"`
	What string `json:"what"`
}

// KeepRound is one wake: what woke it (time, arrival, change, now, ring, first),
// what it did, and whether it spoke (silent, told, asked).
type KeepRound struct {
	At       string `json:"at"`
	Woke     string `json:"woke"`
	WokeWhat string `json:"wokeWhat,omitempty"`
	// D560: WokeMet: WokeWhat is a condition that came true, said as it stands;
	// WokePr: what changed on one pull request, from its wait's own command.
	WokeMet bool    `json:"wokeMet,omitempty"`
	WokePr  *PrWake `json:"wokePr,omitempty"`
	// Did is what happened, in one line to the person (the model's reading
	// of the report, D519); absent until read. Report is the task's own
	// words to Ducter, shown only behind 看细节.
	Did    string `json:"did,omitempty"`
	Report string `json:"report,omitempty"`
	Spoke  string `json:"spoke"`
	State  string `json:"state"`
	TaskID string `json:"taskId,omitempty"`
	// Changed (D550): a review_report in the round marked a PR changed.
	Changed bool `json:"changed,omitempty"`
	// Edit (D533): Woke "edit" is not a wake but a change the person or the
	// partner made, said as a line among the rounds.
	Edit *KeepEditLine `json:"edit,omitempty"`
}

// KeepEdit is one field changed (D533), from and to as the page says them
// (every: minutes; agent: a harness; where: a computer's name; cap: a number).
type KeepEdit struct {
	Field string `json:"field"`
	From  string `json:"from,omitempty"`
	To    string `json:"to,omitempty"`
	// D593: From and To are only the part of a long text that changed.
	Cut bool `json:"cut,omitempty"`
}

// KeepEditLine is one change: who made it (you, partner) and what changed;
// Undo: it put back the change before it.
type KeepEditLine struct {
	By    string     `json:"by"`
	Edits []KeepEdit `json:"edits"`
	Undo  bool       `json:"undo,omitempty"`
}

// KeepLine is a Keep's last change in one sentence.
type KeepLine struct {
	At   string `json:"at"`
	Text string `json:"text"`
}

// KeepAddress is a Keep's name in Bridge (a helper): a detail, never its home.
type KeepAddress struct {
	Name   string `json:"name"`
	Mem    string `json:"mem"`
	Detail string `json:"detail,omitempty"`
	// D604: the Spaces it receives in, by label, as Mem's identity inbox last read them.
	Spaces []string `json:"spaces,omitempty"`
}

// KeepBell is a Keep's doorbell (D620): on when present, with when its
// URL was made. The URL itself is never here; a page reveals it once.
type KeepBell struct {
	At  string `json:"at"`
	URL string `json:"url,omitempty"`
}

// KeepSheet is a Keep on On hand: the home's one model of its state.
type KeepSheet struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	ProjectKey  string     `json:"projectKey,omitempty"`
	ProjectName string     `json:"projectName,omitempty"`
	Persona     string     `json:"persona,omitempty"`
	Life        string     `json:"life"` // on, paused, done, stopped
	Run         string     `json:"run"`  // same, fresh, perItem
	Wakes       []KeepWake `json:"wakes"`
	Until       string     `json:"until,omitempty"`
	// D650: the end as the head says it (a testable sentence and the look code
	// runs), or noEnd; how many rounds it has run; why Ducter paused it, in words.
	End       *KeepEnd `json:"end,omitempty"`
	NoEnd     bool     `json:"noEnd,omitempty"`
	RoundsRun int      `json:"roundsRun"`
	PausedWhy string   `json:"pausedWhy,omitempty"`
	// PausedBy (D661, research/245 §3.3): who paused it; a system pause is an ask.
	PausedBy string `json:"pausedBy,omitempty"`
	// RoutineID (D661): a paused routine and its one decision are one item.
	RoutineID   string          `json:"routineId,omitempty"`
	Items       []KeepItem      `json:"items"`
	TaskIDs     []string        `json:"taskIds"`
	Asks        int             `json:"asks"`
	EveryMs     int64           `json:"everyMs,omitempty"`
	Cadence     string          `json:"cadence,omitempty"`
	NextAt      string          `json:"nextAt,omitempty"`
	Running     bool            `json:"running,omitempty"`
	Health      *OngoingHealth  `json:"health,omitempty"`
	Line        *KeepLine       `json:"line,omitempty"`
	Lines       int             `json:"lines,omitempty"` // D519: rounds with their line yet (the page is asked again when it grows)
	Reviews     *ReviewStanding `json:"reviews,omitempty"`
	Week        int             `json:"week"`
	PausedUntil string          `json:"pausedUntil,omitempty"`
	Address     *KeepAddress    `json:"address,omitempty"`
	// D620: its doorbell (the sheet says on/off; a page may carry the URL once).
	Bell    *KeepBell `json:"bell,omitempty"`
	Since   string    `json:"since"`
	EndedAt string    `json:"endedAt,omitempty"`
}

// KeepWhere is where a Keep's rounds run and who does them.
type KeepWhere struct {
	DeviceName string `json:"deviceName,omitempty"`
	Harness    string `json:"harness,omitempty"`
}

// KeepPage is a Keep's own page (keep_result): the sheet, the person's
// words, its rules and every round (newest first).
type KeepPage struct {
	KeepSheet
	Said      string      `json:"said"`
	Speaks    string      `json:"speaks,omitempty"`
	Limits    string      `json:"limits,omitempty"`
	Rounds    []KeepRound `json:"rounds"`
	Where     *KeepWhere  `json:"where,omitempty"`
	Decisions []string    `json:"decisions"`
	// D533: what the person may change in place, its clock, a helper's cap a
	// day, and the computer and agent its rounds go to (absent: Ducter picks).
	Editable []string        `json:"editable,omitempty"`
	At       *RoutineTrigger `json:"at,omitempty"`
	Cap      int             `json:"cap,omitempty"`
	Device   string          `json:"device,omitempty"`
	Agent    string          `json:"agent,omitempty"`
	// D609: every hand-off this helper has held, its states included (手上的事 grouped by state).
	Handoffs []HandoffLine `json:"handoffs"`
}

// CanEdit is whether the page lets the person change field in place.
func (k *KeepPage) CanEdit(field string) bool {
	for _, f := range k.Editable {
		if f == field {
			return true
		}
	}
	return false
}

// KeepAt is a Keep's clock as an edit sends it (every day or weekday, at a time).
type KeepAt struct {
	Every string `json:"every"`
	Time  string `json:"time"`
}

// KeepChange is what an edit on a Keep's page changes (D533): the same shape
// as the partner's keep_change. Until, speaks and limits are pointers so ""
// (clear it) can be sent.
type KeepChange struct {
	Title        string  `json:"title,omitempty"`
	Until        *string `json:"until,omitempty"`
	Speaks       *string `json:"speaks,omitempty"`
	Limits       *string `json:"limits,omitempty"`
	EveryMinutes int     `json:"everyMinutes,omitempty"`
	At           *KeepAt `json:"at,omitempty"`
	Said         string  `json:"said,omitempty"`
	Cap          int     `json:"cap,omitempty"`
	Where        string  `json:"where,omitempty"`
	Agent        string  `json:"agent,omitempty"`
	Address      string  `json:"address,omitempty"`
	// D620: on, off, or new (a fresh URL; the old one stops at once).
	Bell string `json:"bell,omitempty"`
}

// KeepChangeReq is keep_change: an edit on a Keep's page (Undo: it puts back
// the change before it). Answered with keep_changed and a fresh keep_result.
type KeepChangeReq struct {
	T      string     `json:"t"`
	ID     string     `json:"id"`
	Change KeepChange `json:"change"`
	Undo   bool       `json:"undo,omitempty"`
}

// KeepWordsReq is keep_words: edited words for the cheap model to read into
// the rules they change. Answered with keep_proposal; nothing applies.
type KeepWordsReq struct {
	T    string `json:"t"`
	ID   string `json:"id"`
	Said string `json:"said"`
}

// KeepProposal is the rules read from edited words (OK), or why not.
type KeepProposal struct {
	OK     bool       `json:"ok"`
	Said   string     `json:"said"`
	Change KeepChange `json:"change"`
	Edits  []KeepEdit `json:"edits,omitempty"`
	Error  string     `json:"error,omitempty"`
}

// KeepEditFrame is keep_changed (an edit's result: its edits and the change
// that undoes it) or keep_proposal (Proposal set).
type KeepEditFrame struct {
	T        string        `json:"t"`
	ID       string        `json:"id"`
	OK       bool          `json:"ok"`
	Error    string        `json:"error,omitempty"`
	Edits    []KeepEdit    `json:"edits,omitempty"`
	Undo     *KeepChange   `json:"undo,omitempty"`
	Undone   bool          `json:"undone,omitempty"`
	Proposal *KeepProposal `json:"proposal,omitempty"`
	// D620: the doorbell URL, only in the answer to the page that made it.
	Bell *KeepBell `json:"bell,omitempty"`
}

func decodeKeepEdit(data []byte, f ServerFrame) (ServerFrame, error) {
	var k KeepEditFrame
	if err := json.Unmarshal(data, &k); err != nil {
		return f, err
	}
	f.ID = k.ID
	f.KeepEdit = &k
	return f, nil
}

// KeepCard is the receipt under the partner's words when a Keep was made.
type KeepCard struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	When      string `json:"when"`
	Speaks    string `json:"speaks,omitempty"`
	Until     string `json:"until,omitempty"`
	Where     string `json:"where,omitempty"`
	First     string `json:"first,omitempty"`
	FirstEver bool   `json:"firstEver,omitempty"`
	Undone    bool   `json:"undone,omitempty"`
}

// TaskKeep names the Keep a task is a round or an item of.
type TaskKeep struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// KeepReq asks for a Keep's page (T "keep"), answered with keep_result.
type KeepReq struct {
	T  string `json:"t"`
	ID string `json:"id"`
}

// KeepAct is keep_action: pause (Until, absent: until resumed), resume,
// look_now, stop. Answered with action_result and a fresh keep_result.
type KeepAct struct {
	T      string `json:"t"`
	ID     string `json:"id"`
	Action string `json:"action"`
	Until  string `json:"until,omitempty"`
}

// KeepSay is words typed on a Keep's page: a send about that Keep.
type KeepSay struct {
	T        string `json:"t"` // send
	Text     string `json:"text"`
	ClientID string `json:"clientId"`
	Keep     string `json:"keep"`
}

// KeepEnd is a Keep's end as the head says it (D650): the sentence in the
// person's language and, when code can test it, the look it runs.
type KeepEnd struct {
	Sentence string       `json:"sentence,omitempty"`
	Look     *KeepEndLook `json:"look,omitempty"`
}

// KeepEndLook is the read Ducter runs to test an end (D650): a PR merged or
// closed, an issue closed, or a date passed.
type KeepEndLook struct {
	Kind string `json:"kind"` // pr | issue | date
	Ref  string `json:"ref,omitempty"`
	What string `json:"what,omitempty"`
	At   string `json:"at,omitempty"`
}
