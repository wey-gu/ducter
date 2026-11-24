package protocol

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

// KeepRound is one wake: what woke it (time, arrival, change, now, first),
// what it did, and whether it spoke (silent, told, asked).
type KeepRound struct {
	At       string `json:"at"`
	Woke     string `json:"woke"`
	WokeWhat string `json:"wokeWhat,omitempty"`
	Did      string `json:"did,omitempty"`
	Spoke    string `json:"spoke"`
	State    string `json:"state"`
	TaskID   string `json:"taskId,omitempty"`
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
}

// KeepSheet is a Keep on On hand: the home's one model of its state.
type KeepSheet struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Persona     string          `json:"persona,omitempty"`
	Life        string          `json:"life"` // on, paused, done, stopped
	Run         string          `json:"run"`  // same, fresh, perItem
	Wakes       []KeepWake      `json:"wakes"`
	Until       string          `json:"until,omitempty"`
	NoEnd       bool            `json:"noEnd,omitempty"`
	Items       []KeepItem      `json:"items"`
	TaskIDs     []string        `json:"taskIds"`
	Asks        int             `json:"asks"`
	EveryMs     int64           `json:"everyMs,omitempty"`
	Cadence     string          `json:"cadence,omitempty"`
	NextAt      string          `json:"nextAt,omitempty"`
	Running     bool            `json:"running,omitempty"`
	Health      *OngoingHealth  `json:"health,omitempty"`
	Line        *KeepLine       `json:"line,omitempty"`
	Reviews     *ReviewStanding `json:"reviews,omitempty"`
	Week        int             `json:"week"`
	PausedUntil string          `json:"pausedUntil,omitempty"`
	Address     *KeepAddress    `json:"address,omitempty"`
	Since       string          `json:"since"`
	EndedAt     string          `json:"endedAt,omitempty"`
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
