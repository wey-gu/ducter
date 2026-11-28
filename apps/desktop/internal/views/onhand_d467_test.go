package views

import (
	"encoding/json"
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
	if got := app.headLine(b, "", n); got != app.L.T("onhand.line.stopped.failed", 1, 1) {
		t.Fatalf("the line is not true to the board: %q", got)
	}
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1400, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	// D471: the head is one sentence; each task says itself once, on its own row.
	for _, want := range []string{"有 1 个停下了，1 个没做成，要你看一眼。", "用手机把 Ducter 官网录一段屏发到 X", "它停了，没留下话。接着做，它从停下的地方接着来。", "停在了一个我没认出的错误上。", "接着做", "放下", "再试一次", "还有 1 个是昨天做完的", "15:37 回来"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	for _, not := range []string{"没有要你定的", "一天多没有动静", "今天回来的", " · ", "一览"} {
		if strings.Contains(all, not) {
			t.Fatalf("%q on the board: %s", not, all)
		}
	}
	// D471: no brief lines: what stopped, what didn't work out and the next
	// wait are rows of their own, walked like every other.
	walked := map[string]bool{}
	for _, id := range app.oh.order {
		walked[id] = true
	}
	for _, id := range []string{"t_phone", "t_android", "t_ci"} {
		if !walked[id] || app.oh.briefed[id] {
			t.Fatalf("%s is not its own walked row: %v", id, app.oh.order)
		}
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

// D467 (the head line, truth of the board): a failure is named failed, never stopped; a stop plus
// a failure says both.
func TestHeadLineNamesFailed(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	app.Now = func() time.Time { return now }
	iso := func(dd time.Duration) string { return now.Add(dd).UTC().Format(time.RFC3339) }
	card := func(id string, a protocol.Attention, at time.Duration) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: "任务 " + id, Place: protocol.Place{Kind: "none"}, Harness: "codex", Attention: a, OpenedAt: iso(at - time.Hour), UpdatedAt: iso(at)}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
		card("t_a", protocol.Failed, -time.Hour),
		card("t_b", protocol.Failed, -2*time.Hour),
	}}})
	b := app.S.Board()
	n := app.stateCounts(b, "")
	if got := app.headLine(b, "", n); got != app.L.T("onhand.line.failed", 2) {
		t.Fatalf("two failures read %q, want %q", got, app.L.T("onhand.line.failed", 2))
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
	for _, want := range []string{"里面有 51 个我能直接做，先挑几个交给我吧。", "挑几个交给我", "看看全部 559 个"} {
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
	if !strings.Contains(all, "已经在做的") || !strings.Contains(all, "收起") || !strings.Contains(all, "454") {
		t.Fatalf("behind 看看全部: %s", all)
	}
}

// D467 round 2: a result carries its PR; a wait doesn't say its title
// again; a working task's trail is the steps it took.
func TestOnHandOutcomesAndTrail(t *testing.T) {
	app, now := d467Board(t, i18n.ZH)
	iso := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339) }
	ok := true
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(50, iso(-80*time.Minute), "default", protocol.TaskStream("t_typo"), protocol.OriginTask, protocol.KindReport,
			protocol.Report{TaskID: "t_typo", State: "done", Summary: "改好了；草稿 PR #1190。", Evidence: []protocol.EvidenceRef{{Kind: "url", Ref: "https://github.com/acme/web/pull/1190"}}}),
	}})
	if l, u := outcomeOf(app.S.Task("t_typo")); l != "#1190" || u != "https://github.com/acme/web/pull/1190" {
		t.Fatalf("outcome %q %q", l, u)
	}
	ci := app.S.Task("t_ci")
	if got := app.waitCardWords(ci, "等 acme-web 的发布流水线跑完"); got != "" && strings.Contains(ci.Title(), got) {
		t.Fatalf("the wait says its title again: %q", got)
	}
	// D498: steps in sentences: commands without words of their own are one
	// gist (never "运行" alone or the command); a step with its own words is
	// itself, and one that didn't work is marked, quietly.
	bad := false
	var evs []protocol.LogEvent
	for i, cmd := range []string{"python3 - <<'EOF'\nprint(1)\nEOF", "rg -n 'scope.*desktop' .", "cargo check -p mem-desktop"} {
		evs = append(evs, protocol.NewEvent(int64(100+i), iso(time.Duration(-15+i)*time.Minute), "default", protocol.TaskStream("t_ci"), protocol.OriginTask, protocol.KindTaskEvent,
			protocol.TaskEvent{TaskID: "t_ci", Role: "tool", Tool: &protocol.ToolCall{Name: "Bash", Input: mustJSON(map[string]string{"command": cmd}), OK: &ok}}))
	}
	evs = append(evs, protocol.NewEvent(110, iso(-2*time.Minute), "default", protocol.TaskStream("t_ci"), protocol.OriginTask, protocol.KindTaskEvent,
		protocol.TaskEvent{TaskID: "t_ci", Role: "tool", Tool: &protocol.ToolCall{Name: "Bash", Input: mustJSON(map[string]string{"command": "bun test", "description": "跑一遍测试"}), OK: &bad}}))
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	ss := app.saidOf(app.S.Task("t_ci"), time.Time{})
	if len(ss) < 2 {
		t.Fatalf("said %+v", ss)
	}
	g, last := ss[len(ss)-2], ss[len(ss)-1]
	if strings.Contains(g.words, "python3") || strings.Contains(g.words, "scope") || g.words == "运行" || !strings.Contains(g.words, "命令") {
		t.Fatalf("the gist %q", g.words)
	}
	if last.words != "跑一遍测试" || !last.bad {
		t.Fatalf("the last step %+v", last)
	}
}

