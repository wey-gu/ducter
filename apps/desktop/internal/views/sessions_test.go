package views

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D391: every task is open: the palette, the preview beside Past tasks,
// the steps and Redo from here, the computer and ending chips.

func sessApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	t.Helper()
	app, sent := pastApp(t, lang)
	app.S.Devices = sessDevices()
	app.Receive(sessOnHand(lang))
	return app, sent
}

func TestSessionFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"past_steps_result","id":"steps1","taskId":"t1","steps":[{"n":1,"seq":10,"at":"2026-11-18T10:00:00Z","who":"partner","text":"split it","came":"split","commit":"5e21b9f"},{"n":2,"seq":20,"at":"2026-11-18T11:00:00Z","who":"you","text":"keep the API"}],"report":"done","repo":true}`))
	if err != nil || f.PastSteps == nil || len(f.PastSteps.Steps) != 2 || f.PastSteps.Steps[0].Commit != "5e21b9f" || !f.PastSteps.Repo || f.PastSteps.Report != "done" {
		t.Fatalf("past_steps_result %#v %v", f.PastSteps, err)
	}
	if len(f.SavedItems) != 0 {
		t.Errorf("steps landed in Autofill's items")
	}
	g, err := protocol.DecodeServerFrame([]byte(`{"t":"past_forked","from":"t1","step":3,"ok":true,"taskId":"t9"}`))
	if err != nil || g.PastSteps == nil || g.PastSteps.From != "t1" || g.PastSteps.Step != 3 || !g.PastSteps.OK || g.PastSteps.TaskID != "t9" {
		t.Fatalf("past_forked %#v %v", g.PastSteps, err)
	}
	h, _ := protocol.DecodeServerFrame([]byte(`{"t":"past_result","items":[{"taskId":"t2","title":"x","project":"","harness":"codex","openedAt":"","updatedAt":"","attention":"done","kind":"fix","lastWords":"bye","asking":"which?","steps":4,"from":{"taskId":"t1","title":"y","step":3}}],"total":1,"facets":{"projects":[],"harnesses":[],"tags":[],"computers":[{"name":"haswell","n":2}]},"suggestions":[]}`))
	it := h.Past.Items[0]
	if it.LastWords != "bye" || it.Asking != "which?" || it.Steps != 4 || it.From.Step != 3 || h.Past.Facets.Computers[0].Name != "haswell" {
		t.Errorf("item %#v facets %#v", it, h.Past.Facets)
	}
	home := ""
	b, _ := json.Marshal(protocol.PastQuery{Q: "x", Computer: &home, Ended: "failed"})
	if string(b) != `{"q":"x","computer":"","ended":"failed"}` {
		t.Errorf("query %s", b)
	}
	b, _ = json.Marshal(protocol.PastFork{T: "past_fork", TaskID: "t1", Step: 3, Harness: "codex"})
	if string(b) != `{"t":"past_fork","taskId":"t1","step":3,"harness":"codex"}` {
		t.Errorf("fork %s", b)
	}
}

func TestPaletteRows(t *testing.T) {
	app, sent := sessApp(t, i18n.ZH)
	app.OpenSwitcher()
	rows := app.palRows("")
	if len(rows) == 0 || rows[0].kind != palTask || rows[0].task.Attention() != protocol.NeedsYou {
		t.Fatalf("no words: what needs you leads: %#v", rows[0])
	}
	if last := rows[len(rows)-1]; last.kind != palGo || last.place.id != "settings" {
		t.Errorf("no words ends with Go to: %#v", last)
	}
	// Words: the home is asked once they rest, with a palette id; the place's own result stays.
	app.oh.swQuery = "compaction"
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Advance(200 * time.Millisecond)
	tt.Frame()
	q, ok := lastPast[protocol.PastReq](*sent)
	if !ok || q.Query.Q != "compaction" || !strings.HasPrefix(q.ID, store.PaletteID) {
		t.Fatalf("past asked %#v", q)
	}
	if m, ok := lastPast[protocol.MadeReq](*sent); !ok || m.ID != q.ID {
		t.Errorf("made asked %#v", m)
	}
	var found []protocol.PastItem
	for _, it := range sessItems(i18n.ZH) {
		if strings.Contains(it.Title, "compaction") || strings.Contains(it.Outcome, "compaction") {
			found = append(found, it)
		}
	}
	app.Receive(sessResult(found, "past9")) // the place's own answer
	stale := sessResult(found[:1], store.PaletteID+"0")
	app.Receive(stale)
	if app.S.Past.Result == nil || app.S.Past.Result.ID != "past9" {
		t.Errorf("a palette answer overwrote the place's")
	}
	if n := countKind(app.palRows("compaction"), palPast); n != 0 {
		t.Errorf("a stale palette answer shows %d rows", n)
	}
	app.Receive(sessResult(found, q.ID))
	rows = app.palRows("compaction")
	order := []palKind{}
	for _, r := range rows {
		if len(order) == 0 || order[len(order)-1] != r.kind {
			order = append(order, r.kind)
		}
	}
	if order[len(order)-2] != palTell || order[len(order)-1] != palNew {
		t.Errorf("tell and new last: %v", order)
	}
	seen := map[string]int{}
	for _, r := range rows {
		id := ""
		if r.task != nil {
			id = r.task.ID
		}
		if r.item != nil {
			id = r.item.TaskID
		}
		if id != "" {
			seen[id]++
		}
	}
	for id, n := range seen {
		if n > 1 {
			t.Errorf("%s shown %d times", id, n)
		}
	}
	if countKind(rows, palPast) == 0 {
		t.Errorf("no earlier rows: %v", order)
	}
	tt.Frame()
	if !hasT(tt, "跟 Ducter 说：「compaction」") || !hasT(tt, "做过的") {
		t.Errorf("texts %q", tt.Texts())
	}
}

func countKind(rows []palRow, k palKind) int {
	n := 0
	for _, r := range rows {
		if r.kind == k {
			n++
		}
	}
	return n
}

func TestPaletteKeys(t *testing.T) {
	app, sent := sessApp(t, i18n.EN)
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Key(ui.Cmd, ui.KeyK)
	tt.Frame()
	if !app.oh.sw {
		t.Fatal("⌘K did not open the palette")
	}
	if !hasT(tt, "Find anything: a task, words, a file, a branch, a PR…") {
		t.Errorf("no field: %q", tt.Texts())
	}
	tt.Key(ui.Cmd, ui.KeyK)
	tt.Frame()
	if app.oh.sw {
		t.Fatal("⌘K again did not close it")
	}
	// An earlier task: ⌘Enter continues it.
	app.OpenSwitcher()
	app.oh.swQuery = "rust build"
	tt.Frame()
	tt.Advance(200 * time.Millisecond)
	tt.Frame()
	q, _ := lastPast[protocol.PastReq](*sent)
	items := sessItems(i18n.EN)
	var rust []protocol.PastItem
	for _, it := range items {
		if strings.HasPrefix(it.TaskID, "s_rust") {
			rust = append(rust, it)
		}
	}
	app.Receive(sessResult(rust, q.ID))
	tt.Frame()
	rows := app.palRows("rust build")
	if rows[0].kind != palPast || rows[0].item.TaskID != "s_rust_build" {
		t.Fatalf("first row %#v", rows[0])
	}
	if !hasT(tt, "⌘") || !hasT(tt, "⌥") { // the Return key itself is drawn
		t.Errorf("the foot bar's keys: %q", tt.Texts())
	}
	tt.Key(ui.Cmd, ui.KeyEnter)
	tt.Frame()
	c, ok := lastPast[protocol.PastContinue](*sent)
	if !ok || c.TaskID != "s_rust_build" || app.oh.sw || app.Route != RouteTask {
		t.Fatalf("⌘Enter %#v open %v route %v", c, app.oh.sw, app.Route)
	}
	// ⌥Enter: Past tasks, the task's steps to pick from.
	app.OpenSwitcher()
	app.oh.swQuery = "rust build"
	app.pal.sent = "rust build"
	tt.Frame()
	tt.Key(ui.Alt, ui.KeyEnter)
	tt.Frame()
	if app.Route != RoutePast || app.past.sel != "s_rust_build" || !app.past.pickSteps {
		t.Fatalf("⌥Enter route %v sel %q pick %v", app.Route, app.past.sel, app.past.pickSteps)
	}
	if s, ok := lastPast[protocol.PastStepsReq](*sent); !ok || s.TaskID != "s_rust_build" {
		t.Errorf("steps asked %#v", s)
	}
	// The last row tells the partner.
	app.OpenSwitcher()
	app.oh.swQuery = "what did haswell build last month"
	tt.Frame()
	for i := 0; i < 40; i++ {
		tt.Key(0, ui.KeyDown)
	}
	tt.Frame()
	tt.Key(ui.Ctrl, ui.KeyP) // New task → Tell
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	s, ok := lastPast[protocol.Send](*sent)
	if !ok || s.Text != "what did haswell build last month" || app.Route != RouteConversation {
		t.Fatalf("tell %#v route %v", s, app.Route)
	}
}

func TestPastPreviewAndRedo(t *testing.T) {
	app, sent := sessApp(t, i18n.ZH)
	app.OpenPast("")
	q, _ := lastPast[protocol.PastReq](*sent)
	items := sessItems(i18n.ZH)
	app.Receive(sessResult(items, q.ID))
	tt := ui.NewTesterWith(app.View, 1360, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if app.past.sel == "" {
		t.Fatal("wide: nothing shown beside the list")
	}
	app.pastSelect("s_compaction_pr")
	s, ok := lastPast[protocol.PastStepsReq](*sent)
	if !ok || s.TaskID != "s_compaction_pr" {
		t.Fatalf("steps asked %#v", s)
	}
	n := len(*sent)
	app.pastSelect("s_compaction_pr")
	if len(*sent) != n {
		t.Errorf("steps asked twice")
	}
	app.Receive(sessSteps(i18n.ZH, "s_compaction_pr"))
	tt.Frame()
	for _, want := range []string{"停在哪儿", "步骤", "第 3 步", "d27fe03", "PR #4127 已经开了，等 Weizhen 的意见。"} {
		if !hasT(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// Redo from step 3 with Codex.
	it := app.pastItemFor("s_compaction_pr")
	app.openRedo(it, app.S.Past.Steps["s_compaction_pr"].Steps[2])
	tt.Frame()
	if !hasT(tt, "从第 3 步开新任务") || !hasT(tt, "代码从这一步之前的样子开始（d27fe03，"+app.redoWhen(app.S.Past.Steps["s_compaction_pr"].Steps[2].At)+"）。之后的改动留在原来那个里。") || !hasT(tt, "原来那个不动。") {
		t.Fatalf("redo sheet %q", tt.Texts())
	}
	if err := tt.Click("Codex"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("开始"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	f, ok := lastPast[protocol.PastFork](*sent)
	if !ok || f.TaskID != "s_compaction_pr" || f.Step != 3 || f.Harness != "codex" || f.Words != "" {
		t.Fatalf("past_fork %#v", f)
	}
	app.Receive(protocol.ServerFrame{T: "past_forked", PastSteps: &protocol.PastStepsFrame{T: "past_forked", From: "s_compaction_pr", Step: 3, OK: false, Message: "haswell 现在连不上。"}})
	tt.Frame()
	if !hasT(tt, "haswell 现在连不上。") || !app.past.redo.open {
		t.Errorf("a failed redo says why: %q", tt.Texts())
	}
	app.past.redo.words = "退避改成指数加抖动，上限 2 秒"
	app.sendRedo(it)
	f, _ = lastPast[protocol.PastFork](*sent)
	if f.Words != "退避改成指数加抖动，上限 2 秒" {
		t.Errorf("changed words not sent: %#v", f)
	}
	app.Receive(protocol.ServerFrame{T: "past_forked", PastSteps: &protocol.PastStepsFrame{T: "past_forked", From: "s_compaction_pr", Step: 3, OK: true, TaskID: "s_new"}})
	tt.Frame()
	if app.Route != RouteTask || app.TaskID != "s_new" || app.past.redo.open {
		t.Errorf("ok opens the new task: route %v task %q", app.Route, app.TaskID)
	}
}

func TestPastComputerAndEndingChips(t *testing.T) {
	app, sent := sessApp(t, i18n.ZH)
	app.OpenPast("")
	q, _ := lastPast[protocol.PastReq](*sent)
	// Errands only on the cards (so "haswell" is the chip's alone), every computer among the facets.
	var errands []protocol.PastItem
	for _, it := range sessItems(i18n.ZH) {
		if it.Project == "" && it.Computer == "" {
			errands = append(errands, it)
		}
	}
	r := sessResult(errands, q.ID)
	r.Past.Facets.Computers = []protocol.PastNameN{{Name: "", N: 30}, {Name: "haswell", N: 9}, {Name: "hel", N: 7}}
	app.Receive(r)
	tt := ui.NewTesterWith(app.View, 900, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasT(tt, "MacBook Pro") || !hasT(tt, "haswell") || !hasT(tt, "没做成") {
		t.Fatalf("chips %q", tt.Texts())
	}
	if err := tt.Click("haswell"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("没做成"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	got, _ := lastPast[protocol.PastReq](*sent)
	if got.Query.Computer == nil || *got.Query.Computer != "haswell" || got.Query.Ended != "failed" {
		t.Fatalf("query %#v", got.Query)
	}
	// All lets go of both.
	if err := tt.Click("全部"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	got, _ = lastPast[protocol.PastReq](*sent)
	if got.Query.Computer != nil || got.Query.Ended != "" {
		t.Errorf("All kept %#v", got.Query)
	}
}

// A narrow Past tasks: a click shows where it stopped as a sheet; a
// redone card says where it came from.
func TestPastNarrowSheet(t *testing.T) {
	app, sent := sessApp(t, i18n.EN)
	app.OpenPast("redo")
	q, _ := lastPast[protocol.PastReq](*sent)
	var redone []protocol.PastItem
	for _, it := range sessItems(i18n.EN) {
		if it.From != nil {
			redone = append(redone, it)
		}
	}
	app.Receive(sessResult(redone, q.ID))
	tt := ui.NewTesterWith(app.View, 900, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasT(tt, "Started from step 3 of “Split the compaction scheduler in two and open a PR”") {
		t.Fatalf("redone line: %q", tt.Texts())
	}
	if app.past.sheet {
		t.Fatal("a sheet before any click")
	}
	if err := tt.Click(redone[0].Title); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !app.past.sheet || app.past.sel != redone[0].TaskID || !hasT(tt, "Where it stopped") {
		t.Fatalf("click: sheet %v sel %q", app.past.sheet, app.past.sel)
	}
	if app.Route != RoutePast {
		t.Errorf("a click opened the task")
	}
}

// hasT is HasText with the word joiners keepWords puts in left out.
func hasT(tt *ui.Tester, s string) bool {
	for _, x := range tt.Texts() {
		if strings.ReplaceAll(x, "\u2060", "") == s {
			return true
		}
	}
	return false
}
