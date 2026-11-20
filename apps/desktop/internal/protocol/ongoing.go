package protocol

import "encoding/json"

// D285: 一直在跑的 / Ongoing, the mirror of past.ts's Ongoing types: what
// keeps going on its own (a routine, a task looking again on its wait).

// OngoingRun is one run of a routine, or one look of a task's wait.
type OngoingRun struct {
	At     string `json:"at"`
	State  string `json:"state"` // done | failed | skipped | running | looked | met
	TaskID string `json:"taskId,omitempty"`
	Line   string `json:"line,omitempty"`
}

// OngoingItem is a routine or a task resting on its own wait or loop.
type OngoingItem struct {
	Kind        string          `json:"kind"` // routine | task
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Project     string          `json:"project,omitempty"`
	State       string          `json:"state"` // running | resting | paused | needs_you | proposed
	Trigger     *RoutineTrigger `json:"trigger,omitempty"`
	Cadence     string          `json:"cadence,omitempty"`
	EveryMs     int64           `json:"everyMs,omitempty"`
	Reason      string          `json:"reason,omitempty"`
	NextAt      string          `json:"nextAt,omitempty"`
	PausedUntil string          `json:"pausedUntil,omitempty"`
	PausedBy    string          `json:"pausedBy,omitempty"` // user | partner | system
	PauseWhy    string          `json:"pauseWhy,omitempty"`
	Runs        []OngoingRun    `json:"runs"`
	TaskID      string          `json:"taskId,omitempty"`
	StartedAt   string          `json:"startedAt"`
	Mark        *PastMark       `json:"mark,omitempty"`
	// D394: a review task's standing after its last round.
	Reviews *ReviewStanding `json:"reviews,omitempty"`
	// D407: the small app this task keeps current (the card opens it).
	App *OngoingApp `json:"app,omitempty"`
}

// ReviewStanding is where a review task's requests stand after its last
// round (D394): waiting on the person, reviewed again, unchanged, drafted.
type ReviewStanding struct {
	Waiting int    `json:"waiting"`
	Again   int    `json:"again"`
	Same    int    `json:"same"`
	Posted  int    `json:"posted,omitempty"` // D411: posted without asking this round
	Drafted int    `json:"drafted"`
	At      string `json:"at"`
}

// OngoingFrame is ongoing_result.
type OngoingFrame struct {
	T     string        `json:"t"`
	ID    string        `json:"id,omitempty"`
	Items []OngoingItem `json:"items"`
}

// OngoingReq asks for Ongoing (T "ongoing"), answered with ongoing_result.
type OngoingReq struct {
	T  string `json:"t"`
	ID string `json:"id,omitempty"`
}

// OngoingAct is ongoing_action: pause (Until, absent: until resumed),
// resume, run_now, retime (Trigger, a time trigger), end. Answered with
// action_result, then a fresh ongoing_result to every window.
type OngoingAct struct {
	T       string          `json:"t"` // ongoing_action
	Kind    string          `json:"kind"`
	ID      string          `json:"id"`
	Action  string          `json:"action"`
	Until   string          `json:"until,omitempty"`
	Trigger *RoutineTrigger `json:"trigger,omitempty"`
}

// decodeOngoing reads ongoing_result on its own (its items aren't Autofill's).
func decodeOngoing(data []byte, f ServerFrame) (ServerFrame, error) {
	var o OngoingFrame
	if err := json.Unmarshal(data, &o); err != nil {
		return f, err
	}
	f.SavedItems = nil
	f.Past = &PastFrame{T: o.T, ID: o.ID, Ongoing: o.Items}
	if f.Past.Ongoing == nil {
		f.Past.Ongoing = []OngoingItem{}
	}
	return f, nil
}
