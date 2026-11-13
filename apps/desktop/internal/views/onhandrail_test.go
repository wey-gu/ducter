package views

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// railBoard is a heavy user's afternoon (D244's shots and checks): two
// repos, an errand, one ask, two at work, a wait on CI, two results.
func railBoard(lang i18n.Lang, now time.Time) []protocol.TaskCard {
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
	card := func(id, title, project string, p protocol.Place, att protocol.Attention, opened time.Duration) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Project: project, Harness: "claude-code", Attention: att, OpenedAt: at(opened), UpdatedAt: at(-time.Minute), Place: p}
	}
	ev := protocol.NewEvent(9, at(-time.Minute), "default", protocol.TaskStream("t_keys"), protocol.OriginTask, protocol.KindTaskEvent,
		protocol.TaskEvent{TaskID: "t_keys", Role: "tool", Tool: &protocol.ToolCall{Name: "Bash", Input: json.RawMessage(`{"command":"bun test apps/web/test/onhand.test.ts"}`)}})
	ev2 := protocol.NewEvent(11, at(-time.Minute), "default", protocol.TaskStream("t_compact"), protocol.OriginTask, protocol.KindTaskEvent,
		protocol.TaskEvent{TaskID: "t_compact", Role: "tool", Tool: &protocol.ToolCall{Name: "Read", Input: json.RawMessage(`{"file_path":"/Users/weyl/dev/hawdb/src/compaction/picker.rs"}`)}})
	ask := card("t_iter", w("范围扫描：旧迭代器要不要留着？", "Range scan: keep the old iterator?"), "hawdb", repo("hawdb", "range-scan-iter"), protocol.NeedsYou, -40*time.Minute)
	ask.LastReport = &protocol.Report{TaskID: "t_iter", State: "needs_input", Summary: w("新迭代器快 2.3 倍，旧的还有两处在用。", "The new iterator is 2.3× faster; two callers still use the old one."),
		Questions: []protocol.Question{{Text: w("两处调用一起改，还是先留着旧的？", "Move both callers now, or keep the old one for a release?")}}}
	keys := card("t_keys", w("手头的事：键盘走一遍", "Keyboard on On hand"), "ducter", repo("ducter", "onhand-keys"), protocol.Working, -12*time.Minute)
	keys.Latest = &ev
	keys.Changes = &protocol.DiffStat{Files: 4, Adds: 186, Dels: 22}
	compact := card("t_compact", w("hel 上的压缩卡顿", "Compaction stall on hel"), "hawdb", repo("hawdb", "compaction-stall"), protocol.Working, -27*time.Minute)
	compact.Latest = &ev2
	ci := card("t_ci", w("等 PR #1592 的 CI 通过再合并", "Merge once CI passes on PR #1592"), "ducter", repo("ducter", "wb-split"), protocol.Blocked, -2*time.Hour)
	ci.Reason = w("等 PR #1592 通过", "PR #1592 to pass")
	bench := card("t_bench", w("范围扫描基准测试", "Range scan benchmark"), "hawdb", repo("hawdb", "range-bench"), protocol.Done, -3*time.Hour)
	bench.LastReport = &protocol.Report{TaskID: "t_bench", State: "done", Summary: w("p99 从 41 ms 降到 17 ms，草稿 PR 已开。", "p99 down from 41 ms to 17 ms; draft PR opened.")}
	bench.Changes = &protocol.DiffStat{Files: 3, Adds: 212, Dels: 64}
	bench.Integrated = &protocol.Integrated{Act: "open_pr", Ref: "https://github.com/wey-gu/hawdb/pull/88"}
	hotel := card("t_hotel", w("订 12 月 6 号京都的酒店，两晚，岚山附近", "Book a hotel in Kyoto for Dec 6, two nights, near Arashiyama"), "", protocol.Place{Kind: "none"}, protocol.Done, -90*time.Minute)
	hotel.LastReport = &protocol.Report{TaskID: "t_hotel", State: "done", Summary: w("订好了：嵯峨野的町屋，两晚 ¥38,400，可免费取消到 12 月 3 日。", "Booked: a machiya in Sagano, two nights ¥38,400, free cancellation until Dec 3.")}
	flaky := card("t_flaky", w("修 Linux 上不稳定的 e2e", "Fix the flaky e2e on Linux"), "ducter", repo("ducter", "e2e-linux"), protocol.Failed, -5*time.Hour)
	flaky.LastReport = &protocol.Report{TaskID: "t_flaky", State: "failed", Summary: w("复现不了：本地 40 次都过了，需要 CI 的日志。", "Couldn't reproduce: 40 local runs passed; it needs the CI logs.")}
	flaky.UpdatedAt = at(-4 * time.Hour) // seen before: not new
	return []protocol.TaskCard{ask, keys, compact, ci, bench, hotel, flaky}
}

func railApp(t *testing.T, lang i18n.Lang) *App {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	app.Local.SeenSince(now.Add(-6 * time.Hour))
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: railBoard(lang, now)}})
	app.Local.MarkSeen("t_flaky", app.S.Task("t_flaky").Card.UpdatedAt, nil)
	return app
}

