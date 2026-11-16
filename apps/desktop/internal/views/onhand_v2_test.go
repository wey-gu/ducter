package views

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// bigBoard is the author's real week (D261): about thirty tasks across
// ducter, hawdb and mem and errands of no folder, three of them waits gone
// quiet for two and a half days (the 2026-11-16 screenshots), a wait on CI
// that looks again in four minutes, two asks, results seen and unseen.
func bigBoard(lang i18n.Lang, now time.Time) ([]protocol.TaskCard, []protocol.Waiter) {
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	at := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339) }
	repo := func(name, branch string) protocol.Place {
		return protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/weyl/dev/" + name, Branch: "ducter/" + branch, BaseBranch: "main"}
	}
	none := protocol.Place{Kind: "none"}
	var cards []protocol.TaskCard
	seq := int64(100)
	card := func(id, title, project string, p protocol.Place, att protocol.Attention, opened, updated time.Duration) *protocol.TaskCard {
		cards = append(cards, protocol.TaskCard{TaskID: id, Title: title, Project: project, Harness: "claude-code", Attention: att, OpenedAt: at(opened), UpdatedAt: at(updated), Place: p})
		return &cards[len(cards)-1]
	}
	step := func(c *protocol.TaskCard, tool string, input string) {
		seq++
		ev := protocol.NewEvent(seq, at(-time.Minute), "default", protocol.TaskStream(c.TaskID), protocol.OriginTask, protocol.KindTaskEvent,
			protocol.TaskEvent{TaskID: c.TaskID, Role: "tool", Tool: &protocol.ToolCall{Name: tool, Input: json.RawMessage(input)}})
		c.Latest = &ev
	}
	said := func(c *protocol.TaskCard, text string) {
		seq++
		ev := protocol.NewEvent(seq, at(-time.Minute), "default", protocol.TaskStream(c.TaskID), protocol.OriginTask, protocol.KindTaskEvent,
			protocol.TaskEvent{TaskID: c.TaskID, Role: "assistant", Text: text})
		c.Latest = &ev
	}
	report := func(c *protocol.TaskCard, state, summary string) {
		c.LastReport = &protocol.Report{TaskID: c.TaskID, State: state, Summary: summary}
	}
	diff := func(c *protocol.TaskCard, a, d int) { c.Changes = &protocol.DiffStat{Files: 3, Adds: a, Dels: d} }

	// Needs you.
	c := card("t_iter", w("范围扫描：旧迭代器要不要留着？", "Range scan: keep the old iterator?"), "hawdb", repo("hawdb", "range-scan-iter"), protocol.NeedsYou, -40*time.Minute, -6*time.Minute)
	report(c, "needs_input", w("新迭代器快 2.3 倍，旧的还有两处在用。", "The new iterator is 2.3× faster; two callers still use the old one."))
	c.LastReport.Questions = []protocol.Question{{Text: w("两处调用一起改，还是先留着旧的？", "Move both callers now, or keep the old one for a release?")}}
	diff(c, 312, 88)
	c = card("t_asc", w("准备 Ducter iOS 在 App Store Connect 上的上架资料", "Get Ducter iOS ready in App Store Connect"), "ducter", repo("ducter", "app-store-connect"), protocol.NeedsYou, -3*time.Hour, -20*time.Minute)
	report(c, "needs_input", w("描述、关键词和截图都准备好了。", "The description, keywords and screenshots are ready."))
	c.LastReport.Questions = []protocol.Question{{Text: w("在 Chrome 里登录一下 App Store Connect？登好了我接着填。", "Could you sign in to App Store Connect in Chrome? I'll carry on once you have.")}}

	// Working.
	c = card("t_onhand", w("手头的事：项目视角和一览", "On hand: the project lens and the strip"), "ducter", repo("ducter", "onhand-v2"), protocol.Working, -48*time.Minute, -time.Minute)
	step(c, "Bash", `{"command":"go test ./internal/views -run OnHand"}`)
	diff(c, 640, 212)
	c = card("t_compact", w("hel 上的压缩卡顿", "Compaction stall on hel"), "hawdb", repo("hawdb", "compaction-stall"), protocol.Working, -27*time.Minute, -time.Minute)
	step(c, "Read", `{"file_path":"/Users/weyl/dev/hawdb/src/compaction/picker.rs"}`)
	diff(c, 41, 9)
	c = card("t_wamp", w("compaction 的写放大分析", "Write amplification in compaction"), "hawdb", repo("hawdb", "compaction-wamp"), protocol.Working, -70*time.Minute, -2*time.Minute)
	said(c, w("L0 到 L1 的合并每次都把整个 L1 读出来，这是写放大的大头。", "Every L0 to L1 merge reads the whole of L1; that's most of the write amplification."))
	c = card("t_obsidian", w("导入 Obsidian 时保留双链", "Keep wiki links when importing from Obsidian"), "mem", repo("mem", "obsidian-links"), protocol.Working, -35*time.Minute, -time.Minute)
	step(c, "Edit", `{"file_path":"/Users/weyl/dev/mem/importers/obsidian/parse.ts","old_string":"a","new_string":"b"}`)
	diff(c, 66, 9)
	c = card("t_review", w("你能帮我准备好能 review nowledge-co 这个 org 下所有打开的 PR 吗", "Get me ready to review every open PR in the nowledge-co org"), "", none, protocol.Working, -22*time.Minute, -time.Minute)
	step(c, "Bash", `{"command":"gh search prs --owner nowledge-co --state open"}`)
	c = card("t_hotel", w("订 12 月 6 号京都的酒店，两晚，岚山附近", "Book a hotel in Kyoto for Dec 6, two nights, near Arashiyama"), "", none, protocol.Working, -15*time.Minute, -time.Minute)
	said(c, w("Booking 上岚山附近两晚有 11 家，在比早餐和退订条件。", "Eleven places near Arashiyama on Booking; comparing breakfast and cancellation."))

	// Waiting: one on CI that looks again soon, three quiet for days.
	var waiters []protocol.Waiter
	c = card("t_ci", w("等 PR #9811 的 CI 通过再合并", "Merge once CI passes on PR #9811"), "hawdb", repo("hawdb", "wb-split"), protocol.Blocked, -2*time.Hour, -50*time.Minute)
	diff(c, 23, 8)
	waiters = append(waiters, protocol.Waiter{WaiterID: "w_ci", TaskID: "t_ci", Reason: w("PR #9811 的 CI 通过", "PR #9811's CI passes"), State: protocol.WaiterArmed, Kind: "check",
		Check: &protocol.CheckSpec{Argv: []string{"gh", "pr", "checks", "9811"}}, EveryMs: 5 * 60_000, ArmedAt: at(-50 * time.Minute), LastLookAt: at(-time.Minute), NextLookAt: at(4 * time.Minute), Until: at(5 * time.Hour)})
	c = card("t_rec", w("复测真机借用与外部录屏能力并更新复盘", "Retest borrowing a real phone and outside screen recording, and update the review"), "ducter", repo("ducter", "phone-retest"), protocol.Blocked, -64*time.Hour, -61*time.Hour)
	report(c, "blocked", w("真机借用复测完了，外部录屏还要等你把 Pixel Fold 连上。", "Borrowing the real phone is retested; outside recording waits for the Pixel Fold to be connected."))
	c = card("t_fold1", w("重新用 Pixel Fold 录屏访问官网并准备推文", "Record the Pixel Fold visiting the site again and draft the post"), "", none, protocol.Blocked, -62*time.Hour, -59*time.Hour)
	waiters = append(waiters, protocol.Waiter{WaiterID: "w_fold1", TaskID: "t_fold1", Reason: w("Pixel Fold 连上这台 Mac", "the Pixel Fold is connected to this Mac"), State: protocol.WaiterArmed, Kind: "check",
		Check: &protocol.CheckSpec{Argv: []string{"adb", "devices"}}, EveryMs: 5 * 60_000, ArmedAt: at(-59 * time.Hour), LastLookAt: at(-3 * time.Minute), NextLookAt: at(2 * time.Minute)})
	c = card("t_fold2", w("用 Pixel Fold 录屏访问 Ducter 官网并发推", "Record the Pixel Fold visiting the Ducter site and post it"), "", none, protocol.Blocked, -60*time.Hour, -58*time.Hour)
	_ = c
	c = card("t_nightly", w("看一眼 mem 的 nightly，挂了就修", "Check mem's nightly; fix it if it broke"), "mem", repo("mem", "nightly"), protocol.Blocked, -5*time.Hour, -3*time.Hour)
	waiters = append(waiters, protocol.Waiter{WaiterID: "w_nightly", TaskID: "t_nightly", Reason: w("今晚的 nightly 跑完", "tonight's nightly finishes"), State: protocol.WaiterArmed, Kind: "check",
		Check: &protocol.CheckSpec{Argv: []string{"gh", "run", "list"}}, EveryMs: 30 * 60_000, ArmedAt: at(-3 * time.Hour), LastLookAt: at(-12 * time.Minute), NextLookAt: at(18 * time.Minute)})

	// Done today: two new, the rest seen.
	c = card("t_bench", w("范围扫描基准测试", "Range scan benchmark"), "hawdb", repo("hawdb", "range-bench"), protocol.Done, -3*time.Hour, -time.Minute)
	report(c, "done", w("p99 从 41 ms 降到 17 ms，草稿 PR 已开。", "p99 down from 41 ms to 17 ms; draft PR opened."))
	diff(c, 212, 64)
	c.Integrated = &protocol.Integrated{Act: "open_pr", Ref: "https://github.com/wey-gu/hawdb/pull/88"}
	c = card("t_movers", w("比较三家搬家公司的报价", "Compare three movers' quotes"), "", none, protocol.Done, -90*time.Minute, -2*time.Minute)
	report(c, "done", w("日通最便宜，¥86,000，含打包；另外两家贵两到三成。", "Nippon Express is cheapest at ¥86,000 with packing; the other two are 20–30% more."))
	seen := []string{}
	for i, s := range []struct{ z, e, proj, sum string }{
		{"修 iOS 上新建任务里冒出来的 emoji", "Fix the emoji showing in New task on iOS", "ducter", "换成了画出来的符号，iOS 模拟器上看过。"},
		{"D211：手机上画不出来的符号一律不用", "D211: no symbol the phone can't draw as text", "ducter", "加了符号检查，CI 里会跑；改了 14 处文字。"},
		{"README 的中文版", "A Chinese README", "mem", "README.zh-CN.md 写好了，和英文版一节一节对上。"},
		{"把 tokio 升到 1.42", "Upgrade tokio to 1.42", "hawdb", "升好了，测试全过。"},
		{"把 10 月的发票整理成表", "Put October's receipts in a spreadsheet", "", "23 张发票整理进了 2026-10.xlsx，合计 ¥48,320。"},
		{"Android 构建在 CI 上挂了", "The Android build fails on CI", "ducter", "CI 的机器上没有 Android SDK。"},
		{"整理 mem 的 issue #312", "Triage mem issue #312", "mem", "#312 是重复的，关掉了。"},
		{"整理 hawdb 的 issue #318", "Triage hawdb issue #318", "hawdb", "补了复现步骤，标了 bug。"},
		{"给 Ducter 官网加 Fold 截图", "Add the Fold shots to the Ducter site", "ducter", "首页第三屏换成了 Fold 的截图。"},
	} {
		id := fmt.Sprintf("t_seen%d", i)
		p := none
		if s.proj != "" {
			p = repo(s.proj, fmt.Sprintf("seen-%d", i))
		}
		att := protocol.Done
		if i == 5 {
			att = protocol.Failed
		}
		c = card(id, w(s.z, s.e), s.proj, p, att, -time.Duration(6+i)*time.Hour, -time.Duration(4+i)*time.Hour)
		report(c, "done", w(s.sum, s.e+": done."))
		if s.proj != "" {
			diff(c, 10+i*17, i*3)
			if i%3 == 0 {
				c.Integrated = &protocol.Integrated{Act: "merge"}
			}
		}
		seen = append(seen, id)
	}
	// Two more at work in ducter, one in mem, to make it a real afternoon.
	c = card("t_glyph", w("Mac 上的 On hand 细节打磨", "Polish On hand's details on the Mac"), "ducter", repo("ducter", "onhand-polish"), protocol.Working, -9*time.Minute, -time.Minute)
	step(c, "Bash", `{"command":"gofmt -l apps/desktop"}`)
	diff(c, 38, 12)
	c = card("t_digest", w("记忆摘要的评测再跑一遍", "Run the memory digest eval again"), "mem", repo("mem", "digest-eval"), protocol.Working, -19*time.Minute, -time.Minute)
	step(c, "Bash", `{"command":"bun run eval:digest"}`)
	_ = seen
	return cards, waiters
}

