package views

import (
	"fmt"
	"hash/fnv"
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

// D189/D193: phone calls on the Mac, against frames as the core sends them.

func f64(v float64) *float64 { return &v }

// fakeQR is a QR-looking pattern (three finder squares and hashed modules)
// for pictures; the real one comes from the home.
func fakeQR(n int) []string {
	rows := make([]string, n)
	finder := func(r, c int) (bool, bool) {
		for _, o := range [][2]int{{0, 0}, {0, n - 7}, {n - 7, 0}} {
			y, x := r-o[0], c-o[1]
			if y >= 0 && y < 7 && x >= 0 && x < 7 {
				ring := y == 0 || y == 6 || x == 0 || x == 6
				core := y >= 2 && y <= 4 && x >= 2 && x <= 4
				return true, ring || core
			}
		}
		return false, false
	}
	for r := 0; r < n; r++ {
		var b strings.Builder
		for c := 0; c < n; c++ {
			in, on := finder(r, c)
			if !in {
				h := fnv.New32a()
				fmt.Fprintf(h, "%d,%d", r, c)
				on = h.Sum32()%2 == 0
			}
			if on {
				b.WriteByte('1')
			} else {
				b.WriteByte('0')
			}
		}
		rows[r] = b.String()
	}
	return rows
}

func sushiPlan(zh bool, at string) *protocol.CallPlan {
	goal, say, keep := "Book two counter seats tomorrow at 7 pm", "Weyl", "No more than ¥30,000 a person"
	if zh {
		goal, keep = "明天晚上 7 点订两位", "每人不超过 3 万日元"
	}
	return &protocol.CallPlan{To: "+81312345678", Name: "Sushi Saito", Goal: goal, Say: []string{say, "+81 90 1234 5678"}, Keep: keep,
		Voice: "ducter", From: "provider", Provider: "Tuwa", Minutes: 4, CostUSD: 1.6, PerMinUSD: 0.4, CalleeZone: "Asia/Tokyo", At: at,
		Summary: "Call Sushi Saito at +81312345678 from a Tuwa number right after approval. May share: Weyl, +81 90 1234 5678. Private: no more than ¥30,000 a person."}
}

func phoneConnFrame(voice bool) protocol.ServerFrame {
	pv := &protocol.PhoneView{Provider: "Tuwa", CapUSD: 10, SpentTodayUSD: 1.6, Calls: 1, DoNotCall: 0}
	pv.Rails = &struct {
		Cap      bool `json:"cap"`
		Sampling bool `json:"sampling"`
		Shared   bool `json:"shared"`
	}{true, true, true}
	if voice {
		pv.Voice = &struct {
			Enrolled bool `json:"enrolled"`
			On       bool `json:"on"`
		}{true, true}
	}
	return protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{
		{ID: "c1", Name: "OOMOL", Source: "oo", Via: "oo", State: "ok", Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"wei@work.example"}}}},
		{ID: "c2", Name: "Tuwa", URL: protocol.TuwaMCP, Source: "mcp", Via: "manual", State: "ok", SignIn: true, Phone: pv},
	}, Oo: &protocol.OoDetect{Installed: true, Account: true}}
}

