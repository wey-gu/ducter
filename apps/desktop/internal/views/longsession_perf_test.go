package views

// D320: a long session stays smooth and bounded. A fake home holds a task
// of 2,000 and 50,000 events and answers task_index and
// task_history as core/src/ws.ts does; the app opens it (the index and the
// newest window: first paint), the reader scrolls from its end to its head
// a few rows a frame (every frame timed; each page answered at once), a
// locator jump goes to the middle (time until its turn is built and
// drawn), and live events arrive while the reader is far up (the page stays
// put). Throughout, the task holds at most the window's events.

import (
	"encoding/json"
	"fmt"
	"slices"

	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// sessionHome answers a task's index and history from its whole stream.
type sessionHome struct {
	evs []protocol.LogEvent
	ix  *protocol.SessionIndex
}

func (h *sessionHome) answer(f any) (protocol.ServerFrame, bool) {
	switch r := f.(type) {
	case protocol.TaskIndexReq:
		ix := *h.ix
		if r.FromSeq > 0 {
			ix.Turns = nil
			for _, t := range h.ix.Turns {
				if t.Seq >= r.FromSeq {
					ix.Turns = append(ix.Turns, t)
				}
			}
		}
		return protocol.ServerFrame{T: "task_index", TaskID: r.TaskID, Index: &ix, FromSeq: r.FromSeq}, true
	case protocol.TaskHistoryReq:
		lim := r.Limit
		if r.AfterSeq != nil {
			from := lowerBound(h.evs, *r.AfterSeq+1)
			to := min(len(h.evs), from+lim)
			a := *r.AfterSeq
			return protocol.ServerFrame{T: "task_history", TaskID: r.TaskID, Events: h.evs[from:to], More: to < len(h.evs), AfterSeq: &a}, true
		}
		to := len(h.evs)
		if r.BeforeSeq > 0 {
			to = lowerBound(h.evs, r.BeforeSeq)
		}
		from := max(0, to-lim)
		return protocol.ServerFrame{T: "task_history", TaskID: r.TaskID, Events: h.evs[from:to], More: from > 0, BeforeSeq: r.BeforeSeq}, true
	}
	return protocol.ServerFrame{}, false
}

// median is the middle frame time.
func median(all []time.Duration) time.Duration {
	s := append([]time.Duration(nil), all...)
	slices.Sort(s)
	return s[len(s)/2]
}

// wire is a frame as the app gets it: encoded, then decoded.
func wire(t *testing.T, f protocol.ServerFrame) protocol.ServerFrame {
	t.Helper()
	data, err := json.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	g, err := protocol.DecodeServerFrame(data)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

type sessionRun struct {
	t     *testing.T
	app   *App
	tt    *ui.Tester
	home  *sessionHome
	sent  *[]any
	seen  int
	held  int
	pages int
	cache int
}

// pumpOne answers the oldest request not answered, if any.
func (r *sessionRun) pumpOne() {
	for r.seen < len(*r.sent) {
		f := (*r.sent)[r.seen]
		r.seen++
		if g, ok := r.home.answer(f); ok {
			r.app.Receive(wire(r.t, g))
			r.note()
			return
		}
	}
}

// pump answers every request sent since the last pump, a frame after each.
func (r *sessionRun) pump(frames *[]time.Duration) {
	for r.seen < len(*r.sent) {
		f := (*r.sent)[r.seen]
		r.seen++
		g, ok := r.home.answer(f)
		if !ok {
			continue
		}
		if g.T == "task_history" {
			r.pages++
		}
		g = wire(r.t, g)
		start := time.Now()
		r.app.Receive(g)
		r.tt.Frame()
		if frames != nil {
			*frames = append(*frames, time.Since(start))
		}
		r.note()
	}
}

func (r *sessionRun) note() {
	task := r.app.S.Task("big")
	r.held = max(r.held, len(task.Events))
	if m := r.app.tpage.memos["big"]; m != nil {
		r.cache = max(r.cache, len(m.cache))
	}
}

func TestLongSessionWindowed(t *testing.T) {
	bound := winKeep + winTail + winSlack + winPage
	// 10,000 was a third size on the same path: 2,000 (small) and 50,000 (the claim) bracket it.
	for _, n := range []int{2000, 50000} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			all := longTask(n+300, "big")
			evs, live := all[:n], all[n:]
			home := &sessionHome{evs: evs, ix: indexOf(evs)}
			app, sent := iaApp(t, i18n.ZH)
			app.Status = client.Connected
			tt := ui.NewTesterWith(app.View, 1280, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			r := &sessionRun{t: t, app: app, tt: tt, home: home, sent: sent}

			// Open: the index and the newest window, then the first paint.
			app.OpenTask("big")
			tt.Frame()
			// The two answers it asked for on open (its index, its newest window), then one frame.
			start0 := time.Now()
			r.pumpOne()
			r.pumpOne()
			tt.Frame()
			open := time.Since(start0)
			r.pump(nil)
			if overBudget(t, open, 300*time.Millisecond) {
				t.Errorf("open: first paint took %v after its frames arrived", open)
			}

			// From the end to the head, two turns a frame (a fast flick).
			ls := app.taskList("big")
			turns := len(home.ix.Turns)
			var frames []time.Duration
			for row := turns; row >= 1; row -= 2 {
				ls.ScrollTo(row, ui.Start)
				start := time.Now()
				tt.Frame()
				frames = append(frames, time.Since(start))
				r.note()
				r.pump(&frames)
			}
			ls.ScrollTo(0, ui.Start)
			tt.Frame()
			r.pump(&frames)
			tt.Frame()
			task := app.S.Task("big")
			if len(task.Events) == 0 || task.Events[0].Seq != evs[0].Seq {
				t.Errorf("at the head, the first events aren't held")
			}
			if _, ok := tt.Find(home.ix.Turns[0].P.Text); !ok {
				t.Errorf("at the head, the brief doesn't show")
			}
			scrollP95 := p95(frames)
			if overBudget(t, scrollP95, 80*time.Millisecond) {
				t.Errorf("scrolling: frame p95 %v", scrollP95)
			}
			if r.held > bound {
				t.Errorf("held %d events, over the window's %d", r.held, bound)
			}

			// A jump into the middle: there at once, built when its page lands.
			mid := turns / 2
			target := home.ix.Turns[mid].Seq
			start := time.Now()
			app.tpage.jump = &jumpTo{task: "big", seq: target}
			for k := 0; k < 20; k++ {
				tt.Frame()
				r.pumpOne() // one page a frame: the time to its turn, not to all its neighbours
				if m := app.memoOf(task); m.slots[mid].Held > 0 && app.tpage.landing == nil {
					break
				}
			}
			tt.Frame()
			jump := time.Since(start)
			if first, last := ls.Visible(); first > mid+1 || last < mid+1 {
				t.Errorf("the jump didn't land on its turn: rows %d..%d, want %d", first, last, mid+1)
			}
			if app.tpage.flash.seq != target {
				t.Errorf("the turn jumped to isn't tinted")
			}
			if overBudget(t, jump, 300*time.Millisecond) {
				t.Errorf("jump: %v to its turn", jump)
			}

			// Live events while far up: the page stays put, the index grows, the window stays bounded.
			first, _ := ls.Visible()
			key := ls.Key(first)
			for i := range live {
				app.Receive(wire(t, protocol.ServerFrame{T: "events", Events: live[i : i+1]}))
				if i%10 == 0 {
					tt.Frame()
				}
				r.pump(nil)
				r.note()
			}
			tt.Frame()
			if f, _ := ls.Visible(); ls.Key(f) != key {
				t.Errorf("live events moved the page: first row %v, was %v", ls.Key(f), key)
			}
			if task.Index.N != n+len(live) {
				t.Errorf("the index has %d events, want %d", task.Index.N, n+len(live))
			}
			if task.Events[len(task.Events)-1].Seq != live[len(live)-1].Seq {
				t.Errorf("the newest isn't held")
			}
			if r.held > bound {
				t.Errorf("held %d events with live ones, over %d", r.held, bound)
			}
			t.Logf("%6d events: open %v, scroll %d frames p50 %v p95 %v, held at most %d events (%d turns built kept), %d pages, jump %v",
				n, open.Round(time.Millisecond), len(frames), median(frames).Round(100*time.Microsecond), scrollP95.Round(100*time.Microsecond), r.held, r.cache, r.pages, jump.Round(time.Millisecond))
		})
	}
}
