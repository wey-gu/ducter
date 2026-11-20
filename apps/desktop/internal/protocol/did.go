package protocol

import "encoding/json"

// D300: 替你做过的 / Done for you, the mirror of packages/protocol/src/did.ts.
// Every outward action Ducter took on the person's behalf, read on the home
// from the Log and the Autofill uses; never a secret, never a read's content.

// DidKinds are the kinds, in the order the filters show them.
var DidKinds = []string{"sent", "paid", "called", "filled", "changed", "deleted", "read"}

// DidOutward are the kinds that reach outside: what "nothing sent or paid" means.
var DidOutward = []string{"sent", "paid", "called"}

// DidLine is the most an item's own words say (DID_LINE).
const DidLine = 140

// DidWho is who asked: you (the person), a task, a routine.
type DidWho struct {
	By      string `json:"by"` // you | task | routine
	TaskID  string `json:"taskId,omitempty"`
	Title   string `json:"title,omitempty"`
	Routine string `json:"routine,omitempty"`
}

// DidGo is the Go that allowed it: you (at At), default, before.
type DidGo struct {
	By string `json:"by"`
	At string `json:"at,omitempty"`
	// Words (D411): by "said", the person's words that allowed it.
	Words string `json:"words,omitempty"`
}

// DidWhere is where it happened: computer, phone, ducter_phone, line,
// own_number, home, browser; Name the device's own name or the line's.
type DidWhere struct {
	Kind string `json:"kind"`
	Name string `json:"name,omitempty"`
}

// DidFiles is what a folder task changed.
type DidFiles struct {
	Added   int `json:"added"`
	Changed int `json:"changed"`
	Removed int `json:"removed"`
}

// DidUndo is Undo where one truly exists: a folder task's copy until Until.
type DidUndo struct {
	Kind   string `json:"kind"` // folder
	TaskID string `json:"taskId"`
	Until  string `json:"until"`
}

// DidItem is one outward action.
type DidItem struct {
	ID     string    `json:"id"`
	Kind   string    `json:"kind"`
	Sub    string    `json:"sub"`
	At     string    `json:"at"`
	To     string    `json:"to,omitempty"`
	Via    string    `json:"via,omitempty"`
	Line   string    `json:"line,omitempty"`
	Cal    string    `json:"cal,omitempty"` // create | move | respond | cancel
	Amount string    `json:"amount,omitempty"`
	Count  int       `json:"count,omitempty"`
	Files  *DidFiles `json:"files,omitempty"`
	Unsure string    `json:"unsure,omitempty"` // no_answer | unconfirmed | uncertain
	Who    DidWho    `json:"who"`
	Go     *DidGo    `json:"go,omitempty"`
	Where  *DidWhere `json:"where,omitempty"`
	TaskID string    `json:"taskId,omitempty"`
	Link   string    `json:"link,omitempty"`
	Undo   *DidUndo  `json:"undo,omitempty"`
}

// DidQuery narrows the list; every field optional.
type DidQuery struct {
	Since  string   `json:"since,omitempty"`
	Before string   `json:"before,omitempty"`
	Kinds  []string `json:"kinds,omitempty"`
	Q      string   `json:"q,omitempty"`
	Limit  int      `json:"limit,omitempty"`
}

// DidReq asks for the list (T "did"), answered with did_result.
type DidReq struct {
	T     string   `json:"t"`
	ID    string   `json:"id,omitempty"`
	Query DidQuery `json:"query"`
}

// DidFrame is did_result: the items newest first, the counts per kind in
// the range (before kinds and words narrow it), the range, and More.
type DidFrame struct {
	T      string         `json:"t"`
	ID     string         `json:"id,omitempty"`
	Items  []DidItem      `json:"items"`
	Counts map[string]int `json:"counts"`
	Since  string         `json:"since"`
	Before string         `json:"before"`
	More   bool           `json:"more,omitempty"`
}

// decodeDid reads did_result on its own: its items are not Autofill's.
func decodeDid(data []byte, f ServerFrame) (ServerFrame, error) {
	var d DidFrame
	if err := json.Unmarshal(data, &d); err != nil {
		return f, err
	}
	f.SavedItems = nil
	f.DidFor = &d
	return f, nil
}
