package store

import (
	"fmt"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D481: a question answered anywhere is answered on every surface of this
// window: the card in the conversation, On hand's rows and the 等你 count
// (and the Dock badge, which counts the same), the opened task's page. The
// matrix: each way it is resolved, live or missed while away (closed by On
// hand's openAsks, then the home's own events from asks_get), for a task's
// question and the partner's own (a loop's card has no task). The same
// matrix as apps/web/test/d481-asks-sync.test.ts.

type d481 struct {
	s   *Store
	seq int64
}

func (x *d481) ev(kind string, body any, stream string) protocol.LogEvent {
	x.seq++
	ts := time.Date(2026, 11, 23, 1, 0, int(x.seq), 0, time.UTC).Format(time.RFC3339)
	return protocol.NewEvent(x.seq, ts, "default", stream, protocol.OriginSystem, kind, body)
}

func (x *d481) apply(evs ...protocol.LogEvent) {
	x.s.Apply(protocol.ServerFrame{T: "events", Events: evs})
}

func (x *d481) ask(kind string) string {
	id := fmt.Sprintf("d_%s%d", kind, x.seq)
	if kind == "task" {
		x.apply(
			x.ev(protocol.KindTaskOpen, &protocol.TaskOpen{TaskID: "b7gw6r2e", Title: "在 hel 用 Gemini 审改 Mem 长文案并开 PR", Place: protocol.Place{Kind: "none"}, Harness: "antigravity"}, "task:b7gw6r2e"),
			x.ev(protocol.KindTaskState, &protocol.TaskState{TaskID: "b7gw6r2e", Attention: protocol.NeedsYou, Residency: "warm"}, "task:b7gw6r2e"),
		)
		x.apply(x.ev(protocol.KindDecision, &protocol.Decision{DecisionID: id, TaskID: "b7gw6r2e", Question: "要开 PR 吗？", GoLabel: "开 PR", DefaultOption: "hold", Reversible: true}, "channel"))
		return id
	}
	x.apply(x.ev(protocol.KindDecision, &protocol.Decision{DecisionID: id, Question: "这一轮跑了很久。", GoLabel: "现在跑一次", DefaultOption: "hold", Reversible: true, Loop: &protocol.LoopAsk{TaskID: "b7gw6r2e"}}, "channel"))
	return id
}

// waiting is every surface's view: where the question still waits for the person.
func (x *d481) waiting(id, kind string) []string {
	var out []string
	if d := x.s.Decisions[id]; d != nil && d.Resolved == nil && d.Pending == "" {
		out = append(out, "card")
	}
	for _, d := range x.s.OpenDecisions() {
		if d.DecisionID == id {
			out = append(out, "onHand")
		}
	}
	if kind == "task" {
		if d := x.s.PendingDecision("b7gw6r2e"); d != nil && d.DecisionID == id {
			out = append(out, "taskPage")
		}
	}
	return out
}

func onHandOf(ids []string, asOf int64) *protocol.OnHand {
	return &protocol.OnHand{OpenAsks: &protocol.OpenAsks{IDs: ids, AsOf: asOf}}
}

func TestD481Matrix(t *testing.T) {
	ways := []protocol.DecisionResolved{
		{Option: "go", By: "user"},
		{Option: "hold", By: "user"},
		{Option: "reply", Text: "应该是一直在推进，你可以直接看看吧？", By: "user"},
		{Option: "hold", By: "default"},
		{Option: "hold", By: "ended", Settled: true},
	}
	for _, kind := range []string{"task", "partner"} {
		for _, way := range ways {
			name := kind + "/" + way.Option + "/" + way.By
			t.Run(name+"/live", func(t *testing.T) {
				x := &d481{s: New()}
				x.s.Apply(protocol.ServerFrame{T: "welcome", Persona: "default"})
				id := x.ask(kind)
				if len(x.waiting(id, kind)) == 0 {
					t.Fatal("not shown open")
				}
				r := way
				r.DecisionID = id
				x.apply(x.ev(protocol.KindDecisionResolved, &r, "channel"))
				if w := x.waiting(id, kind); len(w) != 0 {
					t.Fatalf("still waiting on %v", w)
				}
			})
			t.Run(name+"/missed", func(t *testing.T) {
				x := &d481{s: New()}
				x.s.Apply(protocol.ServerFrame{T: "welcome", Persona: "default"})
				id := x.ask(kind)
				r := way
				r.DecisionID = id
				missed := x.ev(protocol.KindDecisionResolved, &r, "channel") // never delivered
				x.s.Apply(protocol.ServerFrame{T: "welcome", Persona: "default", HeadSeq: x.seq})
				x.s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: onHandOf(nil, x.seq)})
				if w := x.waiting(id, kind); len(w) != 0 {
					t.Fatalf("still waiting on %v after On hand", w)
				}
				if !x.s.Decisions[id].Elsewhere {
					t.Fatal("not marked as answered elsewhere")
				}
				if got := x.s.TakeAsksWanted(); len(got) != 1 || got[0] != id {
					t.Fatalf("asks_get %v", got)
				}
				if got := x.s.TakeAsksWanted(); len(got) != 0 {
					t.Fatalf("asked twice: %v", got)
				}
				x.apply(missed) // asks_get's answer
				d := x.s.Decisions[id]
				if d.Elsewhere || d.Resolved.Option != way.Option || d.Resolved.By != way.By {
					t.Fatalf("the home's resolution didn't replace the stand-in: %+v", d.Resolved)
				}
			})
		}
	}
}

func TestD481SnapshotOrder(t *testing.T) {
	x := &d481{s: New()}
	x.s.Apply(protocol.ServerFrame{T: "welcome", Persona: "default"})
	asOf := x.seq
	id := x.ask("partner") // after the snapshot was taken
	x.s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: onHandOf(nil, asOf)})
	if len(x.waiting(id, "partner")) == 0 {
		t.Fatal("a question asked after asOf was closed by an older snapshot")
	}
	// Open at the home, unknown here: asked for, then shown.
	x.s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: onHandOf([]string{id, "d_far"}, x.seq)})
	if got := x.s.TakeAsksWanted(); len(got) != 1 || got[0] != "d_far" {
		t.Fatalf("asks_get %v", got)
	}
	x.apply(x.ev(protocol.KindDecision, &protocol.Decision{DecisionID: "d_far", Question: "要改成每小时一次吗？", GoLabel: "改", DefaultOption: "hold", Reversible: true}, "channel"))
	if len(x.waiting("d_far", "partner")) != 2 {
		t.Fatalf("d_far: %v", x.waiting("d_far", "partner"))
	}
	// A new socket asks again for what it lacks.
	x.s.Apply(protocol.ServerFrame{T: "welcome", Persona: "default", HeadSeq: x.seq})
	x.s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: onHandOf([]string{"d_gone_far"}, x.seq)})
	if got := x.s.TakeAsksWanted(); len(got) != 3 {
		t.Fatalf("after a new socket: %v", got) // id and d_far closed (not in the set), d_gone_far unknown
	}
}
