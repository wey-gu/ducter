package protocol

// D235, 用电脑 / Use the computer: a task uses the apps on one of the
// person's Macs through Ducter's app tools (cua-driver underneath). The same
// frames as packages/protocol/src/computer-use.ts.

// ComputerPerms are macOS's two switches for cua-driver on that Mac.
type ComputerPerms struct {
	Accessibility bool `json:"accessibility"`
	Screen        bool `json:"screen"`
}

// ComputerAsk is an app task's decision: a Go for one action that commits
// (Kind "go": App, Label, Effect), or the person's own turn (Kind "user").
type ComputerAsk struct {
	Kind   string `json:"kind"`
	App    string `json:"app,omitempty"`
	Label  string `json:"label,omitempty"`
	Effect string `json:"effect,omitempty"`
}

// Computing says a task is using the person's apps on a computer.
type Computing struct {
	Device string `json:"device"`
	App    string `json:"app,omitempty"`
}

// ComputerGrantReq opens cua-driver's guide to the two switches on that Mac.
type ComputerGrantReq struct {
	T      string `json:"t"` // "computer_grant"
	Device string `json:"device"`
}

// ComputerStopReq is 停下 / Stop: the task stops using the person's apps.
type ComputerStopReq struct {
	T      string `json:"t"` // "computer_stop"
	TaskID string `json:"taskId"`
}
