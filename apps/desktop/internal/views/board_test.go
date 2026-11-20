package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D407: a routine fills a small app on the Mac: the board offer's card,
// the Ongoing card that opens the review board, and the board's 看草稿
// opening that PR's draft sheet in the main window.

func boardOfferCard(lang i18n.Lang) protocol.Decision {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	return protocol.Decision{DecisionID: "d_board", Question: w("要不要把这些做成一个看板？", "Keep these on a board?"), GoLabel: w("做成看板", "Make a board"), HoldLabel: w("不用了", "No thanks"), DefaultOption: "hold",
		Board: &protocol.BoardAsk{TaskID: "t_review", Title: w("看 nowledge-co 里请我 review 的 PR", "Review my requests in nowledge-co"), Kind: "reviews"}}
}

func TestBoardOfferCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev("channel", protocol.KindDecision, boardOfferCard(lang))}})
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		for i := 0; i < 3; i++ {
			tt.Frame()
		}
		texts := strings.Join(tt.Texts(), " ")
		d := boardOfferCard(lang)
		for _, want := range []string{d.Question, unjoin(keepWords(autospace(app.L.T("board.offer.what", d.Board.Title)))), unjoin(keepWords(autospace(app.L.T("board.offer.reviews")))), d.HoldLabel} {
			if !strings.Contains(texts, want) {
				t.Errorf("%s: the offer lacks %q: %q", lang, want, texts)
			}
		}
	}
}

func TestOngoingOpensTheBoard(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	var opened []string
	app.OpenAppWindow = func(id, name string) { opened = append(opened, id) }
	items := ongoingFixture(i18n.ZH)
	items[1].Reviews = &protocol.ReviewStanding{Waiting: 8, Again: 3, Same: 5, Drafted: 3}
	items[1].App = &protocol.OngoingApp{ID: "a1b2c3", Name: "审查看板"}
	app.OpenOngoing()
	app.Receive(ongoingFrame(items))
	app.past.og.focus = "t_review"
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	for i := 0; i < 3; i++ {
		tt.Frame()
	}
	label := app.L.T("board.open", "审查看板")
	if err := tt.Click(label); err != nil {
		t.Fatalf("no %q: %v (%q)", label, err, tt.Texts())
	}
	if len(opened) != 1 || opened[0] != "a1b2c3" {
		t.Errorf("opened %v", opened)
	}
}

func TestBoardReadDraftOpensTheSheet(t *testing.T) {
	app, sent := appsApp(t, i18n.ZH)
	shown := 0
	app.ShowMain = func() { shown++ }
	b := app.Bridge()
	b.Post("a1b2c3", []byte(`{"t":"show","draft":"javascript:alert(1)"}`))
	b.Post("a1b2c3", []byte(`{"t":"show","draft":"nowledge-co/mem#10287"}`))
	n := 0
	for _, m := range *sent {
		if r, ok := m.(protocol.PreReadReq); ok {
			n++
			if r.Ref != "nowledge-co/mem#10287" {
				t.Errorf("asked for %q", r.Ref)
			}
		}
	}
	if n != 1 || shown != 1 || !app.pile.open || app.pile.review != "nowledge-co/mem#10287" {
		t.Errorf("pre-read asks %d, shown %d, sheet %+v", n, shown, app.pile.review)
	}
}

// Shots for review (D75: outside git):
//
//	DUCTER_SHOTS_DIR=../../../../.shots/review-board DUCTER_BOARD_SHOTS=1 go test ./internal/views -run BoardShots
func TestBoardShots(t *testing.T) {
	if os.Getenv("DUCTER_BOARD_SHOTS") == "" {
		t.Skip("DUCTER_BOARD_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			w := func(zh, en string) string { return pastWord(lang, zh, en) }
			app, _ := pastApp(t, lang)
			tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			if dark {
				tt.SetDark(true)
				tt.Frame()
				tt.Advance(2 * time.Second)
			}
			tt.SetScale(2)
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			scheme := "light"
			if dark {
				scheme = "dark"
			}
			shot := func(name string) {
				t.Helper()
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(200 * time.Millisecond)
				}
				f, err := os.Create(filepath.Join(dir, "mac-"+name+"-"+string(lang)+"-"+scheme+".png"))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: w("每 45 分钟帮我看一下 nowledge-co 里请我 review 的 PR，按 mem 的 review skill 来审。", "Every 45 minutes, look at the PRs in nowledge-co that want my review, and review them with mem's review skill.")}),
				ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("好，每 45 分钟去看一轮，审好的先给你过目再发。", "On it: a round every 45 minutes, and you see each review before it goes out.")}),
				ev("channel", protocol.KindDecision, boardOfferCard(lang)),
			}})
			shot("offer")
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_board", Option: "go", By: "user"}),
				ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("做好了。每一轮都会更新它，不用再读一遍报告。", "Done. Each round updates it, so there's no report to read again."), App: &protocol.AppCard{ID: "a1b2c3", Name: w("审查看板", "Review board"), Version: 1, Change: "made"}}),
			}})
			shot("made")
			items := ongoingFixture(lang)
			items[1].Title = w("看 nowledge-co 里请我 review 的 PR", "Review my requests in nowledge-co")
			items[1].Reviews = &protocol.ReviewStanding{Waiting: 9, Again: 3, Same: 6, Drafted: 3, At: ogAt(-time.Minute)}
			items[1].App = &protocol.OngoingApp{ID: "a1b2c3", Name: w("审查看板", "Review board")}
			app.OpenOngoing()
			app.Receive(ongoingFrame(items))
			app.past.og.focus = "t_review"
			shot("ongoing")
		}
	}
}
