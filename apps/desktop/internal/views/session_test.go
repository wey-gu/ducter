package views

// D320: the Go port of the session index and window passes the TS
// reference's fixtures (packages/protocol/test/session.test.ts): the
// index of every transcript case, its turns built one at a time, and the
// window's asks and keeps.

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func sameJSON(t *testing.T, name string, got any, want json.RawMessage) {
	t.Helper()
	b, _ := json.Marshal(got)
	var g, w any
	_ = json.Unmarshal(b, &g)
	_ = json.Unmarshal(want, &w)
	if !reflect.DeepEqual(g, w) {
		t.Errorf("%s:\n got %s\nwant %s", name, b, want)
	}
}

func TestSessionIndexFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/transcript.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name    string              `json:"name"`
		Harness string              `json:"harness"`
		Working bool                `json:"working"`
		Events  []protocol.LogEvent `json:"events"`
		Want    json.RawMessage     `json:"want"`
		Index   json.RawMessage     `json:"index"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		ix := indexOf(c.Events)
		sameJSON(t, c.Name+": index", ix, c.Index)
		sameJSON(t, c.Name+": built turn by turn", builtTurns(slotsOf(c.Harness, ix, c.Events, c.Working, turnCache{})), c.Want)
	}
}

// nullSpan reads a span whose to may be null (Infinity).
type nullSpan struct {
	From int64  `json:"from"`
	To   *int64 `json:"to"`
}

func (s nullSpan) span() protocol.Span {
	if s.To == nil {
		return protocol.Span{From: s.From, To: protocol.SpanEnd}
	}
	return protocol.Span{From: s.From, To: *s.To}
}

func TestSessionWindowFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/session.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Index protocol.SessionIndex `json:"index"`
		Cases []struct {
			Name  string     `json:"name"`
			Spans []nullSpan `json:"spans"`
			View  struct {
				First int `json:"first"`
				Last  int `json:"last"`
				Dir   int `json:"dir"`
			} `json:"view"`
			Ask *struct {
				BeforeSeq *int64 `json:"beforeSeq"`
				AfterSeq  *int64 `json:"afterSeq"`
				Limit     int    `json:"limit"`
			} `json:"ask"`
			Keep []nullSpan `json:"keep"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	ix := &f.Index
	for _, c := range f.Cases {
		var spans []protocol.Span
		for _, s := range c.Spans {
			spans = append(spans, s.span())
		}
		var held []protocol.LogEvent
		for seq := ix.Turns[0].Seq; seq <= ix.Last; seq++ {
			if protocol.Covers(spans, seq, seq) {
				held = append(held, protocol.LogEvent{Seq: seq})
			}
		}
		v := sessionView{c.View.First, c.View.Last, c.View.Dir}
		a, ok := nextAsk(ix, spans, held, v)
		switch {
		case c.Ask == nil && ok:
			t.Errorf("%s: asked %+v, want nothing", c.Name, a)
		case c.Ask != nil && !ok:
			t.Errorf("%s: asked nothing, want %+v", c.Name, *c.Ask)
		case c.Ask != nil && c.Ask.AfterSeq != nil && (!a.After || a.AfterSeq != *c.Ask.AfterSeq || a.Limit != c.Ask.Limit):
			t.Errorf("%s: asked %+v, want after %d", c.Name, a, *c.Ask.AfterSeq)
		case c.Ask != nil && c.Ask.BeforeSeq != nil && (a.After || a.BeforeSeq != *c.Ask.BeforeSeq || a.Limit != c.Ask.Limit):
			t.Errorf("%s: asked %+v, want before %d", c.Name, a, *c.Ask.BeforeSeq)
		}
		var want []protocol.Span
		for _, s := range c.Keep {
			want = append(want, s.span())
		}
		if got := keepFor(ix, held, &v); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: keep %+v, want %+v", c.Name, got, want)
		}
	}
	// Spans join where they meet, and cut to what is kept.
	if got := protocol.AddSpan([]protocol.Span{{From: 10, To: 20}}, protocol.Span{From: 21, To: 30}); !reflect.DeepEqual(got, []protocol.Span{{From: 10, To: 30}}) {
		t.Errorf("join: %+v", got)
	}
	if got := protocol.CutSpans([]protocol.Span{{From: 0, To: protocol.SpanEnd}}, []protocol.Span{{From: 50, To: 60}, {From: 90, To: protocol.SpanEnd}}); !reflect.DeepEqual(got, []protocol.Span{{From: 50, To: 60}, {From: 90, To: protocol.SpanEnd}}) {
		t.Errorf("cut: %+v", got)
	}
}

// A page or a live event builds only its own turns.
func TestSlotsBuildOnlyTheirOwn(t *testing.T) {
	evs := longTask(3000, "s1")
	ix := indexOf(evs[:2990])
	cache := turnCache{}
	first := slotsOf("claude-code", ix, evs[:2990], true, cache)
	again := slotsOf("claude-code", ix, evs[:2990], true, cache)
	for i := range first {
		if first[i].Turn() != again[i].Turn() {
			t.Fatalf("turn %d built again with nothing changed", i)
		}
	}
	for i := 2990; i < 3000; i++ {
		indexAdd(ix, &evs[i])
	}
	next := slotsOf("claude-code", ix, evs, true, cache)
	rebuilt := 0
	for i := range first {
		if next[i].Turn() != first[i].Turn() {
			rebuilt++
		}
	}
	if rebuilt > 2 {
		t.Fatalf("%d turns built again for 10 live events", rebuilt)
	}
	// Built alone, the same as built all at once.
	all, _ := json.Marshal(turnsOf(blocksOf("claude-code", evs, true)))
	sameJSON(t, "long task", builtTurns(next), all)
}
