package protocol

// D425: several things in one message, line by line under it. When the
// person asks for several separate things in one message, the partner names
// each in their own words (task_open's or task_send's asks); core logs the
// lines under that message (KindAsks, the latest per MsgSeq wins), each with
// the task that does it and its state. A line is no object of its own: it is
// one row of its task. The same shapes as packages/protocol/src/asks.ts.

// KindAsks is the lines under one of the person's messages.
const KindAsks = "asks"

// Ask states, as a line's mark.
const (
	AskWorking  = "working"
	AskDone     = "done"
	AskNeedsYou = "needs_you"
	AskFailed   = "failed"
)

// AsksCountFrom is how many lines it takes for the count to show under them.
const AsksCountFrom = 4

// AskLine is one thing the person asked for, and where it stands.
type AskLine struct {
	Words  string `json:"words"`
	TaskID string `json:"taskId"`
	Held   string `json:"held,omitempty"` // D360: held in a group's line, not opened yet
	State  string `json:"state"`
	Note   string `json:"note,omitempty"` // one short line of what came of it
}

// Asks is the lines under one message.
type Asks struct {
	MsgSeq int64     `json:"msgSeq"`
	Lines  []AskLine `json:"lines"`
}

// AskSettled reports whether nothing more comes of a line without the person.
func AskSettled(state string) bool { return state == AskDone || state == AskFailed }

// AsksCount is the count under the lines: shown from AsksCountFrom lines,
// once something is done, while something is left. A line that didn't work
// counts in neither (its cross says it). ok is false when none shows.
func AsksCount(lines []AskLine) (done, left int, ok bool) {
	if len(lines) < AsksCountFrom {
		return 0, 0, false
	}
	for _, l := range lines {
		if l.State == AskDone {
			done++
		} else if !AskSettled(l.State) {
			left++
		}
	}
	return done, left, done > 0 && left > 0
}
