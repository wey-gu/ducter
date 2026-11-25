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

// D285: Past tasks on the Mac.

func pastApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Now = func() time.Time { return pastNow }
	return app, sent
}

func TestPastFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"past_result","id":"past3","items":[{"taskId":"t1","title":"flaky 测试：假时钟","original":"查 compaction 测试","project":"hawdb","harness":"claude-code","openedAt":"2026-11-18T10:00:00Z","updatedAt":"2026-11-19T10:00:00Z","attention":"done","outcome":"原因是假时钟","changes":{"files":2,"adds":38,"dels":12,"at":"x"},"branch":"ducter/x","integrated":{"act":"open_pr","ref":"https://github.com/x/y/pull/1"},"kind":"look","mark":{"name":"flaky 测试：假时钟","starred":true,"tags":["flaky"],"glyph":"look","tint":"sage","at":"2026-11-19T10:00:00Z"},"hit":{"field":"words","text":"flaky"},"from":{"taskId":"t0","title":"earlier"}}],"total":1,"facets":{"projects":[{"name":"hawdb","n":3}],"harnesses":[{"harness":"codex","n":2}],"tags":[{"tag":"flaky","n":1}]},"suggestions":["flaky","hawdb"],"range":{"since":"2026-11-10T00:00:00Z","before":"2026-11-11T00:00:00Z","words":"上周二"}}`))
	if err != nil {
		t.Fatal(err)
	}
	p := f.Past
	if p == nil || len(p.Items) != 1 || p.ID != "past3" || p.Total != 1 || p.Range == nil || p.Range.Words != "上周二" {
		t.Fatalf("past_result %#v", p)
	}
	it := p.Items[0]
	if it.Mark == nil || !it.Mark.Starred || it.Mark.Tint != "sage" || it.Hit.Field != "words" || it.From.TaskID != "t0" || it.Changes.Adds != 38 || it.Integrated.Act != "open_pr" {
		t.Errorf("item %#v", it)
	}
	if len(f.SavedItems) != 0 {
		t.Errorf("Past items landed in Autofill's: %#v", f.SavedItems)
	}
	if p.Facets.Projects[0].Name != "hawdb" || p.Facets.Harnesses[0].Harness != "codex" || p.Facets.Tags[0].N != 1 {
		t.Errorf("facets %#v", p.Facets)
	}
	m, err := protocol.DecodeServerFrame([]byte(`{"t":"past_marked","taskId":"t1","mark":null}`))
	if err != nil || m.Past == nil || m.Past.TaskID != "t1" || m.Past.Mark != nil {
		t.Fatalf("past_marked %#v %v", m.Past, err)
	}
	// What goes out: null clears, absent leaves.
	empty, on := "", true
	b, _ := json.Marshal(protocol.PastMarkReq{T: "past_mark", TaskID: "t1", Patch: protocol.PastMarkPatch{Name: &empty, Starred: &on}})
	if string(b) != `{"t":"past_mark","taskId":"t1","patch":{"name":null,"starred":true}}` {
		t.Errorf("past_mark %s", b)
	}
	b, _ = json.Marshal(protocol.PastMarkReq{T: "past_mark", TaskID: "t1", Patch: protocol.PastMarkPatch{SetTags: true}})
	if string(b) != `{"t":"past_mark","taskId":"t1","patch":{"tags":[]}}` {
		t.Errorf("past_mark tags %s", b)
	}
	b, _ = json.Marshal(protocol.TaskNew{T: "task_new", Words: "接着查", From: "t1"})
	if !strings.Contains(string(b), `"from":"t1"`) {
		t.Errorf("task_new %s", b)
	}
}

func TestPastGroupsByWhen(t *testing.T) {
	l := i18n.New(i18n.ZH)
	groups := pastGroups(l, pastItems(pastSeeds()), pastNow)
	var names []string
	n := 0
	for _, g := range groups {
		names = append(names, g.name)
		n += len(g.items)
	}
	want := "标了星的 今天 昨天 这周 上周 这个月 10 月"
	if got := strings.Join(names, " "); got != want {
		t.Errorf("groups %q, want %q", got, want)
	}
	if n != len(pastSeeds()) {
		t.Errorf("%d items grouped of %d", n, len(pastSeeds()))
	}
	if g := groups[0]; len(g.items) != 3 || g.items[0].TaskID != "t_flaky" {
		t.Errorf("starred %v", pastIDs(deref(g.items)))
	}
	en := pastGroups(i18n.New(i18n.EN), pastItems(pastSeeds()), pastNow)
	if last := en[len(en)-1].name; last != "October" {
		t.Errorf("month %q", last)
	}
	if got := monthName(i18n.ZH, time.Date(2025, 12, 1, 0, 0, 0, 0, time.Local), pastNow); got != "2025 年 12 月" {
		t.Errorf("other year %q", got)
	}
}

func deref(items []*protocol.PastItem) []protocol.PastItem {
	out := make([]protocol.PastItem, len(items))
	for i, it := range items {
		out[i] = *it
	}
	return out
}

func lastPast[T any](sent []any) (T, bool) {
	for i := len(sent) - 1; i >= 0; i-- {
		if f, ok := sent[i].(T); ok {
			return f, true
		}
	}
	var zero T
	return zero, false
}

func TestPastSearchesAsYouType(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	app.OpenPast("")
	q, ok := lastPast[protocol.PastReq](*sent)
	if !ok || q.Query.Q != "" {
		t.Fatalf("opening asks %#v", *sent)
	}
	app.Receive(pastResult(pastItems(pastSeeds()), q.ID))
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, "订京都的酒店") || !hasText(tt, "标了星的") {
		t.Fatalf("the list %q", tt.Texts())
	}
	n := len(*sent)
	app.past.q = "fla"
	tt.Frame()
	app.past.q = "flaky"
	tt.Frame()
	if len(*sent) != n {
		t.Fatalf("asked before the words rested: %#v", (*sent)[n:])
	}
	tt.Advance(150 * time.Millisecond)
	tt.Frame()
	q, _ = lastPast[protocol.PastReq](*sent)
	if q.Query.Q != "flaky" || len(*sent) != n+1 {
		t.Fatalf("after the rest %#v", (*sent)[n:])
	}
	// A filter asks at once.
	app.past.filter = pastFilter{"project", "hawdb"}
	tt.Frame()
	q, _ = lastPast[protocol.PastReq](*sent)
	if q.Query.Project == nil || *q.Query.Project != "hawdb" || q.Query.Q != "flaky" {
		t.Fatalf("filter %#v", q.Query)
	}
	app.Receive(pastResult(pastFlaky(), q.ID))
	tt.Frame()
	for _, want := range []string{"你说过", "文件", "分支", "标签", "原名"} {
		if !hasText(tt, want) {
			t.Errorf("no hit label %q in %q", want, tt.Texts())
		}
	}
}

func TestPastKeys(t *testing.T) {
	app, sent := pastApp(t, i18n.EN)
	app.Route = RouteOnHand
	app.OpenPast("")
	q, _ := lastPast[protocol.PastReq](*sent)
	app.Receive(pastResult(pastItems(pastSeeds()), q.ID))
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	// ↓ leaves the field for the first card.
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	if app.past.focus != app.past.order[0] {
		t.Fatalf("down: %q (order %v)", app.past.focus, app.past.order[:3])
	}
	first := app.past.focus
	tt.SetFocused(true)
	tt.Key(0, ui.KeyEscape) // the field had the keyboard: its words are empty, so Esc would go back
	if app.Route != RouteOnHand {
		t.Fatalf("Esc with nothing to clear goes back: route %v", app.Route)
	}
	app.OpenPast("")
	app.Receive(pastResult(pastItems(pastSeeds()), "x"))
	tt.Frame()
	tt.Frame()
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	if app.past.focus != first {
		t.Fatalf("down again: %q", app.past.focus)
	}
	// s stars the focused card, at once and to the home.
	tt.Key(0, ui.KeyS)
	tt.Frame()
	m, ok := lastPast[protocol.PastMarkReq](*sent)
	it := app.pastItem(first)
	if !ok || m.TaskID != first || it.Mark == nil || it.Mark.Starred {
		// t_flaky starts starred: s unstars it.
		t.Fatalf("s: %#v, item %#v", m, it.Mark)
	}
	tt.Key(0, ui.KeyJ)
	tt.Frame()
	if app.past.focus == first {
		t.Errorf("j did not walk")
	}
	tt.Key(0, ui.KeyK)
	tt.Frame()
	if app.past.focus != first {
		t.Errorf("k did not walk back: %q", app.past.focus)
	}
	// r renames: the marks open with the name.
	tt.Key(0, ui.KeyR)
	tt.Frame()
	if app.past.marking != first || !app.past.markOpen {
		t.Fatalf("r: %#v", app.past)
	}
	app.past.nameDraft = "The fake-clock flake"
	app.closeMarks()
	m, _ = lastPast[protocol.PastMarkReq](*sent)
	if m.Patch.Name == nil || *m.Patch.Name != "The fake-clock flake" || app.pastItem(first).Title != "The fake-clock flake" {
		t.Errorf("rename %#v", m.Patch)
	}
	// ⌘Enter continues and opens the task; Esc there comes back here.
	tt.Key(ui.Cmd, ui.KeyEnter)
	tt.Frame()
	c, ok := lastPast[protocol.PastContinue](*sent)
	if !ok || c.TaskID != first || app.Route != RouteTask || app.TaskID != first {
		t.Fatalf("⌘Enter %#v route %v", c, app.Route)
	}
	app.Up()
	if app.Route != RoutePast {
		t.Errorf("back from the task: %v", app.Route)
	}
	// ⇧⌘Enter: New task from this, with the chip, and from goes with it.
	tt.Frame()
	tt.Key(ui.Cmd|ui.Shift, ui.KeyEnter)
	tt.Frame()
	if !app.nt.open || app.pastFromID() != first {
		t.Fatalf("⇧⌘Enter: open %v from %q", app.nt.open, app.pastFromID())
	}
	if !hasText(tt, "With what “The fake-clock flake” found") {
		t.Errorf("no chip in %q", tt.Texts())
	}
	app.nt.words = "Now fix the other race in TestFlushRace"
	app.StartNewTask()
	nt, _ := lastPast[protocol.TaskNew](*sent)
	if nt.From != first {
		t.Errorf("task_new %#v", nt)
	}
	app.nt.open = false
	app.OpenNewTask(nil)
	if app.pastFromID() != "" {
		t.Errorf("a plain New task kept the chip")
	}
}

func TestPastMarkedUpdatesEverywhere(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t_kyoto", Title: "订京都的酒店", Attention: protocol.Done}}}})
	app.Receive(pastResult(pastItems(pastSeeds()), ""))
	app.Receive(protocol.ServerFrame{T: "past_marked", Past: &protocol.PastFrame{T: "past_marked", TaskID: "t_kyoto", Mark: &protocol.PastMark{Name: "京都住哪儿", Starred: true}}})
	it := app.pastItem("t_kyoto")
	if it.Title != "京都住哪儿" || it.Original != "订京都的酒店" || !it.Mark.Starred {
		t.Errorf("item %#v", it)
	}
	if got := app.S.Task("t_kyoto").Title(); got != "京都住哪儿" {
		t.Errorf("the task's title %q", got)
	}
	app.Receive(protocol.ServerFrame{T: "past_marked", Past: &protocol.PastFrame{T: "past_marked", TaskID: "t_kyoto"}})
	if it := app.pastItem("t_kyoto"); it.Title != "订京都的酒店" || it.Original != "" || it.Mark != nil {
		t.Errorf("cleared %#v", it)
	}
}

func TestPastWaysIn(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t_w", Title: "修 CI", Attention: protocol.Working}}}})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if err := tt.Click("做过的事"); err != nil {
		t.Fatalf("On hand's end line: %v (%q)", err, tt.Texts())
	}
	tt.Frame()
	if app.Route != RoutePast {
		t.Fatalf("route %v", app.Route)
	}
	app.Route = RouteOnHand
	app.oh.find = "京都"
	tt.Frame()
	if err := tt.Click("在做过的事里找「京都」"); err != nil {
		t.Fatalf("Find's link: %v (%q)", err, tt.Texts())
	}
	q, _ := lastPast[protocol.PastReq](*sent)
	if app.Route != RoutePast || q.Query.Q != "京都" {
		t.Errorf("Find opened %v with %#v", app.Route, q.Query)
	}
}
