package views

// An opened task's history (D284, D320). What the store holds paints at
// once; the home is asked for the task's session index (one small row per
// turn, D320) and its newest window (historyFirst events), which paints
// the moment it lands. From then on the window follows the rows on
// screen: the turns in view, then winAhead events ahead of the scroll and
// winBehind behind it, are asked a page at a time (nextAsk), and when the
// task holds more than winKeep + winTail + winSlack events, the far ones
// are let go (keepFor), always keeping the newest winTail. A home that
// sends no index (before D320) gets D284's paging: older pages in the
// background up to historyLimit, then only at the head.

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

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

// askPage asks for the page nextAsk named (D320).
func (a *App) askPage(id string, ask sessionAsk) {
	a.S.HistoryAsked(id, ask.Limit)
	r := protocol.TaskHistoryReq{T: "task_history", TaskID: id, Limit: ask.Limit}
	if ask.After {
		after := ask.AfterSeq
		r.AfterSeq = &after
	} else {
		r.BeforeSeq = ask.BeforeSeq
	}
	a.send(r)
}

// askIndex asks for the task's session index (D320) when it holds none or
// a new socket may have left a gap (then from its last turn on).
func (a *App) askIndex(id string) {
	t := a.S.Task(id)
	if t != nil && (t.IndexPending || (t.Index != nil && !t.IndexStale)) {
		return
	}
	var from int64
	if t != nil && t.Index != nil && len(t.Index.Turns) > 0 {
		from = t.Index.Turns[len(t.Index.Turns)-1].Seq
	}
	a.S.IndexAsked(id)
	a.send(protocol.TaskIndexReq{T: "task_index", TaskID: id, FromSeq: from})
}

// pageHistory, after a page landed: with no index (a home before D320),
// the next older page of the opened task while it holds fewer than
// historyLimit events and the home has more (D284); with one, the window
// takes the next step.
func (a *App) pageHistory(id string) {
	t := a.S.Task(id)
	if t == nil || a.Route != RouteTask || a.TaskID != id || t.HistPending {
		return
	}
	if t.Index != nil {
		if v, ok := a.tpage.views[id]; ok {
			a.windowStep(t, v)
		}
		return
	}
	if !t.HistMore || t.HistFrom == 0 || len(t.Events) >= historyLimit {
		return
	}
	a.askHistory(id, t.HistFrom)
}

// moreAtHead asks for an older page when the reader has scrolled up to
// the head of a task the background stopped paging (D284, no index).
func (a *App) moreAtHead(id string, first int) {
	t := a.S.Task(id)
	if first > 1 || t == nil || t.HistPending || !t.HistMore || t.HistFrom == 0 || !t.HistoryLoaded {
		return
	}
	a.askHistory(id, t.HistFrom)
}

// setView notes the turns on screen of an opened task (D320).
func (a *App) setView(id string, v sessionView) {
	if a.tpage.views == nil {
		a.tpage.views = map[string]sessionView{}
	}
	a.tpage.views[id] = v
}

// windowAt is the page's rows first..last on screen (list rows: the head
// is 0, the turns from 1): the window follows them (D320), or D284's
// paging at the head without an index.
func (a *App) windowAt(task *store.Task, m *taskMemo, first, last int) {
	if task.Index == nil {
		a.moreAtHead(task.ID, first)
		return
	}
	n := len(m.slots)
	// A glide on its way passes rows it doesn't stop at: nothing is asked for them.
	if j := a.tpage.jump; n == 0 || (j != nil && j.task == task.ID) {
		return
	}
	v := sessionView{First: min(max(first-1, 0), n-1), Last: min(max(last-1, 0), n-1)}
	if was, ok := a.tpage.views[task.ID]; ok {
		v.Dir = was.Dir
		switch {
		case v.First < was.First:
			v.Dir = -1
		case v.First > was.First:
			v.Dir = 1
		}
	}
	// A far jump on its way: the window gathers around its turn.
	if w := a.tpage.landing; w != nil && w.task == task.ID {
		if k := turnAt(m.ix, w.seq); k >= 0 {
			v = sessionView{First: k, Last: k}
		}
	}
	a.setView(task.ID, v)
	a.windowStep(task, v)
	prebuild(m, v, time.Now().Add(prebuildFor))
}

// prebuildFor is how long a frame spends building held turns just ahead
// of the scroll that aren't on screen yet, so they are built when they
// come into view (D320): a turn's cost is mostly hiding keys in its
// outputs.
const prebuildFor = 3 * time.Millisecond

// prebuild builds held turns near the view, ahead of the scroll first,
// until the deadline.
func prebuild(m *taskMemo, v sessionView, until time.Time) {
	n := len(m.slots)
	step := -1
	if v.Dir > 0 {
		step = 1
	}
	for _, d := range []int{step, -step} {
		i := v.First - 1
		if d > 0 {
			i = v.Last + 1
		}
		for k := 0; k < 12 && i >= 0 && i < n; k, i = k+1, i+d {
			if s := &m.slots[i]; s.Held > 0 && s.got == nil && s.over == nil {
				if time.Now().After(until) {
					return
				}
				s.Turn()
			}
		}
	}
}

// windowStep lets far events go when the task holds too much, then asks
// for the next page the view needs, one at a time (D320).
func (a *App) windowStep(task *store.Task, v sessionView) {
	if task.Index == nil || !task.HistoryLoaded || task.HistPending || task.HistStale || task.IndexStale {
		return
	}
	ix := task.Index
	if keep := keepFor(ix, task.Events, &v); keep != nil {
		a.S.Evict(task.ID, keep)
	}
	if ask, ok := nextAsk(ix, task.Spans, task.Events, v); ok {
		a.askPage(task.ID, ask)
	}
}

// liveIndex adds a frame's live events to their tasks' indexes (D320),
// and caps the tasks not open at winCap events.
func (a *App) liveIndex(f protocol.ServerFrame) {
	if f.T != "events" {
		return
	}
	touched := map[string]bool{}
	for i := range f.Events {
		ev := &f.Events[i]
		if len(ev.Stream) <= 5 || ev.Stream[:5] != "task:" {
			continue
		}
		id := ev.Stream[5:]
		touched[id] = true
		if t := a.S.Task(id); t != nil && t.Index != nil && !t.IndexStale {
			indexAdd(t.Index, ev)
		}
	}
	for id := range touched {
		if a.Route == RouteTask && a.TaskID == id {
			continue
		}
		if t := a.S.Task(id); t != nil {
			if keep := keepFor(t.Index, t.Events, nil); keep != nil {
				a.S.Evict(id, keep)
			}
		}
	}
}
