package views

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D410: 你的小应用 / Your apps on the Mac. The fixture is the author's own
// shelf after the Beijing trip: the trip's costs (filled in from the
// bookings), the review routine's board, and a reading streak, pinned.

func shelfFixture(lang i18n.Lang) []protocol.AppMeta {
	w := func(zh, en string) string { return appWords(lang, zh, en) }
	now := time.Now().UTC()
	at := func(d time.Duration) string { return now.Add(-d).Format(time.RFC3339) }
	return []protocol.AppMeta{
		{ID: "a1b2c3", Name: w("北京出差 11/20–21", "Beijing trip, Nov 20–21"), Persona: "default", Made: at(2 * time.Hour), Updated: at(20 * time.Minute), Version: 2, Back: true, Icon: "coins",
			Summary: w("3 笔，合计 ¥2,036", "3 costs, ¥2,036 in all"), Note: w("11/20 的高铁和两晚酒店已经从你的预订里填好了。", "The Nov 20 train and two hotel nights are in, from your bookings.")},
		{ID: "a9e8d7", Name: w("审查看板", "Review board"), Persona: "default", Made: at(50 * time.Hour), Updated: at(30 * time.Minute), Version: 1, Kind: "reviews", Opened: at(3 * time.Hour),
			Summary: w("9 个 PR 在等你，3 份草稿没发", "9 PRs waiting, 3 drafts not sent"), Task: &protocol.AppTask{ID: "t1", Title: w("看 nowledge-co 里请我 review 的 PR", "Review my requests in nowledge-co")}},
		{ID: "a4f5e6", Name: w("读书打卡", "Reading streak"), Persona: "default", Made: at(200 * time.Hour), Updated: at(26 * time.Hour), Version: 3, Icon: "check", Pinned: true, Opened: at(5 * time.Hour),
			Summary: w("连续 6 天，这周 4 小时", "6 days in a row, 4 hours this week")},
	}
}

func shelfApp(t *testing.T, lang i18n.Lang, apps []protocol.AppMeta, ideas []protocol.AppIdea) (*App, *[]any) {
	app, sent := appsApp(t, lang)
	app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: apps, Ideas: ideas}})
	return app, sent
}

func shelfIdeas() []protocol.AppIdea {
	return []protocol.AppIdea{
		{Say: protocol.Words{ZH: "做个小应用，记一下这趟北京出差的花销", EN: "Make me an app to keep my Beijing trip's costs"}, Why: &protocol.Words{ZH: "你 11/20 去北京", EN: "You're in Beijing from 11/20"}, Icon: "coins"},
		{Say: protocol.Words{ZH: "做个习惯打卡：每天读书、跑步、11 点后不看手机", EN: "A habit tracker: reading, a run, no phone after 11"}, Icon: "check"},
		{Say: protocol.Words{ZH: "做个小清单，记下这周要买的东西", EN: "A little list of what to buy this week"}, Icon: "list"},
	}
}

func shelfTester(app *App, w int) *ui.Tester {
	tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	for i := 0; i < 3; i++ {
		tt.Frame()
		tt.Advance(300 * time.Millisecond)
	}
	return tt
}

