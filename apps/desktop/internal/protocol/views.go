package protocol

import "encoding/json"

// D662 (research/245 §3.5): 列表 / List. A saved view (视图) is the list's
// filter, its sort and its mode with a name, kept on the home
// (views.json) so every device has it; the three built-ins are offered by
// every client, each only while it has rows. A bulk action goes through
// each task's own path at the home and is logged once as a batch.

// TaskFilter is the list's filter chips, and the two facts the built-ins add.
type TaskFilter struct {
	State    string `json:"state,omitempty"` // needs_you | stopped | working | waiting | done
	Project  string `json:"project,omitempty"`
	Computer string `json:"computer,omitempty"`
	Agent    string `json:"agent,omitempty"`
	Source   string `json:"source,omitempty"`
	Long     bool   `json:"long,omitempty"`
	PR       bool   `json:"pr,omitempty"`
}

// Empty says no chip is on.
func (f TaskFilter) Empty() bool { return f == TaskFilter{} }

// BoardView is one saved way of looking.
type BoardView struct {
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	Filter  TaskFilter `json:"filter"`
	Sort    string     `json:"sort"` // urgency | changed | age
	Mode    string     `json:"mode"` // overview | list
	Builtin string     `json:"builtin,omitempty"`
}

// BuiltinViews are the three every home has (protocol/src/views.ts).
var BuiltinViews = []BoardView{
	{ID: "builtin:needs-today", Filter: TaskFilter{State: "needs_you"}, Sort: "urgency", Mode: "list", Builtin: "needs_today"},
	{ID: "builtin:running-long", Filter: TaskFilter{Long: true}, Sort: "age", Mode: "list", Builtin: "running_long"},
	{ID: "builtin:prs-waiting", Filter: TaskFilter{PR: true}, Sort: "changed", Mode: "list", Builtin: "prs_waiting"},
}

// ViewNameMax is how long a view's name may be.
const ViewNameMax = 32

// ViewSave saves a view on the home (Remove takes one of the person's away).
type ViewSave struct {
	T      string    `json:"t"` // view_save
	View   BoardView `json:"view"`
	Remove bool      `json:"remove,omitempty"`
}

// TaskBulk is one gesture on a selection: end | pause | continue | move |
// reassign | drop; Device for move, Harness (and Model) for reassign.
type TaskBulk struct {
	T       string   `json:"t"` // task_bulk
	TaskIDs []string `json:"taskIds"`
	Op      string   `json:"op"`
	Device  string   `json:"device,omitempty"`
	Harness string   `json:"harness,omitempty"`
	Model   string   `json:"model,omitempty"`
}

// TaskBulkUndo undoes one batch within its ten seconds.
type TaskBulkUndo struct {
	T       string `json:"t"` // task_bulk_undo
	BatchID string `json:"batchId"`
}

// BulkResult is task_bulk_result and task_bulk_undone, read on their own.
type BulkResult struct {
	BatchID string `json:"batchId"`
	Op      string `json:"op,omitempty"`
	Total   int    `json:"total,omitempty"`
	Done    int    `json:"done,omitempty"`
	Skipped int    `json:"skipped,omitempty"`
	Pending int    `json:"pending,omitempty"`
	Keeps   int    `json:"keeps,omitempty"`
	OK      bool   `json:"ok,omitempty"`
	Undone  int    `json:"undone,omitempty"`
	Message string `json:"message,omitempty"`
}

func decodeBulk(data []byte, f ServerFrame) (ServerFrame, error) {
	var b BulkResult
	if err := json.Unmarshal(data, &b); err != nil {
		return f, err
	}
	f.Bulk = &b
	return f, nil
}

func decodeViews(data []byte, f ServerFrame) (ServerFrame, error) {
	var v struct {
		Views []BoardView `json:"views"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return f, err
	}
	f.Views = v.Views
	if f.Views == nil {
		f.Views = []BoardView{}
	}
	return f, nil
}
