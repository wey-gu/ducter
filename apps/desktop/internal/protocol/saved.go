package protocol

// 自动填充 / Autofill (D191): the mirror of packages/protocol/src/saved.ts.
// A secret goes to the home once, in SavedPut; what comes back never holds
// one: a sign-in's site and user name, a card's last four, a private
// detail only as kept.

// SavedView is one saved sign-in or card.
type SavedView struct {
	ID       string   `json:"id"`
	Handle   string   `json:"handle"`
	Kind     string   `json:"kind"` // signin | card
	Label    string   `json:"label"`
	Site     string   `json:"site,omitempty"`
	Username string   `json:"username,omitempty"`
	Brand    string   `json:"brand,omitempty"`
	Last4    string   `json:"last4,omitempty"`
	Exp      string   `json:"exp,omitempty"`
	Name     string   `json:"name,omitempty"`
	AddedAt  string   `json:"addedAt"`
	UsedAt   string   `json:"usedAt,omitempty"`
	OKSites  []string `json:"okSites,omitempty"`
}

// DetailView is one of 你的资料 / Your details: a read field with its
// value, a fill field only as kept (and a hint of its last characters).
type DetailView struct {
	Key     string   `json:"key"`
	Handle  string   `json:"handle"`
	Kept    bool     `json:"kept"`
	Value   string   `json:"value,omitempty"`
	Hint    string   `json:"hint,omitempty"`
	OKSites []string `json:"okSites,omitempty"`
}

// SavedUse is one line of 用在了哪儿 / Where it was used.
type SavedUse struct {
	At     string `json:"at"`
	Handle string `json:"handle"`
	Label  string `json:"label"`
	Site   string `json:"site"`
	What   string `json:"what"` // filled | approved | ok | declined
	TaskID string `json:"taskId,omitempty"`
	Task   string `json:"task,omitempty"`
	Amount string `json:"amount,omitempty"`
	Once   bool   `json:"once,omitempty"` // D233: a key given just this once
}

// PayAsk is a 付款 / Pay card (D191): merchant, amount, card; the security
// code goes with the Go.
type PayAsk struct {
	Site      string `json:"site"`
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	What      string `json:"what,omitempty"`
	Handle    string `json:"handle"`
	Card      string `json:"card"`
	Last4     string `json:"last4"`
	NeedsCvc  bool   `json:"needsCvc"`
	FirstHere bool   `json:"firstHere"`
}

// FillAsk is the first use of a saved sign-in or private detail on a site.
type FillAsk struct {
	Site   string `json:"site"`
	Handle string `json:"handle"`
	Label  string `json:"label"`
	Kind   string `json:"kind"` // signin | detail
}

// SavedReq asks for the Autofill list (T "saved").
type SavedReq struct {
	T string `json:"t"`
}

// SavedPut adds or changes one thing (the only frame with a secret).
type SavedPut struct {
	T    string     `json:"t"` // saved_put
	Item SavedInput `json:"item"`
}

// SavedInput is a sign-in, a card or the details. Empty secret fields on
// an edit keep what is saved.
type SavedInput struct {
	Kind     string            `json:"kind"` // signin | card | detail
	ID       string            `json:"id,omitempty"`
	Site     string            `json:"site,omitempty"`
	Username string            `json:"username,omitempty"`
	Password string            `json:"password,omitempty"`
	Name     string            `json:"name,omitempty"`
	Number   string            `json:"number,omitempty"`
	ExpMonth int               `json:"expMonth,omitempty"`
	ExpYear  int               `json:"expYear,omitempty"`
	Values   map[string]string `json:"values,omitempty"`
}

// SavedRemove deletes one (an id, or a detail's key).
type SavedRemove struct {
	T  string `json:"t"` // saved_remove
	ID string `json:"id"`
}

// DecidePay is Go on a pay card, with the card's security code.
type DecidePay struct {
	T          string `json:"t"` // "decide"
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go
	Cvc        string `json:"cvc,omitempty"`
}

// KeyView is one of 密钥 / Keys (D233): never the value; Hint is a known
// head then ••••••, or empty (the client says it is kept).
type KeyView struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"` // key
	Handle  string `json:"handle"`
	Env     string `json:"env"`
	Name    string `json:"name"`
	Hint    string `json:"hint,omitempty"`
	AddedAt string `json:"addedAt"`
	UsedAt  string `json:"usedAt,omitempty"`
}

// KeyAsk is {task} 需要一个密钥 / {task} needs a key (D233).
type KeyAsk struct {
	Env   string `json:"env"`
	Name  string `json:"name"`
	Why   string `json:"why,omitempty"`
	File  string `json:"file"`
	Saved bool   `json:"saved,omitempty"`
}

// KeyInput adds or changes one key (saved_put; the value goes once).
type KeyInput struct {
	Kind  string `json:"kind"` // key
	ID    string `json:"id,omitempty"`
	Name  string `json:"name"`
	Env   string `json:"env"`
	Value string `json:"value,omitempty"`
}

// KeyPut is saved_put with a key.
type KeyPut struct {
	T    string   `json:"t"` // saved_put
	Item KeyInput `json:"item"`
}

// DecideKey is 保存，继续 / Save and continue on a key card: the key goes
// with this Go only (kept in Autofill unless Once).
type DecideKey struct {
	T          string `json:"t"` // "decide"
	DecisionID string `json:"decisionId"`
	Option     string `json:"option"` // go
	Key        string `json:"key"`
	Once       bool   `json:"once,omitempty"`
}

// SavedAskKeys is 让任务向我要密钥 / Let tasks ask me for keys.
type SavedAskKeys struct {
	T  string `json:"t"` // saved_ask_keys
	On bool   `json:"on"`
}

// DetailFill reports whether a detail is fill-only (the partner and its
// tasks can't read it), as packages/protocol/src/saved.ts DETAIL_CLASS.
var DetailFill = map[string]bool{
	"address": true, "birthday": true, "passport_number": true, "passport_expiry": true, "known_traveler": true, "loyalty": true,
}

// DetailOrder is the details form, in the order a booking asks for them.
var DetailOrder = []string{"name", "email", "phone", "birthday", "address", "passport_number", "passport_country", "passport_expiry", "known_traveler", "loyalty", "seat", "meal"}
