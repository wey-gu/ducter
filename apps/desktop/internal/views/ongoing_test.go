package views

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

// D285: 一直在跑的 / Ongoing on the Mac.

func ogAt(d time.Duration) string { return pastNow.Add(d).UTC().Format(time.RFC3339) }

// ongoingRuns makes n runs, one every step back from now, states in turn.
func ongoingRunsOf(step time.Duration, line string, states ...string) []protocol.OngoingRun {
	var out []protocol.OngoingRun
	for i, s := range states {
		out = append(out, protocol.OngoingRun{At: ogAt(-time.Duration(len(states)-i) * step), State: s, TaskID: "t_run" + itoa(int64(i)), Line: line})
	}
	return out
}

// ongoingFixture is eight things that keep going, in the author's words.
func ongoingFixture(lang i18n.Lang) []protocol.OngoingItem {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	ci := &protocol.RoutineTrigger{Kind: "time", Every: "day", Time: "09:00", Zone: "local", TZ: "Asia/Shanghai"}
	mon := &protocol.RoutineTrigger{Kind: "time", Every: "week", Days: []int{1}, Time: "10:00", Zone: "local", TZ: "Asia/Shanghai"}
	wd := &protocol.RoutineTrigger{Kind: "time", Every: "weekday", Time: "08:30", Zone: "local", TZ: "Asia/Shanghai"}
	nextMon := time.Date(2026, 11, 23, 10, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)
	return []protocol.OngoingItem{
		{Kind: "routine", ID: "r_ci", Title: w("每天早上看一眼 hawdb 的 CI", "Check hawdb's CI every morning"), Project: "hawdb", State: "resting", Trigger: ci,
			Cadence: w("每天 09:00", "Every day at 9:00"), NextAt: time.Date(2026, 11, 20, 9, 0, 0, 0, time.Local).UTC().Format(time.RFC3339),
			Runs: ongoingRunsOf(24*time.Hour, w("CI 两个 job 红了，都是 TestCompactionRace", "2 CI jobs red, both TestCompactionRace"), "done", "done", "failed", "done", "done", "skipped", "done", "done", "failed", "done", "done", "done"), StartedAt: ogAt(-30 * 24 * time.Hour)},
		{Kind: "task", ID: "t_review", Title: w("盯着 nowledge-co 的 review 请求", "Watch for review requests on nowledge-co"), State: "resting", EveryMs: 45 * 60 * 1000,
			Reason: "a review request", NextAt: ogAt(32 * time.Minute), TaskID: "t_review",
			Runs: ongoingRunsOf(45*time.Minute, w("还没有新的 review 请求", "No new review request yet"), "looked", "looked", "looked", "met", "looked", "looked", "looked", "looked", "looked"), StartedAt: ogAt(-7 * time.Hour),
			Mark: &protocol.PastMark{Glyph: "review", Tint: "lilac", At: ogAt(-time.Hour)}},
		{Kind: "routine", ID: "r_weekly", Title: w("每周一整理周报", "Write the weekly report on Mondays"), State: "paused", Trigger: mon, Cadence: w("每周一 10:00", "Mondays at 10:00"),
			PausedUntil: nextMon, PausedBy: "user", Runs: ongoingRunsOf(7*24*time.Hour, w("周报写好了，发在 #team", "Weekly report posted in #team"), "done", "done", "done", "done"), StartedAt: ogAt(-40 * 24 * time.Hour)},
		{Kind: "routine", ID: "r_mail", Title: w("工作日 8:30 读邮件摘要", "Read the mail digest on weekdays at 8:30"), State: "paused", Trigger: wd, Cadence: w("工作日 08:30", "Weekdays at 8:30"),
			PausedBy: "system", PauseWhy: "failures", Runs: ongoingRunsOf(24*time.Hour, w("邮箱登录过期了，读不到邮件", "The mail sign-in expired; couldn't read mail"), "done", "done", "failed", "failed", "failed"), StartedAt: ogAt(-20 * 24 * time.Hour)},
		{Kind: "routine", ID: "r_deps", Title: w("每周看一次依赖有没有安全更新", "Look for security updates in dependencies weekly"), Project: "ducter", State: "running",
			Trigger: &protocol.RoutineTrigger{Kind: "time", Every: "week", Days: []int{4}, Time: "14:00"}, Cadence: w("每周四 14:00", "Thursdays at 14:00"), TaskID: "t_deps_now",
			Runs: ongoingRunsOf(7*24*time.Hour, w("2 个依赖有安全更新", "2 dependencies have security updates"), "done", "done", "done", "running"), StartedAt: ogAt(-28 * 24 * time.Hour)},
		{Kind: "task", ID: "t_flight", Title: w("等东京的机票降到 3000 以下", "Wait for Tokyo flights under ¥3,000"), State: "resting", EveryMs: 6 * 3600 * 1000,
			NextAt: ogAt(26 * time.Hour), TaskID: "t_flight", Runs: ongoingRunsOf(6*time.Hour, w("最低 3280 元，还没降到 3000", "Lowest ¥3,280, not under ¥3,000 yet"), "looked", "looked", "looked", "looked", "looked", "looked"), StartedAt: ogAt(-36 * time.Hour),
			Mark: &protocol.PastMark{Glyph: "errand", Tint: "clay", At: ogAt(-time.Hour)}},
		{Kind: "routine", ID: "r_bench", Title: w("每晚跑一遍 hawdb 的写入基准", "Run hawdb's write benchmark every night"), Project: "hawdb", State: "needs_you",
			Trigger: &protocol.RoutineTrigger{Kind: "time", Every: "day", Time: "23:00"}, Cadence: w("每天 23:00", "Every day at 23:00"), TaskID: "t_bench_now",
			Runs: ongoingRunsOf(24*time.Hour, w("写入吞吐和上次持平", "Write throughput level with last time"), "done", "done", "done", "done", "done", "done", "done"), StartedAt: ogAt(-10 * 24 * time.Hour)},
		{Kind: "routine", ID: "r_mem", Title: w("每周五把这周的记忆整理成摘要", "Summarize the week's memories every Friday"), Project: "mem", State: "resting",
			Trigger: &protocol.RoutineTrigger{Kind: "time", Every: "week", Days: []int{5}, Time: "18:00"}, Cadence: w("每周五 18:00", "Fridays at 18:00"),
			NextAt: time.Date(2026, 11, 20, 18, 0, 0, 0, time.Local).UTC().Format(time.RFC3339), Runs: ongoingRunsOf(7*24*time.Hour, w("这周 34 条记忆，整理成了 6 条", "34 memories this week, kept as 6"), "done", "done", "skipped", "done"), StartedAt: ogAt(-35 * 24 * time.Hour)},
	}
}

