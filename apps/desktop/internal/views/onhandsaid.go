package views

// D498: On hand says a working task's steps the way a person reads them
// (D152), and shows it alive without pretending to measure progress
// (research/216). A step is its own words, or a step that said what it was
// for; a run of steps with no words of their own (a bare command, a read, a
// search pattern) is one gist (看了 3 个文件，跑了 2 条命令); never a verb
// alone, a raw command or a raw pattern. A step that didn't work is a quiet
// line: the task went on, so it is no alarm. The mark at work is a pebble
// that beats once each time a step lands and rests between, dimmed once no
// step has come for a while. The web reads the same (onhand-brief.tsx
// saidOf).

import (
	"math"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// quietStep is how long a working task may go without a new step before
// its row says when its last one was (raters read any earlier word as "may
// be hung", research/216; D481 leaves judging a stall to the partner).
const quietStep = 10 * time.Minute

// saidLine is one line of a task's steps as the person reads them: its mark (a
// step's kind, "voice" for the agent's own words), its words, whether it
// didn't work, and its seq.
type saidLine struct {
	k, words string
	bad      bool
	seq      int64
}

// heldStep is a step this Mac holds for a task, at its time.
type heldStep struct {
	at time.Time
	ev protocol.LogEvent
}

// stepsHeld is the steps this Mac holds for a task, oldest first (at most
// 400), the card's latest among them. On hand asks for it several times a
// frame per row, so the decoded steps are kept per task until its held
// events change (a frame never decodes 400 events again).
func stepsHeld(task *store.Task) []heldStep {
	out := heldOf(task)
	if task.Card != nil && task.Card.Latest != nil {
		l := *task.Card.Latest
		if len(out) == 0 || out[len(out)-1].ev.Seq < l.Seq {
			out = append(slices.Clip(out), heldStep{at: store.ParseTime(l.TS), ev: l})
		}
	}
	return out
}

// heldKey is what a task's held steps are read from: its newest 400 events,
// by where that run sits and its bounds (an event's seq never changes what it is).
type heldKey struct {
	base        *protocol.LogEvent
	n           int
	first, last int64
}

type heldMemo struct {
	key heldKey
	out []heldStep
}

var (
	heldMu    sync.Mutex
	heldCache = map[*store.Task]heldMemo{}
)

// heldOf is the steps among a task's newest 400 held events, decoded once
// per change; callers never write into what it returns.
func heldOf(task *store.Task) []heldStep {
	from := max(0, len(task.Events)-400)
	evs := task.Events[from:]
	if len(evs) == 0 {
		return nil
	}
	key := heldKey{base: &evs[0], n: len(evs), first: evs[0].Seq, last: evs[len(evs)-1].Seq}
	heldMu.Lock()
	m, ok := heldCache[task]
	heldMu.Unlock()
	if ok && m.key == key {
		return m.out
	}
	var out []heldStep
	for _, e := range evs {
		if e.Kind != protocol.KindTaskEvent {
			continue
		}
		var b protocol.TaskEvent
		if e.Decode(&b) != nil {
			continue
		}
		if b.Role != "tool" && !(b.Role == "assistant" && (strings.TrimSpace(b.Text) != "" || len(b.Thinking) > 0)) {
			continue
		}
		out = append(out, heldStep{at: store.ParseTime(e.TS), ev: e})
	}
	out = slices.Clip(out)
	heldMu.Lock()
	if len(heldCache) > 400 {
		clear(heldCache)
	}
	heldCache[task] = heldMemo{key: key, out: out}
	heldMu.Unlock()
	return out
}

// lastStepAt is when the newest step this Mac holds happened.
func lastStepAt(task *store.Task) time.Time {
	s := stepsHeld(task)
	if len(s) == 0 {
		return time.Time{}
	}
	return s[len(s)-1].at
}

// turnStart is when this turn began (D210): the home's word on the card,
// else when the task opened. A working row says how long this turn has run,
// never how long ago the task was opened.
func turnStart(task *store.Task) time.Time {
	if task.Card != nil {
		if at := store.ParseTime(task.Card.TurnAt); !at.IsZero() {
			return at
		}
		if at := store.ParseTime(task.Card.OpenedAt); !at.IsZero() {
			return at
		}
	}
	return store.ParseTime(task.OpenedAt)
}

// gistMark is a gist's mark: the kind of step it is mostly made of.
var gistMark = map[string]string{"edited": "edited", "ran": "ran", "read": "read", "searched": "searched", "web": "browsed", "browsed": "browsed", "computer": "computer", "waited": "waited"}

type saidKey struct {
	last  int64
	n     int
	since time.Time
	lang  string
}

type saidMemo struct {
	key saidKey
	out []saidLine
}

// saidOf is a task's latest steps in sentences (since: only this turn's,
// zero for all held), cached until a new step lands.
func (a *App) saidOf(task *store.Task, since time.Time) []saidLine {
	steps := stepsHeld(task)
	if len(steps) == 0 {
		return nil
	}
	key := saidKey{last: steps[len(steps)-1].ev.Seq, n: len(steps), since: since, lang: string(a.L.Lang)}
	memoID := task.ID
	if !since.IsZero() {
		memoID += "|turn"
	}
	if a.oh.said == nil || len(a.oh.said) > 400 {
		a.oh.said = map[string]saidMemo{}
	}
	if m, ok := a.oh.said[memoID]; ok && m.key == key {
		return m.out
	}
	var evs []protocol.LogEvent
	for _, s := range steps {
		if !since.IsZero() && s.at.Before(since.Add(-time.Second)) {
			continue
		}
		evs = append(evs, s.ev)
	}
	if len(evs) > 120 {
		evs = evs[len(evs)-120:]
	}
	var out []saidLine
	var pend []StepRow
	flush := func() {
		if len(pend) == 0 {
			return
		}
		tally := tallyOf(pend)
		k := "other"
		if len(tally) > 0 {
			if m, ok := gistMark[tally[0].Kind]; ok {
				k = m
			}
		}
		out = append(out, saidLine{k: k, words: a.tallyWords(tally), seq: pend[len(pend)-1].Seq})
		pend = nil
	}
	if len(evs) > 0 {
		for _, b := range blocksOf(task.Harness(), evs, false) {
			if b.K == "voice" {
				flush()
				for _, l := range strings.Split(b.Text, "\n") {
					if w := strings.TrimSpace(l); w != "" {
						out = append(out, saidLine{k: "voice", words: w, seq: b.Seq})
						break
					}
				}
				continue
			}
			if b.K != "steps" {
				continue
			}
			for _, l := range b.Lines {
				if l.K == "group" {
					pend = append(pend, l.Rows...)
					continue
				}
				r := l.Row
				if r == nil || r.Step == nil {
					continue // thinking: its words come when it says them
				}
				if w := strings.TrimSpace(r.Step.Says); w != "" {
					flush()
					out = append(out, saidLine{k: r.Step.Kind, words: w, bad: r.Outcome == "error", seq: r.Seq})
				} else {
					pend = append(pend, *r)
				}
			}
		}
		flush()
	}
	a.oh.said[memoID] = saidMemo{key: key, out: out}
	return out
}

// roundsLine is a task in rounds between rounds (D498, D427, D394), each its
// own fact (D291): paused; else its health when it isn't on time; else a
// review's standing; else the last round's own line.
func (a *App) roundsLine(r *protocol.TaskRounds) []string {
	switch {
	case r.Paused:
		return []string{a.L.T("og.paused")}
	case r.Health != nil:
		return a.ongoingHealthLine(r.Health)
	case r.Reviews != nil:
		return a.reviewLine(r.Reviews)
	case r.Last != nil && r.Last.Line != "":
		return []string{r.Last.Line}
	case r.Last != nil:
		return []string{a.L.T("og.run." + r.Last.State)}
	}
	return nil
}

// roundsBeat is a task in rounds at its right edge: this round's time while
// one runs, else when the next comes, or that it is paused.
func (a *App) roundsBeat(task *store.Task, r *protocol.TaskRounds, running bool) string {
	if running {
		d := a.rowTime(task)
		if d == "" || d == a.L.T("time.now") {
			return a.L.T("onhand.rounds.started")
		}
		return a.L.T("onhand.rounds.now", d)
	}
	if r.Paused {
		return a.L.T("onhand.rounds.paused")
	}
	if at := store.ParseTime(r.NextAt); !at.IsZero() && at.After(a.Now()) {
		return a.L.T("onhand.rounds.next", a.soon(at))
	}
	return ""
}

// beatOf is when the newest step of a task was first drawn on this Mac: the
// pebble beats once from then (a step that was there at launch doesn't beat).
func (a *App) beatOf(task *store.Task) time.Time {
	steps := stepsHeld(task)
	if len(steps) == 0 {
		return time.Time{}
	}
	seq := steps[len(steps)-1].ev.Seq
	if a.oh.beats == nil {
		a.oh.beats = map[string]beatMark{}
	}
	b, ok := a.oh.beats[task.ID]
	if !ok {
		a.oh.beats[task.ID] = beatMark{seq: seq} // already there: no beat
		return time.Time{}
	}
	if b.seq != seq {
		b = beatMark{seq: seq, at: time.Now()}
		a.oh.beats[task.ID] = b
	}
	return b.at
}

type beatMark struct {
	seq int64
	at  time.Time
}

// pebbleBeat is how long one beat lasts.
const pebbleBeat = 900 * time.Millisecond

// drawPebble is the mark at work (D498, research/216): a pebble that swells
// a little with a soft ring once when a step lands (beat) and rests between;
// dimmed when no step has come for a while (still). Reduced motion: no beat.
func drawPebble(col ui.Color, beat time.Time, still bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		rad := float32(6)
		if r.W < 12 {
			rad = r.W / 2
		}
		if still {
			p.FillPath(oval(cx, cy, rad, rad), col.Alpha(0.45))
			return
		}
		if !beat.IsZero() && !p.Preferences().ReduceMotion {
			if k := float64(p.Now().Sub(beat)) / float64(pebbleBeat); k >= 0 && k < 1 {
				s := float32(math.Sin(math.Pi * math.Min(1, k/0.7)))
				halo := rad + 2 + 7*float32(k)
				p.FillPath(oval(cx, cy, halo, halo), col.Alpha(0.22*float32(1-k)))
				rad *= 1 + 0.25*s
				idleFrame(p)
			}
		}
		p.FillPath(oval(cx, cy, rad, rad), col)
	}
}
