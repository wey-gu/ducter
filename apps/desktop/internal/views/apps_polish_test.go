package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/appdock"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D562: the apps walked end to end for the polish pass (research/229),
// with the author's own cases: the Beijing trip filled from his bookings and
// then by him, the review board a routine keeps over nowledge-co's PRs, a
// habit app whose page broke, a shopping list never opened.
func polishFixture(lang i18n.Lang) []protocol.AppMeta {
	w := func(zh, en string) string { return appWords(lang, zh, en) }
	now := time.Now().UTC()
	at := func(d time.Duration) string { return now.Add(-d).Format(time.RFC3339) }
	reviews := w("看 nowledge-co 里请我 review 的 PR", "Review my requests in nowledge-co")
	k := &protocol.AppKept{Task: "t_reviews", Title: reviews, State: "resting", Next: now.Add(44 * time.Minute).Format(time.RFC3339), Last: at(time.Minute)}
	k.Of.Kind, k.Of.ID = "task", "t_reviews"
	return withHome([]protocol.AppMeta{
		{ID: "a1b2c3", Name: w("北京出差 11/20–21", "Beijing trip, Nov 20–21"), Persona: "default", Made: at(3 * time.Hour), Updated: at(12 * time.Minute), Version: 3, Back: true, Icon: "suitcase", Pinned: true, Opened: at(10 * time.Minute),
			Note: w("高铁和两晚酒店，来自你的预订", "Your train and two hotel nights, from your bookings"), Summary: w("4 笔，合计 ¥1,914", "4 costs, ¥1,914 in all")},
		{ID: "a9e8d7", Name: w("审查看板", "Review board"), Persona: "default", Made: at(50 * time.Hour), Updated: at(time.Minute), Version: 1, Kind: "reviews", Opened: at(3 * time.Hour), Pinned: true,
			Summary: w("9 个 PR 在等你，3 份草稿", "9 PRs wait on you, 3 drafts"), Task: &protocol.AppTask{ID: "t_reviews", Title: reviews}, Live: &protocol.AppLive{Kept: k}},
		{ID: "a3b4c5", Name: w("每日习惯", "Daily habits"), Persona: "default", Made: at(90 * time.Hour), Updated: at(5 * time.Hour), Version: 2, Icon: "flame", Opened: at(time.Hour),
			Summary: w("读书连续 6 天", "Reading 6 days in a row"), Live: &protocol.AppLive{Broke: &protocol.AppLiveErr{Text: "Cannot read properties of null (reading 'streak')"}}},
		{ID: "a7c8d9", Name: w("这周要买的", "To buy this week"), Persona: "default", Made: at(20 * time.Minute), Updated: at(20 * time.Minute), Version: 1, Icon: "cart"},
	})
}

// withHome gives each app the home's icon path (D562), as every list does.
func withHome(apps []protocol.AppMeta) []protocol.AppMeta {
	for i := range apps {
		apps[i].Home = "/app-icon/" + apps[i].ID + "/k/"
	}
	return apps
}

