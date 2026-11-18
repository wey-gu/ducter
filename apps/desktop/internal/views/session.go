package views

// D320: a long session, opened: the Go port of
// packages/protocol/src/session.ts (both pass fixtures/session.json and
// fixtures/transcript.json's index). The session index is one small row
// per turn, made on the home and kept live here with the same indexAdd;
// the page lays out every turn from it, the locator draws the whole
// session from it, and a window of events around what is on screen is
// held: pages load ahead of the scroll (nextAsk), far ones are let go
// (keepFor). Each turn is built on its own with what it needs from the
// turns before it (slotsOf) and kept until its events change.

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode/utf16"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
)

// The window's sizes (D320), in events (WINDOW in session.ts).
const (
	winFirst  = 200  // the newest window an opened task asks for first (D284)
	winPage   = 300  // each page after it
	winKeep   = 1500 // held around what is on screen
	winTail   = 200  // always held: the newest (what the rest of the app reads)
	winAhead  = 600  // loaded ahead of the scroll
	winBehind = 300  // and behind it
	winSlack  = 300  // past keep + tail before far events are let go
	winEnough = 600  // a turn this big is shown from what is held
	winCap    = 2000 // events of a task not open, before its oldest go
	// promptMax is how much of what opened a turn the index carries.
	promptMax = 200
	// markMax is how much of a report's first line its mark carries (D325).
	markMax = 120
	// buildMax is the most events one turn is built from (its newest).
	buildMax = 1000
)

