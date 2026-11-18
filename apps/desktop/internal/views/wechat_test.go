package views

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D301: WeChat in 设置 › 聊天软件 on the Mac: Connect puts up a QR, the scan
// says how far it got, WeChat's number goes back, and once linked the group
// says plainly what WeChat allows.

func fakeScan(step string) *protocol.ChannelScan {
	return &protocol.ChannelScan{QR: fakeQR(33), Link: "https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=qr-1&bot_type=3", Step: step, ExpiresAt: time.Now().Add(5 * time.Minute).UTC().Format(time.RFC3339)}
}

func TestWechatConnect(t *testing.T) {
	// The other two linked, so WeChat's 连上 is the page's only one.
	at := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	tg := protocol.ChannelView{Kind: "telegram", State: "linked", Bot: &protocol.ChannelBot{Name: "小鸭", Handle: "xiaoya_bot"}, Linked: &protocol.ChannelLinked{Name: "Wey", At: at}}
	sl := protocol.ChannelView{Kind: "slack", State: "linked", Bot: &protocol.ChannelBot{Name: "小鸭", Team: "Nowledge"}, Linked: &protocol.ChannelLinked{Name: "Wey", At: at}}
	app, sent, tt := chatsApp(t, i18n.ZH, []protocol.ChannelView{tg, sl, {Kind: "wechat", State: "off"}})
	for _, want := range []string{"微信", "用微信自己的 ClawBot 连", "断开微信"} {
		if want == "断开微信" {
			if tt.HasText(want) {
				t.Errorf("%q shown before connecting", want)
			}
			continue
		}
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	if !hasTextLike(tt.Texts(), "Ducter 不登录你的微信") {
		t.Errorf("the honest line is missing: %q", tt.Texts())
	}
	// D364: it rests as its row until 设置 opens the steps.
	if tt.HasText("连上") {
		t.Errorf("the steps are open before 设置: %q", tt.Texts())
	}
	if err := tt.Click("设置，微信"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("连上"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, ok := lastSent[protocol.ChannelConnectReq](*sent); !ok || r.Kind != "wechat" || r.Token != "" {
		t.Fatalf("Connect sent %#v", r)
	}
	app.Receive(protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{tg, sl, {Kind: "wechat", State: "scan", Scan: fakeScan("wait")}}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"等你用微信扫码", "不连了"} {
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	app.Receive(protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{tg, sl, {Kind: "wechat", State: "scan", Scan: fakeScan("verify")}}})
	tt.Frame()
	tt.Frame()
	if !tt.HasText("微信里显示的数字") {
		t.Errorf("no field for WeChat's number: %q", tt.Texts())
	}
	if err := tt.Click("不连了"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, ok := lastSent[protocol.ChannelOpReq](*sent); !ok || r.T != "channel_forget" || r.Kind != "wechat" {
		t.Errorf("Cancel sent %#v", r)
	}
}

func TestWechatLinked(t *testing.T) {
	at := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	_, _, tt := chatsApp(t, i18n.EN, []protocol.ChannelView{{Kind: "telegram", State: "off"}, {Kind: "slack", State: "off"},
		{Kind: "wechat", State: "linked", Bot: &protocol.ChannelBot{Name: "ClawBot"}, Linked: &protocol.ChannelLinked{At: at}, OpenUntil: time.Now().Add(20 * time.Hour).UTC().Format(time.RFC3339)}})
	for _, want := range []string{"WeChat", "Waiting for you in WeChat's ClawBot", "Linked to your WeChat", "It can reach you in WeChat now", "Disconnect WeChat"} {
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	if !hasTextLike(tt.Texts(), "There are no buttons in WeChat") {
		t.Errorf("the rule is missing: %q", tt.Texts())
	}
	_, _, tt = chatsApp(t, i18n.EN, []protocol.ChannelView{{Kind: "telegram", State: "off"}, {Kind: "slack", State: "off"}, {Kind: "wechat", State: "off", Reason: "expired"}})
	if !hasTextLike(tt.Texts(), "The QR code ran out") {
		t.Errorf("an expired scan isn't said: %q", tt.Texts())
	}
}

// D301: WeChat's group pictured in each state, zh and en, for review:
//
//	DUCTER_CHATS_SHOTS=1 DUCTER_SHOTS_DIR=../../../../.shots/d301 go test ./internal/views -run WechatShots
func TestWechatShots(t *testing.T) {
	if os.Getenv("DUCTER_CHATS_SHOTS") == "" {
		t.Skip("DUCTER_CHATS_SHOTS not set")
	}
	dir := shotsDir(t)
	at := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	tg := protocol.ChannelView{Kind: "telegram", State: "off"}
	sl := protocol.ChannelView{Kind: "slack", State: "off"}
	states := map[string]protocol.ChannelView{
		"off":     {Kind: "wechat", State: "off"},
		"scan":    {Kind: "wechat", State: "scan", Scan: fakeScan("wait")},
		"scanned": {Kind: "wechat", State: "scan", Scan: fakeScan("scanned")},
		"verify":  {Kind: "wechat", State: "scan", Scan: fakeScan("verify")},
		"linked":  {Kind: "wechat", State: "linked", Bot: &protocol.ChannelBot{Name: "ClawBot"}, Linked: &protocol.ChannelLinked{At: at}, OpenUntil: time.Now().Add(20 * time.Hour).UTC().Format(time.RFC3339)},
		"closed":  {Kind: "wechat", State: "linked", Bot: &protocol.ChannelBot{Name: "ClawBot"}, Linked: &protocol.ChannelLinked{At: at}},
		"expired": {Kind: "wechat", State: "off", Reason: "expired"},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for name, v := range states {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Backend = &fakeBackend{}
			app.IMessage = (&fakeIMessage{}).set(imessage.Status{State: imessage.StateOff, Automation: true, Disk: true})
			app.Receive(protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{tg, sl, v}, SlackManifest: "{}"})
			app.openTab(TabChats)
			for _, w := range []int{1280, 900} {
				tt := ui.NewTesterWith(app.View, w, 2300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
				}
				save(t, dir, fmt.Sprintf("mac-wechat-%s-%d-%s.png", name, w, lang), tt)
			}
		}
	}
}

func hasTextLike(texts []string, part string) bool {
	for _, s := range texts {
		if strings.Contains(s, part) {
			return true
		}
	}
	return false
}
