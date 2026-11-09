package protocol

// What the partner thinks with, and who does the tasks (D89): mirrors
// packages/protocol/src/loadout.ts and the harnesses branch's Settings.brain
// and DeviceHarness fields. Field names and JSON tags are identical.

// PartnerReserve is the share of the partner's own account kept for its
// answers; tasks can't use it (fixed in v1).
const PartnerReserve = 0.1

// KindBodySelected: who does a task and why, on open and on every switch.
const KindBodySelected = "body_selected"

// Brain is what the partner thinks with: a harness and, optionally, its model.
type Brain struct {
	Harness string `json:"harness"`
	Model   string `json:"model,omitempty"`
}

// TaskAccount is one account's 用它做事 / Use it for tasks switch.
type TaskAccount struct {
	Enabled bool `json:"enabled"`
}

// HarnessModel is one model an account offers.
type HarnessModel struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// RuleView is one of 你的规则 / Your rules: work of a kind goes to one AI agent.
type RuleView struct {
	ID        string   `json:"id"`
	Text      string   `json:"text"`
	Harness   string   `json:"harness"`
	Model     string   `json:"model,omitempty"`
	Match     []string `json:"match"`
	CreatedAt string   `json:"createdAt"`
}

// BodyWhy is why a task is on the AI agent it is on: default | rule | limit
// | unavailable | you | partner (From: who it would have been, or was;
// Blocked: why From couldn't take it, for unavailable).
type BodyWhy struct {
	Kind    string `json:"kind"`
	RuleID  string `json:"ruleId,omitempty"`
	Text    string `json:"text,omitempty"`
	From    string `json:"from,omitempty"`
	Blocked string `json:"blocked,omitempty"`
}

// TaskBody is who does a task now, and why.
type TaskBody struct {
	Harness string  `json:"harness"`
	Model   string  `json:"model,omitempty"`
	Why     BodyWhy `json:"why"`
}

// BodySelected is the body_selected event.
type BodySelected struct {
	TaskID  string  `json:"taskId"`
	Harness string  `json:"harness"`
	Model   string  `json:"model,omitempty"`
	Why     BodyWhy `json:"why"`
}

// CandidateReason: rule | fit | fast | left | current.
type CandidateReason struct {
	Kind   string `json:"kind"`
	RuleID string `json:"ruleId,omitempty"`
	Text   string `json:"text,omitempty"`
}

// Candidate is one AI agent (and model) that could do a task, best first.
// Blocked: not_installed | signed_out | off | reserve | no_model | offline.
type Candidate struct {
	Harness  string          `json:"harness"`
	Model    string          `json:"model,omitempty"`
	Current  bool            `json:"current,omitempty"`
	Reason   CandidateReason `json:"reason"`
	Left     *float64        `json:"left,omitempty"`
	ResetsAt string          `json:"resetsAt,omitempty"`
	Billing  string          `json:"billing,omitempty"`
	Blocked  string          `json:"blocked,omitempty"`
}

// RulesReq asks for Your rules and keeps this socket told of every change.
type RulesReq struct {
	T string `json:"t"` // "rules"
}

// RuleRemove is 不要这条 / Remove.
type RuleRemove struct {
	T  string `json:"t"` // "rule_remove"
	ID string `json:"id"`
}

// CandidatesReq asks who could do a task (换谁来做 / Switch who does it).
type CandidatesReq struct {
	T      string `json:"t"` // "candidates"
	TaskID string `json:"taskId"`
}

// TaskSwitch is 换到 X 接着做 / Continue on X; answered with action_result
// (action "switch").
type TaskSwitch struct {
	T       string `json:"t"` // "task_switch"
	TaskID  string `json:"taskId"`
	Harness string `json:"harness"`
	Model   string `json:"model,omitempty"`
}
