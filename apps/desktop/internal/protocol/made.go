package protocol

import "encoding/json"

// D383: 给你做的 / Made for you (packages/protocol/src/made.ts): what Ducter
// made for the person, read by the home from the Log and opened with what
// already opens each thing (the viewer, file_open, the rich block, the
// browser).

// MadeKinds are the kinds, in the order the chips show them.
var MadeKinds = []string{"app", "file", "picture", "table", "chart", "list", "link"}

// MadeTask is the task that made a thing.
type MadeTask struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
}

// MadeHit is where a search's words matched.
type MadeHit struct {
	Field string `json:"field"`
	Text  string `json:"text"`
}

// MadeItem is one thing Ducter made (made.ts MadeItem).
type MadeItem struct {
	ID     string    `json:"id"`
	Kind   string    `json:"kind"`
	Title  string    `json:"title"`
	At     string    `json:"at"`
	Task   *MadeTask `json:"task,omitempty"`
	Ask    string    `json:"ask,omitempty"`
	Media  *MediaRef `json:"media,omitempty"`
	Path   string    `json:"path,omitempty"`
	Block  *RichUI   `json:"block,omitempty"`
	Seq    int64     `json:"seq,omitempty"`
	URL    string    `json:"url,omitempty"`
	Pinned bool      `json:"pinned,omitempty"`
	Hit    *MadeHit  `json:"hit,omitempty"`
	// App (D405): an app, opened in its own window.
	App *MadeApp `json:"app,omitempty"`
}

// MadeApp is an app in Made for you: its id and version now.
type MadeApp struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

// MadeQuery narrows Made for you.
type MadeQuery struct {
	Q      string `json:"q,omitempty"`
	Kind   string `json:"kind,omitempty"`
	TaskID string `json:"taskId,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

// MadeReq asks for what was made (T "made"), answered with made_result.
type MadeReq struct {
	T     string    `json:"t"`
	ID    string    `json:"id,omitempty"`
	Query MadeQuery `json:"query"`
}

// MadeKindN is how many of one kind there are.
type MadeKindN struct {
	Kind string `json:"kind"`
	N    int    `json:"n"`
}

// MadeFrame is made_result.
type MadeFrame struct {
	T     string      `json:"t"`
	ID    string      `json:"id,omitempty"`
	Items []MadeItem  `json:"items"`
	Total int         `json:"total"`
	Kinds []MadeKindN `json:"kinds"`
	Range *PastRange  `json:"range,omitempty"`
	Kind  string      `json:"kind,omitempty"`
}

// decodeMade reads made_result on its own (its items aren't Autofill's).
func decodeMade(data []byte, f ServerFrame) (ServerFrame, error) {
	var m MadeFrame
	if err := json.Unmarshal(data, &m); err != nil {
		return f, err
	}
	f.SavedItems = nil
	f.Made = &m
	return f, nil
}
