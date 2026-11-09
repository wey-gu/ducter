package protocol

import (
	"encoding/json"
	"testing"
)

// Frames as the TypeScript core writes them (packages/protocol/src/index.ts).
const eventsFrame = `{"t":"events","events":[
 {"seq":1,"ts":"2026-11-08T20:00:00.000Z","persona":"ducter","stream":"channel","origin":"user","kind":"user_msg","body":{"text":"fix CI","clientId":"c1"}},
 {"seq":2,"ts":"2026-11-08T20:00:01.000Z","persona":"ducter","stream":"task:t1","origin":"system","kind":"task_open","body":{"taskId":"t1","title":"Fix CI","project":"","place":{"kind":"repo","device":"mac","repoPath":"/r","worktree":"/w","branch":"ducter/x","baseBranch":"main"},"harness":"codex","brief":"b"}},
 {"seq":3,"ts":"2026-11-08T20:00:02.000Z","persona":"ducter","stream":"task:t1","origin":"task","kind":"task_event","body":{"taskId":"t1","role":"tool","tool":{"name":"Bash","input":{"command":"ls"},"output":"a\n","ok":true}}},
 {"seq":4,"ts":"2026-11-08T20:00:03.000Z","persona":"ducter","stream":"channel","origin":"partner","kind":"living_msg","body":{"items":[{"taskId":"t1","kind":"decision","title":"Fix CI","text":"rebase?","decisionId":"d1"}]},"supersedes":2}
]}`

func TestDecodeServerFrames(t *testing.T) {
	f, err := DecodeServerFrame([]byte(eventsFrame))
	if err != nil {
		t.Fatal(err)
	}
	if f.T != "events" || len(f.Events) != 4 {
		t.Fatalf("frame %+v", f)
	}
	open, err := f.Events[1].Typed()
	if err != nil {
		t.Fatal(err)
	}
	o := open.(*TaskOpen)
	if o.Place.Kind != "repo" || o.Place.Worktree != "/w" || o.Place.BaseBranch != "main" || o.Harness != "codex" {
		t.Errorf("task_open %+v", o)
	}
	ev, _ := f.Events[2].Typed()
	if te := ev.(*TaskEvent); te.Tool == nil || te.Tool.Name != "Bash" || te.Tool.OK == nil || !*te.Tool.OK {
		t.Errorf("task_event %+v", te)
	}
	if f.Events[3].Supersedes != 2 {
		t.Errorf("supersedes %d", f.Events[3].Supersedes)
	}
	lm, _ := f.Events[3].Typed()
	if items := lm.(*LivingMsg).Items; len(items) != 1 || items[0].DecisionID != "d1" {
		t.Errorf("living %+v", items)
	}

	for _, raw := range []string{
		`{"t":"welcome","persona":"ducter","personaName":"Ducter","headSeq":9}`,
		`{"t":"on_hand","onHand":{"tasks":[{"taskId":"t1","persona":"ducter","title":"x","project":"","place":{"kind":"none"},"harness":"pi","attention":"needs_you","residency":"warm","updatedAt":"2026-11-08T20:00:00Z"}],"counts":{"needs_you":1,"working":0,"waiting":0,"done_today":2}}}`,
		`{"t":"task_history","taskId":"t1","events":[]}`,
		`{"t":"error","message":"nope"}`,
	} {
		f, err := DecodeServerFrame([]byte(raw))
		if err != nil {
			t.Errorf("%s: %v", raw, err)
		}
		if f.T == "on_hand" && (f.OnHand.Counts.DoneToday != 2 || f.OnHand.Tasks[0].Attention != NeedsYou) {
			t.Errorf("on_hand %+v", f.OnHand)
		}
		if f.T == "welcome" && f.HeadSeq != 9 {
			t.Errorf("welcome %+v", f)
		}
	}
	if _, err := DecodeServerFrame([]byte(`{"t":"nope"}`)); err == nil {
		t.Error("an unknown frame decoded")
	}
}

