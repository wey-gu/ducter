package protocol

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
)

// D405: 小应用 / Apps (packages/protocol/src/apps.ts). An app the partner
// made: its card under the partner's words, its row in Made for you, and its
// own window, where the home's document runs in a web view with no network
// but this app's own scheme (the bridge: /bridge, /events).

// AppMeta is one app as the list names it.
type AppMeta struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Persona string `json:"persona"`
	Made    string `json:"made"`
	Updated string `json:"updated"`
	Version int    `json:"version"`
	Size    int    `json:"size"`
	Opened  string `json:"opened,omitempty"`
	Ask     string `json:"ask,omitempty"`
	Note    string `json:"note,omitempty"`
	Back    bool   `json:"back,omitempty"`
	// Task (D407): the routine task that keeps it current; Kind "reviews"
	// is the review board Ducter made from its template.
	Task *AppTask `json:"task,omitempty"`
	Kind string   `json:"kind,omitempty"`
	// D410: the app's own line for its shelf tile (ducter.summary), its
	// mark and clay tint (else the window and a tint from its id), pinned.
	Summary string `json:"summary,omitempty"`
	Icon    string `json:"icon,omitempty"`
	Tint    string `json:"tint,omitempty"`
	Pinned  bool   `json:"pinned,omitempty"`
	// D422: its page threw on a version; what it is doing now (the home's).
	Broke *AppBroke `json:"broke,omitempty"`
	Live  *AppLive  `json:"live,omitempty"`
}

// AppTints are the shelf's clay tints (D410: the person's muted clays, D285).
var AppTints = []string{"clay", "sand", "sage", "mist", "lilac", "stone"}

// TintOf is an app's tint: its own, else one picked from its id (the same
// hash as packages/protocol/src/apps.ts appTint).
func (m AppMeta) TintOf() string {
	for _, t := range AppTints {
		if m.Tint == t {
			return t
		}
	}
	var h uint32
	for _, ch := range m.ID {
		h = h*31 + uint32(ch)
	}
	return AppTints[h%uint32(len(AppTints))]
}

// IconOf is an app's mark (D422, the web's appIcon): its own, else the
// review board's board, else the one its name or the sentence it was made
// from points to (出差花销: a suitcase), else the window.
func (m AppMeta) IconOf() string {
	if _, ok := AppGlyphs[m.Icon]; ok && m.Icon != "window" {
		return m.Icon
	}
	if m.Kind == "reviews" {
		return "board"
	}
	if i := AppIconFor(m.Name); i != "" {
		return i
	}
	if i := AppIconFor(m.Ask); i != "" {
		return i
	}
	return "window"
}

var (
	iconWordsOnce sync.Once
	iconWords     []*regexp.Regexp
)

// AppIconFor is the mark some words point to (AppIconWords, in order), or "".
func AppIconFor(words string) string {
	if strings.TrimSpace(words) == "" {
		return ""
	}
	iconWordsOnce.Do(func() {
		for _, w := range AppIconWords {
			iconWords = append(iconWords, regexp.MustCompile("(?i)"+w[1]))
		}
	})
	for i, re := range iconWords {
		if re.MatchString(words) {
			return AppIconWords[i][0]
		}
	}
	return ""
}

// AppBroke is an app's page throwing on a version (D422).
type AppBroke struct {
	Text    string `json:"text"`
	At      string `json:"at"`
	Version int    `json:"version"`
}

// AppLive is what an app is doing now, worked out by the home (D422, the
// web's AppLive): kept current by a task, being changed, broken, the old look.
type AppLive struct {
	Kept     *AppKept    `json:"kept,omitempty"`
	Changing *struct{}   `json:"changing,omitempty"`
	Broke    *AppLiveErr `json:"broke,omitempty"`
	Old      bool        `json:"old,omitempty"`
}

// AppKept is the task that keeps an app current, as Ongoing has it.
type AppKept struct {
	Task  string `json:"task"`
	Title string `json:"title"`
	State string `json:"state"` // running | resting | paused | failed
	Last  string `json:"last,omitempty"`
	Next  string `json:"next,omitempty"`
	Why   string `json:"why,omitempty"`
	Of    struct {
		Kind string `json:"kind"`
		ID   string `json:"id"`
	} `json:"of"`
}

// AppLiveErr is the first words of what broke.
type AppLiveErr struct {
	Text string `json:"text"`
}

