package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D511: a Keep's rounds are its own. The task a routine ran its round in stands
// under the Keep (never a row in 今天做完), and a round that waits for the
// person stays in 等你 with the Keep's name.
func TestKeepRoundsNotInDoneToday(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	now := "2026-11-24T02:10:00Z"
	keep := &protocol.TaskKeep{ID: "kp_f", Name: "12 月 20 日上海飞东京的机票"}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			{TaskID: "t_fare3", Title: "12 月 20 日上海飞东京的机票的票价", Attention: protocol.Done, UpdatedAt: now, Keep: keep},
			{TaskID: "t_fare4", Title: "改签确认", Attention: protocol.NeedsYou, UpdatedAt: now, Keep: keep},
			{TaskID: "t_other", Title: "整理本周 mem 的发布说明", Attention: protocol.Done, UpdatedAt: now},
		},
		Keeps: []protocol.KeepSheet{{ID: "kp_f", Title: keep.Name, Life: "on", Run: "fresh", Wakes: []protocol.KeepWake{{Kind: "at", Words: "每天早上 8:00"}}, TaskIDs: []string{"t_fare3", "t_fare4"}, Since: now}},
	}})
	hidden := app.keepHidden()
	if !hidden["t_fare3"] {
		t.Errorf("a finished round stands as its own row: %v", hidden)
	}
	if hidden["t_fare4"] || hidden["t_other"] {
		t.Errorf("hid what isn't the Keep's quiet round: %v", hidden)
	}
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if tt.HasText("12 月 20 日上海飞东京的机票的票价") {
		t.Errorf("the round is a row on On hand: %q", tt.Texts())
	}
	if !tt.HasText("在照看的") || !tt.HasText("改签确认") {
		t.Errorf("On hand lost its own rows: %q", tt.Texts())
	}
}