func TestRailPanes(t *testing.T) {
	cases := []struct {
		w            float32
		bench        bool
		rail, bench2 bool
	}{
		{1000, false, false, false},
		{1100, false, true, false},
		{1400, true, false, true}, // two slots: the workbench takes the rail's place
		{1560, true, true, true},
		{1700, false, true, false},
	}
	for _, c := range cases {
		r, b := panes(c.w, c.bench)
		if r != c.rail || b != c.bench2 {
			t.Errorf("at %v (workbench %v): rail %v workbench %v", c.w, c.bench, r, b)
		}
	}
	if railWidth(1100) != 300 || railWidth(1400) != 308 || railWidth(1900) != 340 {
		t.Errorf("rail widths %v %v %v", railWidth(1100), railWidth(1400), railWidth(1900))
	}
}

func TestRailStatusAndNewResults(t *testing.T) {
	app := railApp(t, i18n.EN)
	want := map[string]rowMark{"t_iter": stNeeds, "t_keys": stWorking, "t_ci": stNone, "t_bench": stNew, "t_hotel": stNew, "t_flaky": stNone}
	for id, st := range want {
		if got := app.rowMarkOf(app.S.Task(id)); got != st {
			t.Errorf("%s: %q, want %q", id, got, st)
		}
	}
	// Opening a result clears it, and it stays cleared after.
	app.OpenTask("t_hotel")
	tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	app.Route = RouteOnHand
	if app.rowMarkOf(app.S.Task("t_hotel")) != stNone {
		t.Errorf("an opened result is still new")
	}
	// A folded group keeps its most urgent mark, and says the counts.
	st, of, words := app.foldMark([]*store.Task{app.S.Task("t_bench"), app.S.Task("t_compact"), app.S.Task("t_iter")})
	if st != stNeeds || of.ID != "t_iter" || words != "1 needs you · 1 working · 1 new result" {
		t.Errorf("fold mark %q %v %q", st, of.ID, words)
	}
	// ⌘⇧] walks in the rail's order: needs you, working, waiting, done.
	app.OpenTask("t_iter")
	app.WalkTask(1)
	if app.TaskID != "t_keys" {
		t.Errorf("next after the ask is %q", app.TaskID)
	}
	app.WalkTask(-1)
	app.WalkTask(-1)
	if app.TaskID != "t_iter" {
		t.Errorf("previous stops at the first: %q", app.TaskID)
	}
}

// A row seen working that turns into a result hands over to the done face once.
func TestRailHandover(t *testing.T) {
	app := railApp(t, i18n.EN)
	app.OpenTask("t_iter")
	tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if app.oh.was["t_keys"] != stWorking {
		t.Fatalf("the rail did not draw the working row: %v", app.oh.was)
	}
	c := app.S.Task("t_keys").Card
	c.Attention = protocol.Done
	if s := app.S.Task("t_keys").State; s != nil {
		s.Attention = protocol.Done
	}
	c.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	tt.Frame()
	if _, ok := app.oh.handed["t_keys"]; !ok {
		t.Fatalf("no handover: %v %v %v", app.oh.was["t_keys"], app.S.Task("t_keys").Attention(), app.rowMarkOf(app.S.Task("t_keys")))
	}
}

// D244's shots: the Mac at 1100, 1400 and 1700, zh and en.
func TestRailShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR=<dir> to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, s := range []struct {
			name  string
			w, h  int
			bench bool
			route Route
		}{
			{"mac-1100", 1100, 800, false, RouteTask},
			{"mac-1400", 1400, 900, false, RouteTask},
			{"mac-1400-bench", 1400, 900, true, RouteTask},
			{"mac-1700-three", 1700, 1000, true, RouteTask},
			{"mac-1000-alone", 1000, 760, false, RouteTask},
			{"mac-onhand-960", 1400, 900, false, RouteOnHand},
		} {
			app := railApp(t, lang)
			app.OpenTask("t_keys")
			app.Route = s.route
			app.bench.open = s.bench
			b := app.benchOf("t_keys")
			b.asked = true
			b.changes = &protocol.WbAnswer{Op: "changes", Kind: "branch", Base: "main", Files: []protocol.WbChange{
				{Path: "apps/web/src/onhand.tsx", Status: "modified", Adds: 96, Dels: 14},
				{Path: "apps/web/static/app.css", Status: "modified", Adds: 61, Dels: 8},
				{Path: "apps/desktop/internal/views/onhandrail.go", Status: "added", Adds: 29}}}
			tt := ui.NewTesterWith(app.View, s.w, s.h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			tt.Frame()
			tt.Advance(time.Second)
			writeShot(t, tt, "onhand-rail-"+s.name+"-"+string(lang)+"")
		}
		// By project with a folded group, and the launcher.
		app := railApp(t, lang)
		app.Local.SetByProject(true)
		app.Local.SetFolded("hawdb", true)
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		tt.Frame()
		writeShot(t, tt, "onhand-rail-mac-folded-"+string(lang)+"")
		app.Local.SetByProject(false)
		app.OpenTask("t_hotel")
		app.bench.open = true
		app.bench.had = "t_hotel"
		tt = ui.NewTesterWith(app.View, 1700, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		tt.Frame()
		writeShot(t, tt, "onhand-rail-mac-launcher-"+string(lang)+"")
	}
}
