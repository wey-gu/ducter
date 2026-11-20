package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D436: 去付款 / Go to checkout on the Mac: the receipt (what, the items, the
// total, the site), why Ducter never presses pay, Not now sends Hold, and Go
// to checkout opens the live view whose words are 还没付 · 付好了 with the band
// that says paying is theirs. A step on a page reads as the person's step.
//
//	DUCTER_D436_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/errand-checkout go test ./internal/views -run TestD436
func TestD436CheckoutCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := func(zh, en string) string { return pastWord(lang, zh, en) }
		L := i18n.New(lang)
		app, sent := pastApp(t, lang)
		step := protocol.Decision{DecisionID: "d_step", TaskID: "t_cart", Question: "Your step on shop.example", GoLabel: "Done", DefaultOption: "hold", SignIn: &protocol.SignInAsk{Site: "shop.example", URL: "https://shop.example/verify", Step: w("点一下「我不是机器人」", "Tap “I'm not a robot”")}}
		card := protocol.Decision{DecisionID: "d_co", TaskID: "t_cart", Question: "Ready to pay CNY 154.70 on shop.example", GoLabel: "I've paid", DefaultOption: "hold", Checkout: &protocol.CheckoutAsk{
			Site: "shop.example", URL: "https://shop.example/checkout", What: w("购物车里的三样", "The three things in your cart"), Total: "154.70", Currency: "CNY",
			Items: []string{w("USB-C 数据线 1.8 米", "USB-C cable, 1.8 m"), w("云南小粒咖啡豆 500 g", "Yunnan coffee beans, 500 g"), w("A5 方格笔记本 3 本装", "A5 grid notebooks, pack of 3")},
		}}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: w("帮我把购物车里那三样买了", "Buy the three things in my cart")}),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("我去买，到付款那步停下给你。", "On it. I'll stop at the checkout for you to pay.")}),
			ev("channel", protocol.KindDecision, step),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("小铺要先确认是你本人在下单，这一步得你来点一下。", "The shop wants to check it's really you; that one tap is yours."), DecisionID: "d_step"}),
			ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_step", Option: "go", By: "user"}),
			ev("channel", protocol.KindDecision, card),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("三样都在，一共 ¥154.70，收货人和手机号填好了，停在付款这一步。", "All three are in, ¥154.70 in total, your name and phone filled in; it's waiting at the payment step."), DecisionID: "d_co"}),
		}})
		tt := ui.NewTesterWith(app.View, 1280, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		frames := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
		}
		frames()
		texts := strings.Join(tt.Texts(), " ")
		for _, want := range []string{L.T("co.what"), L.T("co.total"), "CNY 154.70", "shop.example", L.T("co.why"), L.T("co.go"), L.T("co.hold"), w("A5 方格笔记本 3 本装", "A5 grid notebooks, pack of 3"), L.T("step.resolved")} {
			if !strings.Contains(texts, want) {
				t.Fatalf("%s: no %q in %q", lang, want, texts)
			}
		}
		if got := app.questionOf(app.S.Decisions["d_step"]); got != L.T("step.title", "shop.example") {
			t.Errorf("%s: the step's question: %q", lang, got)
		}
		if os.Getenv("DUCTER_D436_SHOTS") != "" {
			d302Both(t, app, tt, frames, "errand-conversation", lang)
		}
		n := len(*sent)
		if err := tt.Click(spoken(L, L.T("co.hold"), "shop.example")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		held := false
		for _, f := range (*sent)[n:] {
			if d, ok := f.(protocol.Decide); ok && d.DecisionID == "d_co" && d.Option == "hold" {
				held = true
			}
		}
		if !held {
			t.Fatalf("%s: Not now sent no Hold: %#v", lang, (*sent)[n:])
		}
		// Go to checkout: the same tab, live, in the person's turn; its words are the card's.
		app.S.Decisions["d_co"].Pending = ""
		app.OpenLive("d_co", "shop.example")
		frames()
		texts = strings.Join(tt.Texts(), " ")
		for _, want := range []string{L.T("co.live.band"), L.T("co.live.notyet"), L.T("co.live.paid")} {
			if !strings.Contains(texts, want) {
				t.Fatalf("%s: the live view lacks %q in %q", lang, want, texts)
			}
		}
		if os.Getenv("DUCTER_D436_SHOTS") != "" {
			d302Both(t, app, tt, frames, "errand-live", lang)
		}
	}
}