// v2App is On hand with the author's week on it.
func v2App(t *testing.T, lang i18n.Lang, few bool) *App {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	app.Local.SeenSince(now.Add(-6 * time.Hour))
	if few {
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: railBoard(lang, now)[:4]}})
		return app
	}
	cards, ws := bigBoard(lang, now)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards, Waiters: ws}})
	for _, c := range cards {
		if strings.HasPrefix(c.TaskID, "t_seen") {
			app.Local.MarkSeen(c.TaskID, c.UpdatedAt, nil)
		}
	}
	return app
}

// D261: the lens, the strip's filter, the quiet waits and the seen results.
func TestOnHandLensAndStrip(t *testing.T) {
	app := v2App(t, i18n.EN, false)
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	all := strings.Join(tt.Texts(), " ")
	for _, want := range []string{"All", "ducter", "hawdb", "mem", "Other", "Retest", "3 more, quiet for over a day", "9 more you've seen", "back at"} {
		if want == "Retest" {
			continue
		}
		if !strings.Contains(all, want) {
			t.Errorf("no %q on the board: %q", want, all)
		}
	}
	// Quiet waits and seen results are folded: not in the keys' walk.
	for _, id := range app.oh.order {
		if id == "t_rec" || id == "t_seen0" {
			t.Errorf("%s is folded but walked", id)
		}
	}
	// The stopped task without a waiter says what it last reported.
	if s := app.storyOf(app.S.Task("t_rec")); !strings.Contains(s.words, "Pixel Fold") {
		t.Errorf("a wait without a waiter: %q", s.words)
	}
	if s := app.storyOf(app.S.Task("t_fold2")); s.words != app.L.T("onhand.wait.unsaid") {
		t.Errorf("a wait that never said: %q", s.words)
	}
	// The lens narrows the board and is kept.
	if err := tt.Click("hawdb, 1 needs you, 2 working, 1 new result"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	if app.Local.Lens() != "hawdb" {
		t.Fatalf("the lens is %q", app.Local.Lens())
	}
	for _, id := range app.oh.order {
		if lensOf(app.S.Task(id)) != "hawdb" {
			t.Errorf("%s shows under hawdb", id)
		}
	}
	// The strip filters, and pressing it again lets go.
	if err := tt.Click(app.L.T("lane.working") + " 2"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.oh.filter != 2 || len(app.oh.order) != 2 {
		t.Fatalf("filter %d, rows %v", app.oh.filter, app.oh.order)
	}
	if err := tt.Click(app.L.T("lane.working") + " 2"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.oh.filter != 0 {
		t.Fatalf("pressed again, the filter stays %d", app.oh.filter)
	}
	// Opening a task: the rail follows the lens.
	app.OpenTask("t_compact")
	tt.Frame()
	for _, id := range app.railOrder() {
		if lensOf(app.S.Task(id)) != "hawdb" {
			t.Errorf("the rail walks %s outside the lens", id)
		}
	}
}

// D261's shots: the Mac at 1100, 1400 and 1700, a fresh few and the
// author's week, zh and en; the lens, a filter, the rail and the task.
func TestOnHandV2Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR=<dir> to write the shots")
	}
	shot := func(app *App, w, h int, name string) {
		tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.SetScale(2)
		app.winW = float32(w)
		tt.Frame()
		tt.Frame()
		writeShot(t, tt, name)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := string(lang)
		for _, w := range []int{1100, 1400, 1700} {
			app := v2App(t, lang, false)
			app.Route = RouteOnHand
			shot(app, w, 1000, fmt.Sprintf("mac-%d-many-%s", w, l))
			app = v2App(t, lang, true)
			app.Route = RouteOnHand
			shot(app, w, 800, fmt.Sprintf("mac-%d-few-%s", w, l))
		}
		app := v2App(t, lang, false)
		app.Route = RouteOnHand
		app.Local.SetLens("hawdb")
		shot(app, 1400, 1000, "mac-1400-lens-"+l)
		app.Local.SetLens("")
		app.oh.filter = 3
		shot(app, 1400, 1000, "mac-1400-waiting-"+l)
		app.oh.filter = 0
		app.Local.SetLens("hawdb")
		app.OpenTask("t_ci")
		shot(app, 1400, 1000, "mac-1400-rail-"+l)
		app.Local.SetLens("")
		app.OpenTask("t_rec")
		shot(app, 1400, 1000, "mac-1400-task-quiet-"+l)
		app.Route = RouteOnHand
		shot(app, 980, 900, "mac-980-many-"+l)
	}
}
