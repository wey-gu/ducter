package views

// D467: On hand reads by attention, in one card shape. A wait nothing will
// bring back on its own (no waiter of any kind, not a question put off, not
// a computer that will come back) has stopped: it stands in 等你 with its one
// action, never as a grey row under 在等. A task that didn't work out stands
// there too. 今天做完 holds what finished today; yesterday's fold under it.
// The strip, the partner's line, the sections and the keys all read this
// one split. The web reads the same (apps/web/src/onhand.tsx).

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// stopAfter is how long a wait with nothing to bring it back may stand
// before it is said to have stopped (an agent arms its waiter just after
// it reports; that moment is not a stop).
const stopAfter = 30 * time.Minute

// stoppedWait: a waiting task nothing will bring back on its own.
func (a *App) stoppedWait(task *store.Task) bool {
	if task.Attention() != protocol.Blocked {
		return false
	}
	if _, later := a.laterRow(task); later {
		return false // D382: it asks again at its time
	}
	if a.S.WaiterFor(task.ID) != nil {
		return false // a time, a check, an event or a limit's reset brings it back
	}
	if strings.HasPrefix(task.Reason(), "device:asleep:") {
		return false // a computer that said it would sleep wakes by itself (D157)
	}
	// D467 round 4: one that went away (device:unreachable) for half an hour needs the person.
	at := task.FinishedAt()
	return !at.IsZero() && a.Now().Sub(at) >= stopAfter
}

// finishedToday: finished well (or being checked) on today's date.
func (a *App) finishedToday(task *store.Task) bool {
	att := task.Attention()
	if att != protocol.Done && att != protocol.DoneClaimed {
		return false
	}
	at := task.FinishedAt()
	if at.IsZero() {
		return true
	}
	now := a.Now()
	y, m, d := now.Date()
	ay, am, ad := at.In(now.Location()).Date()
	return ay == y && am == m && ad == d
}

// boardSplit is the board's tasks by section (D467).
type boardSplit struct {
	// ready (D508): a finished task whose PR is ready to merge: the merge is
	// the person's. A finished task whose PR waits on CI or a reviewer is in
	// waiting; only a merged or closed one is done.
	needs, stopped, ready, failed, working, waiting, today, earlier []*store.Task
}

func (a *App) splitOf(b store.Board) boardSplit {
	var s boardSplit
	s.needs = b.Lanes[store.LaneNeedsYou]
	s.working = append([]*store.Task(nil), b.Lanes[store.LaneWorking]...)
	for _, x := range b.Lanes[store.LaneWaiting] {
		if _, _, ok := mendingOf(x); ok {
			s.working = append(s.working, x) // D473, D471: Ducter is mending it: at work, not yours yet
			continue
		}
		// D517: a stop the person has looked at waits with the rest (its card keeps 接着做).
		if a.stoppedWait(x) && !a.looked(x) {
			s.stopped = append(s.stopped, x)
		} else {
			s.waiting = append(s.waiting, x)
		}
	}
	for _, x := range b.Lanes[store.LaneDone] {
		_, _, mending := mendingOf(x)
		switch {
		case mending:
			s.working = append(s.working, x)
		// D517: a failure or a PR ready to merge the person has looked at
		// leaves 等你: the failure stands with what finished on its day, the PR
		// with what waits (each card keeps its action).
		case x.Attention() == protocol.Failed && a.looked(x):
			if onDay(x.FinishedAt(), a.Now()) {
				s.today = append(s.today, x)
			} else {
				s.earlier = append(s.earlier, x)
			}
		case x.Attention() == protocol.Failed:
			s.failed = append(s.failed, x)
		case prStandsAt(x) == "needs" && a.looked(x):
			s.waiting = append(s.waiting, x)
		case prStandsAt(x) == "needs":
			s.ready = append(s.ready, x)
		case prStandsAt(x) == "waiting":
			s.waiting = append(s.waiting, x)
		case a.finishedToday(x):
			s.today = append(s.today, x)
		default:
			s.earlier = append(s.earlier, x)
		}
	}
	return s
}

// prStandsAt is where the board stands a finished task under its open PR
// ("needs", "waiting"), or "" when it has none open (D508).
func prStandsAt(task *store.Task) string {
	_, _, st := prRow(task)
	return st
}