// The Mac's apps at 1000, 1150 and 1400, zh and en, light and dark: the
// conversation (the card, the pinned chips), the shelf, and the window's
// states (the first open, a change that landed, a page that broke).
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/apps-polish/after/mac go test ./internal/views -run AppsPolishShots
func TestAppsPolishShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := map[bool]string{false: "light", true: "dark"}[dark]
			shot := func(view func(*ui.Context), w, h int, name string, then func(tt *ui.Tester)) {
				tt := ui.NewTesterWith(view, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				if then != nil {
					then(tt)
					for i := 0; i < 3; i++ {
						tt.Frame()
						tt.Advance(300 * time.Millisecond)
					}
				}
				shotTester(t, tt, fmt.Sprintf("mac-%s-%s-%s", name, lang, mode))
			}
			for _, width := range []int{1000, 1150, 1400} {
				app, _ := shelfApp(t, lang, polishFixture(lang), nil)
				app.Dock = &fakeDock{kept: map[string]appdock.Kept{}}
				shot(app.View, width, 900, fmt.Sprintf("conv-%d", width), nil)
				app, _ = shelfApp(t, lang, polishFixture(lang), nil)
				app.OpenApps()
				shot(app.View, width, 900, fmt.Sprintf("shelf-%d", width), nil)
			}
			// The trip's 「⋯」 on its tile.
			app, _ := shelfApp(t, lang, polishFixture(lang), nil)
			app.Dock = &fakeDock{kept: map[string]appdock.Kept{}}
			app.OpenApps()
			shot(app.View, 1150, 900, "shelf-menu-1150", func(tt *ui.Tester) {
				_ = tt.Click(app.L.T("apps.more", appWords(lang, "北京出差 11/20–21", "Beijing trip, Nov 20–21")))
			})
			// The window: the first open (the shopping list is never opened; the
			// trip's note stands in for what it filled in), a change that landed, a broken page.
			first := polishFixture(lang)
			first[0].Opened = ""
			app, _ = shelfApp(t, lang, first, nil)
			shot(app.AppWinView(app.NewAppWin("a1b2c3")), 600, 860, "window-first", nil)
			app, _ = shelfApp(t, lang, polishFixture(lang), nil)
			win := app.NewAppWin("a1b2c3")
			win.landed, win.changed = true, appWords(lang, "加了每天的小计，超过 ¥800 的那天标红", "Added each day's subtotal; a day over ¥800 shows red")
			shot(app.AppWinView(win), 600, 860, "window-changed", nil)
			app, _ = shelfApp(t, lang, polishFixture(lang), nil)
			shot(app.AppWinView(app.NewAppWin("a3b4c5")), 600, 860, "window-broke", nil)
			app, _ = shelfApp(t, lang, polishFixture(lang), nil)
			app.Dock = &fakeDock{kept: map[string]appdock.Kept{"a1b2c3": {ID: "a1b2c3"}}}
			shot(app.AppWinView(app.NewAppWin("a1b2c3")), 600, 860, "window-menu", func(tt *ui.Tester) {
				_ = tt.Click(app.L.T("apps.more", appWords(lang, "北京出差 11/20–21", "Beijing trip, Nov 20–21")))
			})
		}
	}
}

// fakeDock keeps what it was asked, as appdock.Stubs would (by app id).
type fakeDock struct{ kept map[string]appdock.Kept }

func (d *fakeDock) List() map[string]appdock.Kept { return d.kept }
func (d *fakeDock) Keep(m protocol.AppMeta) (string, error) {
	d.kept[m.ID] = appdock.Kept{ID: m.ID, Name: m.Name, Path: "/tmp/" + m.Name + ".app"}
	return d.kept[m.ID].Path, nil
}
func (d *fakeDock) Drop(id string) error           { delete(d.kept, id); return nil }
func (d *fakeDock) Follow(apps []protocol.AppMeta) {}

// D562: 放到程序坞 from an app's 「⋯」 keeps it in the Dock and says so; the
// 「⋯」 then offers 从程序坞拿掉; deleting the app takes it out of the Dock.
func TestKeepAnAppInTheDock(t *testing.T) {
	app, _ := shelfApp(t, i18n.ZH, polishFixture(i18n.ZH), nil)
	d := &fakeDock{kept: map[string]appdock.Kept{}}
	app.Dock = d
	app.OpenApps()
	tt := shelfTester(app, 1150)
	more := app.L.T("apps.more", "北京出差 11/20–21")
	if err := tt.Click(more); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("放到程序坞"); err != nil {
		t.Fatalf("%v %q", err, tt.Texts())
	}
	if _, ok := d.kept["a1b2c3"]; !ok {
		t.Fatalf("not kept: %v", d.kept)
	}
	said := app.L.T("app.dock.done", "北京出差 11/20–21")
	if app.fileToast != said && !hasText(tt, said) {
		tt.Frame()
		if !hasText(tt, said) {
			t.Errorf("no toast %q in %q", said, tt.Texts())
		}
	}
	if err := tt.Click(more); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !hasText(tt, "从程序坞拿掉") || hasText(tt, "放到程序坞") {
		t.Errorf("menu after keeping %q", tt.Texts())
	}
}
