package protocol

// D320: a task's session index (one small row per turn) and the spans of
// its stream a client holds. The data of packages/protocol/src/session.ts;
// the rules over them (indexAdd, nextAsk, keepFor, slotsOf) are in
// internal/views/session.go.

import (
	"math"
	"sort"
)

// IndexPrompt is what opened a turn, as the index carries it: its block's
// fields (k brief | you | partner | wake | told | go), texts cut at
// PromptMax, without pictures.
type IndexPrompt struct {
	K     string  `json:"k"`
	Seq   int64   `json:"seq"`
	Text  string  `json:"text,omitempty"`
	By    string  `json:"by,omitempty"`
	Label *string `json:"label,omitempty"`
	Say   string  `json:"say,omitempty"`
	Name  string  `json:"name,omitempty"`
	Timer bool    `json:"timer,omitempty"`
	Limit bool    `json:"limit,omitempty"`
}

// IndexMark is something inside a turn the locator can point at.
type IndexMark struct {
	Seq int64  `json:"seq"`
	K   string `json:"k"` // compacted switched moved retuned interrupted report
}

// IndexTurn is one turn of a session: where it starts and ends in the
// stream, when, what opened it, and about how tall it draws (H, in 16 px
// steps; S: it holds steps; V: its last words' length).
type IndexTurn struct {
	Seq   int64        `json:"seq"`
	End   int64        `json:"end"`
	N     int          `json:"n"`
	At    string       `json:"at"`
	EndAt string       `json:"endAt"`
	P     *IndexPrompt `json:"p,omitempty"`
	H     int          `json:"h"`
	S     int          `json:"s,omitempty"`
	V     int          `json:"v,omitempty"`
	Marks []IndexMark  `json:"marks,omitempty"`
}

// SessionIndex is a task's turns, its event count and newest seq, and what
// adding the next event needs.
type SessionIndex struct {
	Turns      []IndexTurn `json:"turns"`
	N          int         `json:"n"`
	Last       int64       `json:"last"`
	Briefed    bool        `json:"briefed,omitempty"`
	LastReport int64       `json:"lastReport,omitempty"`
	Wakes      int         `json:"wakes"`
	LastWakeAt string      `json:"lastWakeAt,omitempty"`
}

// SpanEnd is a span that runs through the newest event, kept live
// (Infinity in the TS reference).
const SpanEnd int64 = math.MaxInt64

// Span says every event of the stream from From to To is held.
type Span struct{ From, To int64 }

// AddSpan is spans with s, joined where they meet or overlap.
func AddSpan(spans []Span, s Span) []Span {
	all := append(append([]Span(nil), spans...), s)
	sort.SliceStable(all, func(i, j int) bool { return all[i].From < all[j].From })
	var out []Span
	for _, x := range all {
		if n := len(out); n > 0 && (out[n-1].To == SpanEnd || x.From <= out[n-1].To+1) {
			out[n-1].To = max(out[n-1].To, x.To)
			continue
		}
		out = append(out, x)
	}
	return out
}

// CutSpans is spans cut to what keep keeps.
func CutSpans(spans, keep []Span) []Span {
	var out []Span
	for _, s := range spans {
		for _, k := range keep {
			from, to := max(s.From, k.From), min(s.To, k.To)
			if from <= to {
				out = AddSpan(out, Span{from, to})
			}
		}
	}
	return out
}

// Covers reports whether every event from from to to is held.
func Covers(spans []Span, from, to int64) bool {
	for _, s := range spans {
		if s.From <= from && s.To >= to {
			return true
		}
	}
	return false
}

// JoinIndex is mine with the turns from fromSeq the home sent (they
// replace its own from there); all of got when fromSeq is 0.
func JoinIndex(mine, got *SessionIndex, fromSeq int64) *SessionIndex {
	if mine == nil || fromSeq == 0 {
		return got
	}
	out := *got
	out.Turns = nil
	for _, t := range mine.Turns {
		if t.Seq < fromSeq {
			out.Turns = append(out.Turns, t)
		}
	}
	out.Turns = append(out.Turns, got.Turns...)
	return &out
}

// SpanOfPage is the span a page of history answers for: what it holds, and
// on to the newest when it reached it; ok=false for none.
func SpanOfPage(f ServerFrame) (Span, bool) {
	n := len(f.Events)
	if f.AfterSeq != nil {
		a := *f.AfterSeq
		if n == 0 {
			if f.More {
				return Span{}, false
			}
			return Span{a + 1, SpanEnd}, true
		}
		if f.More {
			return Span{a + 1, f.Events[n-1].Seq}, true
		}
		return Span{a + 1, SpanEnd}, true
	}
	to := SpanEnd
	if f.BeforeSeq > 0 {
		to = f.BeforeSeq - 1
	}
	if n == 0 {
		if f.More {
			return Span{}, false
		}
		return Span{0, to}, true
	}
	if f.More {
		return Span{f.Events[0].Seq, to}, true
	}
	return Span{0, to}, true
}
