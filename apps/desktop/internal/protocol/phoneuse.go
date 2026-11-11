package protocol

// D217, 用手机 / Use a phone: Ducter's own phone (an Android emulator on a
// Mac). The same frames as packages/protocol/src/phone-use.ts.

// PhoneAsk is a phone task's decision: a Go for one tap that commits
// (Kind "go": App, Label, Effect), or the user's own turn on the phone
// (Kind "user": Go is 好了 / Done in the live view).
type PhoneAsk struct {
	Kind   string `json:"kind"`
	App    string `json:"app,omitempty"`
	Name   string `json:"name,omitempty"` // the app as the user knows it (never its id)
	Label  string `json:"label,omitempty"`
	Effect string `json:"effect,omitempty"`
}

// PhoneInstallStep is how far installing the phone is.
type PhoneInstallStep struct {
	Step  string `json:"step"` // download | unpack | phone
	Done  int64  `json:"done,omitempty"`
	Total int64  `json:"total,omitempty"`
}

// PhoneLicense is one of Google's licenses, its text as published now.
type PhoneLicense struct {
	ID     string            `json:"id"`
	Title  map[string]string `json:"title"`
	Text   string            `json:"text"`
	Sha256 string            `json:"sha256"`
}

// PhonePackage is one download of the phone.
type PhonePackage struct {
	Label   map[string]string `json:"label"`
	Version string            `json:"version"`
	Size    int64             `json:"size"`
}

// Accepted is a license the person agreed to, by the text they saw.
type Accepted struct {
	ID     string `json:"id"`
	Sha256 string `json:"sha256"`
}

type PhoneTermsReq struct {
	T      string `json:"t"` // "phone_terms"
	Device string `json:"device,omitempty"`
}

type PhoneInstallReq struct {
	T        string     `json:"t"` // "phone_install"
	Device   string     `json:"device,omitempty"`
	Accepted []Accepted `json:"accepted"`
}

type PhoneEraseReq struct {
	T       string `json:"t"` // "phone_erase"
	Device  string `json:"device,omitempty"`
	KeepSdk bool   `json:"keepSdk"`
}

// PhoneOpenReq opens the live view: Mode watch | takeover | signin.
type PhoneOpenReq struct {
	T          string `json:"t"` // "phone_open"
	Device     string `json:"device,omitempty"`
	TaskID     string `json:"taskId,omitempty"`
	DecisionID string `json:"decisionId,omitempty"`
	Mode       string `json:"mode"`
}

// PhoneInput is the user's input in their turn; X, Y are fractions.
type PhoneInput struct {
	Kind string  `json:"kind"` // tap | swipe | key | text
	X    float64 `json:"x,omitempty"`
	Y    float64 `json:"y,omitempty"`
	Long bool    `json:"long,omitempty"`
	X1   float64 `json:"x1,omitempty"`
	Y1   float64 `json:"y1,omitempty"`
	X2   float64 `json:"x2,omitempty"`
	Y2   float64 `json:"y2,omitempty"`
	Ms   int     `json:"ms,omitempty"`
	Key  string  `json:"key,omitempty"` // back | home | recents | enter | delete
	Text string  `json:"text,omitempty"`
}

type PhoneInputReq struct {
	T     string     `json:"t"` // "phone_input"
	ID    string     `json:"id"`
	Input PhoneInput `json:"input"`
}

type PhoneAckReq struct {
	T   string `json:"t"` // "phone_ack"
	ID  string `json:"id"`
	Seq int64  `json:"seq"`
}

type PhoneTurnReq struct {
	T    string `json:"t"` // "phone_turn"
	ID   string `json:"id"`
	Mine bool   `json:"mine"`
}

type PhonePauseReq struct {
	T      string `json:"t"` // "phone_pause"
	ID     string `json:"id"`
	Paused bool   `json:"paused"`
}

type PhoneCloseReq struct {
	T    string `json:"t"` // "phone_close"
	ID   string `json:"id"`
	Done bool   `json:"done,omitempty"`
}
