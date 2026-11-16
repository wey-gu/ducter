package protocol

import "encoding/json"

// D285: 做过的事 / Past tasks, the mirror of packages/protocol/src/past.ts.

// PastGlyphs are the pictures a person can give a task: literal kinds of
// work, drawn (never emoji, D211).
var PastGlyphs = []string{"fix", "build", "look", "review", "write", "ship", "data", "talk", "errand", "idea"}

// PastTints are the clay tints a picture sits on: the person's own
// grouping, never a state's colour.
var PastTints = []string{"clay", "sand", "sage", "mist", "lilac", "stone"}

// The limits of a mark (PAST_TAGS_MAX, PAST_TAG_LEN, PAST_NAME_LEN).
const (
	PastTagsMax = 5
	PastTagLen  = 24
	PastNameLen = 80
)

// PastMark is the person's marks on one task, kept per persona on the home.
type PastMark struct {
	Name    string   `json:"name,omitempty"`
	Starred bool     `json:"starred,omitempty"`
	Tags    []string `json:"tags,omitempty"`
	Glyph   string   `json:"glyph,omitempty"`
	Tint    string   `json:"tint,omitempty"`
	At      string   `json:"at,omitempty"`
}

// PastHit is where a search matched, with a short piece of the text.
type PastHit struct {
	Field string `json:"field"` // name | title | tag | words | report | file | branch | project | agent | brief
	Text  string `json:"text"`
}

// PastFrom is the task a task was seeded from (New task from this).
type PastFrom struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
}

// PastItem is one task as Past tasks shows it.
type PastItem struct {
	TaskID     string      `json:"taskId"`
	Title      string      `json:"title"`
	Original   string      `json:"original,omitempty"`
	Project    string      `json:"project"`
	Harness    string      `json:"harness"`
	Model      string      `json:"model,omitempty"`
	Computer   string      `json:"computer,omitempty"`
	OpenedAt   string      `json:"openedAt"`
	UpdatedAt  string      `json:"updatedAt"`
	Attention  Attention   `json:"attention"`
	Outcome    string      `json:"outcome,omitempty"`
	Changes    *DiffStat   `json:"changes,omitempty"`
	Branch     string      `json:"branch,omitempty"`
	Integrated *Integrated `json:"integrated,omitempty"`
	Kind       string      `json:"kind"`
	Mark       *PastMark   `json:"mark,omitempty"`
	Hit        *PastHit    `json:"hit,omitempty"`
	From       *PastFrom   `json:"from,omitempty"`
	// Outside: D299, carried on from a session the person ran outside Ducter.
	Outside *PastOutside `json:"outside,omitempty"`
}

// PastOutside is the agent and the day of the outside session a task carries on (D299).
type PastOutside struct {
	Agent     string `json:"agent"`
	StartedAt string `json:"startedAt"`
}

// OutsideAgents are the agents whose own sessions Past tasks lists (D299).
var OutsideAgents = []string{"claude-code", "codex", "pi"}

// OutsideItem is one session the person ran in their own agent on the
// home, outside Ducter (D299: 也在这台电脑上 / Also on this computer).
type OutsideItem struct {
	Agent     string   `json:"agent"`
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Ask       string   `json:"ask,omitempty"`
	Project   string   `json:"project"`
	Cwd       string   `json:"cwd"`
	Branch    string   `json:"branch,omitempty"`
	Model     string   `json:"model,omitempty"`
	StartedAt string   `json:"startedAt"`
	UpdatedAt string   `json:"updatedAt"`
	Kind      string   `json:"kind"`
	Hit       *PastHit `json:"hit,omitempty"`
	Gone      bool     `json:"gone,omitempty"`
}

// OutsideSource is one agent Past tasks read, its count, and whether the
// person hid it.
type OutsideSource struct {
	Agent  string `json:"agent"`
	N      int    `json:"n"`
	Hidden bool   `json:"hidden"`
}

// OutsideContinue carries an outside session on as a task (outside_continue),
// answered with outside_adopted.
type OutsideContinue struct {
	T       string `json:"t"` // outside_continue
	Agent   string `json:"agent"`
	ID      string `json:"id"`
	Harness string `json:"harness,omitempty"`
	Model   string `json:"model,omitempty"`
}

// OutsideHide stops (or starts again) showing one agent's sessions (outside_hide).
type OutsideHide struct {
	T      string `json:"t"` // outside_hide
	Agent  string `json:"agent"`
	Hidden bool   `json:"hidden"`
}

