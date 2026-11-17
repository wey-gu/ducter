package protocol

import "encoding/json"

// D341, 待办来源 / To-do sources: the person's to-dos kept in other apps
// (GitHub issues and pull requests assigned to them; Obsidian Tasks lines in
// a vault on the home), which a task can be bound to. The outside app owns
// what the to-do is and whether it is open; Ducter owns how it gets done.
// The same frames as packages/protocol/src/task-sources.ts.

// SourceItemRef is one outside to-do as a task carries it (TaskCard.Source,
// a card's Src): enough to draw the chip and open it in its app.
type SourceItemRef struct {
	Source string `json:"source"`
	Kind   string `json:"kind"` // github | obsidian | jira
	// Ref: github "owner/repo#123"; obsidian "<path in the vault>::<key>".
	Ref string `json:"ref"`
	// Label is the chip's words: github "#123", obsidian the note's name.
	Label string `json:"label"`
	// Where: github the repository; obsidian the note's path in the vault.
	Where string `json:"where,omitempty"`
	Title string `json:"title"`
	URL   string `json:"url,omitempty"`
	PR    bool   `json:"pr,omitempty"`
}

// TaskSource is TaskCard.source: the bound to-do, how it stands in its app
// (open | closed | gone) and what Ducter wrote there (comment | close |
// tick | untick).
type TaskSource struct {
	SourceItemRef
	State string   `json:"state,omitempty"`
	Wrote []string `json:"wrote,omitempty"`
}

// SourceItem is an item as the composer's pick lists it.
type SourceItem struct {
	SourceItemRef
	State     string   `json:"state"` // open | closed
	Body      string   `json:"body,omitempty"`
	UpdatedAt string   `json:"updatedAt,omitempty"`
	Due       string   `json:"due,omitempty"` // YYYY-MM-DD
	Priority  string   `json:"priority,omitempty"`
	Labels    []string `json:"labels,omitempty"`
	Repeats   bool     `json:"repeats,omitempty"`
	// TaskID: the live task already bound to it (a pick opens that task).
	TaskID string `json:"taskId,omitempty"`
}

// SourceStanding is one standing go and how it came.
type SourceStanding struct {
	At    string `json:"at"`
	After int    `json:"after,omitempty"`
}

// SourceView is a source as Settings › 待办来源 / To-do sources shows it.
// State: ok | no_tool | signed_out | missing | error. WhenNew: tell | take |
// quiet. WhenDone: ask | comment | close | tick | leave.
type SourceView struct {
	ID        string           `json:"id"`
	Kind      string           `json:"kind"`
	Name      string           `json:"name"` // github: the login; obsidian: the vault's name
	State     string           `json:"state"`
	Error     string           `json:"error,omitempty"`
	Repos     []string         `json:"repos,omitempty"`
	Label     string           `json:"label,omitempty"`
	Folder    string           `json:"folder,omitempty"`
	Path      string           `json:"path,omitempty"`
	WhenNew   string           `json:"whenNew"`
	WhenDone  string           `json:"whenDone"`
	Standing  *SourceStandings `json:"standing,omitempty"`
	Open      int              `json:"open,omitempty"`
	Taken     int              `json:"taken,omitempty"`
	CheckedAt string           `json:"checkedAt,omitempty"`
}

// SourceStandings are a source's standing goes: to take new ones, and to
// write back, each after the person did it twice in 14 days (or set here).
type SourceStandings struct {
	Take  *SourceStanding `json:"take,omitempty"`
	Write *SourceStanding `json:"write,omitempty"`
}

// SourceErr is a source that couldn't be read for a pick, and why (English,
// for Details).
type SourceErr struct {
	Source string `json:"source"`
	Error  string `json:"error"`
}

// SourcesFoundGitHub is gh on the home: ok | no_tool | signed_out.
type SourcesFoundGitHub struct {
	State    string `json:"state"`
	Login    string `json:"login,omitempty"`
	Computer string `json:"computer,omitempty"`
}

