package views

// D325: the locator's list of landmarks, the Go port of
// packages/protocol/src/landmarks.ts (both pass fixtures/landmarks.json):
// made from the session index alone, so a session of any length lists every
// one without loading a turn. A landmark is a turn someone opened by saying
// something, a mark of the index (a report, a compaction, a switch or move,
// an interruption), or a run of quiet turns between them said once. A quiet
// turn that reports is its report.

import (
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Landmark is one row of the locator's list.
type Landmark struct {
	K     string                `json:"k"`
	From  int                   `json:"from"`
	To    int                   `json:"to"`
	Seq   int64                 `json:"seq"`
	Text  string                `json:"text,omitempty"`
	P     *protocol.IndexPrompt `json:"p,omitempty"`
	N     int                   `json:"n,omitempty"`
	Wakes bool                  `json:"wakes,omitempty"`
	At    string                `json:"at"`
	EndAt string                `json:"endAt,omitempty"`
	// D526: a brief the person wrote themselves; how a report stood.
	By string `json:"by,omitempty"`
	S  string `json:"s,omitempty"`
}

var landmarkMarks = map[string]bool{"report": true, "compacted": true, "switched": true, "moved": true, "interrupted": true}

func saidIndexTurn(t *protocol.IndexTurn) bool {
	return t.P != nil && (t.P.K == "brief" || t.P.K == "you" || t.P.K == "partner")
}

func firstWords(s string) string {
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			return l
		}
	}
	return ""
}

// landmarksOf is the landmarks of a session's turns, in order.
func landmarksOf(turns []protocol.IndexTurn) []Landmark {
	out := []Landmark{}
	var run []int
	flush := func() {
		switch {
		case len(run) == 1:
			t := &turns[run[0]]
			out = append(out, Landmark{K: "quiet", From: run[0], To: run[0], Seq: t.Seq, P: t.P, At: t.At})
		case len(run) > 1:
			a, b := &turns[run[0]], &turns[run[len(run)-1]]
			wakes := true
			for _, i := range run {
				wakes = wakes && turns[i].P.K == "wake"
			}
			out = append(out, Landmark{K: "quiet", From: run[0], To: run[len(run)-1], Seq: b.Seq, N: len(run), Wakes: wakes, At: a.At, EndAt: b.At})
		}
		run = run[:0]
	}
	for i := range turns {
		t := &turns[i]
		reports := false
		for _, m := range t.Marks {
			reports = reports || m.K == "report"
		}
		switch {
		case saidIndexTurn(t):
			flush()
			lm := Landmark{K: t.P.K, From: i, To: i, Seq: t.Seq, Text: firstWords(t.P.Text), At: t.At}
			if t.P.K == "brief" && t.P.By == "you" {
				lm.By = "you"
			}
			out = append(out, lm)
		case t.P != nil && !reports:
			run = append(run, i)
		}
		for _, m := range t.Marks {
			if !landmarkMarks[m.K] {
				continue
			}
			flush()
			at := m.At
			if at == "" {
				at = t.EndAt
			}
			out = append(out, Landmark{K: m.K, From: i, To: i, Seq: t.Seq, Text: m.W, At: at, S: m.S})
		}
	}
	flush()
	return out
}

// firstEndingAtOrAfter is the first landmark whose turns end at or after
// turn i (rows are in turn order).
func firstEndingAtOrAfter(lms []Landmark, i int) int {
	lo, hi := 0, len(lms)
	for lo < hi {
		m := (lo + hi) >> 1
		if lms[m].To < i {
			lo = m + 1
		} else {
			hi = m
		}
	}
	return lo
}

// landmarkNear is the landmark nearest turn i (one that holds it, else the
// closer of the two around it; the later on a tie), or -1.
func landmarkNear(lms []Landmark, i int) int {
	if len(lms) == 0 {
		return -1
	}
	k := firstEndingAtOrAfter(lms, i)
	if k >= len(lms) {
		return len(lms) - 1
	}
	if lms[k].From <= i || k == 0 {
		return k
	}
	if i-lms[k-1].To < lms[k].From-i {
		return k - 1
	}
	return k
}

// landmarksIn is the landmarks standing for any turn from first to last
// (the turns in view), as [lo, hi).
func landmarksIn(lms []Landmark, first, last int) (int, int) {
	if last < first {
		return 0, 0
	}
	lo := firstEndingAtOrAfter(lms, first)
	hi := lo
	for hi < len(lms) && lms[hi].From <= last {
		hi++
	}
	return lo, hi
}
