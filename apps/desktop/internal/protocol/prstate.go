package protocol

// TaskPR (D508) is one pull request a task made or took over, where it
// stands at Ducter's last look (core's owned looks, D483, D496). The
// TypeScript twin is packages/protocol/src/pr-state.ts.
type TaskPR struct {
	PR       string         `json:"pr"`
	URL      string         `json:"url"`
	State    string         `json:"state"`
	At       string         `json:"at"`
	Standing *OwnedStanding `json:"standing,omitempty"`
}

// OwnedStanding (D496) is where a PR stands, as facts read from GitHub at
// one look.
type OwnedStanding struct {
	At         string        `json:"at"`
	Head       string        `json:"head,omitempty"`
	Draft      bool          `json:"draft,omitempty"`
	Changes    []OwnedChange `json:"changes,omitempty"`
	ApprovedBy []string      `json:"approvedBy,omitempty"`
	Awaiting   []string      `json:"awaiting,omitempty"`
	Checks     *OwnedChecks  `json:"checks,omitempty"`
	Merge      string        `json:"merge,omitempty"`
}

// OwnedChange is a reviewer's standing request for changes.
type OwnedChange struct {
	ID   string `json:"id"`
	By   string `json:"by"`
	At   string `json:"at"`
	On   string `json:"on,omitempty"`
	Text string `json:"text"`
}

// OwnedChecks are the checks on a PR's head.
type OwnedChecks struct {
	Total   int      `json:"total"`
	Passed  int      `json:"passed"`
	Failed  []string `json:"failed"`
	Pending []string `json:"pending"`
}
