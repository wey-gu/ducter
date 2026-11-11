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
	if err := tt.Click("连接 Tuwa"); err != nil {
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
		protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 Sushi Saito？", GoLabel: "拨打", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: sushiPlan(true, "")}}),
	}})
	tt.Frame()
	for _, w := range []string{"+81 3 1234 5678", "可以说", "不透露", "Ducter 的声音", "Tuwa 的号码", "4 分钟 · 约 $1.60", "暂不拨打"} {
		if !tt.HasText(w) {
			t.Errorf("the Go card lacks %q: %q", w, tt.Texts())
		}
	}
	if tt.HasText("不再问") || tt.HasText("后你没回") {
		t.Errorf("a call's card has a default or a don't-ask-again: %q", tt.Texts())
	}
	if err := tt.Click("拨打"); err != nil {
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

// tuwaWording is a confirmation as Tuwa writes it (English, label: value lines).
const tuwaWording = "To: +81 90 1111 2222 (Aya)\nGoal: Ask whether Aya is free for a call this evening\nMay tell them: Weyl\nScope: one question only\nMust not: share the hotel name\nWhen in UTC: 2026-11-12T00:00:00Z\nCalling from: a Tuwa number"

func waitPlan(zh bool, why string, canNow bool) *protocol.CallPlan {
	p := sushiPlan(zh, time.Now().Add(13*time.Hour).UTC().Format(time.RFC3339))
	p.Name, p.To, p.Summary, p.Say, p.Keep = "Aya", "+819011112222", tuwaWording, []string{"Weyl"}, ""
	p.Goal = "Ask whether she's free tonight"
	if zh {
		p.Goal = "问她今晚有没有空"
	}
	p.MustNot = []string{"share the hotel name"}
	if zh {
		p.MustNot = []string{"别说酒店名字"}
	}
	their := "20:03"
	if why == "late" {
		their = "21:30"
	}
	p.Wait, p.CanNow = &protocol.CallWait{Why: why, Zone: "Asia/Tokyo", Their: their, Then: "09:00"}, canNow
	return p
}

// D208: the wait says why, Call now only when the owner may, the provider's
// wording as rows, and every ended call says what happened.
func TestCallD208(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.Route = RouteConversation
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 Aya？", GoLabel: "到时拨打", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: waitPlan(true, "callee", true)}}),
	}})
	tt.Frame()
	for _, w := range []string{"对方那边现在 20:03，我排到了对方的 09:00。", "立即拨打", "到时拨打", "不能做", "别说酒店名字", "Tuwa 的原话（英文）"} {
		if !tt.HasText(w) {
			t.Errorf("the waiting Go card lacks %q: %q", w, tt.Texts())
		}
	}
	if err := tt.Click("Tuwa 的原话（英文）"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	for _, w := range []string{"范围", "one question only", "从", "a Tuwa number", "什么时候（UTC）"} {
		if !tt.HasText(w) {
			t.Errorf("Tuwa's wording lacks %q: %q", w, tt.Texts())
		}
	}
	if err := tt.Click("立即拨打"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if c, ok := (*sent)[len(*sent)-1].(protocol.CallNow); !ok || c.CallID != "call_1" {
		t.Fatalf("Call now sent %#v", (*sent)[len(*sent)-1])
	}
	if !tt.HasText("好，现在就打。") || strings.Contains(strings.Join(tt.Texts(), "|"), "|现在就打|") {
		t.Errorf("after Call now: %q", tt.Texts())
	}

	// Too late there: the reason, and no Call now.
	app2, _ := iaApp(t, i18n.ZH)
	tt2 := ui.NewTesterWith(app2.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app2.Route = RouteConversation
	app2.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 Aya？", GoLabel: "到时拨打", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: waitPlan(true, "late", false)}}),
	}})
	tt2.Frame()
	if !tt2.HasText("对方那边现在 21:30，太晚了，排到了对方的 09:00。") || tt2.HasText("立即拨打") {
		t.Errorf("too late: %q", tt2.Texts())
	}

	// On hand: automated with the screening hint, a line that failed, a refusal in Tuwa's words.
	plan := *sushiPlan(true, "")
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{
		{CallID: "c_auto", State: protocol.CallAutomated, Hint: "screening", Plan: plan, Outcome: "An automated Google Voice message said the subscriber is not available."},
		{CallID: "c_line", State: protocol.CallFailed, Reason: "call_failed", Error: "the provider gave no reason", Plan: plan},
		{CallID: "c_ref", State: protocol.CallFailed, Reason: "provider", Error: "number not allowed", Plan: plan},
	}}})
	app.Route = RouteOnHand
	tt.Frame()
	for _, w := range []string{"接通的是自动语音 · Sushi Saito", "是 Google Voice 的来电过滤", "没打通 · Sushi Saito", "Tuwa 没说原因", "没打出去 · Sushi Saito", "Tuwa 拒绝了：number not allowed"} {
		found := false
		for _, s := range tt.Texts() {
			if strings.Contains(s, w) {
				found = true
			}
		}
		if !found {
			t.Errorf("On hand lacks %q: %q", w, tt.Texts())
		}
	}
	for _, s := range tt.Texts() {
		if strings.Contains(s, "Tuwa 没接这通") {
			t.Errorf("a refusal that wasn't said: %q", s)
		}
	}
}

