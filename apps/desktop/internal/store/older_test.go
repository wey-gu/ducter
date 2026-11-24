package store

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"sort"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// olderFixture is the morning across midnight both clients fold (D509; the
// web's apps/web/test/older.test.ts and core's paging test read it too).
func olderFixture(t *testing.T) (evs []protocol.LogEvent, cut int64) {
	t.Helper()
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/older-pages.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cut    int64               `json:"cut"`
		Events []protocol.LogEvent `json:"events"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f.Events, f.Cut
}

func pick(evs []protocol.LogEvent, keep func(int64) bool) []protocol.LogEvent {
	var out []protocol.LogEvent
	for _, e := range evs {
		if keep(e.Seq) {
			out = append(out, e)
		}
	}
	return out
}

// shownOf is what the conversation shows: each row's place and words, and
// the state it is drawn with.
func shownOf(s *Store) []string {
	var out []string
	for _, e := range s.Channel {
		words := ""
		switch {
		case e.User != nil:
			words = e.User.Text
		case e.AI != nil:
			words = e.AI.Text
		case e.Job != nil && e.Job.Status != nil:
			words = e.Job.Status.Text
		case e.Living != nil:
			for _, it := range e.Living.Items {
				words += it.Text
			}
		}
		out = append(out, fmt.Sprintf("%d %s %s", e.FirstSeq, e.Event.Kind, words))
	}
	d := s.Decisions["d_retry"]
	res := ""
	if d != nil && d.Resolved != nil {
		res = d.Resolved.Option
	}
	var waiting []string
	for id := range s.Waiters {
		waiting = append(waiting, id)
	}
	sort.Strings(waiting)
	job := ""
	if j := s.Jobs["job_ci"]; j != nil && j.Status != nil {
		job = j.Status.State
	}
	q := ""
	if d != nil {
		q = d.Question
	}
	return append(out, "job "+job, "decision "+res+" "+q, fmt.Sprint("waiting ", waiting), fmt.Sprint("read ", s.ReadUpTo))
}

func welcomeFrame() protocol.ServerFrame {
	return protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 16}
}

// D509: the newest stretch, then the older page before it, reads as the
// whole conversation folded in order.
func TestOlderPageReadsAsInOrder(t *testing.T) {
	evs, cut := olderFixture(t)
	all := New()
	all.Apply(welcomeFrame())
	all.Apply(protocol.ServerFrame{T: "events", Events: pick(evs, func(s int64) bool { return s != 5 })})

	s := New()
	s.Apply(welcomeFrame())
	s.Apply(protocol.ServerFrame{T: "events", Events: pick(evs, func(s int64) bool { return s >= cut })})
	if s.Older.From != cut || !s.MoreOlder() {
		t.Fatalf("paging back starts at %d (more %v), want %d", s.Older.From, s.MoreOlder(), cut)
	}
	s.OlderAsked(cut)
	if s.MoreOlder() || !s.LoadingOlder() {
		t.Fatal("a second page asked while one is on its way")
	}
	s.Apply(protocol.ServerFrame{T: "channel_history", BeforeSeq: cut, Events: pick(evs, func(s int64) bool { return s < cut && s != 5 })})
	if got, want := shownOf(s), shownOf(all); !reflect.DeepEqual(got, want) {
		t.Fatalf("paged:\n%q\nin order:\n%q", got, want)
	}
	if s.Older != (OlderState{From: 1, Done: true}) || s.MoreOlder() || s.LoadingOlder() {
		t.Errorf("after the last page: %+v", s.Older)
	}
	if got := shownOf(s); got[len(got)-4] != "job done" || got[len(got)-2] != "waiting []" {
		t.Errorf("a newer state was taken back by the older page: %q", got[len(got)-4:])
	}
}

// A page nobody asked for (another partner's, an old socket's) changes
// nothing, and a new socket can ask again.
func TestOlderPageUnasked(t *testing.T) {
	evs, cut := olderFixture(t)
	s := New()
	s.Apply(welcomeFrame())
	s.Apply(protocol.ServerFrame{T: "events", Events: pick(evs, func(s int64) bool { return s >= cut })})
	before := shownOf(s)
	s.Apply(protocol.ServerFrame{T: "channel_history", BeforeSeq: cut, Events: pick(evs, func(s int64) bool { return s < cut })})
	if !reflect.DeepEqual(shownOf(s), before) {
		t.Errorf("an unasked page joined")
	}
	s.OlderAsked(cut)
	s.Apply(welcomeFrame())
	if !s.MoreOlder() {
		t.Errorf("a new socket can't ask again")
	}
}

// Pages come one before the other until the home says there are none.
func TestOlderPagesInFront(t *testing.T) {
	evs, _ := olderFixture(t)
	s := New()
	s.Apply(welcomeFrame())
	s.Apply(protocol.ServerFrame{T: "events", Events: pick(evs, func(s int64) bool { return s >= 14 })})
	s.OlderAsked(14)
	s.Apply(protocol.ServerFrame{T: "channel_history", BeforeSeq: 14, More: true, Events: pick(evs, func(s int64) bool { return s >= 9 && s < 14 })})
	if s.Older != (OlderState{From: 9}) {
		t.Fatalf("after a page with more: %+v", s.Older)
	}
	s.OlderAsked(9)
	s.Apply(protocol.ServerFrame{T: "channel_history", BeforeSeq: 9, Events: pick(evs, func(s int64) bool { return s < 9 && s != 5 })})
	if !sort.SliceIsSorted(s.Channel, func(i, j int) bool { return s.Channel[i].FirstSeq < s.Channel[j].FirstSeq }) {
		t.Errorf("rows out of order")
	}
	if s.Channel[0].User == nil || s.Channel[0].User.Text != "把 CI 上那个时好时坏的测试修一下" || !s.Older.Done {
		t.Errorf("the first message isn't first, or more is said: %+v", s.Older)
	}
}
