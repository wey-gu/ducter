package views

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// statesFixture is the shelf with every state an app can be in (D422), as
// the demo core's DEMO_STAGE=states: the author's old app, the trip pinned,
// the review board resting until tomorrow, a fare check whose round failed,
// the baby's feeds being changed, a habit app whose page broke.
func statesFixture(lang i18n.Lang) []protocol.AppMeta {
	w := func(zh, en string) string { return appWords(lang, zh, en) }
	now := time.Now().UTC()
	at := func(d time.Duration) string { return now.Add(-d).Format(time.RFC3339) }
	kept := func(id, title, state, next, why string) *protocol.AppLive {
		k := &protocol.AppKept{Task: id, Title: title, State: state, Next: next, Why: why, Last: at(2 * time.Hour)}
		k.Of.Kind, k.Of.ID = "task", id
		return &protocol.AppLive{Kept: k}
	}
	l := time.Now()
	tomorrow := time.Date(l.Year(), l.Month(), l.Day()+1, 9, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)
	fares := w("每天早上看一眼上海到东京的机票", "Check Shanghai to Tokyo fares each morning")
	reviews := w("看 nowledge-co 里请我 review 的 PR", "Review my requests in nowledge-co")
	return []protocol.AppMeta{
		{ID: "a1b2c3", Name: w("北京出差 11/20–21", "Beijing trip, Nov 20–21"), Persona: "default", Made: at(2 * time.Hour), Updated: at(20 * time.Minute), Version: 2, Icon: "suitcase", Pinned: true, Opened: at(time.Hour),
			Summary: w("2 笔，合计 ¥1,698", "2 costs, ¥1,698 in all")},
		{ID: "a2b3c4", Name: w("宝宝喝奶", "Baby feeds"), Persona: "default", Made: at(3 * time.Hour), Updated: at(time.Hour), Version: 1, Icon: "bottle", Opened: at(time.Hour),
			Summary: w("今天 210ml，上次 9:05", "210ml today, last at 9:05"), Live: &protocol.AppLive{Changing: &struct{}{}}},
		{ID: "a3b4c5", Name: w("每日习惯", "Daily habits"), Persona: "default", Made: at(90 * time.Hour), Updated: at(5 * time.Hour), Version: 1, Icon: "flame", Opened: at(time.Hour),
			Summary: w("读书连续 6 天", "Reading 6 days in a row"), Live: &protocol.AppLive{Broke: &protocol.AppLiveErr{Text: "Cannot read properties of null (reading 'streak')"}}},
		{ID: "a4b5c6", Name: w("东京机票", "Tokyo fares"), Persona: "default", Made: at(90 * time.Hour), Updated: at(26 * time.Hour), Version: 1, Icon: "plane", Opened: at(3 * time.Hour),
			Summary: w("往返 ¥2,480，比昨天便宜 ¥160", "¥2,480 return, ¥160 less than yesterday"), Task: &protocol.AppTask{ID: "t_fares", Title: fares},
			Live: kept("t_fares", fares, "failed", "", w("航司的网站没打开", "The airline's site didn't load"))},
		{ID: "a9e8d7", Name: w("审查看板", "Review board"), Persona: "default", Made: at(50 * time.Hour), Updated: at(2 * time.Hour), Version: 1, Kind: "reviews", Opened: at(3 * time.Hour),
			Summary: w("9 个 PR 在等你，3 份草稿", "9 PRs wait on you, 3 drafts"), Task: &protocol.AppTask{ID: "t1", Title: reviews},
			Live: kept("t1", reviews, "resting", tomorrow, "")},
		{ID: "a5b6c7", Name: w("出差花销", "Trip expenses"), Persona: "default", Made: at(6 * time.Hour), Updated: at(6 * time.Hour), Version: 1, Ask: w("给我做个小应用，记一下出差花销", "Make me a little app to keep my trip expenses"),
			Live: &protocol.AppLive{Old: true}},
	}
}