// FoundVault is a vault Obsidian lists on the home (name and folder only).
type FoundVault struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// SourcesFound is what the home could add without asking anything.
type SourcesFound struct {
	GitHub *SourcesFoundGitHub `json:"github,omitempty"`
	Vaults []FoundVault        `json:"vaults"`
}

// SourcesView is the sources frame.
type SourcesView struct {
	Sources []SourceView `json:"sources"`
	Found   SourcesFound `json:"found"`
}

// SourceAsk is a card about a bound to-do (Decision.Src): kind write (a
// comment, and close), closed (closed in its app: stop?), trust (the
// standing go offered once).
type SourceAsk struct {
	Kind   string        `json:"kind"`
	Item   SourceItemRef `json:"item"`
	Text   string        `json:"text,omitempty"`
	Close  bool          `json:"close,omitempty"`
	TaskID string        `json:"taskId,omitempty"`
	Trust  string        `json:"trust,omitempty"` // take | write
}

// SourcesFrame is what a sources, source_items_result or source_result
// frame carried, decoded on its own (its items aren't Autofill's).
type SourcesFrame struct {
	// sources
	View *SourcesView
	// source_items_result
	ClientID string
	Items    []SourceItem
	Errors   []SourceErr
	// source_result: Op add | set | remove; Reason no_tool | signed_out |
	// missing | exists | unknown.
	Op     string
	OK     bool
	ID     string
	Reason string
}

// SourcesReq subscribes to the sources (T "sources").
type SourcesReq struct {
	T string `json:"t"`
}

// SourceAddReq is 加上 / Add: github (the home's gh), or an Obsidian vault
// by its folder on the home.
type SourceAddReq struct {
	T    string `json:"t"` // "source_add"
	Kind string `json:"kind"`
	Path string `json:"path,omitempty"`
}

// SourceSetReq changes one source's choices.
type SourceSetReq struct {
	T        string   `json:"t"` // "source_set"
	ID       string   `json:"id"`
	WhenNew  string   `json:"whenNew,omitempty"`
	WhenDone string   `json:"whenDone,omitempty"`
	Folder   *string  `json:"folder,omitempty"`
	Label    *string  `json:"label,omitempty"`
	Repos    []string `json:"repos,omitempty"`
}

// SourceRemoveReq is 移除 / Remove.
type SourceRemoveReq struct {
	T  string `json:"t"` // "source_remove"
	ID string `json:"id"`
}

// SourceItemsReq is the composer's 从待办里选 / Pick from your to-dos.
type SourceItemsReq struct {
	T        string `json:"t"` // "source_items"
	ID       string `json:"id,omitempty"`
	Query    string `json:"query,omitempty"`
	ClientID string `json:"clientId,omitempty"`
}

// decodeSources reads the three D341 frames on their own.
func decodeSources(data []byte, f ServerFrame) (ServerFrame, error) {
	var raw struct {
		Sources  *[]SourceView `json:"sources"`
		Found    *SourcesFound `json:"found"`
		ClientID string        `json:"clientId"`
		Items    []SourceItem  `json:"items"`
		Errors   []SourceErr   `json:"errors"`
		Op       string        `json:"op"`
		OK       bool          `json:"ok"`
		ID       string        `json:"id"`
		Reason   string        `json:"reason"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return f, err
	}
	s := &SourcesFrame{ClientID: raw.ClientID, Items: raw.Items, Errors: raw.Errors, Op: raw.Op, OK: raw.OK, ID: raw.ID, Reason: raw.Reason}
	if f.T == "sources" {
		v := &SourcesView{}
		if raw.Sources != nil {
			v.Sources = *raw.Sources
		}
		if raw.Found != nil {
			v.Found = *raw.Found
		}
		s.View = v
	}
	f.SavedItems = nil
	f.Sources = s
	return f, nil
}

// SourceKindName is an app's own name (GitHub, Obsidian, Jira).
func SourceKindName(kind string) string {
	switch kind {
	case "github":
		return "GitHub"
	case "obsidian":
		return "Obsidian"
	case "jira":
		return "Jira"
	}
	return kind
}
