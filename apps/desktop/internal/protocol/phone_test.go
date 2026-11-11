package protocol

import (
	"encoding/json"
	"testing"
)

// D193: the phone frames as the core writes them, and the client frames as
// it reads them (packages/protocol/src/phone.ts and index.ts).
func TestPhoneFrames(t *testing.T) {
	f, err := DecodeServerFrame([]byte(`{"t":"connection_signin","signIn":{"url":"https://api.tuwa.ai/mcp","name":"Tuwa","state":"waiting","userCode":"WXYZ-2345","verifyUrl":"https://api.tuwa.ai/oauth/device","verifyUrlComplete":"https://api.tuwa.ai/oauth/device?user_code=WXYZ-2345","expiresAt":"2026-11-11T03:15:00Z","qr":["101","010","101"]}}`))
	if err != nil || f.SignIn == nil || f.SignIn.UserCode != "WXYZ-2345" || len(f.SignIn.QR) != 3 {
		t.Fatalf("connection_signin: %v %+v", err, f.SignIn)
	}
	f, err = DecodeServerFrame([]byte(`{"t":"phone_voice_result","action":"record","ok":true,"url":"https://tuwa.ai/record/x"}`))
	if err != nil || !f.OK || f.URL == "" || f.Action != "record" {
		t.Fatalf("phone_voice_result: %v %+v", err, f)
	}
	f, err = DecodeServerFrame([]byte(`{"t":"connections","connections":[{"id":"c1","name":"Tuwa","url":"https://api.tuwa.ai/mcp","source":"mcp","addedAt":"x","via":"manual","state":"ok","signIn":true,"phone":{"provider":"Tuwa","capUsd":10,"spentTodayUsd":1.6,"calls":1,"voice":{"enrolled":true,"on":false},"doNotCall":0,"rails":{"cap":true,"sampling":true,"shared":true}}}],"oo":{"installed":false,"account":false}}`))
	if err != nil || f.Connections[0].Phone == nil || f.Connections[0].Phone.CapUSD != 10 || !f.Connections[0].Phone.Rails.Sampling || !f.Connections[0].SignIn {
		t.Fatalf("connections with a phone: %v %+v", err, f.Connections)
	}
	f, err = DecodeServerFrame([]byte(`{"t":"on_hand","onHand":{"tasks":[],"counts":{"needs_you":0,"working":0,"waiting":0,"done_today":0},"waiters":[],"calls":[{"callId":"call_1","connectionId":"c1","state":"talking","plan":{"to":"+81312345678","name":"Sushi Saito","goal":"book","say":[],"mustNot":[],"voice":"ducter","from":"provider","provider":"Tuwa","minutes":4,"costUsd":1.6,"perMinUsd":0.4,"calleeZone":"Asia/Tokyo"},"talkingSince":"2026-11-11T03:01:00Z","updatedAt":"2026-11-11T03:02:00Z"}]}}`))
	if err != nil || len(f.OnHand.Calls) != 1 || f.OnHand.Calls[0].Plan.CostUSD != 1.6 {
		t.Fatalf("on_hand calls: %v %+v", err, f.OnHand)
	}
	ev := LogEvent{Kind: KindDecision, Body: json.RawMessage(`{"decisionId":"d1","question":"打给 Sushi Saito？","goLabel":"打过去","defaultOption":"hold","reversible":false,"call":{"callId":"call_1","kind":"go","plan":{"to":"+81312345678","name":"Sushi Saito","goal":"book","say":["Weyl"],"mustNot":[],"voice":"ducter","from":"provider","provider":"Tuwa","minutes":4,"costUsd":1.6,"perMinUsd":0.4,"calleeZone":"Asia/Tokyo"}}}`)}
	v, err := ev.Typed()
	if d, ok := v.(*Decision); err != nil || !ok || d.Call == nil || d.Call.Plan.Name != "Sushi Saito" {
		t.Fatalf("a call's decision: %v %+v", err, v)
	}
	ev = LogEvent{Kind: KindPhoneCall, Body: json.RawMessage(`{"callId":"call_1","connectionId":"c1","state":"done","plan":{"to":"+8131","name":"x","goal":"y","say":[],"mustNot":[],"voice":"ducter","from":"provider","provider":"Tuwa","minutes":4,"costUsd":1.6,"perMinUsd":0.4,"calleeZone":"Asia/Tokyo"},"durationSec":190,"costUsd":1.6}`)}
	if v, err := ev.Typed(); err != nil || *v.(*CallBody).DurationSec != 190 {
		t.Fatalf("phone_call: %v %+v", err, v)
	}
	// D208: the wait, Call now, an automated end with its hint.
	ev = LogEvent{Kind: KindPhoneCall, Body: json.RawMessage(`{"callId":"call_2","connectionId":"c1","state":"automated","hint":"screening","callNow":true,"reason":"call_failed","plan":{"to":"+12025550147","name":"x","goal":"y","say":[],"mustNot":[],"voice":"ducter","from":"provider","provider":"Tuwa","minutes":2,"costUsd":0.6,"perMinUsd":0.3,"calleeZone":"Asia/Tokyo","at":"2026-11-12T00:00:00.000Z","wait":{"why":"callee","zone":"Asia/Tokyo","their":"20:03","then":"09:00"},"canNow":true,"own":true}}`)}
	if v, err := ev.Typed(); err != nil {
		t.Fatal(err)
	} else if c := v.(*CallBody); c.State != CallAutomated || !CallEnded(c.State) || c.Hint != "screening" || !c.CallNow || c.Plan.Wait == nil || c.Plan.Wait.Their != "20:03" || !c.Plan.CanNow || !c.Plan.Own {
		t.Fatalf("D208 call: %+v", c)
	}
	ev = LogEvent{Kind: KindDecisionResolved, Body: json.RawMessage(`{"decisionId":"d1","option":"go","by":"user","now":true}`)}
	if v, err := ev.Typed(); err != nil || !v.(*DecisionResolved).Now {
		t.Fatalf("decision_resolved now: %v %+v", err, v)
	}
	for want, v := range map[string]any{
		`{"t":"connection_signin_cancel"}`:               ConnectionSignInCancel{T: "connection_signin_cancel"},
		`{"t":"connection_reauth","id":"c1"}`:            ConnectionReauth{T: "connection_reauth", ID: "c1"},
		`{"t":"phone_voice","action":"record"}`:          PhoneVoice{T: "phone_voice", Action: "record"},
		`{"t":"call_cancel","callId":"call_1"}`:          CallCancel{T: "call_cancel", CallID: "call_1"},
		`{"t":"phone_cap","usd":20}`:                     PhoneCap{T: "phone_cap", USD: 20},
		`{"t":"call_now","callId":"call_1"}`:             CallNow{T: "call_now", CallID: "call_1"},
		`{"t":"connection_add","url":"` + TuwaMCP + `"}`: ConnectionAdd{T: "connection_add", URL: TuwaMCP},
	} {
		got, _ := json.Marshal(v)
		if string(got) != want {
			t.Errorf("got %s, want %s", got, want)
		}
	}
}