func TestPhoneFlow(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{}, Oo: &protocol.OoDetect{}})
	app.openTab(TabAccounts)
	tt := ui.NewTesterWith(app.View, 1280, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if err := tt.Click("连上 Tuwa"); err != nil {
		t.Fatalf("the offer: %v; %q", err, tt.Texts())
	}
	tt.Frame()
	last := (*sent)[len(*sent)-1]
	if a, ok := last.(protocol.ConnectionAdd); !ok || a.URL != protocol.TuwaMCP || a.Token != "" {
		t.Fatalf("Connect Tuwa sent %#v", last)
	}
	app.Receive(protocol.ServerFrame{T: "connection_result", Reason: "signing_in"})
	app.Receive(protocol.ServerFrame{T: "connection_signin", SignIn: &protocol.SignInView{URL: protocol.TuwaMCP, Name: "Tuwa", State: "waiting", UserCode: "WXYZ-2345", VerifyURLComplete: "https://api.tuwa.ai/oauth/device?user_code=WXYZ-2345", ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339), QR: fakeQR(25)}})
	tt.Frame()
	if !tt.HasText("WXYZ-2345") || !tt.HasText("在手机上登录 Tuwa") || tt.HasText("在等你在手机上登录。") {
		t.Fatalf("the sign-in panel: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "connection_signin", SignIn: &protocol.SignInView{URL: protocol.TuwaMCP, Name: "Tuwa", State: "done", ID: "c2"}})
	app.Receive(phoneConnFrame(false))
	tt.Frame()
	if !tt.HasText("打电话 · Tuwa") || !tt.HasText("能打电话了") {
		t.Fatalf("the phone card: %q", tt.Texts())
	}
	if err := tt.Click("$20"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if c, ok := (*sent)[len(*sent)-1].(protocol.PhoneCap); !ok || c.USD != 20 {
		t.Fatalf("the cap sent %#v", (*sent)[len(*sent)-1])
	}

	// The Go card: Call sends Go, Not now sends Hold.
	app.Route = RouteConversation
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 Sushi Saito？", GoLabel: "打过去", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: sushiPlan(true, "")}}),
	}})
	tt.Frame()
	for _, w := range []string{"+81 3 1234 5678", "可以说", "不说", "Ducter 的声音", "Tuwa 的号码", "4 分钟 · 约 $1.60", "先不打"} {
		if !tt.HasText(w) {
			t.Errorf("the Go card lacks %q: %q", w, tt.Texts())
		}
	}
	if tt.HasText("不再问") || tt.HasText("后你没回") {
		t.Errorf("a call's card has a default or a don't-ask-again: %q", tt.Texts())
	}
	if err := tt.Click("打过去"); err != nil {
		t.Fatal(err)
	}
	if d, ok := (*sent)[len(*sent)-1].(protocol.Decide); !ok || d.Option != "go" || d.DecisionID != "d1" {
		t.Fatalf("Call sent %#v", (*sent)[len(*sent)-1])
	}

	// A question from the line: on top, a yes/no answers in the owner's word.
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{{CallID: "call_1", State: "question", Plan: *sushiPlan(true, ""), TalkingSince: time.Now().Add(-70 * time.Second).UTC().Format(time.RFC3339), Question: &protocol.CallQuestion{Text: "7 点半可以吗？", YesNo: true, DecisionID: "d2"}}}}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(2, time.Now().UTC().Format(time.RFC3339), "default", "channel", "system", protocol.KindDecision, protocol.Decision{DecisionID: "d2", Question: "7 点半可以吗？", GoLabel: "yes", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "question", YesNo: true}}),
	}})
	tt.Frame()
	if !tt.HasText("对方在问 · Sushi Saito") || !tt.HasText("电话那头在等；90 秒没回，就说回头再打。") {
		t.Fatalf("the question card: %q", tt.Texts())
	}
	if err := tt.Click("可以"); err != nil {
		t.Fatal(err)
	}
	if d, ok := (*sent)[len(*sent)-1].(protocol.Decide); !ok || d.Option != "reply" || d.Text != "yes" {
		t.Fatalf("Yes sent %#v", (*sent)[len(*sent)-1])
	}

	// On hand: a live call can be hung up.
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{{CallID: "call_1", State: "talking", Plan: *sushiPlan(true, ""), TalkingSince: time.Now().Add(-134 * time.Second).UTC().Format(time.RFC3339)}}}})
	app.Route = RouteOnHand
	tt.Frame()
	if err := tt.Click("挂断"); err != nil {
		t.Fatalf("hang up: %v; %q", err, tt.Texts())
	}
	if d, ok := (*sent)[len(*sent)-1].(protocol.CallCancel); !ok || d.CallID != "call_1" {
		t.Fatalf("Hang up sent %#v", (*sent)[len(*sent)-1])
	}
}

