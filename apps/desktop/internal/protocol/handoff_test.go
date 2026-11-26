package protocol

import (
	"encoding/json"
	"testing"
)

// D609: core sends the record's facts on a task's card and a helper Keep's page; the clients read
// the same fields (sender, state, item, givenAt, why) and never derive them from ids.
func TestHandoffLineOnTaskAndKeep(t *testing.T) {
	const line = `{"id":"ho_1","state":"returned","item":{"kind":"pr","ref":"nowledge-co/mem#11393","title":"修好 #11393"},"sender":"Ducter 的任务「官网」","to":"PR Babysitter","givenAt":"2026-11-26T16:31:00Z","at":"2026-11-26T17:02:00Z","taskId":"t-sender","why":"这个不是我接的范围","outcome":"评审通过"}`
	var card TaskCard
	if err := json.Unmarshal([]byte(`{"taskId":"t-sender","handoff":`+line+`}`), &card); err != nil {
		t.Fatal(err)
	}
	if card.Handoff == nil || card.Handoff.State != "returned" || card.Handoff.To != "PR Babysitter" || card.Handoff.Item.Ref != "nowledge-co/mem#11393" || card.Handoff.Why != "这个不是我接的范围" {
		t.Fatalf("task hand-off = %+v", card.Handoff)
	}
	var page KeepPage
	if err := json.Unmarshal([]byte(`{"handoffs":[`+line+`]}`), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Handoffs) != 1 || page.Handoffs[0].Sender != "Ducter 的任务「官网」" || page.Handoffs[0].GivenAt != "2026-11-26T16:31:00Z" || page.Handoffs[0].TaskID != "t-sender" {
		t.Fatalf("keep hand-offs = %+v", page.Handoffs)
	}
	// A helper with no records sends `[]`, not an absent field: its page still draws 手上的事's empty line.
	empty := KeepPage{}
	if err := json.Unmarshal([]byte(`{"handoffs":[]}`), &empty); err != nil {
		t.Fatal(err)
	}
	if empty.Handoffs == nil {
		t.Fatal("an empty handoffs list must stay a list")
	}
}