func TestClientFramesEncodeAsTheContract(t *testing.T) {
	cur := int64(7)
	cases := map[string]any{
		`{"t":"hello","cursor":7,"locale":"zh"}`:                       Hello{T: "hello", Cursor: &cur, Locale: "zh"},
		`{"t":"send","text":"hi","clientId":"c1"}`:                     Send{T: "send", Text: "hi", ClientID: "c1"},
		`{"t":"decide","decisionId":"d1","option":"reply","text":"x"}`: Decide{T: "decide", DecisionID: "d1", Option: "reply", Text: "x"},
		`{"t":"task_send","taskId":"t1","text":"go on"}`:               TaskSend{T: "task_send", TaskID: "t1", Text: "go on"},
		`{"t":"read","upToSeq":4}`:                                     Read{T: "read", UpToSeq: 4},
		`{"t":"task_history","taskId":"t1","limit":50}`:                TaskHistoryReq{T: "task_history", TaskID: "t1", Limit: 50},
		`{"t":"task_action","taskId":"t1","action":"drop"}`:            TaskAction{T: "task_action", TaskID: "t1", Action: "drop"},
	}
	for want, v := range cases {
		got, _ := json.Marshal(v)
		if string(got) != want {
			t.Errorf("got %s, want %s", got, want)
		}
	}
}

// Protocol v2 (packages/protocol, commit 17dad6a): waiters, task_event
// from/usage, pendingDecision/openedAt on cards, the "sent" ack.
func TestProtocolV2Frames(t *testing.T) {
	if Version != 2 {
		t.Fatalf("version %d", Version)
	}
	f, err := DecodeServerFrame([]byte(`{"t":"on_hand","onHand":{"tasks":[{"taskId":"t1","persona":"p","title":"x","project":"","place":{"kind":"none"},"harness":"codex",
		"attention":"needs_you","residency":"warm","pendingDecisionId":"d1",
		"pendingDecision":{"decisionId":"d1","taskId":"t1","question":"rebase?","goLabel":"Rebase","defaultOption":"go","defaultAt":"2026-11-09T01:00:00Z","reversible":true,"askedAt":"2026-11-09T00:30:00Z"},
		"openedAt":"2026-11-09T00:00:00Z","updatedAt":"2026-11-09T00:30:00Z"}],
		"counts":{"needs_you":1,"working":0,"waiting":0,"done_today":0},
		"waiters":[{"waiterId":"w1","at":"2026-11-09T08:00:00Z","reason":"PR approval","state":"armed"}]}}`))
	if err != nil {
		t.Fatal(err)
	}
	c := f.OnHand.Tasks[0]
	if c.OpenedAt == "" || c.PendingDecision == nil || c.PendingDecision.GoLabel != "Rebase" || c.PendingDecision.AskedAt == "" || !c.PendingDecision.Reversible {
		t.Errorf("card %+v", c)
	}
	if w := f.OnHand.Waiters; len(w) != 1 || w[0].WaiterID != "w1" || w[0].TaskID != "" || w[0].State != WaiterArmed {
		t.Errorf("waiters %+v", w)
	}

	f, err = DecodeServerFrame([]byte(`{"t":"sent","taskId":"t1","delivered":"steered"}`))
	if err != nil || f.TaskID != "t1" || f.Delivered != DeliverySteered {
		t.Errorf("sent %+v %v", f, err)
	}

	f, _ = DecodeServerFrame([]byte(`{"t":"events","events":[
		{"seq":5,"ts":"2026-11-09T00:00:00Z","persona":"p","stream":"task:t1","origin":"user","kind":"task_event","body":{"taskId":"t1","role":"user","from":"user","text":"use the fixture"}},
		{"seq":6,"ts":"2026-11-09T00:00:01Z","persona":"p","stream":"task:t1","origin":"task","kind":"task_event","body":{"taskId":"t1","role":"assistant","text":"ok","usage":{"inputTokens":12,"outputTokens":3,"cacheRead":100}}},
		{"seq":7,"ts":"2026-11-09T00:00:02Z","persona":"p","stream":"channel","origin":"waiter","kind":"waiter","body":{"waiterId":"w1","taskId":"t1","at":"2026-11-09T08:00:00Z","reason":"CI","state":"armed"}}
	]}`))
	b, _ := f.Events[0].Typed()
	if te := b.(*TaskEvent); te.From != "user" || te.Role != "user" {
		t.Errorf("from %+v", te)
	}
	b, _ = f.Events[1].Typed()
	if u := b.(*TaskEvent).Usage; u == nil || u.InputTokens != 12 || u.CacheRead != 100 {
		t.Errorf("usage %+v", u)
	}
	b, _ = f.Events[2].Typed()
	if w, ok := b.(*Waiter); !ok || w.Reason != "CI" || w.TaskID != "t1" {
		t.Errorf("waiter %+v", b)
	}
	// A v1 snapshot (no waiters, no openedAt) still decodes.
	if _, err := DecodeServerFrame([]byte(`{"t":"on_hand","onHand":{"tasks":[],"counts":{"needs_you":0,"working":0,"waiting":0,"done_today":0}}}`)); err != nil {
		t.Error(err)
	}
}

