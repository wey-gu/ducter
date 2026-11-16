package store

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// IsDoneToday is the one meaning of 今天做完 / Done today (D310), the Go
// twin of packages/protocol/src/done-today.ts: a task that finished well
// ("done"; not failed, not a done the agent only claims) at a moment on
// now's day, in now's location. A wait that ended unmet is not a task
// done: it is 没等到 / Didn't happen, said on its own.
func IsDoneToday(a protocol.Attention, finished, now time.Time) bool {
	if a != protocol.Done || finished.IsZero() {
		return false
	}
	at := finished.In(now.Location())
	y, m, d := now.Date()
	ay, am, ad := at.Date()
	return ay == y && am == m && ad == d
}

// FinishedAt is when a task last changed: its card's time or its newest
// event's, whichever is later.
func (t *Task) FinishedAt() time.Time {
	var at time.Time
	if t.Card != nil {
		at = ParseTime(t.Card.UpdatedAt)
	}
	if len(t.Events) > 0 {
		if e := ParseTime(t.Events[len(t.Events)-1].TS); e.After(at) {
			at = e
		}
	}
	return at
}

// DoneToday counts the tasks done today: the number the conversation's
// header, On hand's sentence and strip, and the menu bar all say.
func DoneToday(tasks []*Task, now time.Time) int {
	n := 0
	for _, t := range tasks {
		if IsDoneToday(t.Attention(), t.FinishedAt(), now) {
			n++
		}
	}
	return n
}