func TestShelfFromTheBarAndItsTiles(t *testing.T) {
	app, sent := shelfApp(t, i18n.ZH, shelfFixture(i18n.ZH), nil)
	var opened []string
	app.OpenAppWindow = func(id, name string) { opened = append(opened, id) }
	tt := shelfTester(app, 1280)
	// One click from the bar's places.
	if err := tt.Click(app.L.T("apps.title")); err != nil {
		t.Fatalf("no Apps place: %v %q", err, tt.Texts())
	}
	tt.Frame()
	if app.Route != RouteApps {
		t.Fatalf("route %v", app.Route)
	}
	for _, want := range []string{"北京出差 11/20–21", unjoin(autospace("3 笔，合计 ¥2,036")), "审查看板", "读书打卡", "置顶", unjoin(autospace(app.L.T("app.kept", "看 nowledge-co 里请我 review 的 PR")))} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// Pinned first, then the newest change.
	if got := app.shelfApps(); got[0].ID != "a4f5e6" || got[1].ID != "a1b2c3" || got[2].ID != "a9e8d7" {
		t.Errorf("order %v %v %v", got[0].ID, got[1].ID, got[2].ID)
	}
	if err := tt.Click(spoken(app.L, app.L.T("app.open"), "北京出差 11/20–21")); err != nil {
		t.Fatal(err)
	}
	if len(opened) != 1 || opened[0] != "a1b2c3" {
		t.Errorf("opened %v", opened)
	}
	// 「⋯」: pin, rename, undo the change, stop the routine, delete.
	more := app.L.T("apps.more", "北京出差 11/20–21")
	if err := tt.Click(more); err != nil {
		t.Fatal(err)
	}
	want := []string{"改名", app.L.T("apps.m.change", "Ducter"), "改回去", "-", "置顶", "-", "删掉"}
	if got := tt.Menu(); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("menu %q want %q", got, want)
	}
	_ = tt.ChooseMenuItem("置顶")
	if s, ok := lastPast[protocol.AppSetReq](*sent); !ok || s.ID != "a1b2c3" || s.Pinned == nil || !*s.Pinned {
		t.Errorf("pin %#v", s)
	}
	tt.Frame()
	_ = tt.Click(more)
	_ = tt.ChooseMenuItem("改回去")
	if s, ok := lastPast[protocol.AppIDReq](*sent); !ok || s.T != "app_back" || s.ID != "a1b2c3" {
		t.Errorf("back %#v", s)
	}
	board := app.L.T("apps.more", "审查看板")
	_ = tt.Click(board)
	_ = tt.ChooseMenuItem(app.L.T("apps.m.untask", "看 nowledge-co 里请我 review 的 PR"))
	if s, ok := lastPast[protocol.AppSetReq](*sent); !ok || s.ID != "a9e8d7" || !s.Untask {
		t.Errorf("untask %#v", s)
	}
	// Rename in place.
	_ = tt.Click(more)
	_ = tt.ChooseMenuItem("改名")
	tt.Frame()
	app.shelf.name = "北京出差"
	if err := tt.Click(spoken(app.L, "保存", "北京出差 11/20–21")); err != nil {
		t.Fatalf("no save: %v %q", err, tt.Texts())
	}
	if s, ok := lastPast[protocol.AppSetReq](*sent); !ok || s.Name == nil || *s.Name != "北京出差" {
		t.Errorf("rename %#v", s)
	}
	tt.Frame()
	// Delete asks first, says what goes; then 撤销 brings it back.
	_ = tt.Click(app.L.T("apps.more", "北京出差"))
	_ = tt.ChooseMenuItem("删掉")
	tt.Frame()
	for _, w := range []string{unjoin(unjoin(autospace("删掉「北京出差」？"))), unjoin("它记下的东西会一起删掉。")} {
		if !hasText(tt, w) {
			t.Errorf("no %q in %q", w, tt.Texts())
		}
	}
	if err := tt.Click(spoken(app.L, "删掉", "北京出差")); err != nil {
		t.Fatal(err)
	}
	if s, ok := lastPast[protocol.AppIDReq](*sent); !ok || s.T != "app_remove" || s.ID != "a1b2c3" {
		t.Errorf("remove %#v", s)
	}
	tt.Frame()
	if !hasText(tt, unjoin(unjoin(autospace("删掉了「北京出差」")))) {
		t.Errorf("no undo line %q", tt.Texts())
	}
	if err := tt.Click(spoken(app.L, "撤销", "北京出差")); err != nil {
		t.Fatal(err)
	}
	if s, ok := lastPast[protocol.AppIDReq](*sent); !ok || s.T != "app_restore" || s.ID != "a1b2c3" {
		t.Errorf("restore %#v", s)
	}
	// Esc goes back to the conversation.
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.Route != RouteConversation {
		t.Errorf("esc route %v", app.Route)
	}
}

func TestShelfEmptyIdeasSayIt(t *testing.T) {
	app, sent := shelfApp(t, i18n.ZH, nil, shelfIdeas())
	app.OpenApps()
	tt := shelfTester(app, 1280)
	for _, want := range []string{unjoin(autospace(app.L.T("apps.empty.h", "Ducter"))), "可以这样说", unjoin(autospace("你 11/20 去北京"))} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("做个小应用，记一下这趟北京出差的花销"); err != nil {
		t.Fatal(err)
	}
	s, ok := lastPast[protocol.Send](*sent)
	if !ok || s.Text != "做个小应用，记一下这趟北京出差的花销" || app.Route != RouteConversation {
		t.Errorf("idea said %#v route %v", s, app.Route)
	}
}