func ongoingFrame(items []protocol.OngoingItem) protocol.ServerFrame {
	return protocol.ServerFrame{T: "ongoing_result", Past: &protocol.PastFrame{T: "ongoing_result", Ongoing: items}}
}

func TestOngoingDecodes(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"ongoing_result","id":"o1","items":[{"kind":"routine","id":"r1","title":"每天早上看一眼 hawdb 的 CI","state":"paused","trigger":{"kind":"time","every":"day","time":"09:00","zone":"local","tz":"Asia/Shanghai"},"cadence":"每天 09:00","pausedUntil":"2026-11-23T02:00:00Z","pausedBy":"system","pauseWhy":"failures","runs":[{"at":"2026-11-18T01:00:00Z","state":"failed","taskId":"t9","line":"2 jobs red"}],"startedAt":"2026-10-01T00:00:00Z","mark":{"glyph":"data","tint":"mist","at":"x"}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if f.Past == nil || f.Past.ID != "o1" || len(f.Past.Ongoing) != 1 || len(f.SavedItems) != 0 {
		t.Fatalf("frame %#v", f.Past)
	}
	it := f.Past.Ongoing[0]
	if it.Trigger.Time != "09:00" || it.PauseWhy != "failures" || it.Runs[0].State != "failed" || it.Runs[0].TaskID != "t9" || it.Mark.Tint != "mist" {
		t.Errorf("item %#v", it)
	}
	e, _ := protocol.DecodeServerFrame([]byte(`{"t":"ongoing_result","items":[]}`))
	app, _ := pastApp(t, i18n.ZH)
	app.Receive(e)
	if app.S.Past.Ongoing == nil || len(app.S.Past.Ongoing) != 0 {
		t.Errorf("an empty list is a list: %#v", app.S.Past.Ongoing)
	}
}

func TestOngoingStateLines(t *testing.T) {
	for _, tc := range []struct {
		lang i18n.Lang
		want map[string]string
	}{
		{i18n.ZH, map[string]string{
			"r_ci":     "每天 09:00 | 下次明天 9:00",
			"t_review": "每 32 分钟看一次 | 下次 15:32",
			"r_weekly": "暂停到周一 10:00",
			"r_mail":   "已暂停：连着 3 次没成",
			"r_deps":   "正在跑",
			"r_bench":  "等你",
			"t_flight": "每 6 小时看一次 | 下次明天 17:00",
		}},
		{i18n.EN, map[string]string{
			"r_ci":     "Every day at 9:00 | Next tomorrow 9:00",
			"r_weekly": "Paused until Mon 10:00",
			"r_deps":   "Running",
		}},
	} {
		app, _ := pastApp(t, tc.lang)
		items := ongoingFixture(tc.lang)
		items[1].EveryMs = 32 * 60 * 1000
		for _, it := range items {
			if want, ok := tc.want[it.ID]; ok {
				if got := strings.Join(app.ongoingLine(&it), " | "); got != want { // D291: separate facts
					t.Errorf("%s %s: %q, want %q", tc.lang, it.ID, got, want)
				}
			}
		}
	}
	app, _ := pastApp(t, i18n.ZH)
	open := protocol.OngoingItem{State: "paused", PausedBy: "user"}
	if got := strings.Join(app.ongoingLine(&open), " | "); got != "暂停了，等你恢复" {
		t.Errorf("paused until resumed: %q", got)
	}
}

func TestOngoingPauseMenu(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	app.OpenOngoing()
	if _, ok := lastPast[protocol.OngoingReq](*sent); !ok {
		t.Fatal("opening Ongoing asks for it")
	}
	app.Receive(ongoingFrame(ongoingFixture(i18n.ZH)))
	tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, want := range []string{"等你", "正在跑", "等下一次", "暂停了", "每天早上看一眼 hawdb 的 CI"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	for _, tc := range []struct{ choice, until string }{
		{"hour", "2026-11-19T16:00:00"},
		{"morning", time.Date(2026, 11, 20, 8, 0, 0, 0, time.Local).UTC().Format("2006-01-02T15:04:05")},
		{"week", "2026-11-26T15:00:00"},
		{"open", ""},
	} {
		got := ongoingUntil(tc.choice, pastNow)
		local := ""
		if got != "" {
			at, _ := time.Parse(time.RFC3339, got)
			local = at.Local().Format("2006-01-02T15:04:05")
			if tc.choice == "morning" {
				local = at.UTC().Format("2006-01-02T15:04:05")
			}
		}
		if local != tc.until {
			t.Errorf("%s: until %q (%q), want %q", tc.choice, got, local, tc.until)
		}
	}
	// Through the menu: the card's Pause opens it; 暂停到明天早上 sends that until.
	app.past.og.focus = "r_ci"
	tt.Frame()
	if err := tt.Click("暂停，每天早上看一眼 hawdb 的 CI"); err != nil {
		t.Fatalf("Pause: %v (%q)", err, tt.Texts())
	}
	tt.Frame()
	if err := tt.Click("暂停到明天早上"); err != nil {
		t.Fatalf("the menu: %v (%q)", err, tt.Texts())
	}
	a, ok := lastPast[protocol.OngoingAct](*sent)
	if !ok || a.Action != "pause" || a.ID != "r_ci" || a.Kind != "routine" || a.Until != ongoingUntil("morning", pastNow) {
		t.Fatalf("sent %#v", a)
	}
	tt.Frame()
	if !tt.HasText("暂停到明天 8:00") {
		t.Errorf("the card did not settle as paused: %q", tt.Texts())
	}
	if err := tt.Click("恢复，每天早上看一眼 hawdb 的 CI"); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if a, _ := lastPast[protocol.OngoingAct](*sent); a.Action != "resume" || a.Until != "" {
		t.Errorf("resume %#v", a)
	}
}

func TestOngoingCountOnHand(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks:    []protocol.TaskCard{{TaskID: "t_w", Title: "盯着 review 请求", Attention: protocol.Blocked}},
		Waiters:  []protocol.Waiter{{WaiterID: "w1", TaskID: "t_w", State: protocol.WaiterArmed}, {WaiterID: "w2", State: protocol.WaiterArmed}},
		Routines: []protocol.Routine{{RoutineID: "r1", State: "active"}, {RoutineID: "r2", State: "paused"}, {RoutineID: "r3", State: "ended"}},
	}})
	if n := app.ongoingCount(); n != 3 {
		t.Errorf("count %d, want 3", n)
	}
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if err := tt.Click("一直在跑的 3 件"); err != nil {
		t.Fatalf("On hand's line: %v (%q)", err, tt.Texts())
	}
	if app.Route != RoutePast || app.past.tab != "ongoing" {
		t.Errorf("opened %v %q", app.Route, app.past.tab)
	}
}

