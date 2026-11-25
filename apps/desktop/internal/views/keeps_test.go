package views

import (
	"strings"
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
	if hasText(tt, "12 月 20 日上海飞东京的机票的票价") {
		t.Errorf("the round is a row on On hand: %q", tt.Texts())
	}
	if !hasText(tt, "看守中") || !hasText(tt, "改签确认") {
		t.Errorf("On hand lost its own rows: %q", tt.Texts())
	}
}

// D519: no Han character alone on a wrapped line (「…东京的机 / 票」), and
// a PR's phase always reads whole (「%s 要求修改」 on a babysitter's row).
func TestKeepWordsWhole(t *testing.T) {
	for in, want := range map[string]string{
		"12 月 20 日上海飞东京的机票":           "12 月 20 日上海飞东京的机⁠票",
		"分给你的待…":                      "分给你的⁠待…",
		"Shanghai to Tokyo on Dec 20": "Shanghai to Tokyo on Dec 20",
		"持续评审 nowledge-co…":           "持续评审 nowledge-co…",
	} {
		if got := noOrphan(in); got != want {
			t.Errorf("noOrphan(%q) = %q, want %q", in, got, want)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		for _, by := range [][]string{nil, {""}, {" "}} {
			w := app.prPhaseWords(protocol.PRSaid{Phase: "changes", By: by}, "")
			if strings.Contains(w, "%") || w != app.L.T("onhand.prs.changes.anon") {
				t.Errorf("%s: changes with no reviewer reads %q", lang, w)
			}
		}
		if w := app.prPhaseWords(protocol.PRSaid{Phase: "changes", By: []string{"100gle"}}, ""); !strings.Contains(w, "100gle") {
			t.Errorf("%s: the reviewer left out: %q", lang, w)
		}
	}
}
