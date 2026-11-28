package protocol

// D653 (research/244 rules 1 and 8): one living card per subject, hanging
// from the message that started the work. The same shapes as
// packages/protocol/src/subject.ts. Core logs KindSubjectCard; the latest card
// per subject wins and both clients draw it under that message, revised in
// place. A key is task:<id>, handoff:<key> or pr:owner/repo#n.

// Subject states, as a card's word and mark.
const (
	SubjectWorking = "working"
	SubjectWaiting = "waiting"
	SubjectDone    = "done"
	SubjectFailed  = "failed"
)

// SubjectCard is one subject's living card.
type SubjectCard struct {
	Key      string `json:"key"`
	MsgSeq   int64  `json:"msgSeq"`
	Title    string `json:"title"`
	State    string `json:"state"`
	Line     string `json:"line"`
	Progress string `json:"progress,omitempty"`
	TaskID   string `json:"taskId,omitempty"`
	At       string `json:"at"`
}

// SubjectCardBody is the body of a subject_card Log event.
type SubjectCardBody struct {
	Card SubjectCard `json:"card"`
}
