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
	// Effort is how hard it thinks (D536): one of the model's own levels; "" its default.
	Effort string `json:"effort,omitempty"`
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
	// Device: the computer this kind of work runs on, when the rule names one (D157).
	Device string `json:"device,omitempty"`
	// Kinds: the kinds of work it covers (code, errand, writing, research,
	// other); Never: never this agent (model) for that work (D372).
	Kinds []string `json:"kinds,omitempty"`
	Never bool     `json:"never,omitempty"`
	// Where: a computer rule (D538, Harness ""): more (or, Avoid, less) of
	// heavy work, web work or all work on Device.
	Where *PlaceRule `json:"where,omitempty"`
}

// PlaceRule is what a computer rule says (D538): Avoid (少放) or not (多放),
// for Heavy work, Web work, or neither (all work); Mem: the Nowledge Mem
// memory it is mirrored to while Mem is on.
type PlaceRule struct {
	Avoid bool   `json:"avoid,omitempty"`
	Heavy bool   `json:"heavy,omitempty"`
	Web   bool   `json:"web,omitempty"`
	Mem   string `json:"mem,omitempty"`
}

// RuleWhere adds a computer rule from a computer's 关于这台 / About this
// computer, or changes the one ID names (D538). Work: heavy | web | all.
type RuleWhere struct {
	T      string `json:"t"` // "rule_where"
	ID     string `json:"id,omitempty"`
	Device string `json:"device"`
	Avoid  bool   `json:"avoid,omitempty"`
	Work   string `json:"work"`
	Lang   string `json:"lang,omitempty"`
}

// KindDefault is the built-in default for a kind of work when no rule
// covers it (D372): Work is errand, or rest (every other kind).
type KindDefault struct {
	Work    string `json:"work"`
	Harness string `json:"harness"`
	Model   string `json:"model,omitempty"`
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
	// Where: the computer it runs on and why, when two or more computers
	// run tasks (D157).
	Where *WhereWhy `json:"where,omitempty"`
	// D372: kind (the default for this kind of work put it on a fast
	// tier; Keeps the smartest kept for harder work) and retry (the fast
	// tier, From/FromModel, failed or Stalled; it carries on here).
	Work      string       `json:"work,omitempty"`
	Keeps     *KindDefault `json:"keeps,omitempty"`
	First     bool         `json:"first,omitempty"`
	FromModel string       `json:"fromModel,omitempty"`
	Stalled   bool         `json:"stalled,omitempty"`
}

// WhereWhy is why a task runs on the computer it runs on (D157,
// design/where.md §8). Kind: always_on | signed_in | only_here | awake |
// changes_here | agent_here | no_signin | moved | you | home. Thing (for
// only_here): chrome | browser | app | agent. Uses: chrome | ducter | app.
type WhereWhy struct {
	Device string `json:"device"`
	Kind   string `json:"kind"`
	Other  string `json:"other,omitempty"`
	Site   string `json:"site,omitempty"`
	Thing  string `json:"thing,omitempty"`
	App    string `json:"app,omitempty"`
	Agent  string `json:"agent,omitempty"`
	RuleID string `json:"ruleId,omitempty"`
	Text   string `json:"text,omitempty"`
	Uses   string `json:"uses,omitempty"`
	// Always (D505 rev.): with signed_in, the site goes straight to their Chrome.
	Always bool `json:"always,omitempty"`
}

// TaskBody is who does a task now, and why.
type TaskBody struct {
	Harness string  `json:"harness"`
	Model   string  `json:"model,omitempty"`
	Effort  string  `json:"effort,omitempty"` // D202
	Why     BodyWhy `json:"why"`
}

// BodySelected is the body_selected event.
type BodySelected struct {
	TaskID  string  `json:"taskId"`
	Harness string  `json:"harness"`
	Model   string  `json:"model,omitempty"`
	Effort  string  `json:"effort,omitempty"` // D202
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
	// D157, with two or more computers: which one, whether it would wait
	// (asleep | unreachable), what it would use (chrome | ducter), whether
	// the user would sign in there first, and whether it widens access.
	Device     string `json:"device,omitempty"`
	DeviceName string `json:"deviceName,omitempty"`
	Waits      string `json:"waits,omitempty"`
	// NoImages (D206): it can't see pictures (看不了图片 / Can't see images).
	NoImages    bool   `json:"noImages,omitempty"`
	Uses        string `json:"uses,omitempty"`
	NeedsSignIn bool   `json:"needsSignIn,omitempty"`
	Widens      bool   `json:"widens,omitempty"`
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

// StandingView (D413) is one 不用问我的 / Without asking: what the person
// said may go without asking (Action "pr_review"), where (Orgs), in their
// words (Text).
type StandingView struct {
	ID        string   `json:"id"`
	Action    string   `json:"action"`
	Orgs      []string `json:"orgs,omitempty"`
	TaskID    string   `json:"taskId,omitempty"`    // D499: only inside this task
	TaskTitle string   `json:"taskTitle,omitempty"` // D499: that task's name
	Text      string   `json:"text"`
	CreatedAt string   `json:"createdAt"`
	UsedAt    string   `json:"usedAt,omitempty"`
}

// StandingRevoke is 收回 / Take back (D413).
type StandingRevoke struct {
	T  string `json:"t"` // "standing_revoke"
	ID string `json:"id"`
}

// CandidatesReq asks who could do a task (换谁来做 / Switch who does it).
type CandidatesReq struct {
	T      string `json:"t"` // "candidates"
	TaskID string `json:"taskId"`
}

// TaskSwitch is 换到 X 接着做 / Continue on X; answered with action_result
// (action "switch"). Device (D157): continue on another computer.
type TaskSwitch struct {
	T       string `json:"t"` // "task_switch"
	TaskID  string `json:"taskId"`
	Harness string `json:"harness"`
	Model   string `json:"model,omitempty"`
	// Effort (D282): with the same agent, its session carries on with it.
	Effort string `json:"effort,omitempty"`
	Device string `json:"device,omitempty"`
}
