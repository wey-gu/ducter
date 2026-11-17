package protocol

import (
	"encoding/json"
	"testing"
)

// D329: the Noted line's replaced and waiting, Memory's undone and waiting, a
// settings frame's undid, mem_closed's canOpen, Update all's Mem step, and the
// two new client frames, as the home sends and reads them.
func TestD329Frames(t *testing.T) {
	ev := LogEvent{Seq: 3, Kind: KindMemoryNoted, Body: json.RawMessage(`{"title":"周报周四发","memoryId":"m2","replyTo":1,"replaced":{"id":"m1","title":"周报周五发"},"waiting":"k-1"}`)}
	v, err := ev.Typed()
	if err != nil {
		t.Fatal(err)
	}
	n := v.(*MemoryNoted)
	if n.Replaced == nil || n.Replaced.ID != "m1" || n.Replaced.Title != "周报周五发" || n.Waiting != "k-1" {
		t.Fatalf("%+v", n)
	}
	f, err := DecodeServerFrame([]byte(`{"t":"settings","settings":{"name":"x","memory":true},"mem":{"state":"connected","noted":[],"undone":[3],"waiting":[4]},"undid":{"seq":3,"ok":false},
		"bridge":{"state":"mem_closed","identity":"ducter","home":"hel","canOpen":true}}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Mem.Undone) != 1 || f.Mem.Undone[0] != 3 || f.Mem.Waiting[0] != 4 || f.Undid == nil || f.Undid.Seq != 3 || f.Undid.OK || f.Bridge.State != "mem_closed" || !f.Bridge.CanOpen {
		t.Fatalf("%+v %+v %+v", f.Mem, f.Undid, f.Bridge)
	}
	f, err = DecodeServerFrame([]byte(`{"t":"devices","devices":[],"updateAll":{"offer":[{"key":"mem:local","kind":"mem","device":"local","deviceName":"hel","from":"0.10.118","to":"","state":"queued","at":"2026-11-17T00:00:00Z"}],"notNow":[]}}`))
	if err != nil {
		t.Fatal(err)
	}
	if f.UpdateAll == nil || f.UpdateAll.Offer[0].Kind != "mem" {
		t.Fatalf("%+v", f.UpdateAll)
	}
	for want, frame := range map[string]any{`{"t":"memory_undo","seq":3}`: MemoryUndo{T: "memory_undo", Seq: 3}, `{"t":"bridge_mem_open"}`: BridgeAction{T: "bridge_mem_open"}} {
		b, _ := json.Marshal(frame)
		if string(b) != want {
			t.Errorf("%s != %s", b, want)
		}
	}
}
