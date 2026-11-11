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

// D218: the own-number card and an own-number Go card, against frames as the
// core sends them.

func ownView(step string) *protocol.OwnPhoneView {
	v := &protocol.OwnPhoneView{Where: "Studio", ADB: true, Headset: "unknown", Today: 0, PerDay: 10}
	v.Audio.Tool = true
	v.Voice.Engine, v.Voice.Model, v.Voice.PerMinUSD = "openai", "gpt-realtime-2.1", 0.2
	v.Test.State = "never"
	if step == "none" {
		return v
	}
	v.Phone = &struct {
		Serial  string `json:"serial"`
		Model   string `json:"model"`
		State   string `json:"state"`
		Android string `json:"android,omitempty"`
	}{"R5CT30ABCDE", "Pixel 7", "ready", "15"}
	if step == "allow" {
		v.Phone.State = "unauthorized"
		return v
	}
	v.SIM = &struct {
		State   string `json:"state"`
		Carrier string `json:"carrier,omitempty"`
	}{"ready", "中国移动"}
	v.Number = "+8613912345678"
	v.Headset = "yes"
	v.Audio.Inputs = []string{"MacBook Pro Microphone", "USB Audio Device"}
	v.Audio.Outputs = []string{"MacBook Pro Speakers", "USB Audio Device"}
	v.Audio.Input, v.Audio.Output = "USB Audio Device", "USB Audio Device"
	if step == "voice" {
		return v
	}
	v.Voice.Key = true
	switch step {
	case "test":
		return v
	case "asking":
		v.Test.State, v.Test.To = "asking", "+8613800001111"
		f := false
		v.Test.HeardLine = &f
		return v
	}
	v.Test.State, v.Test.To = "passed", "+8613800001111"
	v.Ready = true
	v.Today = 1
	if step == "live" {
		v.Live = &struct {
			CallID string `json:"callId"`
			Name   string `json:"name"`
		}{"call_1", "鼎泰丰"}
	}
	return v
}

func ownFrame(step string) protocol.ServerFrame {
	return protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{}, Oo: &protocol.OoDetect{}, OwnPhone: ownView(step)}
}

func TestOwnPhoneFlow(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Receive(ownFrame("none"))
	app.openTab(TabAccounts)
	tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, w := range []string{"用你自己的号码打", "用 USB 线把安卓手机插到 Studio 上，再在手机的开发者选项里打开 USB 调试。", "只拨号、挂断、按键、看通话状态；不碰短信、通讯录和别的 App，不录音。"} {
		if !tt.HasText(w) {
			t.Errorf("the first step lacks %q: %q", w, tt.Texts())
		}
	}
	if err := tt.Click("再找一次"); err != nil {
		t.Fatal(err)
	}
	if f, ok := (*sent)[len(*sent)-1].(protocol.OwnPhoneAct); !ok || f.Action != "scan" || f.T != "own_phone" {
		t.Fatalf("Look again sent %#v", (*sent)[len(*sent)-1])
	}
	// The phone, SIM and cable are done: the live voice is the one open step.
	app.Receive(ownFrame("voice"))
	tt.Frame()
	for _, w := range []string{"Pixel 7 · Android 15", "中国移动 · +86 139 1234 5678", "电话里实时说话要用一个语音模型，得单独有个 Key：Claude 和 ChatGPT 的订阅都不含实时语音。"} {
		if !tt.HasText(w) {
			t.Errorf("the voice step lacks %q: %q", w, tt.Texts())
		}
	}
	// The test call asks whether the other phone heard it.
	app.Receive(ownFrame("asking"))
	tt.Frame()
	if !tt.HasText("那边听到提示音和那句话了吗？") || !tt.HasText("这边没听到电话里的声音：看看手机耳机那头的线，再把手机音量调大一点。") {
		t.Fatalf("the test's question: %q", tt.Texts())
	}
	if err := tt.Click("听到了"); err != nil {
		t.Fatal(err)
	}
	if f, ok := (*sent)[len(*sent)-1].(protocol.OwnPhoneAct); !ok || f.Action != "heard" || f.Heard == nil || !*f.Heard {
		t.Fatalf("Heard it sent %#v", (*sent)[len(*sent)-1])
	}
	// Live: the card says so and hangs up from here.
	app.Receive(ownFrame("live"))
	tt.Frame()
	if !tt.HasText("正在用你的手机打给鼎泰丰") || !tt.HasText("能用你的号码打了") {
		t.Fatalf("the live card: %q", tt.Texts())
	}
	if err := tt.Click("挂断"); err != nil {
		t.Fatal(err)
	}
	if f, ok := (*sent)[len(*sent)-1].(protocol.CallCancel); !ok || f.CallID != "call_1" {
		t.Fatalf("Hang up sent %#v", (*sent)[len(*sent)-1])
	}
}

func ownPlan() *protocol.CallPlan {
	return &protocol.CallPlan{To: "+862161234567", Name: "鼎泰丰", Goal: "问周六晚上 7 点还有没有 4 位的位子", Say: []string{"姓顾"}, Voice: "ducter", From: protocol.OwnPhone, Provider: protocol.OwnPhone,
		FromNumber: "+8613912345678", FromPhone: "Pixel 7", Minutes: 4, CostUSD: 0.8, PerMinUSD: 0.2, CalleeZone: "Asia/Shanghai"}
}

func TestOwnPhoneGoCard(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Route = RouteConversation
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 鼎泰丰？", GoLabel: "打过去", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: ownPlan()}}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, w := range []string{"你的号码 +86 139 1234 5678（Pixel 7）", "4 分钟 · 语音约 $0.80，话费走你的套餐"} {
		if !tt.HasText(w) {
			t.Errorf("the Go card lacks %q: %q", w, tt.Texts())
		}
	}
}

// The own-number card in each step, zh and en, for review:
//
//	DUCTER_SHOTS_DIR=../../../../.shots/own-number go test ./internal/views -run OwnPhoneShots
func TestOwnPhoneShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, step := range []string{"none", "allow", "voice", "asking", "passed", "live"} {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Receive(ownFrame(step))
			app.openTab(TabAccounts)
			tt := ui.NewTesterWith(app.View, 1280, 1500, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetScale(2)
			tt.Frame()
			tt.Advance(time.Second)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-own-%s-%s.png", step, lang)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
		app, _ := iaApp(t, lang)
		app.Route = RouteConversation
		pl := ownPlan()
		if lang == i18n.EN {
			pl.Name, pl.Goal, pl.Say = "Din Tai Fung", "Ask whether they have a table for 4 at 7 pm on Saturday", []string{"Gu"}
		}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339), "default", "channel", "partner", protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "打给 " + pl.Name + "？", GoLabel: "打过去", DefaultOption: "hold", Call: &protocol.CallAsk{CallID: "call_1", Kind: "go", Plan: pl}}),
		}})
		tt := ui.NewTesterWith(app.View, 1280, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.Frame()
		f, _ := os.Create(filepath.Join(dir, fmt.Sprintf("mac-own-gocard-%s.png", lang)))
		_ = png.Encode(f, tt.Image())
		f.Close()
	}
}
