package views

import (
	"fmt"
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

// D278: calls from your own number when the home is a server. The card never
// asks to plug a phone into it, install lines are the home's own system's,
// 再找一次 says when it looked and what it saw, and the call sheet's 你来打 /
// You call rings on the person's phone from the Mac.

func serverOwnView() *protocol.OwnPhoneView {
	v := &protocol.OwnPhoneView{Where: "hel", Station: false, OS: "linux", Headset: "unknown", PerDay: 10}
	v.Voice.Engine, v.Voice.Model, v.Voice.PerMinUSD = "openai", "gpt-realtime-2.1", 0.2
	v.Test.State = "never"
	return v
}

func pixelReach() protocol.ServerFrame {
	return protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{}, Reach: &protocol.Reach{Clients: []protocol.ReachClient{{ID: "c_pixel", Name: "Pixel Fold · Ducter", Platform: "android-app", Connected: true, Handset: &protocol.HandsetView{Able: true, Linked: true, Dial: true}}}}}
}

func ownSheetPlan(zh bool) *protocol.CallPlan {
	if zh {
		return &protocol.CallPlan{To: "+862161234567", Name: "浦东 4S 店", Goal: "问小保养要多久，要不要预约", Say: []string{"姓顾"}, Voice: "ducter", From: "self", CalleeZone: "Asia/Shanghai",
			Sheet: &protocol.CallSheet{Why: "own", Open: "你好，我想问一下小保养大概要多久，需要预约吗？", Ask: []string{"周六上午能做吗？", "大概多少钱？"}, Dont: []string{"车架号"}, Note: []string{"时间", "价格"}}}
	}
	return &protocol.CallPlan{To: "+862161234567", Name: "Pudong dealership", Goal: "Ask how long a minor service takes and whether to book", Say: []string{"Gu"}, Voice: "ducter", From: "self", CalleeZone: "Asia/Shanghai",
		Sheet: &protocol.CallSheet{Why: "own", Open: "你好，我想问一下小保养大概要多久，需要预约吗？", Ask: []string{"Can it be Saturday morning?", "Roughly how much?"}, Dont: []string{"The VIN"}, Note: []string{"Time", "Price"}}}
}

func TestOwnPhoneServerHome(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{}, Oo: &protocol.OoDetect{}, OwnPhone: serverOwnView()})
		app.openTab(TabAccounts)
		tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		// The Plugins tab (D673) is not a word about plugging a phone in.
		all := strings.ReplaceAll(strings.Join(tt.Texts(), "\n"), "Plugins", "")
		for _, never := range []string{"brew", "USB", "插到", "Plug", "再找一次", "Look again"} {
			if strings.Contains(all, never) {
				t.Errorf("%s: a server home's card says %q: %q", lang, never, tt.Texts())
			}
		}
		want := map[i18n.Lang][]string{
			i18n.ZH: {"你来打：要说的，我先写在通话单上。", "即将推出"},
			i18n.EN: {"You call: I write what to say on a call sheet first.", "Coming soon"},
		}[lang]
		for _, w := range want {
			if !hasText(tt, w) {
				t.Errorf("%s: lacks %q: %q", lang, w, tt.Texts())
			}
		}
	}
}

func TestOwnPhoneInstallAndLook(t *testing.T) {
	if ownInstall("linux", "adb") != "sudo apt install adb" || ownInstall("mac", "adb") != "brew install android-platform-tools" || ownInstall("other", "ffmpeg") != "" {
		t.Fatal("install lines")
	}
	app, _ := iaApp(t, i18n.ZH)
	v := ownView("none")
	v.Where = "MacBook"
	v.LookedAt = time.Date(2026, 11, 16, 20, 14, 0, 0, time.Local).UTC().Format(time.RFC3339)
	if saw, at := app.ownLooked(v); saw != "MacBook 上还没看到手机" || at != "20:14" {
		t.Fatalf("looked: %q %q", saw, at)
	}
	app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{}, Oo: &protocol.OoDetect{}, OwnPhone: v})
	app.openTab(TabAccounts)
	app.own.opened = true // D337: 设置 / Set up pressed
	tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, "MacBook 上还没看到手机") || !hasText(tt, "20:14") {
		t.Fatalf("the look's line: %q", tt.Texts())
	}
	v.Looking = true
	tt.Frame()
	if !hasText(tt, "正在找…") || hasText(tt, "再找一次") {
		t.Fatalf("looking: %q", tt.Texts())
	}
}