func TestShelfCardRemovedCardAndPins(t *testing.T) {
	app, sent := shelfApp(t, i18n.EN, shelfFixture(i18n.EN), nil)
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(7, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "where are my apps?"}),
		protocol.NewEvent(8, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "They're all in Your apps, at the top.", ReplyTo: 7, Shelf: true}),
		protocol.NewEvent(9, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "delete the lunch splitter"}),
		protocol.NewEvent(10, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "Deleted the lunch splitter and its two rows.", ReplyTo: 9, App: &protocol.AppCard{ID: "a7a7a7", Name: "Team lunch splitter", Version: 2, Change: "removed"}}),
	}})
	tt := shelfTester(app, 1280)
	for _, want := range []string{"3 apps", "Open Your apps", unjoin(keepClauses(autospace("Deleted, with what it kept."))), "Reading streak"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click(spoken(app.L, "Undo", "Team lunch splitter")); err != nil {
		t.Fatal(err)
	}
	if s, ok := lastPast[protocol.AppIDReq](*sent); !ok || s.T != "app_restore" || s.ID != "a7a7a7" {
		t.Errorf("restore %#v", s)
	}
	tt.Frame()
	if _, ok := tt.Find(spoken(app.L, "Undo", "Team lunch splitter")); ok {
		t.Errorf("Undo still offered after it went out")
	}
	// The pinned app's chip under the bar opens it.
	var opened []string
	app.OpenAppWindow = func(id, name string) { opened = append(opened, id) }
	if err := tt.Click(app.L.T("board.open", "Reading streak")); err != nil {
		t.Fatal(err)
	}
	if len(opened) != 1 || opened[0] != "a4f5e6" {
		t.Errorf("pinned chip opened %v", opened)
	}
	if err := tt.Click("Open Your apps"); err != nil {
		t.Fatal(err)
	}
	if app.Route != RouteApps {
		t.Errorf("shelf card route %v", app.Route)
	}
}

func TestAppWindowFirstLineAskAndChange(t *testing.T) {
	app, sent := shelfApp(t, i18n.ZH, shelfFixture(i18n.ZH), nil)
	w := app.NewAppWin("a1b2c3")
	tt := ui.NewTesterWith(app.AppWinView(w), 520, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, want := range []string{"北京出差 11/20–21", unjoin(autospace(app.L.T("app.first", "Ducter"))), unjoin(autospace("11/20 的高铁和两晚酒店已经从你的预订里填好了。")), "修改"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// D562: the head keeps the whole name; 改回去 is said beside a change that lands (below).
	if hasText(tt, "改回去") {
		t.Errorf("改回去 in the head: %q", tt.Texts())
	}
	// D603: at rest, no composer and no footer under the app.
	if _, ok := tt.Find("发送"); ok || hasText(tt, unjoin(autospace(app.L.T("app.private")))) {
		t.Errorf("a composer or a footer at rest: %q", tt.Texts())
	}
	// The first-open line goes by itself after a while.
	tt.Advance(9 * time.Second)
	tt.Frame()
	if hasText(tt, unjoin(autospace(app.L.T("app.first", "Ducter")))) {
		t.Errorf("first-open line still there: %q", tt.Texts())
	}
	// 修改 brings the composer up with the keys; Esc puts it away; ⌘L and / bring it back.
	if err := tt.Click(spoken(app.L, "修改", "北京出差 11/20–21")); err != nil {
		t.Fatalf("%v %q", err, tt.Texts())
	}
	tt.Frame()
	if _, ok := tt.Find("发送"); !ok || !w.compose {
		t.Fatalf("no composer after 修改: %q", tt.Texts())
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if _, ok := tt.Find("发送"); ok {
		t.Errorf("composer still up after Esc: %q", tt.Texts())
	}
	tt.Key(ui.Cmd, ui.KeyL)
	tt.Frame()
	if !w.compose {
		t.Errorf("⌘L didn't bring the composer up")
	}
	w.compose = false
	tt.Frame()
	app.ComposeApp("a1b2c3") // the menu bar's 修改这个小应用…, or the app's own / through its bridge
	tt.Frame()
	if !w.compose {
		t.Errorf("ComposeApp didn't bring the composer up")
	}
	// D519, D562: the ask is the conversation's composer.
	w.said = "加一笔打车 84"
	tt.Frame()
	if err := tt.Click("发送"); err != nil {
		t.Fatal(err)
	}
	s, ok := lastPast[protocol.Send](*sent)
	if !ok || s.App != "a1b2c3" || s.Text != "加一笔打车 84" {
		t.Errorf("send %#v", s)
	}
	tt.Frame()
	// Sent: the composer goes down into the line that says it is being made.
	if _, ok := tt.Find("发送"); ok || !hasText(tt, unjoin(autospace(app.L.T("app.live.changing", "Ducter")))) {
		t.Errorf("no progress line %q", tt.Texts())
	}
	// The partner changed it: 改好了 with its words, the page runs again.
	reloads := 0
	w.Reload = func() { reloads++ }
	apps := shelfFixture(i18n.ZH)
	apps[0].Version, apps[0].Note = 3, "加了打车 ¥84"
	app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: apps}})
	tt.Frame()
	if reloads != 1 || !hasText(tt, "改好了") || !hasText(tt, unjoin(autospace("加了打车 ¥84"))) {
		t.Errorf("reloads %d %q", reloads, tt.Texts())
	}
	// D562: 改回去 beside the change; when that Undo lands, it says 改回去了, never 改好了.
	if err := tt.Click(spoken(app.L, "改回去", "北京出差 11/20–21")); err != nil {
		t.Fatalf("%v %q", err, tt.Texts())
	}
	if b, ok := lastPast[protocol.AppIDReq](*sent); !ok || b.T != "app_back" || b.ID != "a1b2c3" {
		t.Errorf("undo sent %#v", b)
	}
	apps[0].Version, apps[0].Note = 4, "加了打车 ¥84"
	app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: apps}})
	tt.Frame()
	if !hasText(tt, "改回去了") || hasText(tt, "改好了") || hasText(tt, unjoin(autospace("加了打车 ¥84"))) {
		t.Errorf("after the undo landed %q", tt.Texts())
	}
	// D603: the line goes by itself; 改回去 stays in 「⋯」.
	tt.Advance(9 * time.Second)
	tt.Frame()
	if hasText(tt, "改回去了") {
		t.Errorf("the change's line stayed: %q", tt.Texts())
	}
	// A second open of an app already opened has no first line.
	w2 := app.NewAppWin("a4f5e6")
	if w2.first != "" {
		t.Errorf("first line on an opened app: %q", w2.first)
	}
}

