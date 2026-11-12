package protocol

// ---------- The opened task's workbench (D214) ----------
// One request/answer frame pair, `wb` (packages/protocol/src/workbench.ts):
// the task's changes, files, a file, and the pages it serves, read and
// written on the computer that holds its working copy.

// WbRequest is one op: files | read | write | changes | diff | revert | ports | preview.
type WbRequest struct {
	Op   string `json:"op"`
	Path string `json:"path,omitempty"`
	Text string `json:"text,omitempty"`
	Base string `json:"base,omitempty"`
	Port int    `json:"port,omitempty"`
	// D220: a simulator's op (sims, sim_frame, sim_act).
	Udid  string `json:"udid,omitempty"`
	Edge  int    `json:"edge,omitempty"`
	Act   string `json:"act,omitempty"`
	Value string `json:"value,omitempty"`
}

// WbSim is a booted iOS Simulator on the task's computer (D220).
type WbSim struct {
	Udid       string `json:"udid"`
	Name       string `json:"name"`
	OS         string `json:"os"`
	Appearance string `json:"appearance,omitempty"`
	Text       string `json:"text,omitempty"`
}

// WbReq asks the home for one op; the answer is a `wb` frame with the same ID.
type WbReq struct {
	T      string    `json:"t"` // "wb"
	ID     string    `json:"id"`
	TaskID string    `json:"taskId"`
	Req    WbRequest `json:"req"`
}

// WbEntry is a file or folder (kind d | f | l).
type WbEntry struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
	Size int64  `json:"size,omitempty"`
}

// WbChange is one file the task changed (status added | modified | deleted | renamed).
type WbChange struct {
	Path   string `json:"path"`
	Status string `json:"status"`
	From   string `json:"from,omitempty"`
	Adds   int    `json:"adds,omitempty"`
	Dels   int    `json:"dels,omitempty"`
	Binary bool   `json:"binary,omitempty"`
}

// WbPort is a page the task serves (via said | listening).
type WbPort struct {
	Port    int    `json:"port"`
	Via     string `json:"via"`
	Command string `json:"command,omitempty"`
	Title   string `json:"title,omitempty"`
}

// WbAnswer is the answer to any op; the fields its op fills are set.
type WbAnswer struct {
	Op string `json:"op"`
	// files
	Path    string    `json:"path,omitempty"`
	Entries []WbEntry `json:"entries,omitempty"`
	More    int       `json:"more,omitempty"`
	// read / write
	Size    int64   `json:"size,omitempty"`
	Version string  `json:"version,omitempty"`
	Text    *string `json:"text,omitempty"`
	Binary  bool    `json:"binary,omitempty"`
	Image   string  `json:"image,omitempty"`
	TooBig  bool    `json:"tooBig,omitempty"`
	// changes
	Kind  string     `json:"kind,omitempty"`
	Base  string     `json:"base,omitempty"`
	Files []WbChange `json:"files,omitempty"`
	// diff
	Patch     string `json:"patch,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
	// revert
	Message string `json:"message,omitempty"`
	// ports / preview
	Ports       []WbPort `json:"ports,omitempty"`
	Port        int      `json:"port,omitempty"`
	PreviewPort int      `json:"previewPort,omitempty"`
	Token       string   `json:"token,omitempty"`
	// sims / sim_frame / sim_act (D220): Image (above) is the frame or the screenshot.
	Sims []WbSim `json:"sims,omitempty"`
	Udid string  `json:"udid,omitempty"`
	W    int     `json:"w,omitempty"`
	H    int     `json:"h,omitempty"`
	Act  string  `json:"act,omitempty"`
	Sim  *WbSim  `json:"sim,omitempty"`
}