// StateOf is the one thing an app's tile and window say (D422, the web's
// appState), the most urgent first.
func (m AppMeta) StateOf() string {
	l := m.Live
	switch {
	case l == nil:
		return "plain"
	case l.Changing != nil:
		return "changing"
	case l.Broke != nil:
		return "broke"
	case l.Kept != nil && l.Kept.State == "failed":
		return "kept_failed"
	case l.Kept != nil && l.Kept.State == "paused":
		return "kept_paused"
	case l.Kept != nil && l.Kept.State == "running":
		return "kept_running"
	case l.Old:
		return "old"
	case l.Kept != nil:
		return "kept_next"
	}
	return "plain"
}

// AppErrorReq is the app's page throwing (D422): kept on that version.
type AppErrorReq struct {
	T       string `json:"t"` // app_error
	ID      string `json:"id"`
	Version int    `json:"version"`
	Text    string `json:"text"`
}

// AppIdea is a first app to make while the shelf is empty (D410): what the
// person could say, in both languages, and why this one.
type AppIdea struct {
	Say  Words  `json:"say"`
	Why  *Words `json:"why,omitempty"`
	Icon string `json:"icon"`
}

// AppSetReq is the shelf's 「⋯」: rename, pin, stop a routine updating it (D410).
type AppSetReq struct {
	T      string  `json:"t"` // app_set
	ID     string  `json:"id"`
	Name   *string `json:"name,omitempty"`
	Pinned *bool   `json:"pinned,omitempty"`
	Untask bool    `json:"untask,omitempty"`
}

// AppIDReq is app_back, app_remove or app_restore (D410: 撤销 a delete).
type AppIDReq struct {
	T  string `json:"t"`
	ID string `json:"id"`
}

// AppSummaryReq is the app's own line for its tile (ducter.summary, D410).
type AppSummaryReq struct {
	T    string `json:"t"` // app_summary
	ID   string `json:"id"`
	Text string `json:"text"`
}

// AppTask names the task that fills an app each round (D407).
type AppTask struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// BoardAsk is Ducter's one offer to keep a repeating task's rounds on a
// board (D407): kind "reviews" (the review board, made on Go) or "reports".
type BoardAsk struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
	Kind   string `json:"kind"`
}

// OngoingApp is the app an Ongoing card opens (D407).
type OngoingApp struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AppOpen is an app as a client opens it: its document (bridge included) and data.
type AppOpen struct {
	AppMeta
	Doc  string                     `json:"doc"`
	Data map[string]json.RawMessage `json:"data"`
}

// AppCard is the card a partner message carries (ai_msg.app).
type AppCard struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version int    `json:"version"`
	Change  string `json:"change"` // made | changed | data | removed (D410)
}

// AppRef names the app a person's message is about, or that asked (Ask).
type AppRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Ask  string `json:"ask,omitempty"`
}

// AppAnswer marks a partner message as the answer to an app's ask.
type AppAnswer struct {
	ID  string `json:"id"`
	Ask string `json:"ask"`
}

// AppOpenReq asks for one app's document (answered by app_open).
type AppOpenReq struct {
	T         string `json:"t"` // app_open
	ID        string `json:"id"`
	Transport string `json:"transport"`
	Dark      bool   `json:"dark,omitempty"`
	Lang      string `json:"lang,omitempty"`
}

// AppPutReq is a key the app wrote (Value null deletes it).
type AppPutReq struct {
	T     string          `json:"t"` // app_put
	ID    string          `json:"id"`
	Key   string          `json:"key"`
	Value json.RawMessage `json:"value"`
}

// AppAskReq is the app's ducter.ask.
type AppAskReq struct {
	T    string `json:"t"` // app_ask
	ID   string `json:"id"`
	Text string `json:"text"`
	Ref  string `json:"ref"`
}

// AppsFrame is apps, app_open, app_data or app_ask_refused.
type AppsFrame struct {
	T     string          `json:"t"`
	Apps  []AppMeta       `json:"apps,omitempty"`
	Ideas []AppIdea       `json:"ideas,omitempty"`
	ID    string          `json:"id,omitempty"`
	App   *AppOpen        `json:"app,omitempty"`
	Gone  bool            `json:"gone,omitempty"`
	Key   string          `json:"key,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
	By    string          `json:"by,omitempty"`
	Ref   string          `json:"ref,omitempty"`
	Why   string          `json:"why,omitempty"`
}

// decodeApps reads the apps frames on their own.
func decodeApps(data []byte, f ServerFrame) (ServerFrame, error) {
	var a AppsFrame
	if err := json.Unmarshal(data, &a); err != nil {
		return f, err
	}
	f.SavedItems = nil
	f.AppsF = &a
	return f, nil
}
