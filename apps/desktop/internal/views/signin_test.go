package views

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D151: a sign-in card opens the live view of Ducter's browser; frames are
// shown and acked one at a time, clicks and keys go in, 完成 / Done answers
// the card. DUCTER_SIGNIN_SHOTS=1 writes the card and the live view (zh,
// en) to shotsDir; DUCTER_LIVE_FRAME=<a JPEG> paints a real page into it.

func signInApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	noRelayWait(t)
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	zh := lang == i18n.ZH
	ack := "On it. I'll look on Example Console."
	ask, title, said := "Check this month's orders on Example Console", "Check this month's orders on Example Console", "To read the orders I need you signed in to console.example.com. Tap below and sign in yourself."
	if zh {
		ack = "好，我去 Example Console 上看看。"
		ask, title, said = "帮我看看 Example Console 上这个月的订单", "看 Example Console 这个月的订单", "要看订单，得先登录 console.example.com。你点一下，自己登录就好。"
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: ask}),
		chEv(2, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: ack, ReplyTo: 1}),
		ev(protocol.TaskStream("t_orders"), protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_orders", Title: title, Harness: "codex", Place: protocol.Place{Kind: "browser", Device: "local", Profile: "default"}}),
		chEv(3, protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d_signin", TaskID: "t_orders", Question: "Sign in to console.example.com in Ducter's browser", GoLabel: "Signed in", DefaultOption: "go",
			SignIn: &protocol.SignInAsk{Site: "console.example.com", URL: "https://console.example.com/login"}}),
		chEv(4, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: said, DecisionID: "d_signin"}),
	}})
	return app, sent
}

// testFrame is a JPEG page: DUCTER_LIVE_FRAME when set (a real page), else a plain one.
func testFrame(t *testing.T) (string, int, int) {
	if p := os.Getenv("DUCTER_LIVE_FRAME"); p != "" {
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		return base64.StdEncoding.EncodeToString(b), cfg.Width / 2, cfg.Height / 2
	}
	img := image.NewRGBA(image.Rect(0, 0, 1000, 700))
	for y := 0; y < 700; y++ {
		for x := 0; x < 1000; x++ {
			img.Set(x, y, color.RGBA{0xf4, 0xf5, 0xf7, 0xff})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 60}); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), 1000, 700
}

func shoot(t *testing.T, tt *ui.Tester, name string) {
	if os.Getenv("DUCTER_SIGNIN_SHOTS") == "" {
		return
	}
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		dir = shotsDir(t)
	}
	f, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func lastSent[T any](sent []any) (T, bool) {
	for i := len(sent) - 1; i >= 0; i-- {
		if v, ok := sent[i].(T); ok {
			return v, true
		}
	}
	var zero T
	return zero, false
}

func TestSignInCardAndLiveView(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		pick := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		app, sent := signInApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.Frame()
		tt.Frame()
		for _, want := range []string{pick("你自己登录。登录的时候它看不见这个页面，也碰不到你的密码。", "You sign in yourself. While you do, it can't see the page or your password."), pick("去登录", "Sign in"), pick("暂不登录", "Not now")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if tt.HasText(pick("先等等", "Hold")) {
			t.Errorf("%s: a sign-in card has no Go / Hold / Reply", lang)
		}
		shoot(t, tt, "desktop-signin-card-"+string(lang)+".png")

		if err := tt.Click(pick("去登录", "Sign in")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		open, ok := lastSent[protocol.LiveOpenReq](*sent)
		if !ok || open.DecisionID != "d_signin" || open.Width < 360 || open.Height < 360 {
			t.Fatalf("%s: no live_open: %#v", lang, *sent)
		}
		if !tt.HasText(pick("正在打开 console.example.com……", "Opening console.example.com…")) {
			t.Errorf("%s: no opening line: %q", lang, tt.Texts())
		}
		data, w, h := testFrame(t)
		app.Receive(protocol.ServerFrame{T: "live", ID: "lv1", DecisionID: "d_signin", State: "open", Site: "console.example.com", URL: "https://console.example.com/login", Width: w, Height: h})
		app.Receive(protocol.ServerFrame{T: "live_frame", ID: "lv1", Seq: 1, Data: data, Width: w, Height: h})
		tt.Frame()
		tt.Frame()
		if ack, ok := lastSent[protocol.LiveAckReq](*sent); !ok || ack.Seq != 1 || ack.ID != "lv1" {
			t.Fatalf("%s: frame 1 not acked: %#v", lang, *sent)
		}
		if !tt.HasText(pick("Ducter 的浏览器 · 它现在看不见", "Ducter's browser · it can't see this now")) {
			t.Errorf("%s: the top line doesn't say the partner can't see: %q", lang, tt.Texts())
		}
		shoot(t, tt, "desktop-live-view-"+string(lang)+".png")

		// A click on the page goes in as fractions of it; typing goes in as text.
		tt.ClickAt(550, 400)
		tt.Frame()
		var mouse []protocol.LiveInput
		for _, f := range *sent {
			if in, ok := f.(protocol.LiveInputReq); ok && in.Input.Kind == "mouse" {
				mouse = append(mouse, in.Input)
			}
		}
		if len(mouse) < 2 || mouse[0].Type != "down" || mouse[1].Type != "up" || mouse[0].X <= 0 || mouse[0].X >= 1 || mouse[0].Y <= 0 || mouse[0].Y >= 1 {
			t.Fatalf("%s: click didn't go in as fractions: %#v", lang, mouse)
		}
		tt.Type("ada@example.com")
		tt.Key(0, ui.KeyTab)
		tt.Frame()
		var typed, keys []string
		for _, f := range *sent {
			if in, ok := f.(protocol.LiveInputReq); ok {
				switch in.Input.Kind {
				case "text":
					typed = append(typed, in.Input.Text)
				case "key":
					keys = append(keys, in.Input.Key)
				}
			}
		}
		if len(typed) == 0 || typed[len(typed)-1] == "" {
			t.Errorf("%s: typing didn't go in: %#v", lang, typed)
		}
		if len(keys) == 0 || keys[len(keys)-1] != "Tab" {
			t.Errorf("%s: Tab didn't go in: %#v", lang, keys)
		}

		if err := tt.Click(pick("完成", "Done")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if cl, ok := lastSent[protocol.LiveCloseReq](*sent); !ok || !cl.Done || cl.ID != "lv1" {
			t.Fatalf("%s: Done didn't close with done: %#v", lang, *sent)
		}
		if app.S.Live != nil {
			t.Errorf("%s: the live view stays after Done", lang)
		}
	}
}

// The server closing a view (another window took it) says so once.
func TestLiveViewReplaced(t *testing.T) {
	app, _ := signInApp(t, i18n.EN)
	app.OpenLive("d_signin", "console.example.com")
	app.Receive(protocol.ServerFrame{T: "live", ID: "lv1", DecisionID: "d_signin", State: "closed", Reason: "replaced"})
	if app.S.Live != nil || app.S.LiveClosed == nil {
		t.Fatalf("closed view kept: %#v", app.S.Live)
	}
	tt := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if app.S.LiveClosed != nil {
		t.Errorf("the close wasn't said")
	}
}