// u16len is s's length as JavaScript counts it (UTF-16 units).
func u16len(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

// heightOf is about how tall a settled turn draws, in 16 px steps.
func heightOf(t *protocol.IndexTurn) int {
	px := 20
	if t.P != nil {
		switch t.P.K {
		case "brief", "partner":
			px += 112
		case "you":
			px += 24 + 22*min(6, int(math.Ceil(float64(max(1, u16len(t.P.Text)))/60)))
		default:
			px += 28
		}
	}
	if t.S != 0 {
		px += 36
	}
	if t.V != 0 {
		px += 10 + 22*min(40, int(math.Ceil(float64(t.V)/70)))
	}
	return max(2, min(64, int(math.Round(float64(px)/16))))
}

// indexPrompt is a prompt as the index carries it: texts cut, no pictures.
func indexPrompt(b *Block) *protocol.IndexPrompt {
	text, _ := clipText(b.Text, promptMax)
	return &protocol.IndexPrompt{K: b.K, Seq: b.Seq, Text: text, By: b.By, Label: b.Label, Say: b.Say, Name: b.Name, Timer: b.Timer, Limit: b.Limit}
}

// promptBlock is an index's prompt as a block (a turn held from its
// middle, a placeholder's locator line).
func promptBlock(p *protocol.IndexPrompt) *Block {
	if p == nil {
		return nil
	}
	return &Block{K: p.K, Seq: p.Seq, Text: p.Text, By: p.By, Label: p.Label, Say: p.Say, Name: p.Name, Timer: p.Timer, Limit: p.Limit}
}

var indexMarks = map[string]bool{"compacted": true, "switched": true, "moved": true, "retuned": true, "interrupted": true}

// indexAdd adds an event of the task's stream to its index; false when the
// index has it already.
func indexAdd(ix *protocol.SessionIndex, ev *protocol.LogEvent) bool {
	if ev.Seq <= ix.Last {
		return false
	}
	ix.Last = ev.Seq
	ix.N++
	if p, ok := promptOf(ev, ix.Briefed); ok {
		if p.K == "brief" {
			ix.Briefed = true
		}
		if p.K == "wake" {
			ix.Wakes++
			ix.LastWakeAt = ev.TS
		}
		t := protocol.IndexTurn{Seq: ev.Seq, End: ev.Seq, N: 1, At: ev.TS, EndAt: ev.TS, P: indexPrompt(&p)}
		t.H = heightOf(&t)
		ix.Turns = append(ix.Turns, t)
		return true
	}
	if len(ix.Turns) == 0 {
		ix.Turns = append(ix.Turns, protocol.IndexTurn{Seq: ev.Seq, End: ev.Seq, At: ev.TS, EndAt: ev.TS})
	}
	t := &ix.Turns[len(ix.Turns)-1]
	t.End, t.EndAt = ev.Seq, ev.TS
	t.N++
	mark := func(k string) { t.Marks = append(t.Marks, protocol.IndexMark{Seq: ev.Seq, K: k, At: ev.TS}) }
	body, _ := ev.Typed()
	switch b := body.(type) {
	case *protocol.Report:
		ix.LastReport = ev.Seq
		mark("report")
		// D325: its first line, for the locator's list.
		for _, l := range strings.Split(b.Summary, "\n") {
			if l = strings.TrimSpace(l); l != "" {
				w, _ := clipText(l, markMax)
				t.Marks[len(t.Marks)-1].W = redact.Text(w)
				break
			}
		}
	case *protocol.Checkpoint:
		// D349: a saved note is one quiet line, not its words (unless it said them, already counted).
		if n := u16len(strings.TrimSpace(b.Text)); n > 0 && t.V == 0 {
			t.V = 1
		}
	case *protocol.TaskEvent:
		if len(b.Thinking) > 0 || b.Tool != nil {
			t.S = 1
		}
		switch {
		// D268: the plan stands in the turn that first wrote it, with the latest items.
		case b.Tool != nil && !hasMark(t, "plan") && len(planOf(b.Tool.Name, b.Tool.Input)) > 0:
			mark("plan")
		case b.Role == "assistant" && strings.TrimSpace(b.Text) != "":
			t.V = u16len(strings.TrimSpace(b.Text))
		case b.Role == "system":
			if n, ok := noteOf(strings.TrimSpace(b.Text), b.Raw); ok && indexMarks[n.Say] {
				mark(n.Say)
			}
		}
	}
	t.H = heightOf(t)
	return true
}

// indexOf is a whole stream's index.
func indexOf(events []protocol.LogEvent) *protocol.SessionIndex {
	ix := &protocol.SessionIndex{Turns: []protocol.IndexTurn{}}
	for i := range events {
		indexAdd(ix, &events[i])
	}
	return ix
}

// endOf is where turn i ends: its last event, or the newest for the last.
func endOf(ix *protocol.SessionIndex, i int) int64 {
	if i == len(ix.Turns)-1 {
		return max(ix.Turns[i].End, ix.Last)
	}
	return ix.Turns[i].End
}

// lowerBound is the first index in events at or after seq.
func lowerBound(events []protocol.LogEvent, seq int64) int {
	return sort.Search(len(events), func(i int) bool { return events[i].Seq >= seq })
}

// turnRange is the held events of turn i, [lo, hi) into events.
func turnRange(ix *protocol.SessionIndex, i int, events []protocol.LogEvent) (int, int) {
	lo := lowerBound(events, ix.Turns[i].Seq)
	if i+1 < len(ix.Turns) {
		return lo, lowerBound(events, ix.Turns[i+1].Seq)
	}
	return lo, len(events)
}

// turnHeld reports turn i held whole.
func turnHeld(ix *protocol.SessionIndex, spans []protocol.Span, i int) bool {
	return protocol.Covers(spans, ix.Turns[i].Seq, endOf(ix, i))
}

// turnAt is the turn holding seq, or -1.
func turnAt(ix *protocol.SessionIndex, seq int64) int {
	return sort.Search(len(ix.Turns), func(i int) bool { return ix.Turns[i].Seq >= seq+1 }) - 1
}

// sessionView is what is on screen: the first and last turn shown, and
// which way the reader last moved (-1 up, 1 down).
type sessionView struct {
	First, Last, Dir int
}

// sessionAsk is a page to ask for: before BeforeSeq, or after AfterSeq.
type sessionAsk struct {
	After     bool
	BeforeSeq int64
	AfterSeq  int64
	Limit     int
}

// nextAsk is the next page to ask for, ok=false when what is on screen and
// around it is held.
func nextAsk(ix *protocol.SessionIndex, spans []protocol.Span, events []protocol.LogEvent, v sessionView) (sessionAsk, bool) {
	n := len(ix.Turns)
	if n == 0 {
		return sessionAsk{}, false
	}
	first := max(0, min(v.First, n-1))
	last := max(first, min(v.Last, n-1))
	var order []int
	if v.Dir > 0 {
		for i := first; i <= last; i++ {
			order = append(order, i)
		}
	} else {
		for i := last; i >= first; i-- {
			order = append(order, i)
		}
	}
	walk := func(from, step, budget int) {
		for i, got := from, 0; i >= 0 && i < n && got < budget; i += step {
			order = append(order, i)
			got += ix.Turns[i].N
		}
	}
	if v.Dir > 0 {
		walk(last+1, 1, winAhead)
		walk(first-1, -1, winBehind)
	} else {
		walk(first-1, -1, winAhead)
		walk(last+1, 1, winBehind)
	}
	for _, i := range order {
		if turnHeld(ix, spans, i) {
			continue
		}
		if lo, hi := turnRange(ix, i, events); hi-lo >= winEnough {
			continue
		}
		return askFor(ix, spans, i, i < first), true
	}
	return sessionAsk{}, false
}

func askFor(ix *protocol.SessionIndex, spans []protocol.Span, i int, above bool) sessionAsk {
	t := ix.Turns[i]
	next := protocol.SpanEnd
	if i+1 < len(ix.Turns) {
		next = ix.Turns[i+1].Seq
	}
	prevEnd := int64(math.MinInt64)
	if i > 0 {
		prevEnd = ix.Turns[i-1].End
	}
	end := endOf(ix, i)
	var up, down *sessionAsk
	for _, s := range spans {
		if s.From > t.Seq && s.From <= next {
			up = &sessionAsk{BeforeSeq: s.From, Limit: winPage}
			break
		}
	}
	for k := len(spans) - 1; k >= 0; k-- {
		if s := spans[k]; s.To < end && s.To >= prevEnd {
			if s.To != protocol.SpanEnd {
				down = &sessionAsk{After: true, AfterSeq: s.To, Limit: winPage}
			}
			break
		}
	}
	pick := down
	if above {
		pick = up
	}
	if pick == nil {
		if above {
			pick = down
		} else {
			pick = up
		}
	}
	if pick != nil {
		return *pick
	}
	j, got := i, 0
	for j > 0 && got+ix.Turns[j-1].N <= winPage/3 {
		j--
		got += ix.Turns[j].N
	}
	return sessionAsk{After: true, AfterSeq: ix.Turns[j].Seq - 1, Limit: winPage}
}

// keepFor is what to keep when a task holds too much (nil while it holds
// no more than keep + tail + slack): winKeep events around what is on
// screen and always the newest winTail; with no view (a task not open),
// the newest winCap.
func keepFor(ix *protocol.SessionIndex, events []protocol.LogEvent, v *sessionView) []protocol.Span {
	limit, tailN := winCap, winCap
	if v != nil {
		limit, tailN = winKeep, winTail
	}
	if len(events) <= limit+winTail+winSlack {
		return nil
	}
	tail := protocol.Span{From: events[len(events)-tailN].Seq, To: protocol.SpanEnd}
	n := 0
	if ix != nil {
		n = len(ix.Turns)
	}
	if v == nil || n == 0 {
		return []protocol.Span{tail}
	}
	lo := max(0, min(v.First, n-1))
	hi := max(lo, min(v.Last, n-1))
	got := 0
	for i := lo; i <= hi; i++ {
		got += ix.Turns[i].N
	}
	up := v.Dir <= 0
	ahead, behind := 0, 0
	room := float64(max(0, winKeep-got))
	can := func(toUp bool) bool {
		if toUp {
			return lo > 0
		}
		return hi < n-1
	}
	grow := func(toUp bool) {
		var k int
		if toUp {
			lo--
			k = ix.Turns[lo].N
		} else {
			hi++
			k = ix.Turns[hi].N
		}
		if toUp == up {
			ahead += k
		} else {
			behind += k
		}
		got += k
	}
	for got < winKeep && (can(true) || can(false)) {
		switch {
		case float64(ahead) < room*2/3 && can(up):
			grow(up)
		case float64(behind) < room/3 && can(!up):
			grow(!up)
		case can(up):
			grow(up)
		default:
			grow(!up)
		}
	}
	to := protocol.SpanEnd
	if hi < n-1 {
		to = ix.Turns[hi+1].Seq - 1
	}
	return protocol.AddSpan([]protocol.Span{tail}, protocol.Span{From: ix.Turns[lo].Seq, To: to})
}

// hasMark reports whether a turn holds a mark of kind k.
func hasMark(t *protocol.IndexTurn, k string) bool {
	for _, m := range t.Marks {
		if m.K == k {
			return true
		}
	}
	return false
}

// slot is a turn of the page: its row in the index and how many of its
// events are held; its turn is built when first read (drawn, or read by
// the page) and kept in the cache while its events are the same (nil with
// nothing held: a placeholder of its height; nil with some held: it says
// nothing).
type slot struct {
	It   protocol.IndexTurn
	Held int
	Part bool
	make func() *builtTurn
	got  *builtTurn
	over *Turn // the plan post-pass's turn, when it changed it
}

// Turn is the slot's turn, built on first read.
func (s *slot) Turn() *Turn {
	if s.over != nil {
		return s.over
	}
	if s.make == nil {
		return nil
	}
	if s.got == nil {
		s.got = s.make()
	}
	return s.got.turn
}

type builtTurn struct {
	key  string
	turn *Turn
}

// turnCache is a task's built turns, by their first seq, until their
// events change.
type turnCache map[int64]*builtTurn

// slotsOf is the page's turns (D320): every turn of the index, each built
// from its own held events when first read, reusing what cache built while
// its events are the same; live: the last turn is under way. The app a run
// of browser steps is in carries within a turn, not from the turn before,
// so a turn is built only when it is read.
func slotsOf(harness string, ix *protocol.SessionIndex, events []protocol.LogEvent, live bool, cache turnCache) []slot {
	out := make([]slot, len(ix.Turns))
	seen := make(map[int64]bool, len(cache))
	var planned []int
	for i := range ix.Turns {
		it := ix.Turns[i]
		out[i].It = it
		lo, hi := turnRange(ix, i, events)
		if hi <= lo {
			continue
		}
		last := i == len(ix.Turns)-1
		if hi-lo > buildMax {
			lo = hi - buildMax
		}
		first := &events[lo]
		prevTS := ""
		if lo > 0 && i > 0 && events[lo-1].Seq >= ix.Turns[i-1].Seq {
			prevTS = events[lo-1].TS
		}
		var report int64
		if ix.LastReport != 0 && ix.LastReport >= it.Seq && ix.LastReport <= events[hi-1].Seq {
			report = ix.LastReport
		}
		key := fmt.Sprintf("%d:%d:%d:%v:%v:%s:%d", hi-lo, first.Seq, events[hi-1].Seq, last && live, !last, prevTS, report)
		seen[it.Seq] = true
		out[i].Held, out[i].Part = hi-lo, !(first.Seq == it.Seq && hi-lo >= it.N)
		part := events[lo:hi]
		briefed := (it.P == nil || it.P.K != "brief") && (i > 0 || ix.Briefed)
		lastReport := ix.LastReport
		out[i].make = func() *builtTurn {
			if b := cache[it.Seq]; b != nil && b.key == key {
				return b
			}
			blocks, _ := build(harness, part, last && live, buildCtx{Briefed: briefed, HasReport: true, LastReport: lastReport, PrevTS: prevTS, More: !last})
			turns := turnsOf(blocks)
			var turn *Turn
			if len(turns) > 0 {
				tu := Turn{Seq: turns[0].Seq, Prompt: turns[0].Prompt, Body: []Block{}}
				for k, x := range turns {
					if k > 0 && x.Prompt != nil {
						tu.Body = append(tu.Body, *x.Prompt)
					}
					tu.Body = append(tu.Body, x.Body...)
				}
				// Held from its middle: what opened it, from the index.
				if tu.Prompt == nil && it.P != nil && part[0].Seq != it.Seq {
					tu.Seq, tu.Prompt = it.Seq, promptBlock(it.P)
				}
				turn = &tu
			}
			b := &builtTurn{key: key, turn: turn}
			cache[it.Seq] = b
			return b
		}
		if hasMark(&it, "plan") {
			planned = append(planned, i)
		}
	}
	for k := range cache {
		if !seen[k] {
			delete(cache, k)
		}
	}
	slotPlans(out, planned)
	return out
}

// slotPlans keeps one plan per task (D268), as building all at once does:
// the first held, with the latest held items. Only the turns the index
// marks as writing a plan are built for it.
func slotPlans(slots []slot, planned []int) {
	type at struct{ i, j int }
	var ats []at
	for _, i := range planned {
		tu := slots[i].Turn()
		if tu == nil {
			continue
		}
		for j := range tu.Body {
			if tu.Body[j].K == "plan" {
				ats = append(ats, at{i, j})
			}
		}
	}
	if len(ats) < 2 {
		return
	}
	f, l := ats[0], ats[len(ats)-1]
	items := slots[l.i].Turn().Body[l.j].Items
	done := map[int]bool{}
	for _, a := range ats {
		if done[a.i] {
			continue
		}
		done[a.i] = true
		s := &slots[a.i]
		src := s.Turn()
		tu := *src
		tu.Body = []Block{}
		for j, b := range src.Body {
			if b.K != "plan" {
				tu.Body = append(tu.Body, b)
			} else if a.i == f.i && j == f.j {
				b.Items = items
				tu.Body = append(tu.Body, b)
			}
		}
		s.over = &tu
	}
}

// builtTurns is the turns built (every held one), in order.
func builtTurns(slots []slot) []Turn {
	var out []Turn
	for i := range slots {
		if tu := slots[i].Turn(); tu != nil {
			out = append(out, *tu)
		}
	}
	return out
}
