package views

// D674: the shadow's review on the Mac: the week's line at the morning
// note's foot, the card under it, a verdict sent once, the settled row, and
// the line fading at the next morning. Fixtures in the shape of the
// author's week (apps/web/demo-shadow.ts), never anything real.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<worktree>/.shots/shadow/mac go test ./internal/views -run ShadowShots

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

var shadowWords = map[i18n.Lang][3]string{
	i18n.ZH: {"12 月 3 日 MU 523 下午落地大阪关西，那晚订的涩谷酒店在东京，从机场过去要三个多小时。", "ducter.dev 12 月 1 日续费，扣款的那张卡上周五在 Stripe 被拒了。", "看看酒店能不能改到 12 月 4 日"},
	i18n.EN: {"MU 523 lands at Osaka Kansai on the afternoon of Dec 3, but that night's hotel is in Shibuya, Tokyo, over three hours away.", "ducter.dev renews on Dec 1, and the card it charges was declined at Stripe last Friday.", "see if the hotel can move to Dec 4"},
}

func shadowApp(t *testing.T, lang i18n.Lang, until time.Time) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Now = func() time.Time { return recallNow }
	opening := recallSeed[lang].opening
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		recallEv(1, protocol.OriginPartner, protocol.KindFinds, protocol.Finds{NoteID: "n1", Rung: "morning", Opening: opening, Finds: []protocol.FindView{}, Learned: &protocol.Learned{Count: 3},
			ShadowReview: &protocol.ShadowOffer{Count: 2, Until: until.UTC().Format(time.RFC3339)}}),
	}})
	return app, sent
}

func shadowReviewFrame(lang i18n.Lang, labelled bool) protocol.ServerFrame {
	w := shadowWords[lang]
	at := recallNow.Add(-26 * time.Hour).UTC().Format(time.RFC3339)
	items := []protocol.ShadowItem{
		{ID: "a1b2c3d4", RunID: "shadow_a", Source: "shadow", Text: w[0], Next: w[2], Confidence: 0.92, At: at, Sort: "facts:booking", Facts: []protocol.ShadowFact{
			{ID: "f1", Type: "booking", Src: "mail", Label: "Flight confirmation MU523 Shanghai–Osaka", From: "China Eastern", At: at},
			{ID: "f2", Type: "booking", Src: "mail", Label: "Reservation confirmed: Shibuya Stream Excel Hotel", From: "Hotels.com", At: at},
		}},
		{ID: "e5f6a7b8", RunID: "shadow_a", Source: "shadow", Text: w[1], Confidence: 0.88, At: at, Sort: "facts:payment+renewal", Facts: []protocol.ShadowFact{
			{ID: "f3", Type: "renewal", Src: "mail", Label: "Your domain ducter.dev renews soon", From: "Cloudflare", At: at},
			{ID: "f4", Type: "payment", Src: "mail", Label: "Card ending 4242 was declined", From: "Stripe", At: at},
		}},
	}
	if labelled {
		items[1].Verdict = "yes"
	}
	return protocol.ServerFrame{T: "shadow_review_result", ShadowFor: &protocol.ShadowReviewFrame{Review: &protocol.ShadowReview{From: "2026-11-09", To: "2026-11-17", Items: items}}}
}

func TestShadowLineOpensTheReviewAndSendsAVerdict(t *testing.T) {
	app, sent := shadowApp(t, i18n.ZH, recallNow.Add(20*time.Hour))
	tt := ui.NewTesterWith(app.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, "这周我注意到 2 处没跟你说") || !hasText(tt, "这周记下的 3 条关于你的事") {
		t.Fatalf("no week's lines at the note's foot: %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click("这周我注意到 2 处没跟你说"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if len(*sent) != 1 || (*sent)[0] != (protocol.ShadowReviewReq{T: "shadow_review"}) {
		t.Fatalf("opening asked %#v", *sent)
	}
	if !hasText(tt, "正在翻这周的…") {
		t.Errorf("no word while it waits: %q", tt.Texts())
	}
	app.Receive(shadowReviewFrame(i18n.ZH, false))
	tt.Frame()
	for _, s := range []string{"我注意到、没说的", shadowWords[i18n.ZH][0], "我会先：看看酒店能不能改到 12 月 4 日", "邮件", "Hotels.com", "应该早说", "不该说", "这类以后都别标"} {
		if !hasText(tt, s) {
			t.Errorf("the card lacks %q", s)
		}
	}
	*sent = nil
	if err := tt.Click("应该早说"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if len(*sent) != 1 || (*sent)[0] != (protocol.ShadowLabelReq{T: "shadow_label", FindingID: "a1b2c3d4", Verdict: "yes"}) {
		t.Fatalf("the verdict sent %#v", *sent)
	}
	if !hasText(tt, "好，这种该早点说。") || !hasText(tt, "改") {
		t.Errorf("the row doesn't settle: %q", tt.Texts())
	}
}

func TestShadowLineFadesAtTheNextMorning(t *testing.T) {
	app, _ := shadowApp(t, i18n.EN, recallNow.Add(-time.Minute))
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if hasText(tt, "2 things I noticed this week and didn't say") {
		t.Fatalf("a faded line still shows")
	}
	if !hasText(tt, "3 things I noted about you this week") {
		t.Fatalf("the note's other ways on went too: %q", tt.Texts())
	}
}

func TestShadowReviewFrameDecodes(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"shadow_review_result","review":{"from":"2026-11-09","to":"2026-11-17","items":[{"id":"x1","runId":"r","source":"detector","text":"t","alsoBy":["mismatch"],"said":false,"at":"2026-11-16T02:00:00Z","facts":[],"sort":"kind:mismatch","verdict":"no","stopped":true}]}}`))
	if err != nil || f.ShadowFor == nil || f.ShadowFor.Review == nil || len(f.ShadowFor.Review.Items) != 1 || !f.ShadowFor.Review.Items[0].Stopped {
		t.Fatalf("decoded %#v, %v", f.ShadowFor, err)
	}
	g, _ := protocol.DecodeServerFrame([]byte(`{"t":"shadow_review_result","error":"unknown_item"}`))
	if g.ShadowFor == nil || g.ShadowFor.Error != "unknown_item" {
		t.Fatalf("an error doesn't decode: %#v", g.ShadowFor)
	}
}

func TestShadowShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1400} {
			for _, mode := range []string{"light", "dark"} {
				app, _ := shadowApp(t, lang, recallNow.Add(20*time.Hour))
				app.Local.SetAppearance(mode)
				tt := ui.NewTesterWith(app.View, w, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.Frame()
				link := app.L.T("shadow.link", "2")
				write := func(name string) {
					for i := 0; i < 3; i++ {
						tt.Frame()
						tt.Advance(200 * time.Millisecond)
					}
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%d-%s.png", name, lang, w, mode)))
					if err != nil {
						t.Fatal(err)
					}
					if err := png.Encode(f, tt.Image()); err != nil {
						t.Fatal(err)
					}
					f.Close()
				}
				write("note")
				if err := tt.Click(link); err != nil {
					t.Fatal(err)
				}
				app.Receive(shadowReviewFrame(lang, true))
				write("review")
				app.Local.SetAppearance("system")
			}
		}
	}
}
