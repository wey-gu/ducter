package views

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D535 (2): On hand opened on a Keep's page left open earlier, at 1000 points
// with no list and no way back. The page lives only while On hand is shown;
// the way back is the header's breadcrumb, at every width; Esc goes up to the
// overview first.
func TestD535KeepPageNavigation(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := d535Keeps(t, lang)
		for _, w := range []int{1000, 1150, 1400} {
			app.Route = RouteConversation
			tt := ui.NewTesterWith(app.View, w, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			// A deep link opens the page straight.
			app.openKeep("kp_review")
			tt.Frame()
			tt.Frame()
			if app.Route != RouteOnHand || app.oh.keep.open != "kp_review" {
				t.Fatalf("%s %d: the deep link didn't open the page: route %v, open %q", lang, w, app.Route, app.oh.keep.open)
			}
			// The breadcrumb names where you are; no back link in the page or its rail.
			conv, onhand := app.L.T("nav.conversation"), app.L.T("onhand.title")
			if _, ok := tt.Find(conv); !ok {
				t.Fatalf("%s %d: no 对话 crumb: %q", lang, w, tt.Texts())
			}
			title := "持续评审 nowledge-co，并处理 100gle 分给你的待办"
			if !tt.HasText(title) {
				t.Fatalf("%s %d: the breadcrumb doesn't name the Keep: %q", lang, w, tt.Texts())
			}
			// Once as the crumb, once as the places' mark: never a back link too.
			if n := strings.Count(strings.Join(tt.Texts(), "\n"), onhand); n != 2 {
				t.Fatalf("%s %d: 手头的事 said %d times on a Keep's page (the crumb and the place, no back link): %q", lang, w, n, tt.Texts())
			}
			// Leaving On hand closes the page: next time On hand opens on its overview.
			if err := tt.Click(conv); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			if app.Route != RouteConversation || app.oh.keep.open != "" {
				t.Fatalf("%s %d: left On hand, the page stayed open: route %v, open %q", lang, w, app.Route, app.oh.keep.open)
			}
			app.Route = RouteOnHand
			tt.Frame()
			if app.oh.keep.open != "" || !tt.HasText(app.L.T("lane.needs_you")) {
				t.Fatalf("%s %d: On hand didn't open on its overview: %q", lang, w, tt.Texts())
			}
			// The crumb 手头的事 goes up from the page to the overview, in place.
			app.openKeep("kp_review")
			tt.Frame()
			if err := tt.Click(onhand); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			if app.Route != RouteOnHand || app.oh.keep.open != "" {
				t.Fatalf("%s %d: 手头的事 didn't go up to the overview: route %v, open %q", lang, w, app.Route, app.oh.keep.open)
			}
			// Esc: the page, then On hand, then the conversation.
			app.openKeep("kp_review")
			tt.Frame()
			tt.Key(0, ui.KeyEscape)
			tt.Frame()
			if app.Route != RouteOnHand || app.oh.keep.open != "" {
				t.Fatalf("%s %d: Esc on a Keep's page: route %v, open %q; want the overview", lang, w, app.Route, app.oh.keep.open)
			}
			tt.Key(0, ui.KeyEscape)
			tt.Frame()
			if app.Route != RouteConversation {
				t.Fatalf("%s %d: Esc on On hand: route %v", lang, w, app.Route)
			}
			// Through an opened task and back: the overview, not the page.
			app.openKeep("kp_review")
			tt.Frame()
			app.OpenTask("t_ask")
			tt.Frame()
			app.Route = RouteOnHand
			tt.Frame()
			if app.oh.keep.open != "" {
				t.Fatalf("%s %d: back from a task, On hand reopened the Keep's page", lang, w)
			}
		}
	}
}

// D535 (1): a needs-you count is a door. The conversation's 「n 个等你」, a
// partner's pebble and the line over the composer open the next item, in
// 等你's order, and step on; after the last, the first again.
func TestD535CountIsADoor(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := d467Board(t, lang)
		items := app.doorItems("")
		if len(items) != 2 || len(items) != app.WaitingCount() {
			t.Fatalf("%s: the door's items %d, the count %d; want the same 2", lang, len(items), app.WaitingCount())
		}
		app.Route = RouteConversation
		tt := ui.NewTesterWith(app.View, 1150, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		// The pinned line: what waits is out of view (it lives in On hand).
		line := app.L.T("door.line", 2)
		if !tt.HasText(line) {
			t.Fatalf("%s: no %q over the composer: %q", lang, line, tt.Texts())
		}
		count := spoken(app.L, app.L.T("header.needs", 2), app.L.T("door.line.about"))
		var seen []string
		for i := 0; i < 3; i++ {
			app.Route = RouteConversation
			app.oh.keep.open = "" // a page left open must not take the door's place
			tt.Frame()
			click := count
			if i == 1 {
				click = spoken(app.L, line, app.L.T("door.line.about"))
			}
			if err := tt.Click(click); err != nil {
				t.Fatalf("%s: %q: %v (%q)", lang, click, err, tt.Texts())
			}
			tt.Frame()
			tt.Frame()
			if app.Route != RouteOnHand || app.oh.focus == "" || app.oh.filter != 0 {
				t.Fatalf("%s: step %d: route %v, focus %q, filter %d", lang, i, app.Route, app.oh.focus, app.oh.filter)
			}
			seen = append(seen, app.oh.focus)
		}
		if seen[0] == seen[1] || seen[2] != seen[0] {
			t.Fatalf("%s: the door didn't step through and wrap: %v", lang, seen)
		}
		if seen[0] != items[0].task.ID {
			t.Fatalf("%s: the first step went to %q, not 等你's first %q", lang, seen[0], items[0].task.ID)
		}
	}
}

// D535: a stopped line, the partner's own questions, another partner's, then
// the tasks; the step after the last is the first; an item gone starts over.
func TestD535NextDoor(t *testing.T) {
	items := []needItem{{group: "g"}, {ask: &protocol.PartnerAsk{DecisionID: "d1"}}}
	if nextDoor(items, "") != 0 || nextDoor(items, "g:g") != 1 || nextDoor(items, "a:d1") != 0 || nextDoor(items, "t:gone") != 0 {
		t.Fatal("nextDoor doesn't step and wrap")
	}
}

// d535Keeps is a board with the author's review loop as a Keep and one task
// that asks.
func d535Keeps(t *testing.T, lang i18n.Lang) *App {
	app, _ := pastApp(t, lang)
	now := "2026-11-24T02:10:00Z"
	keep := &protocol.TaskKeep{ID: "kp_review", Name: "持续评审 nowledge-co，并处理 100gle 分给你的待办"}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			{TaskID: "t_round", Title: "持续评审 nowledge-co", Attention: protocol.Working, UpdatedAt: now, Keep: keep},
			{TaskID: "t_ask", Title: "PR #11024 要不要合进 main", Attention: protocol.NeedsYou, UpdatedAt: now},
		},
		Keeps: []protocol.KeepSheet{
			{ID: "kp_review", Title: keep.Name, Life: "on", Run: "same", Wakes: []protocol.KeepWake{{Kind: "every", Words: "每 45 分钟"}}, TaskIDs: []string{"t_round"}, Since: now},
			{ID: "kp_fare", Title: "12 月 20 日上海飞东京的机票", Life: "on", Run: "fresh", Wakes: []protocol.KeepWake{{Kind: "at", Words: "每天早上 8:00"}}, Since: now},
		},
	}})
	app.S.KeepPages = map[string]*protocol.KeepPage{"kp_review": {ID: "kp_review", Title: keep.Name, Life: "on", Run: "same", Since: now}}
	return app
}
