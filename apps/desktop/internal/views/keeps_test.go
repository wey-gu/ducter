package views

import (
	"strings"
	"testing"
	"time"

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

// D624: the Keep's held PR row says its CI, a draft, a conflict or changes
// requested, and the head commit, each its own element, in the same words On
// hand uses.
func TestKeepPRFacts(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	checks := &protocol.PRChecksSaid{Passed: 2, Total: 3, Pending: 0}
	got := app.prFacts(protocol.PRSaid{Phase: "changes", By: []string{"100gle"}, Checks: checks, Draft: true, Sha: "b2c3d4e"})
	want := []string{"CI 通过 2/3", "草稿", "看的是 b2c3d4e"}
	if len(got) != len(want) {
		t.Fatalf("prFacts = %q, want %q", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("fact %d = %q, want %q", i, got[i], want[i])
		}
	}
	// A draft's own phase already says it once; the fact is not repeated.
	got = app.prFacts(protocol.PRSaid{Phase: "draft", Checks: checks, Draft: true, Sha: "a1b2c3d"})
	for _, f := range got {
		if f == "草稿" {
			t.Errorf("the draft phase repeated its word: %q", got)
		}
	}
	if w := app.prPhaseWords(protocol.PRSaid{Phase: "conflict"}, "main"); w != "和 main 有冲突" {
		t.Errorf("conflict says %q", w)
	}
}

// D650: the Keep's head says its end, its rounds and how long it has run, each
// its own element; with no testable end it says so; and a system pause says its
// reason in words, never a code.
func TestKeepEndHead(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	since := app.Now().Add(-40 * time.Minute).UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks:  []protocol.TaskCard{{TaskID: "t_1", Title: "跟着 #11230", Attention: protocol.Working, UpdatedAt: since}},
		Counts: protocol.Counts{Working: 1},
		Keeps: []protocol.KeepSheet{
			{ID: "kp_1", Title: "独立复审远程访问设置并跟进 #11230", Life: "on", Run: "same", Since: since, RoundsRun: 5, End: &protocol.KeepEnd{Sentence: "#11230 合并时结束", Look: &protocol.KeepEndLook{Kind: "pr", Ref: "nowledge-co/mem#11230", What: "merged"}}},
			{ID: "kp_2", Title: "持续评审 nowledge-co", Life: "on", Run: "same", Since: since, NoEnd: true},
			{ID: "kp_3", Title: "nowledge-co 自动 PR 评审", Life: "paused", Run: "fresh", Since: since, PausedWhy: "这个月的用量到了上限（20M），等你决定"},
		},
	}})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1150, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	for i := 0; i < 3; i++ {
		tt.Frame()
	}
	for _, want := range []string{"#11230 合并时结束", "第 5 轮", "跑了 40 分钟", "没有说什么时候结束", "这个月的用量到了上限（20M）"} {
		if !hasText(tt, want) {
			t.Errorf("the Keep head lost %q: %q", want, tt.Texts())
		}
	}
	// A testable end is a sentence + a look code can run; noEnd is not an end.
	if got := app.keepEndWords(&protocol.KeepSheet{NoEnd: true}); got != "没有说什么时候结束" {
		t.Errorf("a no-end head says %q", got)
	}
	if got := app.keepEndWords(&protocol.KeepSheet{End: &protocol.KeepEnd{Sentence: "#11230 合并时结束"}}); got != "#11230 合并时结束" {
		t.Errorf("the end head says %q", got)
	}
	// D291: a clock and its zone are two facts, never one dot-joined string.
	facts := app.keepFacts(&protocol.KeepSheet{Cadence: "每天 09:00 · 跟着你的时区"})
	if len(facts) != 2 || facts[0].text != "每天 09:00" || facts[1].text != "跟着你的时区" {
		t.Errorf("cadence facts = %+v", facts)
	}
	for _, f := range facts {
		if strings.Contains(f.text, " · ") {
			t.Errorf("dot-joined fact %q", f.text)
		}
	}
}

// D650: the stall ask's third choice opens the Keep's Until editor.
func TestStallAskThirdChoice(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = 2
	now := time.Now().UTC().Format(time.RFC3339Nano)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{
			DecisionID: "d_stall", Question: "已经 6 轮没有新进展了。结束看守？", GoLabel: "结束", HoldLabel: "再看 6 轮",
			DefaultOption: "go", Reversible: true, DefaultAt: time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
			Keep: &protocol.KeepAsk{ID: "kp_1", Title: "独立复审 #11230", Ask: "stall"},
		}),
	}})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(100 * time.Millisecond)
	}
	for _, want := range []string{"独立复审 #11230", "结束", "再看 6 轮", "改结束条件"} {
		if !hasText(tt, want) {
			t.Errorf("the stall card lost %q: %q", want, tt.Texts())
		}
	}
}