// The activity frame (D104) decodes, and its null ends the turn.
func TestDecodeActivity(t *testing.T) {
	f, err := DecodeServerFrame([]byte(`{"t":"activity","activity":{"step":"recalling","since":"2026-11-09T10:00:00Z","stepSince":"2026-11-09T10:00:01Z"}}`))
	if err != nil || f.Activity == nil || f.Activity.Step != "recalling" {
		t.Fatalf("got %+v, %v", f.Activity, err)
	}
	f, err = DecodeServerFrame([]byte(`{"t":"activity","activity":null}`))
	if err != nil || f.Activity != nil {
		t.Fatalf("null: got %+v, %v", f.Activity, err)
	}
}

// D128: a task the user opened themselves, its diff stat, and the New task frames.
func TestNewTaskFrames(t *testing.T) {
	f, err := DecodeServerFrame([]byte(`{"t":"task_new_result","ok":true,"clientId":"c1","taskId":"t1","card":{"taskId":"t1","persona":"default","title":"Fix","project":"tinycart","place":{"kind":"repo","device":"local","repoPath":"/r","branch":"ducter/fix","baseBranch":"main"},"harness":"codex","attention":"queued","residency":"provisioning","openedAt":"x","updatedAt":"x","openedBy":"you","changes":{"files":3,"adds":42,"dels":7,"at":"x"}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if !f.OK || f.ClientID != "c1" || f.Card == nil || f.Card.OpenedBy != "you" || f.Card.Changes == nil || f.Card.Changes.Adds != 42 {
		t.Fatalf("task_new_result %+v", f)
	}
	o, err := DecodeServerFrame([]byte(`{"t":"task_new_options","places":[{"place":{"kind":"repo","device":"local","repoPath":"/r"},"name":"tinycart","defaultBranch":"main","branches":["main","dev"]},{"place":{"kind":"none"},"name":""}],"candidates":[{"harness":"codex","reason":{"kind":"fit"}}]}`))
	if err != nil || len(o.Places) != 2 || o.Places[0].DefaultBranch != "main" || len(o.Candidates) != 1 {
		t.Fatalf("task_new_options %+v %v", o, err)
	}
	if s, err := DecodeServerFrame([]byte(`{"t":"open_task","taskId":"t1"}`)); err != nil || s.TaskID != "t1" {
		t.Fatalf("open_task %+v %v", s, err)
	}
	b, _ := json.Marshal(TaskNew{T: "task_new", Words: "修一下测试", ClientID: "c1"})
	if string(b) != `{"t":"task_new","words":"修一下测试","clientId":"c1"}` {
		t.Errorf("task_new %s", b)
	}
}
