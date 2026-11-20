package store

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D426: several things in one message, on the web's fixture: the latest
// lines stay on their message (also when they come before it), and they are
// no row of their own.
func TestManyAsksFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/many-asks.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Events []protocol.LogEvent `json:"events"`
		Want   map[string]struct {
			States []string `json:"states"`
			Count  []int    `json:"count"`
		} `json:"want"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	s := New()
	for _, e := range f.Events {
		s.ApplyEvent(e)
	}
	for seqS, want := range f.Want {
		seq, _ := strconv.ParseInt(seqS, 10, 64)
		var e *Entry
		for _, x := range s.Channel {
			if x.FirstSeq == seq {
				e = x
			}
		}
		if e == nil || e.User == nil || e.Asks == nil {
			t.Fatalf("message %d has no lines", seq)
		}
		var got []string
		for _, l := range e.Asks.Lines {
			got = append(got, l.State)
		}
		if len(got) != len(want.States) {
			t.Fatalf("message %d: states %v, want %v", seq, got, want.States)
		}
		for i := range got {
			if got[i] != want.States[i] {
				t.Errorf("message %d: states %v, want %v", seq, got, want.States)
			}
		}
		if len(want.Count) == 2 {
			done, left, ok := protocol.AsksCount(e.Asks.Lines)
			if !ok || done != want.Count[0] || left != want.Count[1] {
				t.Errorf("message %d: count %d/%d (%v), want %v", seq, done, left, ok, want.Count)
			}
		}
	}
	for _, e := range s.Channel {
		if e.User == nil && e.AI == nil && e.Job == nil {
			t.Errorf("a row that is no message: seq %d", e.FirstSeq)
		}
	}
}
