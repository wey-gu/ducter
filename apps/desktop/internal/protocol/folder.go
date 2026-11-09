package protocol

// ---------- Folders that aren't repos (D142) ----------

// FolderChange is one thing a task did to a non-git folder, against the
// copy Ducter kept. Moved: From is where it was (same folder = renamed).
type FolderChange struct {
	Kind string `json:"kind"` // added | changed | removed | moved
	Path string `json:"path"`
	From string `json:"from,omitempty"`
	Dir  bool   `json:"dir,omitempty"`
}

// FolderSummary counts what a task changed in a non-git folder. Undo:
// open | kept | undone | expired | none.
type FolderSummary struct {
	Added     int    `json:"added"`
	Changed   int    `json:"changed"`
	Removed   int    `json:"removed"`
	Moved     int    `json:"moved"`
	Renamed   int    `json:"renamed"`
	Folders   int    `json:"folders"`
	Undo      string `json:"undo"`
	UndoUntil string `json:"undoUntil,omitempty"`
	At        string `json:"at"`
}

// Any is true when something changed.
func (f *FolderSummary) Any() bool {
	return f != nil && f.Added+f.Changed+f.Removed+f.Moved+f.Renamed+f.Folders > 0
}

// FolderChanges is the summary with its list (at most 500; More left out).
type FolderChanges struct {
	FolderSummary
	Files []FolderChange `json:"files"`
	More  int            `json:"more"`
}

// UndoConfirm is what an undo would lose: changes made after the task finished.
type UndoConfirm struct {
	Count int      `json:"count"`
	Files []string `json:"files"`
}

// FolderChangesReq asks for a folder task's list (answered with folder_changes).
type FolderChangesReq struct {
	T      string `json:"t"` // "folder_changes"
	TaskID string `json:"taskId"`
}
