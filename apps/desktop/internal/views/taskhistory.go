package views

// An opened task's history, newest first (D284): what the store holds
// paints at once; the home is asked for the newest window (historyFirst
// events), which paints the moment it lands; older pages follow one at a
// time in the background up to historyLimit, then only as the reader
// scrolls up to the head. A page is small, so a live frame never waits
// behind megabytes on the one socket.

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// askHistory asks the home for a page of the task's stream: the newest
// window (before 0), or the page before seq before.
func (a *App) askHistory(id string, before int64) {
	limit := historyFirst
	if before > 0 {
		limit = historyPage
	}
	a.S.HistoryAsked(id, limit)
	a.send(protocol.TaskHistoryReq{T: "task_history", TaskID: id, BeforeSeq: before, Limit: limit})
}

// pageHistory asks for the next older page of the opened task while it
// holds fewer than historyLimit events and the home has more.
func (a *App) pageHistory(id string) {
	t := a.S.Task(id)
	if t == nil || a.Route != RouteTask || a.TaskID != id || t.HistPending || !t.HistMore || t.HistFrom == 0 || len(t.Events) >= historyLimit {
		return
	}
	a.askHistory(id, t.HistFrom)
}

// moreAtHead asks for an older page when the reader has scrolled up to
// the head of a task the background stopped paging (past historyLimit).
func (a *App) moreAtHead(id string, first int) {
	t := a.S.Task(id)
	if first > 1 || t == nil || t.HistPending || !t.HistMore || t.HistFrom == 0 || !t.HistoryLoaded {
		return
	}
	a.askHistory(id, t.HistFrom)
}
