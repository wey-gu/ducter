package views

// D427: the Ongoing card says when a promise isn't kept on time (late with
// why, failing, back after a stop by mistake), its last run in one line,
// where it runs and with which agent, and its one fix; on time it says
// nothing. How often sends every.

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// loopsFixture is the demo's five (apps/web/demo-routines.ts): the review
// loop back after a round's done stopped it, a fare check whose MacBook is
// asleep, a CI watch failing three rounds, an issue sweep out of allowance,
// and a weekly report on time.
func loopsFixture(lang i18n.Lang) []protocol.OngoingItem {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	home := &protocol.OngoingWhere{Device: "local", DeviceName: "Ada's MacBook Air", Harness: "codex"}
	return []protocol.OngoingItem{
		{Kind: "task", ID: "ci_hawdb", Title: w("hawdb 的 nightly 挂了就告诉我", "Tell me when hawdb's nightly breaks"), State: "resting", Loop: true, EveryMs: 30 * 60_000, NextAt: ogAt(12 * time.Minute),
			Health: &protocol.OngoingHealth{State: "failing", Why: "failed", Fails: 3, Fix: "run_now"},
			Last:   &protocol.OngoingLast{At: ogAt(-18 * time.Minute), State: "failed", Line: w("读不到 nowledge-co/hawdb 的 Actions：gh 说这个仓库不存在或没有权限。", "Couldn't read nowledge-co/hawdb's Actions: gh says the repo doesn't exist or isn't readable.")},
			Where:  home, Runs: ongoingRunsOf(30*time.Minute, "", "done", "done", "done", "done", "done", "done", "failed", "failed", "failed"), TaskID: "ci_hawdb", StartedAt: ogAt(-6 * time.Hour)},
		{Kind: "task", ID: "fare_pek", Title: w("盯北京往返机票", "Watch the Beijing return fares"), State: "resting", Loop: true, EveryMs: 24 * 60 * 60_000, NextAt: ogAt(9 * time.Minute),
			Health: &protocol.OngoingHealth{State: "late", Why: "asleep", LateMin: 75, Detail: "Ada's MacBook Pro", Fix: "run_now"},
			Last:   &protocol.OngoingLast{At: ogAt(-25 * time.Hour), State: "done", Line: w("最低 ¥2,290，还没到 ¥2,000。", "Lowest ¥2,290, not under ¥2,000 yet.")},
			Where:  &protocol.OngoingWhere{Device: "mbp", DeviceName: "Ada's MacBook Pro", Harness: "claude-code"}, Runs: ongoingRunsOf(24*time.Hour, "", "done", "done", "done"), TaskID: "fare_pek", StartedAt: ogAt(-72 * time.Hour)},
		{Kind: "task", ID: "swj3zc4w", Title: w("看 nowledge-co 的评审请求", "Review requests on nowledge-co"), State: "resting", Loop: true, EveryMs: 45 * 60_000, NextAt: ogAt(44 * time.Minute),
			Health: &protocol.OngoingHealth{State: "back", Since: ogAt(-56 * time.Minute)},
			Last:   &protocol.OngoingLast{At: ogAt(-56 * time.Minute), State: "done", Line: w("Mem #10622 已合并并退出审查队列，#10473 重新开放审查。队列现有 9 个 PR。", "Mem #10622 merged and left the queue; #10473 is open for review again. 9 PRs in the queue.")},
			Where:  home, Runs: ongoingRunsOf(45*time.Minute, "", "done", "done", "done", "done", "done", "done", "done"), TaskID: "swj3zc4w", StartedAt: ogAt(-9 * time.Hour)},
		{Kind: "task", ID: "issues_mem", Title: w("每 2 小时看一次 mem 的新 issue", "New mem issues, every 2 hours"), State: "resting", Loop: true, EveryMs: 2 * 60 * 60_000, NextAt: ogAt(95 * time.Minute),
			Health: &protocol.OngoingHealth{State: "late", Why: "quota", ResetsAt: ogAt(95 * time.Minute)},
			Last:   &protocol.OngoingLast{At: ogAt(-2 * time.Hour), State: "done", Line: w("没有要你处理的。", "Nothing for you.")},
			Where:  home, Runs: ongoingRunsOf(2*time.Hour, "", "done", "done", "done", "done"), TaskID: "issues_mem", StartedAt: ogAt(-8 * time.Hour)},
		{Kind: "routine", ID: "r_weekly", Title: w("整理上周的周报", "Last week's report"), State: "resting", Cadence: w("每周一 10:00（跟着你的时区）", "Mondays 10:00 (follows your time zone)"), NextAt: ogAt(4 * 24 * time.Hour),
			Trigger: &protocol.RoutineTrigger{Kind: "time", Every: "week", Days: []int{1}, Time: "10:00", Zone: "personal"}, Where: &protocol.OngoingWhere{Device: "local", DeviceName: "Ada's MacBook Air"}, Runs: nil, StartedAt: ogAt(-30 * 24 * time.Hour)},
	}
}

