package protocol

import "encoding/json"

// D674 (research/247 Brief B): the shadow gets a verdict. Once a week
// the morning note offers, in one quiet line at its foot, the review of what
// Ducter noticed and didn't say (Finds.ShadowReview); the list comes from
// the home on asking (shadow_review), and each verdict goes back as
// shadow_label. The home keeps the verdicts once in its Log and decides the
// gate from them alone; the Mac only shows and asks.

// ShadowOffer is the note's line: how many still wait for a word, and when
// the line fades (the next morning, ISO).
type ShadowOffer struct {
	Count int    `json:"count"`
	Until string `json:"until"`
}

// ShadowFact is one fact an item joined: where it was read, its header,
// who it came from, when.
type ShadowFact struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Src   string `json:"src"`
	Label string `json:"label"`
	From  string `json:"from,omitempty"`
	At    string `json:"at"`
}

// ShadowItem is one thing the week's passes noticed: its words (what it
// would have said), its facts, whether something on them was said, and the
// person's verdict (yes 应该早说, no 不该说; Stopped: 这类以后都别标).
type ShadowItem struct {
	ID         string       `json:"id"`
	RunID      string       `json:"runId"`
	Source     string       `json:"source"`
	Text       string       `json:"text"`
	Why        string       `json:"why,omitempty"`
	Next       string       `json:"next,omitempty"`
	Confidence float64      `json:"confidence,omitempty"`
	AlsoBy     []string     `json:"alsoBy"`
	Said       bool         `json:"said"`
	At         string       `json:"at"`
	Facts      []ShadowFact `json:"facts"`
	Sort       string       `json:"sort"`
	Verdict    string       `json:"verdict,omitempty"`
	Stopped    bool         `json:"stopped,omitempty"`
}

// ShadowReview is the list (From and To are the person's days); the gate
// is the home's, never decided here.
type ShadowReview struct {
	From  string       `json:"from"`
	To    string       `json:"to"`
	Items []ShadowItem `json:"items"`
}

// ShadowReviewReq asks for the list (T "shadow_review").
type ShadowReviewReq struct {
	T    string `json:"t"`
	Week bool   `json:"week,omitempty"`
}

// ShadowLabelReq is one verdict (T "shadow_label"): yes, no or stop.
type ShadowLabelReq struct {
	T         string `json:"t"`
	FindingID string `json:"findingId"`
	Verdict   string `json:"verdict"`
}

// ShadowReviewFrame is shadow_review_result.
type ShadowReviewFrame struct {
	Review *ShadowReview `json:"review,omitempty"`
	Error  string        `json:"error,omitempty"`
}

func decodeShadowReview(data []byte, f ServerFrame) (ServerFrame, error) {
	var r ShadowReviewFrame
	if err := json.Unmarshal(data, &r); err != nil {
		return f, err
	}
	f.ShadowFor = &r
	return f, nil
}
