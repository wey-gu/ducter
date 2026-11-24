package protocol

// 密码和银行卡 / Passwords & cards (Autofill in code) (D191): the mirror of packages/protocol/src/saved.ts.
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

// CheckoutAsk (D436): 去付款 / Go to checkout. The errand stopped at the
// checkout; the site is the page's host, read by code. Go is 付好了 / I've
// paid (the person paid in the live view themselves); Hold is 先不买 / Not
// now. No default, ever.
type CheckoutAsk struct {
	Site     string     `json:"site"`
	URL      string     `json:"url"`
	What     string     `json:"what"`
	Total    string     `json:"total,omitempty"`
	Currency string     `json:"currency,omitempty"`
	Items    []string   `json:"items,omitempty"`
	Media    []MediaRef `json:"media,omitempty"`
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
	// D539: a key Ducter keeps on a computer (kept_keys): where it was
	// copied from, and when.
	From string `json:"from,omitempty"`
	At   string `json:"at,omitempty"`
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

// KeyComputer is one computer in a copy (D539): its device id ("local" =
// the home) and the name the person knows it by.
type KeyComputer struct {
	Device string `json:"device"`
	Name   string `json:"name"`
}

// CopyKeyAsk is the 复制密钥 / Copy a key card (D539): set only by
// Ducter's code, never by a task's report.
type CopyKeyAsk struct {
	Env     string        `json:"env"`
	Name    string        `json:"name"`
	From    KeyComputer   `json:"from"`
	To      []KeyComputer `json:"to"`
	Source  string        `json:"source"` // shell | ducter
	Why     string        `json:"why,omitempty"`
	TaskIDs []string      `json:"taskIds,omitempty"`
}

// KeyCopyFailed is one computer a copy couldn't reach, and why
// (offline | old | gone | failed).
type KeyCopyFailed struct {
	Name string `json:"name"`
	Why  string `json:"why"`
}

// KeyCopy is the key_copy event (D539): names only, never a value.
type KeyCopy struct {
	DecisionID string          `json:"decisionId,omitempty"`
	Env        string          `json:"env"`
	Name       string          `json:"name"`
	From       string          `json:"from"`
	To         []string        `json:"to"`
	Failed     []KeyCopyFailed `json:"failed,omitempty"`
	Removed    string          `json:"removed,omitempty"`
	By         string          `json:"by"`
}

// KeptKeysReq asks a computer for the keys Ducter keeps there (D539).
type KeptKeysReq struct {
	T      string `json:"t"` // kept_keys
	Device string `json:"device"`
}

// KeptKeyRemove forgets one there.
type KeptKeyRemove struct {
	T      string `json:"t"` // kept_key_remove
	Device string `json:"device"`
	Env    string `json:"env"`
}
