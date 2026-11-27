package views

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D633: when the task's last word is the outside thing ending, its row and the opened task's
// head say that line, not the report written while it still waited.
func TestSettledLineIsTheRowAndTheHead(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	line := "#11389 已合并，这件结束。"
	now := time.Now().UTC().Format(time.RFC3339)
	ev := protocol.NewEvent(9, now, "default", protocol.TaskStream("t1"), protocol.OriginSystem, protocol.KindTaskEvent,
		protocol.TaskEvent{TaskID: "t1", Role: "system", From: "ducter", Text: line, Raw: json.RawMessage(`{"settled":{"ref":"nowledge-co/mem#11389","state":"merged","text":"#11389 已合并，这件结束。"}}`)})
	card := protocol.TaskCard{
		TaskID: "t1", Title: "接手 mem#11389 的收尾", Project: "mem", Harness: "codex",
		Attention: protocol.Done, Residency: protocol.Parked, OpenedAt: now, UpdatedAt: now, Latest: &ev,
		Place:      protocol.Place{Kind: "none"},
		LastReport: &protocol.Report{TaskID: "t1", State: "done", Summary: "已交回，等 #11389 合并。", Questions: []protocol.Question{}, Evidence: []protocol.EvidenceRef{}},
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}, Waiters: []protocol.Waiter{}}})
	task := app.S.Task("t1")
	if got := settledOf(task); got != line {
		t.Fatalf("settledOf = %q, want %q", got, line)
	}
	if got := app.storyOf(task).words; got != line {
		t.Fatalf("the row says %q, want %q", got, line)
	}
	app.OpenTask("t1")
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, line) {
		t.Fatalf("the opened task's head does not say %q: %q", line, tt.Texts())
	}
}
