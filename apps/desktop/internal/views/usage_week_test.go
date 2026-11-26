package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// usageWeekReport is a heavy developer's week as the home counts it (D588,
// D591): the WAL bench and a Log index rework on Claude Code, a review loop
// and a CI hunt on Codex, the partner's replies and its checks.
func usageWeekReport(zh bool) *protocol.UsageReport {
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	tk := func(in, cached, out float64) protocol.UsageTokens {
		return protocol.UsageTokens{Input: in, Cached: cached, Output: out}
	}
	r := &protocol.UsageReport{Turns: 128, TaskCount: 6, Total: tk(18_000_000, 14_000_000, 400_000)}
	r.Harnesses = []protocol.UsageHarness{
		{Harness: "claude-code", Share: 0.62, Turns: 79, Top: &protocol.UsageTop{TaskID: "t_l1", Title: w("跑完 WAL 基准测试，给出 p99", "Run the WAL bench and report the p99"), Share: 0.48}},
		{Harness: "codex", Share: 0.35, Turns: 46, Top: &protocol.UsageTop{TaskID: "u_loop", Title: w("每 45 分钟 review 一次 nowledge-co/mem#551", "Review nowledge-co/mem#551 every 45 minutes"), Share: 0.74}},
		{Harness: "pi", Share: 0.03, Turns: 3},
	}
	r.Agents = []protocol.UsageAgent{{Harness: "claude-code", Model: "opus", Share: 0.58}, {Harness: "codex", Model: "gpt-6.2-sol", Share: 0.35}, {Harness: "claude-code", Model: "haiku", Share: 0.04}}
	r.Tasks = []protocol.UsageTask{
		{TaskID: "t_l1", Title: w("跑完 WAL 基准测试，给出 p99", "Run the WAL bench and report the p99"), Harness: "claude-code", Share: 0.30},
		{TaskID: "u_loop", Title: w("每 45 分钟 review 一次 nowledge-co/mem#551", "Review nowledge-co/mem#551 every 45 minutes"), Harness: "codex", Share: 0.26},
		{TaskID: "u_fts", Title: w("把 Log 的全文索引改成按月分表", "Split the Log's full-text index by month"), Harness: "claude-code", Share: 0.19},
		{TaskID: "u_ci", Title: w("查 mem 这周 main 上红的 CI", "Find why mem's CI went red on main this week"), Harness: "codex", Share: 0.09},
		{TaskID: "t_l2", Title: w("整理 PR #1592 的评审意见", "Sort out the review comments on PR #1592"), Harness: "claude-code", Share: 0.04},
	}
	r.By.You, r.By.Partner = tk(6_000_000, 4_000_000, 150_000), tk(10_000_000, 8_500_000, 200_000)
	r.Talk = protocol.UsagePart{Turns: 30, Share: 0.09}
	r.Looks = protocol.UsagePart{Turns: 25, Share: 0.04}
	return r
}

// D591: Overview says where this week's allowance went: silent with
// nothing used, then the agents' shares, the three tasks that used most
// (each opening its task) and the rest behind More; at 1000 and 1400 wide,
// nothing out of the window, squeezed or drawn over.
func TestOverviewUsageWeekD591(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := homeApp(t, lang, false)
		L := app.L
		if _, ok := tt.Find(L.T("usage.head")); ok {
			t.Fatalf("%s: the section shows before anything was counted", lang)
		}
		app.Receive(protocol.ServerFrame{T: "usage_days_result", UsageFor: &protocol.UsageReport{}})
		tt.Frame()
		if _, ok := tt.Find(L.T("usage.head")); ok {
			t.Fatalf("%s: the section shows with nothing used", lang)
		}
		r := usageWeekReport(lang == i18n.ZH)
		app.Receive(protocol.ServerFrame{T: "usage_days_result", UsageFor: r})
		for i := 0; i < 3; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		for _, s := range []string{L.T("usage.head"), L.T("usage.agent", "Claude Code", "62%"), L.T("usage.agent", "Codex", "35%"), r.Tasks[0].Title, r.Tasks[2].Title, "30%", L.T("usage.more")} {
			if _, ok := tt.Find(s); !ok {
				t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
			}
		}
		if _, ok := tt.Find(r.Tasks[3].Title); ok {
			t.Fatalf("%s: the fourth task shows before More", lang)
		}
		for _, s := range tt.Texts() {
			if strings.Contains(s, " · ") {
				t.Fatalf("%s: dot-joined %q", lang, s)
			}
		}
		for _, w := range []int{1000, 1400} {
			tt.SetSize(w, 2000)
			tt.Frame()
			if bad := paneGeometry(tt, float32(w)); len(bad) > 0 {
				t.Fatalf("%s at %d: %v", lang, w, bad)
			}
		}
		tt.SetSize(1280, 2000)
		tt.Frame()
		tt.Click(L.T("usage.more"))
		for i := 0; i < 3; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		for _, s := range []string{r.Tasks[3].Title, L.T("usage.talk"), L.T("usage.looks"), L.T("usage.models"), L.T("usage.note")} {
			if _, ok := tt.Find(s); !ok {
				t.Fatalf("%s: more: no %q in %q", lang, s, tt.Texts())
			}
		}
		tt.Click(r.Tasks[0].Title)
		tt.Frame()
		if app.TaskID != "t_l1" {
			t.Fatalf("%s: the top task's row opened %q", lang, app.TaskID)
		}
	}
}

// D591: the limit card names what used most of that agent this week: the
// task itself, or another one.
func TestLimitCardSaysWhyD591(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, _ := limitApp(t, lang)
		r := usageWeekReport(lang == i18n.ZH)
		app.Receive(protocol.ServerFrame{T: "usage_days_result", UsageFor: r})
		tt := ui.NewTesterWith(app.View, 1150, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		app.OpenTask("t_l1")
		app.S.Task("t_l1").HistoryLoaded = true
		tt.Frame()
		this := app.L.T("usage.why.this", "Claude Code", "48%")
		if _, ok := tt.Find(this); !ok {
			t.Fatalf("%s: no %q in %q", lang, this, tt.Texts())
		}
		app.OpenTask("t_l2")
		app.S.Task("t_l2").HistoryLoaded = true
		tt.Frame()
		other := app.L.T("usage.why", "Claude Code", r.Harnesses[0].Top.Title, "48%")
		if _, ok := tt.Find(other); !ok {
			t.Fatalf("%s: no %q in %q", lang, other, tt.Texts())
		}
		// pi used too little for a top task: its card says nothing more.
		app.OpenTask("t_l4")
		app.S.Task("t_l4").HistoryLoaded = true
		tt.Frame()
		for _, s := range tt.Texts() {
			if strings.Contains(s, "48%") {
				t.Fatalf("%s: pi's card names Claude Code's top task: %q", lang, s)
			}
		}
	}
}
