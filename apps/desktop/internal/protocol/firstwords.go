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
}

// FirstStart is one offer: its words, what a tap puts in the composer, and
// whose records it came from ("claude-code" | "codex" | "everyday").
type FirstStart struct {
	ID    string `json:"id"`
	Words string `json:"words"`
	Draft string `json:"draft"`
	From  string `json:"from"`
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
	Needs   string `json:"needs,omitempty"`
	Install string `json:"install,omitempty"`
	Model   string `json:"model,omitempty"`
	Checked *bool  `json:"checked,omitempty"`
	// Reason: shape | wrong | no_balance | limited | blocked | offline |
	// unsupported | failed.
	Reason string `json:"reason,omitempty"`
	Detail string `json:"detail,omitempty"`
	Abroad bool   `json:"abroad,omitempty"`
	// Say is the partner's words for it (the CLI's --json adds them).
	Say *Words `json:"say,omitempty"`
}