// Every phone surface in zh and en, for review (gitignored .shots/phone):
//
//	DUCTER_SHOTS_DIR=../../../../.shots/phone go test ./internal/views -run PhoneShots
func TestPhoneShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	now := time.Now()
	iso := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339) }
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		pick := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		shot := func(app *App, name string, w, h int) {
			t.Helper()
			tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetScale(2)
			tt.Frame()
			tt.Advance(time.Second)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("desktop-%s-%s.png", name, lang)))
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

		// 1. The offer.
		app := base()
		app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{
			{ID: "c1", Name: "OOMOL", Source: "oo", Via: "oo", State: "ok", Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"wei@work.example"}}}},
		}, Oo: &protocol.OoDetect{Installed: true, Account: true}})
		app.openTab(TabAccounts)
		shot(app, "phone-offer", 1280, 900)

		// 2. The sign-in, waiting; and how it can end.
		app.Receive(protocol.ServerFrame{T: "connection_signin", SignIn: &protocol.SignInView{URL: protocol.TuwaMCP, Name: "Tuwa", State: "waiting", UserCode: "WXYZ-2345", VerifyURLComplete: "https://api.tuwa.ai/oauth/device?user_code=WXYZ-2345", ExpiresAt: iso(15 * time.Minute), QR: fakeQR(29)}})
		shot(app, "phone-signin", 1280, 900)
		app.Receive(protocol.ServerFrame{T: "connection_signin", SignIn: &protocol.SignInView{URL: protocol.TuwaMCP, Name: "Tuwa", State: "expired"}})
		shot(app, "phone-signin-expired", 1280, 700)

		// 3. The phone card: before a voice, and with the owner's voice on.
		app = base()
		app.Receive(phoneConnFrame(false))
		app.openTab(TabAccounts)
		shot(app, "phone-card", 1280, 1100)
		app = base()
		app.Receive(phoneConnFrame(true))
		app.openTab(TabAccounts)
		shot(app, "phone-card-voice", 1280, 1100)

		// 4. The Go card in the conversation (now, and after quiet hours).
		go1 := func(at string) *App {
			app := base()
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				protocol.NewEvent(1, iso(-2*time.Minute), "default", "channel", "user", protocol.KindUserMsg, protocol.UserMsg{Text: pick("帮我给 Sushi Saito 打个电话，订明天晚上 7 点两位，名字写 Weyl", "Call Sushi Saito and book two for tomorrow at 7 pm under Weyl")}),
				protocol.NewEvent(2, iso(-time.Minute), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: pick("打给 Sushi Saito？", "Call Sushi Saito?"), GoLabel: pick("打过去", "Call"), DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: sushiPlan(zh, at)}}),
			}})
			return app
		}
		shot(go1(""), "phone-go", 1280, 1000)
		tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 9, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)
		shot(go1(tomorrow), "phone-go-later", 1280, 1000)

		// 5. A question from the line, on top of the conversation.
		app = base()
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{{CallID: "call_1", State: "question", Plan: *sushiPlan(zh, ""), TalkingSince: iso(-70 * time.Second), Question: &protocol.CallQuestion{Text: pick("对方问：7 点没有了，7 点半可以吗？", "They ask: 7 is full, is 7:30 all right?"), YesNo: true, DecisionID: "d2"}}}}})
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(1, iso(-3*time.Minute), "default", "channel", "user", protocol.KindUserMsg, protocol.UserMsg{Text: pick("帮我给 Sushi Saito 打个电话，订明天晚上 7 点两位", "Call Sushi Saito and book two for tomorrow at 7 pm")}),
			protocol.NewEvent(2, iso(-2*time.Minute), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: pick("打给 Sushi Saito？", "Call Sushi Saito?"), GoLabel: pick("打过去", "Call"), DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: sushiPlan(zh, "")}}),
			protocol.NewEvent(3, iso(-2*time.Minute), "default", "channel", "user", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d1", Option: "go", By: "user"}),
			protocol.NewEvent(4, iso(-10*time.Second), "default", "channel", "system", protocol.KindDecision, protocol.Decision{DecisionID: "d2", Question: pick("对方问：7 点没有了，7 点半可以吗？", "They ask: 7 is full, is 7:30 all right?"), GoLabel: "yes", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "question", YesNo: true}}),
		}})
		shot(app, "phone-question", 1280, 1000)
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(5, iso(-5*time.Second), "default", "channel", "system", protocol.KindDecision, protocol.Decision{DecisionID: "d3", Question: pick("对方问：坐吧台还是包间？", "They ask: counter or a private room?"), GoLabel: pick("吧台", "Counter"), DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "question", Choices: []string{pick("吧台", "Counter"), pick("包间", "Private room")}}}),
			protocol.NewEvent(6, iso(-4*time.Second), "default", "channel", "user", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d2", Option: "reply", Text: "yes", By: "user"}),
		}})
		shot(app, "phone-question-choices", 1280, 1000)

		// 6. On hand: every state of a call's row, one result open.
		app = base()
		plan := *sushiPlan(zh, "")
		clinic := plan
		clinic.Name, clinic.To = pick("仁爱牙科", "Bright Dental"), "+14155550123"
		shop := plan
		shop.Name, shop.To = pick("岛田酒铺", "Shimada Liquor"), "+81355550199"
		hotel := plan
		hotel.Name, hotel.To, hotel.At = "Park Hotel", "+6562221234", tomorrow
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{
			{CallID: "c_talk", State: "talking", Plan: plan, TalkingSince: iso(-134 * time.Second), PlacedAt: iso(-150 * time.Second)},
			{CallID: "c_dial", State: "calling", Plan: clinic, PlacedAt: iso(-10 * time.Second)},
			{CallID: "c_wait", State: "waiting", Plan: hotel},
			{CallID: "c_done", State: "done", Plan: plan, Outcome: pick("订好了：明天 19:30，两位吧台，名字 Weyl。", "Booked: tomorrow 19:30, two counter seats, under Weyl."), Summary: pick("对方说 7 点满了，问 7 点半；你说可以。押金不用付，迟到 15 分钟会取消。", "They said 7 was full and offered 7:30; you said yes. No deposit; a table is released after 15 minutes late."), Agreed: []string{pick("明天 19:30，两位", "Tomorrow 19:30, two people"), pick("吧台", "Counter seats")}, Transcript: []protocol.CallLine{{Who: "agent", Text: pick("您好，我是 Ducter，Weyl 的 AI 助手，替 Weyl 打来订位。", "Hello, this is Ducter, Weyl's AI assistant, calling for Weyl to book a table.")}, {Who: "them", Text: pick("7 点满了，7 点半可以吗？", "7 is full; is 7:30 all right?")}}, DurationSec: f64(190), CostUSD: f64(1.6), EndedAt: iso(-time.Hour)},
			{CallID: "c_unc", State: "uncertain", Plan: shop, Outcome: pick("对方说会回电，但没说定时间。", "They said they'd call back but didn't say when."), DurationSec: f64(75), CostUSD: f64(0.8)},
			{CallID: "c_none", State: "no_answer", Plan: clinic},
			{CallID: "c_pay", State: "failed", Reason: "payment", PayURL: "https://checkout.stripe.com/x", Plan: hotel},
		}}})
		app.Route = RouteOnHand
		app.ph().open["c_done"] = true
		app.ph().script["c_done"] = true
		shot(app, "phone-onhand", 1280, 1500)
	}
}
