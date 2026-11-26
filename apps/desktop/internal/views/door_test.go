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
			if !hasText(tt, title) {
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
			if app.oh.keep.open != "" || !hasText(tt, app.L.T("lane.needs_you")) {
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

// D535 (1): a needs-you count is a door. The conversation's 「n 个待你处理」, a
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
		if !hasText(tt, line) {
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

// D535: the author's 0.1.43 On hand showed a card 「通用设置」 with 「Macbook
// Pro M3」 under it in 在做 all day, opening nothing: a hand-over's group
// whose every task had left the board (the task, "Improve general setting
// page", removed), kept in 在做 with only its name and its computer. A group
// with nothing on the board and nothing held is not listed; one with parts
// still held in line stands and says so.
func TestD535NoCardThatOpensNothing(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		now := "2026-11-24T02:10:00Z"
		hand := func() *protocol.GroupHandView {
			return &protocol.GroupHandView{Shape: "one", Where: &protocol.HandDevice{Device: "dev_m3", Name: "Macbook Pro M3"}, Harness: "codex"}
		}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
			Tasks: []protocol.TaskCard{{TaskID: "t_run", Title: "整理本周 mem 的发布说明", Attention: protocol.Working, OpenedAt: now, UpdatedAt: now}},
			Groups: []protocol.TaskGroup{
				// Its one task is gone from the board.
				{ID: "g_stale", Name: "通用设置", By: "user", Persona: "default", CreatedAt: now, Hand: hand(),
					Members: []protocol.GroupMember{{TaskID: "t_gone", Title: "Improve general setting page"}}},
				// Parts still held in line on that computer: it stands, and says so.
				{ID: "g_held", Name: "整理 hawdb 的 issue", By: "user", Persona: "default", CreatedAt: now, Hand: hand(),
					Members: []protocol.GroupMember{{Key: "k1", Title: "给 #120 写复现", Device: "dev_m3"}, {Key: "k2", Title: "关掉重复的 #98", Device: "dev_m3"}}},
				// Its plan ready for the person, nothing of it on the board: 等你.
				{ID: "g_plan", Name: "整理 dotfiles", By: "user", Persona: "default", CreatedAt: now,
					Hand:    &protocol.GroupHandView{Shape: "plan", Plan: &protocol.GroupPlanView{TaskID: "t_plan", State: "ready"}},
					Members: []protocol.GroupMember{{TaskID: "t_plan"}, {Key: "k1", Title: "把 zsh 配置拆开"}}},
			},
		}})
		lanes := map[string]int{}
		for _, g := range app.boardGroups(app.S.Board()) {
			lanes[g.g.ID] = g.lane
		}
		if _, ok := lanes["g_stale"]; ok || lanes["g_held"] != 1 || lanes["g_plan"] != 0 || len(lanes) != 2 {
			t.Fatalf("%s: groups and their lanes %v; want g_held in 在做 (1), g_plan in 等你 (0), no g_stale", lang, lanes)
		}
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, 1150, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		if hasText(tt, "通用设置") {
			t.Fatalf("%s: the card that opens nothing is listed: %q", lang, tt.Texts())
		}
		if !hasText(tt, "整理 hawdb 的 issue") || !hasText(tt, "给 #120 写复现") {
			t.Fatalf("%s: the hand-over with held parts is gone: %q", lang, tt.Texts())
		}
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