// D467 round 4: each way of being stuck gets its own fix, from what Ducter knows.
func TestStuckFixKinds(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	y, m, d := time.Now().Date()
	now := time.Date(y, m, d, 15, 0, 0, 0, time.Local)
	app.Now = func() time.Time { return now }
	iso := func(dd time.Duration) string { return now.Add(dd).UTC().Format(time.RFC3339) }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "Weyl's MacBook Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: false}, {Harness: "codex", Installed: true, LoggedIn: true}},
			Abilities: []protocol.DeviceAbility{{ID: "computer", State: "on", Perms: &protocol.ComputerPerms{Accessibility: true, Screen: false}}}},
		{ID: "mini", Name: "Mac mini", Kind: "mini", State: "offline", LastSeen: iso(-2 * time.Hour)},
	}})
	card := func(id, title, harness string, a protocol.Attention, at time.Duration) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Place: protocol.Place{Kind: "none", Device: "local"}, Harness: harness, Attention: a, OpenedAt: iso(at - time.Hour), UpdatedAt: iso(at)}
	}
	signin := card("t_sign", "给 acme-api 的限流写文档", "claude-code", protocol.Failed, -time.Hour)
	cant := card("t_cant", "在 Mac mini 上跑基准", "codex", protocol.Failed, -time.Hour)
	cant.Cant = &protocol.CantStart{Why: "no_repo", Computer: "Mac mini", What: "hawdb", Elsewhere: &protocol.CantElsewhere{Device: "local", Name: "Weyl's MacBook Pro"}}
	off := card("t_off", "在 Mac mini 上把基准跑一遍", "codex", protocol.Blocked, -2*time.Hour)
	off.Reason = "device:unreachable:Mac mini"
	perm := card("t_perm", "在 Keynote 里改第三页", "codex", protocol.Blocked, -2*time.Hour)
	perm.Computing = &protocol.Computing{Device: "local", App: "Keynote"}
	plain := card("t_fail", "Android 构建在 CI 上挂了", "codex", protocol.Failed, -time.Hour)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{signin, cant, off, perm, plain}}})
	if st := app.S.Task("t_cant").State; st != nil {
		st.Cant = cant.Cant // as the home's task_state carries it
	}
	// D471: a failure with no words of its own says the error is unknown, never a raw log.
	for id, want := range map[string]string{"t_sign": "signin", "t_cant": "cant", "t_off": "offline", "t_perm": "perm", "t_fail": "unknown"} {
		f := app.stuckFix(app.S.Task(id))
		if f.kind != want || len(f.buttons) == 0 {
			t.Errorf("%s: %s (%q), want %s", id, f.kind, f.sentence, want)
		}
	}
	if f := app.stuckFix(app.S.Task("t_off")); !strings.Contains(f.sentence, "上次在线是 2 小时前") {
		t.Errorf("offline says when it was last seen: %q", f.sentence)
	}
	if f := app.stuckFix(app.S.Task("t_sign")); f.buttons[0].label != "重新登录" || !strings.Contains(f.sentence, "Claude Code 在 Weyl's MacBook Pro 上的登录过期了") {
		t.Errorf("signin: %q %q", f.sentence, f.buttons[0].label)
	}
	if !app.stoppedWait(app.S.Task("t_off")) {
		t.Error("a computer gone away for two hours needs the person")
	}
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
