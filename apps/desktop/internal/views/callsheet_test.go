package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D215: a call sheet on the Mac, for a number no line Ducter has calls: the
// sheet, Copy number (a Mac can't dial), 打完了 / Done calling, and its row.

func sheetPlan(zh bool) *protocol.CallPlan {
	if zh {
		return &protocol.CallPlan{To: "+842838291234", Name: "金玉楼", Goal: "订明晚 7 点，两位，姓王", Say: []string{"王先生", "+86 138 0013 8000"}, Voice: "ducter", From: "self", CalleeZone: "Asia/Ho_Chi_Minh",
			Sheet: &protocol.CallSheet{Why: "uncovered", Open: "您好，我想订明天晚上 7 点的位子，两位，姓王。", Ask: []string{"明晚 7 点两位还有位子吗？", "要不要付定金？"}, Dont: []string{"银行卡号"}, Note: []string{"订位的名字和时间", "要不要提前到"}}}
	}
	return &protocol.CallPlan{To: "+623613021888", Name: "Alila Seminyak", Goal: "An airport pickup on Friday at 3 pm, and what it costs", Say: []string{"Alex", "Flight QZ 7510"}, Voice: "ducter", From: "self", CalleeZone: "Asia/Makassar",
		Sheet: &protocol.CallSheet{Why: "uncovered", Open: "Hi, this is Alex. I'm staying with you from Friday, and I'd like an airport pickup at 3 pm.", Ask: []string{"Can you do 3 pm on Friday?", "How much is it, and do I pay at the hotel?"}, Dont: []string{"Card details over the phone"}, Note: []string{"The price", "Where the driver will wait"}}}
}

func sheetEvents(zh bool) []protocol.LogEvent {
	now := time.Now()
	iso := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339) }
	user, said, q, goLabel := "Can you call the Alila Seminyak in Bali and ask about an airport pickup Friday at 3 pm?", "I can't call numbers in Indonesia for you yet, so here's a call sheet to ring them yourself.", "Call sheet: Alila Seminyak", "Done calling"
	if zh {
		user, said, q, goLabel = "帮我打给胡志明市的金玉楼订明晚 7 点两位，他们说中文", "越南的号码我还打不过去，做了张通话单，你照着打就行。", "打给 金玉楼 的通话单", "打完了"
	}
	return []protocol.LogEvent{
		protocol.NewEvent(1, iso(-2*time.Minute), "default", "channel", "user", protocol.KindUserMsg, protocol.UserMsg{Text: user}),
		protocol.NewEvent(2, iso(-time.Minute), "default", "channel", "partner", protocol.KindAIMsg, protocol.AIMsg{Text: said}),
		protocol.NewEvent(3, iso(-time.Minute), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: q, GoLabel: goLabel, DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_s", Kind: "sheet", Plan: sheetPlan(zh)}}),
	}
}

func TestCallSheet(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Route = RouteConversation
	app.Receive(protocol.ServerFrame{T: "events", Events: sheetEvents(true)})
	tt := ui.NewTesterWith(app.View, 1280, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, w := range []string{"+84 28 3829 1234", "先说", "您好，我想订明天晚上 7 点的位子，两位，姓王。", "要问", "别说", "记下", "复制号码", "先不打", "打完了"} {
		if !tt.HasText(w) {
			t.Errorf("the sheet lacks %q: %q", w, tt.Texts())
		}
	}
	for _, w := range []string{"打过去", "Tuwa 的号码", "Ducter 的声音", "大约"} {
		if tt.HasText(w) {
			t.Errorf("a call sheet shows the Go card's %q: %q", w, tt.Texts())
		}
	}
	if err := tt.Click("复制号码"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText("已复制") {
		t.Errorf("Copy number didn't say so: %q", tt.Texts())
	}
	if err := tt.Click("打完了"); err != nil {
		t.Fatal(err)
	}
	if d, ok := (*sent)[len(*sent)-1].(protocol.Decide); !ok || d.Option != "go" || d.DecisionID != "d1" {
		t.Fatalf("Done calling sent %#v", (*sent)[len(*sent)-1])
	}
	// On hand: the call they made, with how it went in their words.
	pl := *sheetPlan(true)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{{CallID: "call_s", State: "done", Plan: pl, Outcome: "订上了：明晚 7 点两位，靠窗"}}}})
	app.Route = RouteOnHand
	tt.Frame()
	if !tt.HasText("打完了 · 金玉楼") || !tt.HasText("订上了：明晚 7 点两位，靠窗") {
		t.Errorf("the row: %q", tt.Texts())
	}
}

// TestCallSheetShots renders the call sheet and its row for review:
//
//	DUCTER_SHOTS_DIR=/path/.shots/calls-sheet go test ./internal/views -run CallSheetShots
func TestCallSheetShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		shot := func(app *App, name string, w, h int) {
			t.Helper()
			tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetScale(2)
			tt.Frame()
			tt.Advance(time.Second)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", name, lang)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		base := func() *App {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Memory: true, Notify: true, DefaultAfterMin: 30}})
			return app
		}
		app := base()
		app.Route = RouteConversation
		app.Receive(protocol.ServerFrame{T: "events", Events: sheetEvents(zh)})
		shot(app, "sheet-conversation", 1280, 1200)
		app.Route = RouteOnHand
		shot(app, "sheet-onhand", 1280, 1200)
		app = base()
		pl := *sheetPlan(zh)
		out := "Yes: Friday 3 pm, a driver with a sign for Alex, 450k rupiah at the hotel."
		if zh {
			out = "订上了：明晚 7 点两位，靠窗"
		}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{{CallID: "call_s", State: "done", Plan: pl, Outcome: out}, {CallID: "call_t", State: "done", Plan: pl}}}})
		app.Route = RouteOnHand
		shot(app, "sheet-row", 1280, 800)
	}
}