// mendingOf: a failure or a stop Ducter is mending right now (D473): its
// newest event is a repair under way, not the partner's rethink (which may
// still ask the person). how and name say it in the steps' words.
func mendingOf(task *store.Task) (how, name string, ok bool) {
	att := task.Attention()
	if att != protocol.Failed && att != protocol.Blocked {
		return
	}
	// The home's word on the card first (it read the task's newest event);
	// else what streamed since.
	if m := task.Card; m != nil && m.Mending != nil {
		if m.Mending.Cls == "stall" {
			return "stall", "", true
		}
		how := m.Mending.How
		if how == "" {
			how = "reopen"
		}
		return how, m.Mending.Name, true
	}
	for i := len(task.Events) - 1; i >= 0; i-- {
		e := &task.Events[i]
		switch e.Kind {
		case protocol.KindTaskState, protocol.KindReport:
			return
		case "mend":
			var b struct{ Cls, Rung, How, Name, State string }
			if e.Decode(&b) != nil || b.State != "going" || b.Rung == "rethink" {
				return
			}
			if b.Cls == "stall" {
				return "stall", "", true
			}
			if b.How == "" {
				b.How = "reopen"
			}
			return b.How, b.Name, true
		}
	}
	// A client that just connected: the home's word on the card.
	if m := task.Card; m != nil && m.Mending != nil {
		if m.Mending.Cls == "stall" {
			return "stall", "", true
		}
		how := m.Mending.How
		if how == "" {
			how = "reopen"
		}
		return how, m.Mending.Name, true
	}
	return
}

// stopMark draws a card's state mark (D467): the same glyphs as a group's
// parts, on a sunk round; never the agent's brand, never a face.
func (a *App) stateMark(c *ui.Context, task *store.Task, stopped bool) {
	t := a.T
	att := task.Attention()
	size := float32(32)
	if a.compact() {
		size = 28
	}
	box := ui.Box(c.Key("mark")).Size(size, size).Radius(size / 2).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).AccessHidden(true)
	_, _, mending := mendingOf(task)
	switch {
	case mending:
		box.Background(t.Working.Surface).Children(func() {
			ui.Box(c.Key("peb")).Size(12, 12).Draw(drawPebble(t.Working.Dot, time.Time{}, false))
		})
	case a.oh.roundsRow && !stopped && att != protocol.NeedsYou && att != protocol.Failed && att != protocol.Working && att != protocol.Queued:
		// D498: a task in rounds between rounds: the drawn repeat (Ongoing's own).
		box.Background(t.SurfaceSunken).Children(func() {
			ui.Box(c.Key("rep")).Size(18, 18).Draw(drawPastGlyph("repeat", t.InkSoft))
		})
	case stopped || att == protocol.NeedsYou || prStandsAt(task) == "needs":
		box.Background(t.NeedsYou.Surface).Draw(drawGroupMark("needs", t.NeedsYou.Dot, t.Surface))
	case prStandsAt(task) == "waiting":
		// D508: it waits on its PR (CI, a reviewer, its next turn): the waiting ring, at rest.
		box.Background(t.SurfaceSunken).Children(func() {
			ui.Box(c.Key("ring")).Size(16, 16).Draw(drawRing(t.Waiting.Ink.Alpha(0.5), t.Waiting.Ink, 0))
		})
	case att == protocol.Failed:
		box.Background(t.Failed.Surface).Draw(drawGroupMark("failed", t.Failed.Dot, t.Surface))
	case att == protocol.Working || att == protocol.Queued:
		// D498 (research/216): a pebble that beats once when a step lands and
		// rests between; dimmed once no step has come for a while.
		last := lastStepAt(task)
		if ts := turnStart(task); ts.After(last) {
			last = ts
		}
		still := (!last.IsZero() && a.Now().Sub(last) >= quietStep) || a.aliveResting(c)
		beat := a.beatOf(task)
		box.Background(t.Working.Surface).Children(func() {
			ui.Box(c.Key("peb")).Size(24, 24).Draw(drawPebble(t.Working.Dot, beat, still))
		})
	case att == protocol.Blocked:
		_, frac := a.waitNext(a.S.WaiterFor(task.ID))
		box.Background(t.SurfaceSunken).Children(func() {
			ui.Box(c.Key("ring")).Size(16, 16).Draw(drawRing(t.Waiting.Ink.Alpha(0.5), t.Waiting.Ink, frac))
		})
	case a.rowMarkOf(task) == stNew:
		box.Background(t.Done.Surface).Draw(drawGroupMark("done", t.Done.Dot, t.Surface))
	default:
		box.Background(t.SurfaceSunken).Draw(drawGroupMark("done", t.InkMuted.Alpha(0.45), t.Surface))
	}
}
