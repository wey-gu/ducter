package protocol

// D238, 用这台手机 / Use this phone: a task borrows the person's own Android
// phone through the Ducter app on it, after asking. The same frames as
// packages/protocol/src/handset.ts. The Mac shows the ask, the phone's card
// (who is using it, Stop, Remove) and Stop on the opened task; adding it is
// done on the phone itself (Android's switch is there).

// HandsetAsk is the card "may this task borrow your phone now" (no default).
type HandsetAsk struct {
	Kind   string `json:"kind"` // "use"
	Device string `json:"device"`
	Name   string `json:"name"`
}

// HandsetOn names the person's own phone a phone card happens on.
type HandsetOn struct {
	Device string `json:"device"`
	Name   string `json:"name"`
}

// HandsetUsing is the task using a phone now.
type HandsetUsing struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
	App    string `json:"app,omitempty"`
}

// HandsetView is 用这台手机 on a phone's card.
type HandsetView struct {
	Added  bool          `json:"added"`
	Able   bool          `json:"able"`
	Linked bool          `json:"linked"`
	Using  *HandsetUsing `json:"using,omitempty"`
}

// HandsetSetReq adds (on the phone only) or removes 用这台手机.
type HandsetSetReq struct {
	T      string `json:"t"` // "handset_set"
	Device string `json:"device,omitempty"`
	On     bool   `json:"on"`
}

// HandsetStopReq is 停下 / Stop: the task stops using the person's phone.
type HandsetStopReq struct {
	T      string `json:"t"` // "handset_stop"
	TaskID string `json:"taskId"`
}
