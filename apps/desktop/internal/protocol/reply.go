package protocol

// ReplyRef (D236): what the user picked to answer when they replied to one
// message (回复 / Reply). The client names only the message; core fills the
// rest from the Log when it logs the reply. Mirrors packages/protocol ReplyRef.
type ReplyRef struct {
	Seq        int64      `json:"seq"`  // the channel event replied to
	From       string     `json:"from"` // "you" | "partner"
	Kind       string     `json:"kind"` // "message" | "question" | "find"
	Quote      string     `json:"quote"`
	Part       bool       `json:"part,omitempty"`    // a part the user picked
	Clipped    bool       `json:"clipped,omitempty"` // its words go on past the quote
	TS         string     `json:"ts"`
	TaskIDs    []string   `json:"taskIds,omitempty"`
	DecisionID string     `json:"decisionId,omitempty"`
	Answers    bool       `json:"answers,omitempty"` // it answered that open question
	FindID     string     `json:"findId,omitempty"`
	Media      []MediaRef `json:"media,omitempty"`
}

// ReplyWant (D236): a client's half of a reply: the message, and a find or a
// part of its words in it.
type ReplyWant struct {
	Seq    int64  `json:"seq"`
	FindID string `json:"findId,omitempty"`
	Part   string `json:"part,omitempty"`
}

// ReplyQuote is how many characters of a message a reply carries.
const ReplyQuote = 200
