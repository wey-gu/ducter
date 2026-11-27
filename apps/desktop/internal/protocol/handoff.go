package protocol

// D609: a hand-off as the clients read it: one record per item, its state and the words a view
// shows. Core sends it on a task's card (the line under its last report) and on a helper Keep's
// page (手上的事 grouped by state). See packages/protocol/src/handoff.ts.

type HandoffItem struct {
	Kind  string `json:"kind"` // pr | issue | task | text
	Ref   string `json:"ref"`
	Title string `json:"title,omitempty"`
}

type HandoffLine struct {
	ID      string      `json:"id"`
	State   string      `json:"state"` // given | taken | done | returned | declined | withdrawn | settled | unclaimed
	Item    HandoffItem `json:"item"`
	Sender  string      `json:"sender"`
	To      string      `json:"to"`
	GivenAt string      `json:"givenAt"`
	At      string      `json:"at"`
	TaskID  string      `json:"taskId,omitempty"`
	Why     string      `json:"why,omitempty"`
	Outcome string      `json:"outcome,omitempty"`
	// D628: the true world state that ended it (merged | closed); never a reminder to anyone.
	SettledBy string `json:"settledBy,omitempty"`
}

// HandoffReq is D616's two actions on a hand-off nobody took: take it now, or stop following it.
type HandoffReq struct {
	T  string `json:"t"`
	ID string `json:"id"`
}
