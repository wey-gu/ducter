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
