package protocol

// D222 (design/calendar.md): the person's calendars, merged across every
// calendar account into one day. Mirrors packages/protocol/src/calendar.ts
// (field names identical). Times are ISO strings with the offset of the
// person's zone; all-day ones are YYYY-MM-DD.

// KindConnectionCall is one read or write through a connected account;
// a calendar change's Go settles from the one with its decision id.
const KindConnectionCall = "connection_call"

// CalendarRow is one calendar inside a calendar account, as Settings ›
// 账号 lists it under the tile.
type CalendarRow struct {
	ID      string `json:"id"`
	Name    string `json:"name"` // "" = the account's main calendar (主日历)
	Kind    string `json:"kind"` // main | own | shared | holidays | birthdays
	Color   string `json:"color,omitempty"`
	CanEdit bool   `json:"canEdit"`
	Seen    bool   `json:"seen"`
}

// CalEvent is one event as a glance shows it: never a description, never
// an attendee's address.
type CalEvent struct {
	Ref       string   `json:"ref"`
	Title     string   `json:"title"`
	Start     string   `json:"start"`
	End       string   `json:"end"`
	AllDay    bool     `json:"allDay,omitempty"`
	Zone      string   `json:"zone,omitempty"`
	Calendar  string   `json:"calendar"`
	Account   string   `json:"account,omitempty"`
	Color     string   `json:"color,omitempty"`
	Where     string   `json:"where,omitempty"`
	Online    bool     `json:"online,omitempty"`
	Link      string   `json:"link,omitempty"`
	People    int      `json:"people,omitempty"`
	With      []string `json:"with,omitempty"`
	Me        string   `json:"me,omitempty"` // accepted | declined | tentative | needsAction
	Mine      bool     `json:"mine,omitempty"`
	Free      bool     `json:"free,omitempty"`
	Recurring bool     `json:"recurring,omitempty"`
}

// CalDay is one day of a glance, in the person's zone.
type CalDay struct {
	Date   string     `json:"date"` // YYYY-MM-DD
	Marks  []string   `json:"marks,omitempty"`
	Events []CalEvent `json:"events"`
}

// CalGlance is 日程 / a day's glance (or a few days'), under the partner's
// words. Clashes are pairs of refs that overlap.
type CalGlance struct {
	Zone     string      `json:"zone"`
	From     string      `json:"from"`
	To       string      `json:"to"`
	Days     []CalDay    `json:"days"`
	Clashes  [][2]string `json:"clashes,omitempty"`
	Accounts int         `json:"accounts"`
	At       string      `json:"at"`
}

// CalSpan is a start and an end.
type CalSpan struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// CalChange is the Go card of a calendar change (D189's rails): what will
// change, where, when (and the other side's time), and who hears.
type CalChange struct {
	Kind      string   `json:"kind"` // create | move | cancel | respond
	Title     string   `json:"title"`
	Calendar  string   `json:"calendar"`
	Account   string   `json:"account,omitempty"`
	Color     string   `json:"color,omitempty"`
	Start     string   `json:"start"`
	End       string   `json:"end"`
	AllDay    bool     `json:"allDay,omitempty"`
	Was       *CalSpan `json:"was,omitempty"`
	TheirZone string   `json:"theirZone,omitempty"`
	TheirName string   `json:"theirName,omitempty"`
	Notify    []string `json:"notify"`
	Response  string   `json:"response,omitempty"` // accepted | declined | tentative
	Organizer string   `json:"organizer,omitempty"`
	Where     string   `json:"where,omitempty"`
	Online    bool     `json:"online,omitempty"`
	Clash     string   `json:"clash,omitempty"`
}

// CalNext is the next thing still ahead today.
type CalNext struct {
	Title string `json:"title"`
	Start string `json:"start"`
}

// CalToday is FirstScreen.today: one quiet line under the greeting, from
// the last look only.
type CalToday struct {
	Left  int      `json:"left"`
	Next  *CalNext `json:"next,omitempty"`
	Clash bool     `json:"clash,omitempty"`
}

// ConnectionCall is one read or write through a connected account
// (Bodies["connection_call"]).
type ConnectionCall struct {
	CallID       string `json:"callId"`
	ConnectionID string `json:"connectionId"`
	Connection   string `json:"connection"`
	Action       string `json:"action"`
	Op           string `json:"op"`    // read | write
	State        string `json:"state"` // done | failed | denied | needs_go | held
	TaskID       string `json:"taskId,omitempty"`
	DecisionID   string `json:"decisionId,omitempty"`
	Summary      string `json:"summary,omitempty"`
	Error        string `json:"error,omitempty"`
	Link         string `json:"link,omitempty"`
}

// CalPick reads one calendar inside a calendar account, or stops reading it.
type CalPick struct {
	T          string `json:"t"` // "cal_pick"
	ID         string `json:"id"`
	Service    string `json:"service"`
	Account    string `json:"account,omitempty"`
	CalendarID string `json:"calendarId"`
	Seen       bool   `json:"seen"`
}
