package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D256: the reply pebble. Hovering anything that can be replied to shows one
// small clay pebble in the gutter beside it, on the side away from its voice's
// edge, resting on its bottom line; it never sits on a bubble's or a card's
// content, at any width, in either theme.

type pebbleWords struct {
	fix, look, fixed, pic, picAns, opening, find1, find2, go2 string
}

var pebbleRun = map[i18n.Lang]pebbleWords{
	i18n.ZH: {
		fix:     "修一下 ~/dev/foo 里 TTL 那个时好时坏的测试",
		look:    "我去看看 foo 里那个时好时坏的 TTL 测试，弄清楚了告诉你。",
		fixed:   "TTL 测试修好了：它用真实计时去等 1 秒过期，机器一忙就抢跑，现在改成假时钟。",
		pic:     "这个报错是什么意思？",
		picAns:  "是 Xcode 找不到签名证书：钥匙串里那张开发证书上周过期了。",
		opening: "早。有两件事：",
		find1:   "王磊周二问的 HawDB 报价，你还没回。",
		find2:   "ducter.dev 11 月 20 日到期，Cloudflare 上自动续费的那张卡过期了。",
		go2:     "去续费",
	},
	i18n.EN: {
		fix:     "Fix the flaky TTL test in ~/dev/foo",
		look:    "I'll look at the flaky TTL test in foo and tell you what I find.",
		fixed:   "The TTL test is fixed: it waited a real second to expire and ran early when the machine was busy. It uses a fake clock now.",
		pic:     "What does this error mean?",
		picAns:  "Xcode can't find the signing certificate: the development one in your keychain expired last week.",
		opening: "Morning. Two things:",
		find1:   "Wang Lei asked for the HawDB quote on Tuesday; you haven't answered.",
		find2:   "ducter.dev expires on Nov 20 and the card Cloudflare renews it with has expired.",
		go2:     "Renew it",
	},
}

func pebbleApp(t *testing.T, lang i18n.Lang, w, h int, dark bool) (*App, *ui.Tester) {
	t.Helper()
	words := pebbleRun[lang]
	app, _, home := mediaApp(t, lang)
	shot := home.ref(t, phoneShot(), "")
	note := protocol.Finds{NoteID: "n1", Rung: "morning", Opening: words.opening, Finds: []protocol.FindView{
		{FindID: "f1", Kind: "waiting_on_you", Text: words.find1, How: []protocol.FindHow{{What: "Wang Lei · HawDB quote", At: "2026-11-11T02:05:00Z"}}},
		{FindID: "f2", Kind: "deadline", Text: words.find2, DecisionID: "d_f2", GoLabel: words.go2},
	}}
	ch := "channel"
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 40*time.Minute, ch, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: words.fix}),
		mev(2, 40*time.Minute, ch, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: words.look, ReplyTo: 1}),
		mev(3, 30*time.Minute, ch, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: words.fixed, ReplyTo: 1}),
		mev(4, 20*time.Minute, ch, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: words.pic, Media: []protocol.MediaRef{shot}}),
		mev(5, 19*time.Minute, ch, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: words.picAns, ReplyTo: 4}),
		mev(6, 5*time.Minute, ch, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d_f2", Question: words.find2, GoLabel: words.go2, DefaultOption: "hold", FindID: "f2"}),
		mev(7, 5*time.Minute, ch, protocol.OriginPartner, protocol.KindFinds, note),
	}})
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.SetDark(dark)
	if os.Getenv("DUCTER_SHOTS_DIR") != "" {
		tt.SetScale(2)
	}
	tt.Frame()
	tt.Frame()
	return app, tt
}

// pebbleShot writes $DUCTER_SHOTS_DIR/<name>.png, only when that is set: the
// test never needs a .shots folder.
func pebbleShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func overlaps(a, b ui.Rect) bool {
	return a.X < b.X+b.W && b.X < a.X+a.W && a.Y < b.Y+b.H && b.Y < a.Y+a.H
}

// hoverPebble rests the pointer on what is found by its words and returns the
// one pebble that shows.
func hoverPebble(t *testing.T, app *App, tt *ui.Tester, words string) (ui.Rect, ui.Rect) {
	t.Helper()
	r, ok := tt.Find(autospace(words))
	if !ok {
		t.Fatalf("%q isn't on the screen: %q", words, texts(tt))
	}
	tt.Move(r.X+min(r.W/2, 40), r.Y+r.H/2)
	tt.Frame()
	tt.Frame()
	if n := count(tt, app.L.T("reply.action")); n != 1 {
		t.Fatalf("hovering %q shows %d pebbles, want 1", words, n)
	}
	p, _ := tt.Find(app.L.T("reply.action"))
	return r, p
}