// PastQuery narrows Past tasks; every field optional, together they AND.
type PastQuery struct {
	Q       string  `json:"q,omitempty"`
	Project *string `json:"project,omitempty"` // "" is a real project: none
	Harness string  `json:"harness,omitempty"`
	Tag     string  `json:"tag,omitempty"`
	Starred bool    `json:"starred,omitempty"`
	Since   string  `json:"since,omitempty"`
	Before  string  `json:"before,omitempty"`
	Limit   int     `json:"limit,omitempty"`
}

// PastFacets are the projects, agents and tags in use, most used first.
type PastFacets struct {
	Projects []struct {
		Name string `json:"name"`
		N    int    `json:"n"`
	} `json:"projects"`
	Harnesses []struct {
		Harness string `json:"harness"`
		N       int    `json:"n"`
	} `json:"harnesses"`
	Tags []struct {
		Tag string `json:"tag"`
		N   int    `json:"n"`
	} `json:"tags"`
}

// PastRange is the dates the time words in q meant.
type PastRange struct {
	Since  string `json:"since"`
	Before string `json:"before"`
	Words  string `json:"words"`
}

// PastFrame is past_result (ID, Items, Total, Facets, Suggestions, Range)
// or past_marked (TaskID, Mark; nil = no marks left).
type PastFrame struct {
	T           string     `json:"t"`
	ID          string     `json:"id,omitempty"`
	Items       []PastItem `json:"items"`
	Total       int        `json:"total"`
	Facets      PastFacets `json:"facets"`
	Suggestions []string   `json:"suggestions"`
	Range       *PastRange `json:"range,omitempty"`
	TaskID      string     `json:"taskId,omitempty"`
	Mark        *PastMark  `json:"mark"`
	// D299: past_result's outside sessions and sources; outside_adopted
	// (Agent, ID the session's, OK, TaskID, Message) and outside_hidden
	// (Agent, Hidden).
	Outside []OutsideItem   `json:"outside,omitempty"`
	Sources []OutsideSource `json:"sources,omitempty"`
	Agent   string          `json:"agent,omitempty"`
	OK      bool            `json:"ok,omitempty"`
	Message string          `json:"message,omitempty"`
	Hidden  bool            `json:"hidden,omitempty"`
	// Ongoing is ongoing_result's items (ongoing.go).
	Ongoing []OngoingItem `json:"-"`
}

// PastReq asks for Past tasks (T "past"), answered with past_result.
type PastReq struct {
	T     string    `json:"t"`
	ID    string    `json:"id,omitempty"`
	Query PastQuery `json:"query"`
}

// PastMarkPatch changes a mark: a nil field leaves it, a set one changes
// it; ClearName / ClearGlyph send null (clears that field).
type PastMarkPatch struct {
	Name    *string  `json:"-"`
	Starred *bool    `json:"-"`
	Tags    []string `json:"-"`
	SetTags bool     `json:"-"`
	Glyph   *string  `json:"-"`
	Tint    *string  `json:"-"`
}

// MarshalJSON writes "" as null for name, glyph and tint (they clear).
func (p PastMarkPatch) MarshalJSON() ([]byte, error) {
	m := map[string]any{}
	orNull := func(s *string) any {
		if *s == "" {
			return nil
		}
		return *s
	}
	if p.Name != nil {
		m["name"] = orNull(p.Name)
	}
	if p.Starred != nil {
		m["starred"] = *p.Starred
	}
	if p.SetTags {
		tags := p.Tags
		if tags == nil {
			tags = []string{}
		}
		m["tags"] = tags
	}
	if p.Glyph != nil {
		m["glyph"] = orNull(p.Glyph)
	}
	if p.Tint != nil {
		m["tint"] = orNull(p.Tint)
	}
	return json.Marshal(m)
}

// PastMarkReq is past_mark: the person's marks on one task.
type PastMarkReq struct {
	T      string        `json:"t"` // past_mark
	TaskID string        `json:"taskId"`
	Patch  PastMarkPatch `json:"patch"`
}

// PastContinue is 接着做 / Continue (past_continue), answered with
// action_result (action "continue").
type PastContinue struct {
	T       string `json:"t"` // past_continue
	TaskID  string `json:"taskId"`
	Harness string `json:"harness,omitempty"`
	Model   string `json:"model,omitempty"`
	Words   string `json:"words,omitempty"`
}

// decodePast reads a past frame on its own: its items are not Autofill's
// (ServerFrame's "items"), so they never land in SavedItems.
func decodePast(data []byte, f ServerFrame) (ServerFrame, error) {
	var p PastFrame
	if err := json.Unmarshal(data, &p); err != nil {
		return f, err
	}
	f.SavedItems = nil
	f.Past = &p
	return f, nil
}