func TestOngoingLoopLines(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := pastApp(t, lang)
		app.OpenOngoing()
		app.Receive(ongoingFrame(loopsFixture(lang)))
		tt := ui.NewTesterWith(app.View, 1280, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		text := strings.Join(tt.Texts(), " | ")
		for _, want := range []string{
			pastWord(lang, "最近 3 轮都没做成", "Its last 3 rounds didn't work"),
			pastWord(lang, "晚了 1 小时", "1 h late"),
			pastWord(lang, "Ada's MacBook Pro 睡着了，醒了马上补一轮", "Ada's MacBook Pro is asleep; it catches up as soon as it wakes"),
			pastWord(lang, "被误停，已经接着跑了", "Stopped by mistake at"),
			pastWord(lang, "额度用完了", "Out of allowance"),
			pastWord(lang, "每 45 分钟一轮", "A round every 45 min"),
			pastWord(lang, "上一轮", "Last round"),
			"Codex", "Claude Code", "Ada's MacBook Air",
		} {
			if !strings.Contains(text, want) {
				t.Errorf("%s: no %q in %q", lang, want, text)
			}
		}
		// On time says nothing: the weekly report has no health line.
		if strings.Contains(text, pastWord(lang, "按时", "on time")) {
			t.Errorf("%s: on time said out loud", lang)
		}
		// How often sends every.
		items := app.S.Past.Ongoing
		app.ongoingRhythmPick(&items[2], 60)
		found := false
		for _, s := range *sent {
			if a, ok := s.(protocol.OngoingAct); ok && a.Action == "every" && a.Minutes == 60 && a.ID == "swj3zc4w" {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: change rhythm didn't send every: %v", lang, *sent)
		}
	}
}

// DUCTER_ROUTINE_SHOTS=1 writes mac-routines-* (light and dark, zh and en) to .shots/routines.
func TestOngoingLoopShots(t *testing.T) {
	if os.Getenv("DUCTER_ROUTINE_SHOTS") == "" {
		t.Skip("DUCTER_ROUTINE_SHOTS=1 to write the shots")
	}
	dir := filepath.Join("..", "..", "..", "..", ".shots", "routines")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			app, _ := pastApp(t, lang)
			tt := ui.NewTesterWith(app.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetScale(2)
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			app.OpenOngoing()
			app.Receive(ongoingFrame(loopsFixture(lang)))
			shot := func(name string) {
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(200 * time.Millisecond)
				}
				f, err := os.Create(filepath.Join(dir, "mac-"+name+"-"+string(lang)+"-"+mode+".png"))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}
			shot("ongoing")
			og := &app.past.og
			og.focus, og.moreFor, og.moreOpen, og.rhythm = "swj3zc4w", "swj3zc4w", true, true
			shot("rhythm")
		}
	}
}
