package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// d467Board is the author's On hand of 2026-11-22 at 15:00: a wait back in
// 37 minutes, a phone task stopped 8 days ago with nothing to bring it back,
// one done this afternoon, one done yesterday evening, one that didn't work.
func d467Board(t *testing.T, lang i18n.Lang) (*App, time.Time) {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	y, m, d := time.Now().Date()
	now := time.Date(y, m, d, 15, 0, 0, 0, time.Local)
	app.Now = func() time.Time { return now }
	iso := func(dd time.Duration) string { return now.Add(dd).UTC().Format(time.RFC3339) }
	card := func(id, title string, a protocol.Attention, at time.Duration) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Place: protocol.Place{Kind: "none"}, Harness: "codex", Attention: a, OpenedAt: iso(at - time.Hour), UpdatedAt: iso(at)}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			card("t_ci", "等 acme-web 的发布流水线跑完再合并", protocol.Blocked, -48*time.Minute),
			card("t_phone", "用手机把 Ducter 官网录一段屏发到 X", protocol.Blocked, -8*24*time.Hour),
			card("t_typo", "改掉定价页上的拼写错误", protocol.DoneClaimed, -90*time.Minute),
			card("t_flaky", "修 session 过期差一秒的偶发测试", protocol.Done, -18*time.Hour),
			card("t_android", "Android 构建在 CI 上挂了", protocol.Failed, -2*time.Hour),
		},
		Waiters: []protocol.Waiter{{WaiterID: "w1", TaskID: "t_ci", Reason: "acme-web 的发布流水线跑完", State: "armed", At: iso(37 * time.Minute), ArmedAt: iso(-48 * time.Minute)}},
	}})
	return app, now
}

// D467: what nothing brings back, and what didn't work out, need you; the
// line says so; 今天做完 holds today's and yesterday's fold away.
func TestOnHandByAttention(t *testing.T) {
	app, _ := d467Board(t, i18n.ZH)
	b := app.S.Board()
	if !app.stoppedWait(app.S.Task("t_phone")) || app.stoppedWait(app.S.Task("t_ci")) {
		t.Fatal("stopped: the phone task (no waiter, 8 days) and never the wait with a time")
	}
	sp := app.splitOf(b)
	if len(sp.stopped) != 1 || len(sp.failed) != 1 || len(sp.waiting) != 1 || len(sp.today) != 1 || len(sp.earlier) != 1 {
		t.Fatalf("split: %d stopped, %d failed, %d waiting, %d today, %d earlier", len(sp.stopped), len(sp.failed), len(sp.waiting), len(sp.today), len(sp.earlier))
	}
	n := app.stateCounts(b, "")
	if n != [4]int{2, 0, 1, 1} {
		t.Fatalf("strip %v: want 2 needs you, 1 waiting, 1 done today", n)
	}
	if n[3] != app.doneToday(b) {
		t.Fatalf("the strip says %d done today, the header %d", n[3], app.doneToday(b))
	}
	if got := app.headLine(b, "", n); got != app.L.T("onhand.line.stopped", 2) {
		t.Fatalf("the line is not true to the board: %q", got)
	}
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1400, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"有 2 个停下了，要你看一眼。", "接着做", "放下", "再试一次", "还有 1 个是昨天做完的", "回来"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	for _, not := range []string{"没有要你定的", "一天多没有动静", "今天回来的", " · "} {
		if strings.Contains(all, not) {
			t.Fatalf("%q on the board: %s", not, all)
		}
	}
	// Keys walk the drawn order: 等你 first, yesterday's folded away.
	if len(app.oh.order) < 2 || app.oh.order[0] != "t_phone" || app.oh.order[1] != "t_android" {
		t.Fatalf("walk: %v", app.oh.order)
	}
	for _, id := range app.oh.order {
		if id == "t_flaky" {
			t.Fatal("yesterday's result is walked while folded")
		}
	}
	// One card shape at one width: every card is the list's width.
	if app.oh.listW <= 0 {
		t.Fatal("no list width")
	}
}

// D467: the to-do source is one summary card whose facts add up to the
// heading's count; the whole sort stands behind 看看全部.
func TestTodoSummaryAddsUp(t *testing.T) {
	app, _, tt := todoApp(t, i18n.ZH, 1400, 1300)
	f := pileFrame(i18n.ZH, 557, 0, 0, 0)
	p := f.Sources.View.Pile
	p.Open = 559 // two more than the sort holds: in tasks already
	f.Sources.View.Sources[0].Open = 559
	app.Receive(f)
	app.Route = RouteOnHand
	todoFrames(tt, 3)
	if n := pileTaken(p); n != 1 {
		// 51+25+28+454 = 558 sorted; 559 open; 1 taken.
		t.Fatalf("taken %d", n)
	}
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"559", "51 个可以交给小鸭做", "25 个要你拿主意", "28 个也许可以关掉", "454 个可以先放着", "1 个已经在做", "看看全部 559 个"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if strings.Contains(all, "分类") {
		t.Fatalf("the whole sort is on the board before 看看全部: %s", all)
	}
	app.oh.srcAll = true
	todoFrames(tt, 2)
	all = strings.Join(tt.Texts(), " | ")
	if !strings.Contains(all, "已经在做的") || !strings.Contains(all, "收起") {
		t.Fatalf("behind 看看全部: %s", all)
	}
}
