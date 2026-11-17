package views

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D325: the Go port of the locator's landmarks makes what the TS model
// makes (fixtures/landmarks.json), the nearest to every turn and the ones
// in view alike.
func TestLandmarksFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/landmarks.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name   string               `json:"name"`
		Turns  []protocol.IndexTurn `json:"turns"`
		Want   json.RawMessage      `json:"want"`
		Near   []int                `json:"near"`
		InView []struct {
			First int    `json:"first"`
			Last  int    `json:"last"`
			Got   [2]int `json:"got"`
		} `json:"inView"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) < 3 {
		t.Fatalf("only %d cases", len(cases))
	}
	for _, c := range cases {
		lms := landmarksOf(c.Turns)
		sameJSON(t, c.Name, lms, c.Want)
		for i, w := range c.Near {
			if g := landmarkNear(lms, i); g != w {
				t.Errorf("%s: nearest to turn %d is %d, want %d", c.Name, i, g, w)
			}
		}
		for _, v := range c.InView {
			if lo, hi := landmarksIn(lms, v.First, v.Last); lo != v.Got[0] || hi != v.Got[1] {
				t.Errorf("%s: in view %d..%d is [%d,%d), want %v", c.Name, v.First, v.Last, lo, hi, v.Got)
			}
		}
	}
}

// D325: a range of times reads in order, with its day when not today and
// both days when it crosses one (the "10:46–10:32" of a loop overnight).
func TestSpanWords(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.Local)
	at := func(d, h, m int) string {
		return time.Date(2026, 11, d, h, m, 0, 0, time.Local).UTC().Format(time.RFC3339)
	}
	for _, c := range []struct {
		a, b   string
		zh, en string
	}{
		{at(17, 10, 32), at(17, 10, 46), "10:32–10:46", "10:32–10:46"},
		{at(17, 10, 46), at(17, 10, 32), "10:32–10:46", "10:32–10:46"},
		{at(16, 10, 46), at(17, 10, 32), "昨天 10:46–今天 10:32", "yesterday 10:46–today 10:32"},
		{at(16, 9, 5), at(16, 22, 10), "昨天 9:05–22:10", "yesterday 9:05–22:10"},
		{at(17, 9, 47), "", "9:47", "9:47"},
		{at(17, 11, 51), at(17, 11, 51), "11:51", "11:51"},
		{at(16, 9, 47), "", "昨天 9:47", "yesterday 9:47"},
	} {
		if g := i18n.Span(i18n.ZH, c.a, c.b, now); g != c.zh {
			t.Errorf("zh %s..%s = %q, want %q", c.a, c.b, g, c.zh)
		}
		if g := i18n.Span(i18n.EN, c.a, c.b, now); g != c.en {
			t.Errorf("en %s..%s = %q, want %q", c.a, c.b, g, c.en)
		}
	}
}

// D325: the list stays light over a long session: its landmarks made from
// a 50,000-event index, and moving the choice through all of them, each
// well under a frame.
func TestLandmarksLight(t *testing.T) {
	evs := longTask(50000, "big")
	ix := indexOf(evs)
	start := time.Now()
	lms := landmarksOf(ix.Turns)
	made := time.Since(start)
	if len(lms) == 0 {
		t.Fatal("no landmarks")
	}
	start = time.Now()
	sel := 0
	for i := range ix.Turns {
		sel = landmarkNear(lms, i)
		landmarksIn(lms, i, i+3)
	}
	moved := time.Since(start) / time.Duration(len(ix.Turns))
	_ = sel
	if made > 8*time.Millisecond || moved > 50*time.Microsecond {
		t.Errorf("landmarks of %d turns: made in %v, each move %v", len(ix.Turns), made, moved)
	}
	t.Log(fmt.Sprintf("%d turns → %d landmarks in %v; a move %v", len(ix.Turns), len(lms), made, moved))
}
