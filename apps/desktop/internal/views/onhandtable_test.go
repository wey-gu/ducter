package views

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D662 (research/245 §3.5): 列表 / List on the Mac. The author's week
// (bigBoard, about thirty tasks) offers it; the consumer's few never do.
func listApp(t *testing.T, lang i18n.Lang, few bool) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app := v2App(t, lang, few)
	var sent []any
	app.Send = func(f any) error { sent = append(sent, f); return nil }
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1400, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.winW = 1400
	tt.Frame()
	tt.Frame()
	return app, tt, &sent
}

func TestListModeOffered(t *testing.T) {
	app, tt, _ := listApp(t, i18n.EN, true)
	all := strings.Join(tt.Texts(), " ")
	for _, not := range []string{"Overview", "Views", "Needs me today", "Last step"} {
		if strings.Contains(all, not) {
			t.Errorf("the consumer's few show %q: %q", not, all)
		}
	}
	if app.listOffered(app.S.Board()) {
		t.Fatal("four tasks offer the list")
	}

	app, tt, _ = listApp(t, i18n.EN, false)
	all = strings.Join(tt.Texts(), " ")
	for _, want := range []string{"Overview", "List", "Views"} {
		if !strings.Contains(all, want) {
			t.Errorf("the week lacks %q", want)
		}
	}
	if app.Local.BoardList() {
		t.Fatal("the list is the default by itself")
	}
	// ⌘2 on the board goes on to the list; ⌘1 there comes back.
	tt.Key(ui.Cmd, ui.Key2)
	tt.Frame()
	if !app.Local.BoardList() {
		t.Fatal("⌘2 on the board didn't open the list")
	}
	tt.Frame()
	all = strings.Join(tt.Texts(), " ")
	for _, want := range []string{"Task", "Project", "Computer", "AI agent", "Age", "Last step", "PR", "CI", "Save as view"} {
		if !strings.Contains(all, want) {
			t.Errorf("the table lacks %q", want)
		}
	}
	if app.Route != RouteOnHand {
		t.Fatalf("⌘2 left the board: %v", app.Route)
	}
	if n := len(tableTasks(app.S.Board())); len(app.oh.order) != n {
		t.Errorf("rows %d, tasks %d", len(app.oh.order), n)
	}
	// Urgency order: the walk never steps back up a tier.
	last := -1
	for _, id := range app.oh.order {
		r := stateRank[truthState(app.S.Task(id))]
		if r < last {
			t.Fatalf("%s (%d) after tier %d", id, r, last)
		}
		last = r
	}
	tt.Key(ui.Cmd, ui.Key1)
	tt.Frame()
	if app.Local.BoardList() || app.Route != RouteOnHand {
		t.Fatalf("⌘1 in the list: list %v route %v", app.Local.BoardList(), app.Route)
	}
}

