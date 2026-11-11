package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D190: 看它上网 / Watch it browse on the Mac. A task holding Ducter's own
// browser shows 看看 on its computer's 上网 block; the view shows the task's
// tab in its turn with what it is doing; 换我来 / My turn asks for the
// user's turn, which the band then says plainly, and 还给它 / Hand it back
// gives it back. DUCTER_SIGNIN_SHOTS=1 writes the views (zh, en);
// DUCTER_LIVE_FRAME=<a JPEG at 2x> paints a real page into them.
func TestWatchItBrowse(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		pick := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		app, sent, tt := devicesApp(t, lang, protocol.DeviceAbility{ID: "web", State: "on", Where: "ducter", Detail: "157.0.8103.38"})
		title := pick("在 Greenleaf 上找 V60 滤纸", "Find V60 filter paper on Greenleaf")
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{
			TaskID: "t_buy", Title: title, Harness: "codex", Attention: protocol.Working, Place: protocol.Place{Kind: "browser", Device: "local"},
			Browsing: &protocol.Browsing{Device: app.S.Devices[0].ID},
		}}}})
		app.Receive(protocol.ServerFrame{T: "browser_sites", Ready: true})
		tt.Frame()
		if err := tt.Click(pick("这是做什么的 · 上网", "What this does · Browse")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		using := app.L.T("live.using", title)
		if !tt.HasText(using) {
			t.Fatalf("%s: no %q in %q", lang, using, tt.Texts())
		}
		shoot(t, tt, "desktop-watch-block-"+string(lang)+".png")
		if err := tt.Click(pick("查看", "Watch")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		open, ok := lastSent[protocol.LiveOpenReq](*sent)
		if !ok || open.DecisionID != protocol.WatchLive || open.TaskID != "t_buy" {
			t.Fatalf("%s: Watch sent %#v", lang, open)
		}
		data, w, h := testFrame(t)
		about := &protocol.BrowserAbout{Device: "hel", Name: "Chrome for Testing", Version: "157.0.8103.38", Profile: "ducter"}
		app.Receive(protocol.ServerFrame{T: "live", ID: "lv1", DecisionID: protocol.WatchLive, State: "open", URL: "http://shop.example.com/search?q=V60", Width: w, Height: h, Browser: about, Turn: "agent", TaskID: "t_buy", Task: &protocol.LiveTask{Title: title, Harness: "codex"}})
		app.Receive(protocol.ServerFrame{T: "live_frame", ID: "lv1", Seq: 1, Data: data, Width: w, Height: h})
		x, y := 0.3, 0.4
		app.Receive(protocol.ServerFrame{T: "live_doing", ID: "lv1", Doing: &protocol.LiveDoing{Kind: "click", Label: "View", X: &x, Y: &y}})
		tt.Frame()
		tt.Frame()
		for _, want := range []string{"shop.example.com", title, pick("正在点「View」", "Clicking “View”"), pick("接手", "My turn"), pick("关闭", "Close")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if tt.HasText(pick("还给它", "Hand it back")) || tt.HasText(pick("刷新", "Reload")) {
			t.Fatalf("%s: watching shows the user's controls: %q", lang, tt.Texts())
		}
		shoot(t, tt, "desktop-watch-"+string(lang)+".png")
		if err := tt.Click(pick("接手", "My turn")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if turn, ok := lastSent[protocol.LiveTurnReq](*sent); !ok || !turn.Mine || turn.ID != "lv1" {
			t.Fatalf("%s: My turn sent %#v", lang, turn)
		}
		app.Receive(protocol.ServerFrame{T: "live_turn", ID: "lv1", Turn: "you", Here: true})
		tt.Frame()
		tt.Frame()
		for _, want := range []string{pick("现在你在用。它看不见这个页面，也不会动它。", "It's your turn. It can't see this page or touch it."), pick("还给它", "Hand it back"), pick("刷新", "Reload")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		shoot(t, tt, "desktop-watch-yourturn-"+string(lang)+".png")
		if err := tt.Click(pick("还给它", "Hand it back")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if turn, ok := lastSent[protocol.LiveTurnReq](*sent); !ok || turn.Mine {
			t.Fatalf("%s: Hand it back sent %#v", lang, turn)
		}
		app.Receive(protocol.ServerFrame{T: "live_turn", ID: "lv1", Turn: "agent"})
		tt.Frame()
		if !tt.HasText(pick("接手", "My turn")) {
			t.Fatalf("%s: after handing back: %q", lang, tt.Texts())
		}
		if err := tt.Click(pick("关闭", "Close")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if c, ok := lastSent[protocol.LiveCloseReq](*sent); !ok || c.Done {
			t.Fatalf("%s: Close sent %#v", lang, c)
		}
	}
}