// DUCTER_PAST_SHOTS=1 also writes mac-ongoing-*.
func TestOngoingShots(t *testing.T) {
	if os.Getenv("DUCTER_PAST_SHOTS") == "" {
		t.Skip("DUCTER_PAST_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, w, h int) {
			t.Helper()
			tt.SetSize(w, h)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, "mac-ongoing-"+name+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		app.OpenOngoing()
		app.Receive(ongoingFrame(ongoingFixture(lang)))
		shot("list", 1280, 820)
		shot("list-tall", 1280, 1200)
		shot("list-narrow", 900, 700)
		og := &app.past.og
		og.focus, og.pauseFor, og.pauseOpen = "r_mem", "r_mem", true
		shot("pause-menu", 1280, 1200)
		og.pauseOpen = false
		og.focus, og.moreFor, og.moreOpen, og.retime, og.reEvery, og.reTime = "r_mem", "r_mem", true, true, "week", "18:00"
		shot("retime", 1280, 1200)
		og.moreOpen, og.retime, og.focus = false, false, ""
		app.Receive(ongoingFrame([]protocol.OngoingItem{}))
		shot("empty", 1280, 820)
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
			Tasks:    []protocol.TaskCard{{TaskID: "t_w", Title: pastWord(lang, "盯着 nowledge-co 的 review 请求", "Watch for review requests on nowledge-co"), Attention: protocol.Blocked, OpenedAt: ogAt(-7 * time.Hour), UpdatedAt: ogAt(-10 * time.Minute)}},
			Waiters:  []protocol.Waiter{{WaiterID: "w1", TaskID: "t_w", State: protocol.WaiterArmed, Reason: pastWord(lang, "有新的 review 请求", "a new review request")}},
			Routines: []protocol.Routine{{RoutineID: "r1", Name: "CI", State: "active"}, {RoutineID: "r2", Name: "weekly", State: "paused"}},
		}})
		app.S.Past.Ongoing = nil
		app.Route = RouteOnHand
		shot("onhand-end", 1280, 820)
		if !strings.Contains(strings.Join(tt.Texts(), " "), pastWord(lang, "一直在跑的 3 件", "3 ongoing")) {
			t.Errorf("%s: no Ongoing line on On hand: %q", lang, tt.Texts())
		}
	}
}
