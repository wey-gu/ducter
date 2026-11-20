package protocol

// D298: the partner's first words and a pasted API key (packages/protocol
// src/index.ts FirstWords, FirstStart; src/api-keys.ts KeyResult).

// FirstWords rides on the partner's first message (AIMsg.First): what it
// offers to start or continue. A tap fills the composer; it never sends.
type FirstWords struct {
	Starts []FirstStart `json:"starts"`
	// Looked: the agents whose records were read ("claude-code", "codex");
	// the client says so under the starts, with 别再看了 / Stop looking.
	Looked []string `json:"looked,omitempty"`
	// Computer (D327): the home's name, where the records were read.
	Computer string `json:"computer,omitempty"`
	// Forgot (D327): the person said to stop looking; what came from the
	// records is gone from the message.
	Forgot bool `json:"forgot,omitempty"`
	// Look (D327): the home's answer to the person's look tap, not the
	// first words themselves (no clay face over it).
	Look bool `json:"look,omitempty"`
}

// FirstStart is one offer: its words, what a tap puts in the composer, and
// whose records it came from ("claude-code" | "codex" | "pi" | "everyday"),
// or "look" (D327): the one start whose tap is the person's yes to looking
// at their records (local_agents_look), not words for the composer.
type FirstStart struct {
	ID    string `json:"id"`
	Words string `json:"words"`
	Draft string `json:"draft"`
	From  string `json:"from"`
	// Path and At (D327): how I know: the folder (~/…) and when that
	// session last changed.
	Path string `json:"path,omitempty"`
	At   string `json:"at,omitempty"`
}

// FromRecords reports whether the start came from the person's records.
func (s FirstStart) FromRecords() bool { return s.From != "everyday" && s.From != "look" }

// LocalAgentsLook (D327) is the person's tap on the look start: the home
// reads their agents' records now and answers with the offers.
type LocalAgentsLook struct {
	T  string `json:"t"` // local_agents_look
	TZ string `json:"tz,omitempty"`
}

// OutsideFolder (D327) is 这个文件夹别看了 / Leave this folder out (Hidden
// false brings it back), for Past tasks and the first words alike.
type OutsideFolder struct {
	T      string `json:"t"` // outside_folder
	Path   string `json:"path"`
	Hidden bool   `json:"hidden"`
}

// KeyAdd sends a pasted key once (never logged, never sent back).
type KeyAdd struct {
	T        string `json:"t"` // key_add
	Key      string `json:"key"`
	ClientID string `json:"clientId"`
}

// LocalAgents is 别再看了 / Stop looking (On false), or looking again.
type LocalAgents struct {
	T  string `json:"t"` // local_agents
	On bool   `json:"on"`
}

// KeyResult is what adding a key came to (key_add_result's result, and
// `ducter key add --json` with Say). It never carries the key.
type KeyResult struct {
	OK       bool   `json:"ok"`
	Provider string `json:"provider,omitempty"`
	Name     string `json:"name,omitempty"`
	Harness  string `json:"harness,omitempty"`
	// Needs "pi": the key is good and kept; this computer needs pi to use it.
	Needs string `json:"needs,omitempty"`
	// Preparing (D440): good, and the home is putting pi in its own tools
	// folder now; a second result with the same clientId follows.
	Preparing bool   `json:"preparing,omitempty"`
	Install   string `json:"install,omitempty"`
	Model     string `json:"model,omitempty"`
	Checked   *bool  `json:"checked,omitempty"`
	// Reason: shape | wrong | no_balance | limited | blocked | offline |
	// unsupported | failed.
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
	Abroad bool   `json:"abroad,omitempty"`
	// Say is the partner's words for it (the CLI's --json adds them).
	Say *Words `json:"say,omitempty"`
}

// KeyRoute is one way to get a key for someone with no AI plan and no
// key (D440, packages/protocol/src/key-routes.ts): the provider's own key
// page, what it costs and needs, three steps and one honest note. The
// home picks them by where it is (first_screen.keyRoutes); before Ducter
// runs, `ducter doctor --json` does (Report.KeyRoutes).
type KeyRoute struct {
	ID       string  `json:"id"`
	Provider string  `json:"provider"`
	Name     Words   `json:"name"`
	URL      string  `json:"url"`
	Free     bool    `json:"free"`
	Line     Words   `json:"line"`
	Steps    []Words `json:"steps"`
	Note     *Words  `json:"note,omitempty"`
}
