package protocol

import "encoding/json"

// D588, D591: what was used over the last days, the mirror of
// packages/protocol/src/usage.ts: counted on the home from its Log (task
// turns, the partner's own replies, Ducter's own looks), with every part's
// share of the whole by weight (cache reads at a tenth). The Mac reads only
// what Settings › Overview and the limit card show.

// UsageTokens is a sum of tokens: input counts its cached part.
type UsageTokens struct {
	Input  float64 `json:"input"`
	Output float64 `json:"output"`
	Cached float64 `json:"cached"`
}

// Weight is what a sum weighs (usageWeight): cache reads at a tenth.
func (s UsageTokens) Weight() float64 { return s.Input - s.Cached + s.Output + s.Cached*0.1 }

// UsageTop is the task that used most of an agent, and its share of it.
type UsageTop struct {
	TaskID string  `json:"taskId"`
	Title  string  `json:"title"`
	Share  float64 `json:"share"`
}

// UsageAgent is one agent and model.
type UsageAgent struct {
	Harness string      `json:"harness"`
	Model   string      `json:"model,omitempty"`
	Tokens  UsageTokens `json:"tokens"`
	Turns   int         `json:"turns"`
	Tasks   int         `json:"tasks"`
	Share   float64     `json:"share"`
}

// UsageHarness is one agent across its models (what a limit counts against).
type UsageHarness struct {
	Harness string      `json:"harness"`
	Tokens  UsageTokens `json:"tokens"`
	Turns   int         `json:"turns"`
	Share   float64     `json:"share"`
	Top     *UsageTop   `json:"top,omitempty"`
}

// UsagePart is the partner's own replies, or Ducter's own looks.
type UsagePart struct {
	Tokens UsageTokens `json:"tokens"`
	Turns  int         `json:"turns"`
	Share  float64     `json:"share"`
}

// UsageTask is one task that used some.
type UsageTask struct {
	TaskID  string      `json:"taskId"`
	Title   string      `json:"title"`
	Harness string      `json:"harness"`
	Model   string      `json:"model,omitempty"`
	By      string      `json:"by"` // you | partner
	Tokens  UsageTokens `json:"tokens"`
	Turns   int         `json:"turns"`
	Share   float64     `json:"share"`
}

// UsageReport is usage_days_result's report.
type UsageReport struct {
	Since     string         `json:"since"`
	Until     string         `json:"until"`
	Total     UsageTokens    `json:"total"`
	Turns     int            `json:"turns"`
	TaskCount int            `json:"taskCount"`
	Agents    []UsageAgent   `json:"agents"`
	Harnesses []UsageHarness `json:"harnesses"`
	By        struct {
		You     UsageTokens `json:"you"`
		Partner UsageTokens `json:"partner"`
	} `json:"by"`
	Talk  UsagePart   `json:"talk"`
	Looks UsagePart   `json:"looks"`
	Tasks []UsageTask `json:"tasks"`
}

// UsageDays asks for the count: the last Days days in the person's own days
// (Tz minutes east of UTC), the Top tasks.
type UsageDays struct {
	T    string `json:"t"` // usage_days
	Days int    `json:"days,omitempty"`
	Tz   int    `json:"tz"`
	Top  int    `json:"top,omitempty"`
}

// usageFrame is usage_days_result as sent.
type usageFrame struct {
	Report *UsageReport `json:"report"`
	Error  string       `json:"error"`
}

// decodeUsage reads usage_days_result on its own; an error leaves no report.
func decodeUsage(data []byte, f ServerFrame) (ServerFrame, error) {
	var u usageFrame
	if err := json.Unmarshal(data, &u); err != nil {
		return f, err
	}
	f.UsageFor = u.Report
	return f, nil
}