func TestReplyPebblePlacement(t *testing.T) {
	for _, size := range []struct {
		name string
		w, h int
	}{{"wide", 1100, 1400}, {"narrow", 460, 1900}} {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			// The Mac app has one theme (Pebble, light); the web has dark too.
			for _, dark := range []bool{false} {
				scheme := map[bool]string{false: "light", true: "dark"}[dark]
				tag := string(lang) + "-" + scheme + "-" + size.name
				w := pebbleRun[lang]
				app, tt := pebbleApp(t, lang, size.w, size.h, dark)
				t.Run(tag, func(t *testing.T) {
					gutter := float32(app.T.S2)
					within := func(what string, p ui.Rect) {
						if p.X < 0 || p.X+p.W > float32(size.w) {
							t.Errorf("%s: the pebble %+v leaves the window", what, p)
						}
					}
					// The person's bubble: left of it, never on it.
					r, p := hoverPebble(t, app, tt, w.fix)
					if p.X+p.W > r.X-gutter+1 {
						t.Errorf("user: the pebble %+v reaches into the bubble round %+v", p, r)
					}
					if p.Y+p.H > r.Y+r.H+1 {
						t.Errorf("user: the pebble %+v hangs below the bubble's bottom (%+v)", p, r)
					}
					within("user", p)
					if lang == i18n.ZH && !dark {
						pebbleShot(t, tt, "mac-"+tag+"-user")
					}
					// The partner's bubble: right of it.
					r, p = hoverPebble(t, app, tt, w.fixed)
					if p.X < r.X+r.W+app.T.S4-2+gutter-1 {
						t.Errorf("partner: the pebble %+v reaches into the bubble round %+v", p, r)
					}
					within("partner", p)
					// A message with a picture: beside the picture's column.
					r, p = hoverPebble(t, app, tt, w.pic)
					if p.X+p.W > r.X-gutter+1 {
						t.Errorf("picture: the pebble %+v reaches into the message round %+v", p, r)
					}
					within("picture", p)
					pebbleShot(t, tt, "mac-"+tag+"-picture")
					// A find: outside the note card, never on its corner or its row.
					r, p = hoverPebble(t, app, tt, w.find1)
					card := []string{w.find1, w.opening, app.L.T("kind.waiting_on_you"), app.L.T("find.useful"), app.L.T("find.mute"), app.L.T("find.how")}
					right := r.X + r.W
					for _, s := range card {
						if q, ok := tt.Find(autospace(s)); ok {
							if overlaps(p, q) {
								t.Errorf("find: the pebble %+v covers %q at %+v", p, s, q)
							}
							right = max(right, q.X+q.W)
						}
					}
					if p.X < right+app.T.S4-2+gutter-1 {
						t.Errorf("find: the pebble %+v is inside the card (its content ends at %v)", p, right)
					}
					if p.Y+p.H < r.Y || p.Y > r.Y+r.H+app.T.S2 {
						t.Errorf("find: the pebble %+v isn't beside the find's words %+v", p, r)
					}
					within("find", p)
					pebbleShot(t, tt, "mac-"+tag+"-find")
				})
			}
		}
	}
}

// The pebble replies: a click on it puts the find's imprint in the composer.
func TestReplyPebbleRepliesToTheFind(t *testing.T) {
	w := pebbleRun[i18n.ZH]
	app, tt := pebbleApp(t, i18n.ZH, 1100, 1400, false)
	r, p := hoverPebble(t, app, tt, w.find1)
	// On the pebble, it says its word, growing away from the card.
	tt.Move(p.X+p.W/2, p.Y+p.H/2)
	tt.Frame()
	tt.Frame()
	q, _ := tt.Find(app.L.T("reply.action"))
	if q.W <= p.W || q.X < p.X-1 {
		t.Errorf("the pebble under the pointer didn't widen away from the card: %+v -> %+v", p, q)
	}
	if !tt.HasText(app.L.T("reply.action")) || q.X < r.X+r.W {
		t.Errorf("no word on the pebble, or it moved onto the card: %+v", q)
	}
	pebbleShot(t, tt, "mac-zh-light-wide-find-on-pebble")
	if err := tt.Click(app.L.T("reply.action")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.rp.replying == nil || app.rp.replying.findID != "f1" {
		t.Fatalf("the pebble didn't reply to the find: %+v", app.rp.replying)
	}
}