// Every phone surface in zh and en, for review (gitignored .shots/calls; the Mac has one theme):
//
//	DUCTER_SHOTS_DIR=../../../../.shots/calls go test ./internal/views -run PhoneShots
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
				protocol.NewEvent(2, iso(-time.Minute), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: pick("打给 Sushi Saito？", "Call Sushi Saito?"), GoLabel: pick("拨打", "Call"), DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: sushiPlan(zh, at)}}),
			}})
			return app
		}
		shot(go1(""), "phone-go", 1280, 1000)
		tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 9, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)
		shot(go1(tomorrow), "phone-go-later", 1280, 1000)

		// 4b. D208: asked for now at 20:03 where they are: why, and Call now; at 21:30: why, no Call now.
		goWait := func(why string, canNow bool) *App {
			app := base()
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				protocol.NewEvent(1, iso(-2*time.Minute), "default", "channel", "user", protocol.KindUserMsg, protocol.UserMsg{Text: pick("现在就给 Aya 打个电话（+81 90-1111-2222），问她今晚有没有空，别说酒店名字", "Call Aya now (+81 90-1111-2222) and ask if she's free tonight; don't mention the hotel")}),
				protocol.NewEvent(2, iso(-time.Minute), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: pick("打给 Aya？", "Call Aya?"), GoLabel: pick("到时拨打", "Call then"), DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: waitPlan(zh, why, canNow)}}),
			}})
			app.ph().summary["d1"] = true
			return app
		}
		shot(goWait("callee", true), "call-go-callnow", 1280, 1200)
		shot(goWait("late", false), "call-go-late", 1280, 1200)

		// 5. A question from the line, on top of the conversation.
		app = base()
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{{CallID: "call_1", State: "question", Plan: *sushiPlan(zh, ""), TalkingSince: iso(-70 * time.Second), Question: &protocol.CallQuestion{Text: pick("对方问：7 点没有了，7 点半可以吗？", "They ask: 7 is full, is 7:30 all right?"), YesNo: true, DecisionID: "d2"}}}}})
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(1, iso(-3*time.Minute), "default", "channel", "user", protocol.KindUserMsg, protocol.UserMsg{Text: pick("帮我给 Sushi Saito 打个电话，订明天晚上 7 点两位", "Call Sushi Saito and book two for tomorrow at 7 pm")}),
			protocol.NewEvent(2, iso(-2*time.Minute), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: pick("打给 Sushi Saito？", "Call Sushi Saito?"), GoLabel: pick("拨打", "Call"), DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: sushiPlan(zh, "")}}),
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

		// 6b. D208: every way a call ends, said truthfully.
		app = base()
		gv := plan
		gv.Name, gv.To = pick("我的 Google Voice", "My Google Voice"), "+12025550147"
		aya := plan
		aya.Name, aya.To, aya.At = "Aya", "+819011112222", tomorrow
		aya.Wait = &protocol.CallWait{Why: "callee", Zone: "Asia/Tokyo", Their: "20:03", Then: "09:00"}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Calls: []protocol.CallBody{
			{CallID: "c_wait", State: "waiting", Plan: aya},
			{CallID: "c_auto", State: protocol.CallAutomated, Hint: "screening", Plan: gv, Outcome: "The call connected, but an automated Google Voice message said the subscriber you have called is not available.", DurationSec: f64(24), CostUSD: f64(0.3)},
			{CallID: "c_done", State: "done", Plan: plan, Outcome: pick("订好了：明天 19:30，两位吧台，名字 Weyl。", "Booked: tomorrow 19:30, two counter seats, under Weyl."), DurationSec: f64(190), CostUSD: f64(1.6)},
			{CallID: "c_none", State: "no_answer", Plan: clinic},
			{CallID: "c_line", State: "failed", Reason: "call_failed", Error: "the provider gave no reason", Plan: shop},
			{CallID: "c_ref", State: "failed", Reason: "provider", Error: "This number can't be called from Tuwa's US line.", Plan: clinic},
			{CallID: "c_lost", State: "failed", Reason: "lost", Error: "the confirmation errored", Plan: hotel},
		}}})
		app.Route = RouteOnHand
		app.ph().open["c_auto"] = true
		shot(app, "call-onhand-outcomes", 1280, 1700)
	}
}