// D422: each tile says its state in words, its mark is by meaning (the old
// app's stored nothing still reads as a suitcase), and the one button does
// the one thing: the new look as the person's words about that app, a retry
// through its Ongoing card.
func TestShelfTilesSayTheirState(t *testing.T) {
	app, sent := shelfApp(t, i18n.ZH, statesFixture(i18n.ZH), nil)
	app.OpenApps()
	tt := shelfTester(app, 1280)
	for _, want := range []string{
		unjoin(autospace(app.L.T("app.live.changing", "Ducter"))),
		unjoin(autospace(app.L.T("app.live.broke"))),
		unjoin(autospace(app.L.T("app.kept.failed", "每天早上看一眼上海到东京的机票"))),
		unjoin(autospace(app.L.T("app.live.old"))),
		app.L.T("app.live.renew"), unjoin(autospace(app.L.T("app.live.fix", "Ducter"))), app.L.T("app.kept.retry"),
	} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if got := app.appByID("a5b6c7").IconOf(); got != "suitcase" {
		t.Errorf("the old app's mark %s", got)
	}
	n := len(*sent)
	if err := tt.Click(spoken(app.L, app.L.T("app.live.renew"), "出差花销")); err != nil {
		t.Fatalf("%v %q", err, tt.Texts())
	}
	tt.Frame()
	if s, ok := (*sent)[len(*sent)-1].(protocol.Send); len(*sent) == n || !ok || s.App != "a5b6c7" || !strings.Contains(s.Text, "新样子") {
		t.Errorf("new look sent %#v", (*sent)[len(*sent)-1])
	}
	if err := tt.Click(spoken(app.L, app.L.T("app.kept.retry"), "东京机票")); err != nil {
		t.Fatalf("%v %q", err, tt.Texts())
	}
	tt.Frame()
	if s, ok := (*sent)[len(*sent)-1].(protocol.OngoingAct); !ok || s.Action != "run_now" || s.ID != "t_fares" {
		t.Errorf("retry sent %#v", (*sent)[len(*sent)-1])
	}
}

// D422: the window of an app made before the kit says so over the app, with
// its button; its foot says who sees it instead of the old internet line.
func TestAppWindowSaysItsState(t *testing.T) {
	app, _ := shelfApp(t, i18n.ZH, statesFixture(i18n.ZH), nil)
	tt := ui.NewTesterWith(app.AppWinView(app.NewAppWin("a5b6c7")), 520, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, want := range []string{unjoin(autospace(app.L.T("app.live.old"))), app.L.T("app.live.renew"), unjoin(autospace(app.L.T("app.private")))} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
}

func TestShelfStatesShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			shot := func(view func(*ui.Context), w, h int, name string) {
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
			for _, width := range []int{1400, 1000} {
				app, _ := shelfApp(t, lang, statesFixture(lang), nil)
				app.OpenApps()
				shot(app.View, width, 900, fmt.Sprintf("states-shelf-%d", width))
			}
			for _, id := range []string{"a5b6c7", "a2b3c4", "a4b5c6"} {
				app, _ := shelfApp(t, lang, statesFixture(lang), nil)
				shot(app.AppWinView(app.NewAppWin(id)), 520, 860, "states-window-"+id)
			}
		}
	}
}

// D431: "sent to the partner" holds only while it is being changed: when the
// change lands (a new version) or the partner answers (no longer changing),
// the line gives way to what is true now.
func TestAppWindowSentLineEnds(t *testing.T) {
	app, _ := shelfApp(t, i18n.ZH, statesFixture(i18n.ZH), nil)
	w := app.NewAppWin("a2b3c4")
	tt := ui.NewTesterWith(app.AppWinView(w), 520, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	w.sent = true
	tt.Frame()
	sent := unjoin(autospace(app.L.T("app.ask.sent", "Ducter")))
	if !tt.HasText(sent) {
		t.Fatalf("no %q while it is being changed: %q", sent, tt.Texts())
	}
	for i := range app.S.Apps {
		if app.S.Apps[i].ID == "a2b3c4" {
			app.S.Apps[i].Live = nil
		}
	}
	tt.Frame()
	tt.Frame()
	if tt.HasText(sent) {
		t.Errorf("%q still shows after the partner answered: %q", sent, tt.Texts())
	}
}
