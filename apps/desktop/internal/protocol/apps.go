package protocol

import "encoding/json"

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
	Change  string `json:"change"` // made | changed | data
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
