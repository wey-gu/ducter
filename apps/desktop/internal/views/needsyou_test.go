package views

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D517: the author's badge, 0.1.35. On hand's head said 「有 2 个停下了，要你看
// 一眼」 (a phone task stopped 8 days ago, an Android build that failed), the
// Dock and the list of partners counted something else, and the stopped task
// sat in a group card under 在做, so neither showed under 等你. Now every
// number is one source's, each item stands under 等你, and opening one clears it.
func TestD517OneCountDrawnAndClearable(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, now := d467Board(t, lang)
		iso := now.UTC().Format("2006-01-02T15:04:05Z")
		// Two partners; the stopped phone task is one part of a two-part line with one at work.
		app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: []protocol.PartnerInfo{
			{ID: "default", Name: "Ducter", Look: "sand"},
			{ID: "p2", Name: map[i18n.Lang]string{i18n.ZH: "小家", i18n.EN: "Home"}[lang], Look: "sage"},
		}})
		oh := *app.S.OnHand
		oh.Tasks = append(oh.Tasks, protocol.TaskCard{TaskID: "t_site", Title: "把官网的首页截图换成新的", Place: protocol.Place{Kind: "none"}, Harness: "codex", Attention: protocol.Working, OpenedAt: iso, UpdatedAt: iso})
		oh.Groups = []protocol.TaskGroup{{ID: "g1", Name: "官网", Order: "side_by_side", By: "user", Persona: "default", CreatedAt: iso,
			Members: []protocol.GroupMember{{TaskID: "t_site"}, {TaskID: "t_phone"}}}}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &oh})
		b := app.S.Board()

		n := app.stateCounts(b, "")
		dock := app.WaitingCount()
		rows := 0
		for _, p := range app.S.Partners {
			rows += app.partnerNeeds(p)
		}
		if n[0] != 2 || dock != 2 || rows != 2 || app.barNeeds(app.barBoard()) != 2 {
			t.Fatalf("%s: one count: head %d, Dock %d, rows %d, bar %d; want 2 each", lang, n[0], dock, rows, app.barNeeds(app.barBoard()))
		}
		// The group with the stopped part stands in 等你, where the head counts it.
		for _, g := range app.boardGroups(b) {
			if g.g.ID == "g1" && g.lane != 0 {
				t.Fatalf("%s: the line with a stopped part stands in lane %d, not 等你", lang, g.lane)
			}
		}
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, 1400, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		all := strings.Join(tt.Texts(), " | ")
		needsAt := strings.Index(all, app.L.T("lane.needs_you"))
		if needsAt < 0 {
			t.Fatalf("%s: no 等你 on the board: %s", lang, all)
		}
		for _, title := range []string{"用手机把 Ducter 官网录一段屏发到 X", "Android 构建在 CI 上挂了"} {
			at := strings.Index(all, title)
			if at < 0 || at < needsAt {
				t.Fatalf("%s: %q is counted but not under 等你: %s", lang, title, all)
			}
		}
		// Opening the failed one (its page, this Mac) clears it: the count drops,
		// it stands with what finished today, its card keeps 再试一次.
		app.markOpenSeen(app.S.Task("t_android"))
		b = app.S.Board()
		if n := app.stateCounts(b, ""); n[0] != 1 || app.WaitingCount() != 1 || app.partnerNeeds(app.S.Partners[0]) != 1 {
			t.Fatalf("%s: after a look: head %d, Dock %d, Ducter's row %d; want 1", lang, n[0], app.WaitingCount(), app.partnerNeeds(app.S.Partners[0]))
		}
		sp := app.splitOf(b)
		if len(sp.failed) != 0 || len(sp.today) != 2 {
			t.Fatalf("%s: a failure looked at stands with today's: %d failed, %d today", lang, len(sp.failed), len(sp.today))
		}
		// A question never clears by a look: only an answer does.
		if app.looked(app.S.Task("t_phone")) {
			t.Fatalf("%s: the stopped task was never opened", lang)
		}
	}
}
