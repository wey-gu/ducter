package protocol

// D238, 用这台手机 / Use this phone: a task borrows the person's own Android
// phone through the Ducter app on it, after asking. The same frames as
// packages/protocol/src/handset.ts. The Mac shows the ask, the phone's card
// (who is using it, Stop, Remove) and Stop on the opened task; adding it is
// done on the phone itself (Android's switch is there).

// HandsetAsk is the card "may this task borrow your phone now" (no default),
// or (D247, kind "setup") "turn on 用这台手机 there first": Go opens the guide
// on that phone, and the task goes on once it is on.
//
// D280 (kind "record"): it is the person's turn on that phone, to allow a
// screen recording in Android's own prompt there; the card counts down to
// Until (when the prompt gives up) and resolves by itself; its one button is
// 不录了 / Skip recording.
type HandsetAsk struct {
	Kind   string `json:"kind"` // "use" | "setup" | "record"
	Device string `json:"device"`
	Name   string `json:"name"`
	Until  string `json:"until,omitempty"` // D280 (record): ISO time the prompt gives up
}

// HandsetOn names the person's own phone a phone card happens on.
type HandsetOn struct {
	Device string `json:"device"`
	Name   string `json:"name"`
}

// HandsetUsing is the task using a phone now. Quiet (D253): it hasn't
// answered for a few seconds; Paused (D331): the person locked it
// ("locked"), or unlocked it and the phone asks whether to keep lending it
// ("asking").
type HandsetUsing struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
	App    string `json:"app,omitempty"`
	Quiet  bool   `json:"quiet,omitempty"`
	Paused string `json:"paused,omitempty"`
}

// HandsetCard is, on a task's card, the person's own phone it uses (D238):
// lent (Quiet when it isn't answering), paused by their lock (D331), or a Go
// given and the loan not on yet: Wait "unlock" (the phone is locked),
// "away" (the home can't reach it; Away says why: limited, old, offline,
// unknown) or "starting".
type HandsetCard struct {
	Device string `json:"device"`
	App    string `json:"app,omitempty"`
	Quiet  bool   `json:"quiet,omitempty"`
	Paused string `json:"paused,omitempty"`
	Wait   string `json:"wait,omitempty"`
	Away   string `json:"away,omitempty"`
}

// HandsetView is 用这台手机 on a phone's card.
type HandsetView struct {
	Added  bool `json:"added"`
	Able   bool `json:"able"`
	Linked bool `json:"linked"`
	// Dial (D278): its app is connected and can dial a call sheet's number.
	Dial  bool          `json:"dial,omitempty"`
	Using *HandsetUsing `json:"using,omitempty"`
}

// HandsetDialReq is 在 Pixel Fold 上拨打 / Call on Pixel Fold (D278): the
// Ducter app on the person's phone dials a call sheet's number. Answered with
// handset_dial_result (CallID, OK, DialPhone, How, Reason).
type HandsetDialReq struct {
	T      string `json:"t"` // "handset_dial"
	CallID string `json:"callId"`
	Device string `json:"device,omitempty"`
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
