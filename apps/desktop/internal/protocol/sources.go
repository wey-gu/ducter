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
	// Author (D357): github, who opened it (a review request's author).
	Author string `json:"author,omitempty"`
	// Review (D357): a PR waiting for the person's review, opened, never taken.
	Review bool `json:"review,omitempty"`
}

// SourceGlance (D357) is one of the few to-dos On hand shows first, and why:
// review | mentioned | due | recent.
type SourceGlance struct {
	SourceItem
	Why string `json:"why"`
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
	Open      int              `json:"open,omitempty"` // github: search's true total, not the page read
	AtLeast   bool             `json:"openAtLeast,omitempty"`
	Review    int              `json:"review,omitempty"` // github: PRs waiting for the person's review
	Taken     int              `json:"taken,omitempty"`
	CheckedAt string           `json:"checkedAt,omitempty"` // counts are shown only once it is set
	Looking   bool             `json:"looking,omitempty"`   // a look is running now
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
	// Glance (D357): the few On hand shows (at most three), none with a live task.
	Glance []SourceGlance `json:"glance,omitempty"`
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
	// D357: On hand's fold: the page answered, whether another follows, the
	// chips (repositories or folders, tags), and GitHub's rate limit.
	Page    int
	More    bool
	Wheres  []string
	Tags    []string
	Limited bool
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
	T        string  `json:"t"` // "source_set"
	ID       string  `json:"id"`
	WhenNew  string  `json:"whenNew,omitempty"`
	WhenDone string  `json:"whenDone,omitempty"`
	Folder   *string `json:"folder,omitempty"`
	Label    *string `json:"label,omitempty"`
	// Repos: nil leaves them as they are; empty (not nil) clears them (D348).
	Repos []string `json:"repos"`
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
	// D357: On hand's fold, a page at a time: a repository or a vault's top
	// folder (Where, "" the vault's top when WhereSet), a tag, or the PRs
	// waiting for the person's review.
	Page   int     `json:"page,omitempty"`
	Where  *string `json:"where,omitempty"`
	Tag    string  `json:"tag,omitempty"`
	Review bool    `json:"review,omitempty"`
}

// decodeSources reads the three D341 frames on their own.
func decodeSources(data []byte, f ServerFrame) (ServerFrame, error) {
	var raw struct {
		Sources  *[]SourceView  `json:"sources"`
		Found    *SourcesFound  `json:"found"`
		ClientID string         `json:"clientId"`
		Items    []SourceItem   `json:"items"`
		Errors   []SourceErr    `json:"errors"`
		Op       string         `json:"op"`
		OK       bool           `json:"ok"`
		ID       string         `json:"id"`
		Reason   string         `json:"reason"`
		Glance   []SourceGlance `json:"glance"`
		Page     int            `json:"page"`
		More     bool           `json:"more"`
		Wheres   []string       `json:"wheres"`
		Tags     []string       `json:"tags"`
		Limited  bool           `json:"limited"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return f, err
	}
	s := &SourcesFrame{ClientID: raw.ClientID, Items: raw.Items, Errors: raw.Errors, Op: raw.Op, OK: raw.OK, ID: raw.ID, Reason: raw.Reason, Page: raw.Page, More: raw.More, Wheres: raw.Wheres, Tags: raw.Tags, Limited: raw.Limited}
	if f.T == "sources" {
		v := &SourcesView{}
		if raw.Sources != nil {
			v.Sources = *raw.Sources
		}
		if raw.Found != nil {
			v.Found = *raw.Found
		}
		v.Glance = raw.Glance
		s.View = v
	}
	f.SavedItems = nil
	f.Sources = s
	return f, nil
}

// BrowsePage (D357) is a page of On hand's fold (BROWSE_PAGE).
const BrowsePage = 30

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
