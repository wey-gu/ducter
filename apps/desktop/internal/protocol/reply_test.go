package protocol

import (
	"encoding/json"
	"testing"
)

// D236: reply frames round-trip with the TS names.
func TestReplyFrames(t *testing.T) {
	b, _ := json.Marshal(Send{T: "send", Text: "再补一条", ClientID: "c1", Reply: &ReplyWant{Seq: 42, FindID: "f2"}})
	if string(b) != `{"t":"send","text":"再补一条","clientId":"c1","reply":{"seq":42,"findId":"f2"}}` {
		t.Errorf("send: %s", b)
	}
	b, _ = json.Marshal(Send{T: "send", Text: "hi", ClientID: "c2"})
	if string(b) != `{"t":"send","text":"hi","clientId":"c2"}` {
		t.Errorf("send without reply: %s", b)
	}
	in := `{"text":"帮我把这个弄好","clientId":"c1","reply":{"seq":7,"from":"partner","kind":"question","quote":"ducter.dev 11 月 20 日到期","clipped":true,"ts":"2026-11-12T09:00:00Z","taskIds":["t1"],"decisionId":"d1","answers":true}}`
	var u UserMsg
	if err := json.Unmarshal([]byte(in), &u); err != nil {
		t.Fatal(err)
	}
	if u.Reply == nil || u.Reply.Seq != 7 || u.Reply.From != "partner" || u.Reply.Kind != "question" || !u.Reply.Answers || u.Reply.DecisionID != "d1" {
		t.Fatalf("reply: %+v", u.Reply)
	}
	out, _ := json.Marshal(u)
	if string(out) != in {
		t.Errorf("round trip:\n%s\n%s", out, in)
	}
	var d DecisionResolved
	json.Unmarshal([]byte(`{"decisionId":"d1","option":"reply","text":"好","by":"user","msgSeq":9}`), &d)
	if d.MsgSeq != 9 {
		t.Errorf("msgSeq: %+v", d)
	}
	b, _ = json.Marshal(DecisionResolved{DecisionID: "d1", Option: "go", By: "user"})
	if string(b) != `{"decisionId":"d1","option":"go","by":"user"}` {
		t.Errorf("no msgSeq: %s", b)
	}
}
