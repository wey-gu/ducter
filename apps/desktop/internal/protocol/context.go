package protocol

// D288: 上下文 / Context: an agent's account usage limits for a task's
// context card (packages/protocol/src/index.ts AccountUsage, UsageWindow).

// AccountUsage is an agent's account limits as the agent reports them.
type AccountUsage struct {
	Harness string        `json:"harness"`
	Plan    string        `json:"plan,omitempty"`
	Account string        `json:"account,omitempty"`
	Limited bool          `json:"limited,omitempty"`
	Windows []UsageWindow `json:"windows"`
	At      string        `json:"at"`
}

// UsageWindow is one limit of an account (5-hour, weekly, per model).
type UsageWindow struct {
	ID         string  `json:"id,omitempty"`
	Label      string  `json:"label"`
	Used       float64 `json:"used"`
	ResetsAt   string  `json:"resetsAt,omitempty"`
	DurationMs int64   `json:"durationMs,omitempty"`
}

// TurnTokens is one turn's tokens (input counts its cached part).
type TurnTokens struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
	Cached int64 `json:"cached,omitempty"`
}

// AccountUsageReq asks the home for an agent's account limits.
type AccountUsageReq struct {
	T       string `json:"t"` // account_usage
	Harness string `json:"harness"`
	Fresh   bool   `json:"fresh,omitempty"`
}