func TestListBulkKeys(t *testing.T) {
	app, tt, sent := listApp(t, i18n.ZH, false)
	app.setBoardList(true)
	tt.Frame()
	tt.Frame()
	// j x j x: two picked; e raises the one ask, never acts.
	for _, k := range []ui.Key{ui.KeyJ, ui.KeyX, ui.KeyJ, ui.KeyX} {
		tt.Key(0, k)
		tt.Frame()
	}
	if len(app.oh.tbl.sel) != 2 {
		t.Fatalf("picked %v", app.oh.tbl.sel)
	}
	before := len(*sent)
	tt.Key(0, ui.KeyE)
	tt.Frame()
	tt.Frame()
	if app.oh.tbl.ask != "end" || len(*sent) != before {
		t.Fatalf("e: ask %q, sent %d", app.oh.tbl.ask, len(*sent)-before)
	}
	all := strings.Join(tt.Texts(), " ")
	rows := app.selected(tableTasks(app.S.Board()))
	if want := app.bulkAsk("end", rows, ""); !strings.Contains(all, want) {
		t.Fatalf("the ask %q is not in the bar: %q", want, all)
	}
	if !strings.Contains(all, "已选 2 个") {
		t.Errorf("the bar's count: %q", all)
	}
	if err := tt.Click("就这样"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	var got *protocol.TaskBulk
	for _, f := range (*sent)[before:] {
		if b, ok := f.(protocol.TaskBulk); ok {
			got = &b
		}
	}
	if got == nil || got.Op != "end" || len(got.TaskIDs) != 2 {
		t.Fatalf("sent %#v", (*sent)[before:])
	}
	if len(app.oh.tbl.sel) != 0 {
		t.Error("the selection stayed after Go")
	}
	// The answer is said with its Undo; Undo sends the batch's id.
	app.Receive(protocol.ServerFrame{T: "task_bulk_result", Bulk: &protocol.BulkResult{BatchID: "bulk_1", Op: "end", Total: 2, Done: 2}})
	tt.Frame()
	if !strings.Contains(strings.Join(tt.Texts(), " "), "结束了 2 个") {
		t.Fatalf("no toast: %q", tt.Texts())
	}
	if err := tt.Click("撤销"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if u, ok := (*sent)[len(*sent)-1].(protocol.TaskBulkUndo); !ok || u.BatchID != "bulk_1" {
		t.Fatalf("undo sent %#v", (*sent)[len(*sent)-1])
	}
	// ⌘A picks every row the filter shows; Esc lets go.
	tt.Key(ui.Cmd, ui.KeyA)
	tt.Frame()
	if len(app.oh.tbl.sel) != len(app.oh.order) {
		t.Fatalf("⌘A picked %d of %d", len(app.oh.tbl.sel), len(app.oh.order))
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if len(app.oh.tbl.sel) != 0 {
		t.Fatal("Esc kept the selection")
	}
}

func TestListBulkAskWords(t *testing.T) {
	app, _, _ := listApp(t, i18n.EN, false)
	tasks := tableTasks(app.S.Board())
	working, done := bulkCounts(tasks)
	if working == 0 || done == 0 {
		t.Fatalf("the week has %d working, %d done", working, done)
	}
	if got, want := app.bulkAsk("end", tasks, ""), fmt.Sprintf("Of %d, %d are working; they stop when this round ends.", len(tasks), working); got != want {
		t.Errorf("end: %q", got)
	}
	if got, want := app.bulkAsk("drop", tasks, ""), fmt.Sprintf("Of %d, %d are done and stay as they are.", len(tasks), done); got != want {
		t.Errorf("drop: %q", got)
	}
	if got := app.bulkAsk("move", tasks[:3], "haswell"); got != "Move all 3 to haswell?" {
		t.Errorf("move: %q", got)
	}
}

func TestListViewSavedAndApplied(t *testing.T) {
	app, tt, sent := listApp(t, i18n.EN, false)
	app.setBoardList(true)
	app.oh.tbl.filter.State = "working"
	tt.Frame()
	if err := tt.Click("Save as view"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Type("Builds at work")
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	var v *protocol.ViewSave
	for _, f := range *sent {
		if x, ok := f.(protocol.ViewSave); ok {
			v = &x
		}
	}
	if v == nil || v.View.Name != "Builds at work" || v.View.Filter.State != "working" || v.View.Mode != "list" {
		t.Fatalf("view_save %#v", v)
	}
	// The home answers; the column lists it under the built-ins, and a press applies it.
	app.Receive(protocol.ServerFrame{T: "view_saved", Views: []protocol.BoardView{v.View}})
	app.oh.tbl.filter = protocol.TaskFilter{}
	app.setBoardList(false)
	tt.Frame()
	if !strings.Contains(strings.Join(tt.Texts(), " "), "Builds at work") {
		t.Fatalf("the saved view isn't in the column: %q", tt.Texts())
	}
	if err := tt.Click("Builds at work, Views"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !app.Local.BoardList() || app.oh.tbl.filter.State != "working" {
		t.Fatalf("applied: list %v filter %#v", app.Local.BoardList(), app.oh.tbl.filter)
	}
}

// Geometry: at 1000, 1150 and 1400 no row is taller than 32 and the
// table never runs past the board.
func TestListGeometry(t *testing.T) {
	for _, w := range []int{1000, 1150, 1400} {
		app, tt, _ := listApp(t, i18n.ZH, false)
		app.setBoardList(true)
		tt.SetSize(w, 1000)
		app.winW = float32(w)
		tt.Frame()
		tt.Frame()
		if app.oh.listW > listMax || app.oh.listW > float32(w) {
			t.Errorf("%d: the table is %v wide", w, app.oh.listW)
		}
		for _, id := range app.oh.order[:3] {
			task := app.S.Task(id)
			label := spoken(app.L, app.L.T("onhand.state."+truthState(task)), task.Title())
			n, ok := tt.AccessByRole(ui.RoleButton, label)
			if !ok {
				t.Fatalf("%d: no row %q", w, label)
			}
			if h := n.Bounds.H; h > tableRowH+0.5 {
				t.Errorf("%d: row %q is %v tall", w, label, h)
			}
			if r := n.Bounds.X + n.Bounds.W; r > float32(w) {
				t.Errorf("%d: row runs to %v", w, r)
			}
		}
	}
}

// The shots: DUCTER_SHOTS_DIR=<dir> go test ./internal/views -run ListShots
func TestListShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR=<dir> to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := ""
			if dark {
				paper = "-dark"
			}
			for _, w := range []int{1000, 1150, 1400} {
				app, _, _ := listApp(t, lang, false)
				app.setBoardList(true)
				tt := ui.NewTesterWith(app.View, w, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetScale(2)
				tt.SetDark(dark)
				app.winW = float32(w)
				tt.Frame()
				tt.Frame()
				writeShot(t, tt, fmt.Sprintf("mac-list-%d-%s%s", w, lang, paper))
				if w != 1150 {
					continue
				}
				for _, k := range []ui.Key{ui.KeyJ, ui.KeyX, ui.KeyJ, ui.KeyJ, ui.KeyX, ui.KeyJ, ui.KeyX} {
					tt.Key(0, k)
					tt.Frame()
				}
				writeShot(t, tt, fmt.Sprintf("mac-list-sel-%d-%s%s", w, lang, paper))
				tt.Key(0, ui.KeyE)
				tt.Frame()
				tt.Frame()
				writeShot(t, tt, fmt.Sprintf("mac-list-ask-%d-%s%s", w, lang, paper))
			}
		}
		app, _, _ := listApp(t, lang, true)
		tt := ui.NewTesterWith(app.View, 1150, 800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.SetScale(2)
		app.winW = 1150
		tt.Frame()
		tt.Frame()
		writeShot(t, tt, fmt.Sprintf("mac-list-few-1150-%s", lang))
	}
}
