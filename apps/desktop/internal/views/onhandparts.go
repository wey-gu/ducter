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
	if strings.HasPrefix(task.Reason(), "device:") {
		return false // its computer coming back brings it back (D157)
	}
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
	needs, stopped, failed, working, waiting, today, earlier []*store.Task
}

func (a *App) splitOf(b store.Board) boardSplit {
	var s boardSplit
	s.needs = b.Lanes[store.LaneNeedsYou]
	s.working = b.Lanes[store.LaneWorking]
	for _, x := range b.Lanes[store.LaneWaiting] {
		if a.stoppedWait(x) {
			s.stopped = append(s.stopped, x)
		} else {
			s.waiting = append(s.waiting, x)
		}
	}
	for _, x := range b.Lanes[store.LaneDone] {
		switch {
		case x.Attention() == protocol.Failed:
			s.failed = append(s.failed, x)
		case a.finishedToday(x):
			s.today = append(s.today, x)
		default:
			s.earlier = append(s.earlier, x)
		}
	}
	return s
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
	switch {
	case stopped || att == protocol.NeedsYou:
		box.Background(t.NeedsYou.Surface).Draw(drawGroupMark("needs", t.NeedsYou.Dot, t.Surface))
	case att == protocol.Failed:
		box.Background(t.Failed.Surface).Draw(drawGroupMark("failed", t.Failed.Dot, t.Surface))
	case att == protocol.Working || att == protocol.Queued:
		box.Background(t.Working.Surface).Children(func() {
			ui.Box(c.Key("pulse")).Size(13, 12).Draw(drawPulse(t.Working.Dot, phaseOf(task.ID), true)) // still: its trail moves
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