func TestYouCallSheetDialsOnPhone(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Route = RouteConversation
	app.Receive(pixelReach())
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 浦东 4S 店 的通话单", GoLabel: "通话结束", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_y", Kind: "sheet", Plan: ownSheetPlan(true)}}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	// In the conversation the partner has just said why (its one line); the sheet and the dial follow.
	for _, w := range []string{"你好，我想问一下小保养大概要多久，需要预约吗？", "在 Pixel Fold 上拨打"} {
		if !hasText(tt, w) {
			t.Errorf("the sheet lacks %q: %q", w, tt.Texts())
		}
	}
	if err := tt.Click("在 Pixel Fold 上拨打"); err != nil {
		t.Fatal(err)
	}
	if f, ok := (*sent)[len(*sent)-1].(protocol.HandsetDialReq); !ok || f.CallID != "call_y" || f.Device != "c_pixel" || f.T != "handset_dial" {
		t.Fatalf("Call on Pixel Fold sent %#v", (*sent)[len(*sent)-1])
	}
	tt.Frame()
	if !hasText(tt, "正在让 Pixel Fold 打出去…") {
		t.Errorf("asking: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "handset_dial_result", CallID: "call_y", OK: true, DialPhone: "Pixel Fold · Ducter", How: "rang"})
	tt.Frame()
	if !hasText(tt, "Pixel Fold 在打了。通话单也在它的通知里，通话时下拉就能看。") {
		t.Errorf("rang: %q", tt.Texts())
	}
	if f, err := protocol.DecodeServerFrame([]byte(`{"t":"handset_dial_result","callId":"c","ok":false,"reason":"timeout","phone":"Pixel Fold · Ducter"}`)); err != nil || f.Reason != "timeout" || f.DialPhone != "Pixel Fold · Ducter" {
		t.Fatalf("decode: %v %+v", err, f)
	}
}

// The D278 cards for review:
//
//	DUCTER_SHOTS_DIR=/path/.shots/d278 go test ./internal/views -run YouCallShots
func TestYouCallShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
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
		app, _ := iaApp(t, lang)
		app.Receive(settingsFrame())
		app.Receive(pixelReach())
		app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{}, Oo: &protocol.OoDetect{}, OwnPhone: serverOwnView()})
		app.openTab(TabAccounts)
		shot(app, "own-server", 1280, 1400)

		app, _ = iaApp(t, lang)
		app.Receive(settingsFrame())
		v := ownView("none")
		v.Where = "MacBook"
		v.LookedAt = time.Now().UTC().Format(time.RFC3339)
		app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{}, Oo: &protocol.OoDetect{}, OwnPhone: v})
		app.openTab(TabAccounts)
		shot(app, "own-looked", 1280, 1400)

		app, _ = iaApp(t, lang)
		app.Receive(settingsFrame())
		app.Route = RouteConversation
		app.Receive(pixelReach())
		q := "打给 浦东 4S 店 的通话单"
		if lang == i18n.EN {
			q = "Call sheet: Pudong dealership"
		}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: q, GoLabel: "通话结束", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_y", Kind: "sheet", Plan: ownSheetPlan(lang == i18n.ZH)}}),
		}})
		app.Receive(protocol.ServerFrame{T: "handset_dial_result", CallID: "call_y", OK: true, DialPhone: "Pixel Fold · Ducter", How: "rang"})
		shot(app, "youcall-sheet", 1280, 1400)
	}
}