func TestAppsBridgeSummary(t *testing.T) {
	app, sent := appsApp(t, i18n.EN)
	app.Bridge().Post("a1b2c3", []byte(`{"t":"summary","text":"3 costs, ¥2,036"}`))
	if s, ok := lastPast[protocol.AppSummaryReq](*sent); !ok || s.ID != "a1b2c3" || s.Text != "3 costs, ¥2,036" {
		t.Errorf("summary %#v", s)
	}
	// The frames' JSON is the home's.
	b, _ := json.Marshal(protocol.AppSetReq{T: "app_set", ID: "a1", Untask: true})
	if string(b) != `{"t":"app_set","id":"a1","untask":true}` {
		t.Errorf("app_set %s", b)
	}
	if (protocol.AppMeta{ID: "a1b2c3"}).TintOf() == "" || (protocol.AppMeta{Kind: "reviews"}).IconOf() != "board" {
		t.Errorf("tint or icon")
	}
}

// The Mac screens of D410:
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/apps-home go test ./internal/views -run ShelfShots
func TestShelfShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			shot := func(app *App, view func(*ui.Context), w, h int, name string) {
				tt := ui.NewTesterWith(view, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				shotTester(t, tt, fmt.Sprintf("mac-%s-%s-%s", name, lang, mode))
			}
			for _, width := range []int{1280, 720} {
				app, _ := shelfApp(t, lang, shelfFixture(lang), nil)
				app.OpenApps()
				shot(app, app.View, width, 860, fmt.Sprintf("shelf-%d", width))
			}
			app, _ := shelfApp(t, lang, nil, shelfIdeas())
			app.OpenApps()
			shot(app, app.View, 1280, 860, "shelf-empty-1280")
			app, _ = shelfApp(t, lang, shelfFixture(lang), nil)
			shot(app, app.AppWinView(app.NewAppWin("a1b2c3")), 520, 860, "app-window-view")
			app, _ = shelfApp(t, lang, shelfFixture(lang), nil)
			ts := time.Now().UTC().Format(time.RFC3339Nano)
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				protocol.NewEvent(7, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: appWords(lang, "我的小应用都在哪？", "where are my apps?")}),
				protocol.NewEvent(8, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: appWords(lang, "都在顶上的「你的小应用」里。", "They're all in Your apps, at the top."), ReplyTo: 7, Shelf: true}),
			}})
			shot(app, app.View, 1280, 860, "conv-shelf-card")
		}
	}
}
