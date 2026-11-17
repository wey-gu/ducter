package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D323: the partner's own Apple ID as a guided setup, with its checks, the
// honest comparison, and the Mac that carries iMessage elsewhere.

func TestIMessageSetupStepsAndTheCheck(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StateOff, Automation: true, Disk: true})
	app, tt := imessageApp(t, i18n.ZH, br)
	for _, want := range []string{
		"给小鸭注册一个 Apple ID。", "打开 account.apple.com", "在这台 Mac 上，让「信息」登录小鸭的 Apple ID。", "检查",
		"让这台 Mac 一直开着，Ducter 也开着。", "点「连上」，再用你的手机给小鸭的 Apple ID 发一串数字。",
		"现在就能用。但每句话在对话里都会出现两遍，一遍是发出的，一遍是收到的：这是「信息」自己的样子，Ducter 改不了。",
	} {
		if !tt.HasText(want) {
			t.Fatalf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("检查"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if br.probed != 1 {
		t.Fatalf("check didn't ask Messages: %d", br.probed)
	}
	br.st.Checked, br.st.Account = true, "xiaoya.ducter@icloud.com"
	tt.Frame()
	if !tt.HasText("「信息」登录的是 xiaoya.ducter@icloud.com。") {
		t.Fatalf("account line: %q", tt.Texts())
	}
	br.st.ICloud = "Xiaoya.Ducter@icloud.com"
	tt.Frame()
	if !tt.HasText("「信息」登录的是 xiaoya.ducter@icloud.com，和这台 Mac 的 iCloud 是同一个 Apple ID。如果它是你自己的，先在「信息」里换成小鸭的。") {
		t.Fatalf("iCloud line: %q", tt.Texts())
	}
	br.st.Background, br.st.User = true, "xiaoya"
	tt.Frame()
	if !tt.HasText("从后台的用户发不出 iMessage。要用的话，让「xiaoya」这个用户在前台，或者用一台专给 Ducter 的 Mac。") {
		t.Fatalf("background line: %q", tt.Texts())
	}
	br.st.Background, br.st.Err, br.st.Checked = false, imessage.StateNotSigned, false
	tt.Frame()
	if !tt.HasText("这台 Mac 的「信息」还没登录 iMessage。") {
		t.Fatalf("not signed in: %q", tt.Texts())
	}
	// Message yourself has no steps.
	if err := tt.Click("给自己发信息"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if tt.HasText("给小鸭注册一个 Apple ID。") {
		t.Error("steps shown for Message yourself")
	}
	_ = app
}

func TestIMessagePairingSaysThePartnersAddressAndTheOneToOne(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StatePairing, Mode: imessage.ModePartner, Code: "482913", CodeUntil: time.Now().Add(9 * time.Minute), Account: "xiaoya.ducter@icloud.com", Automation: true, Disk: true})
	_, tt := imessageApp(t, i18n.ZH, br)
	if !tt.HasText("用你的手机给 xiaoya.ducter@icloud.com 发这串数字：") {
		t.Fatalf("code line: %q", tt.Texts())
	}
	br.st = imessage.Status{State: imessage.StateOn, Mode: imessage.ModePartner, Handle: "+86 138 0000 0000", Account: "xiaoya.ducter@icloud.com", Automation: true, Disk: true}
	tt.Frame()
	if !tt.HasText("小鸭用 xiaoya.ducter@icloud.com 和你一对一地聊。你在 iMessage 里说的也会出现在 Ducter 的对话里。") {
		t.Fatalf("linked line: %q", tt.Texts())
	}
}

func TestIMessageOwnAppleIDSeenByTheCodeStartsOverInMessageYourself(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StateOwnID, Mode: imessage.ModePartner, Automation: true, Disk: true})
	_, tt := imessageApp(t, i18n.ZH, br)
	if !tt.HasText("你发的数字出现在你和自己的对话里：这台 Mac 的「信息」登录的是你自己的 Apple ID。小鸭不会用你的身份说话；要继续，就改成「给自己发信息」，或者先让「信息」登录它自己的 Apple ID 再连。") {
		t.Fatalf("own line: %q", tt.Texts())
	}
	if err := tt.Click("改成给自己发信息"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if len(br.enabled) != 1 || br.enabled[0] != imessage.ModeSelf {
		t.Fatalf("enabled %v", br.enabled)
	}
}

func TestIMessageOnAnotherMacIsSaidAndNotOfferedHere(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StateOff, Automation: true, Disk: true})
	app, tt := imessageApp(t, i18n.ZH, br)
	app.Receive(protocol.ServerFrame{T: "channels", IMessageAt: []protocol.IMessageCarrier{{Computer: "Mac mini", State: "on"}}})
	tt.Frame()
	for _, want := range []string{"开着，在「Mac mini」上", "在「Mac mini」上收发", "经过「Mac mini」收发，那台 Mac 要开着。"} {
		if !tt.HasText(want) {
			t.Fatalf("no %q in %q", want, tt.Texts())
		}
	}
	if tt.HasText("连上") || tt.HasText("给小鸭注册一个 Apple ID。") {
		t.Error("setup offered while another Mac carries it")
	}
	// This Mac's own bridge, as the home echoes it, is not "elsewhere".
	app.Receive(protocol.ServerFrame{T: "channels", IMessageAt: []protocol.IMessageCarrier{{Computer: "MacBook Air", State: "on", Here: true}}})
	tt.Frame()
	if !tt.HasText("连上") {
		t.Error("this Mac's own echo hid Connect")
	}
}

// D323 shots, for review:
//
//	DUCTER_D323_SHOTS=1 DUCTER_SHOTS_DIR=/Users/weyl/dev/ducter/.shots/d323 go test ./internal/views -run D323Shots
func TestD323Shots(t *testing.T) {
	if os.Getenv("DUCTER_D323_SHOTS") == "" {
		t.Skip("DUCTER_D323_SHOTS not set")
	}
	dir := shotsDir(t)
	acct := "xiaoya.ducter@icloud.com"
	states := []struct {
		name string
		st   imessage.Status
		self bool
		at   []protocol.IMessageCarrier
	}{
		{"setup", imessage.Status{State: imessage.StateOff, Automation: true, Disk: true}, false, nil},
		{"checked", imessage.Status{State: imessage.StateOff, Automation: true, Disk: true, Checked: true, Account: acct}, false, nil},
		{"icloud", imessage.Status{State: imessage.StateOff, Automation: true, Disk: true, Checked: true, Account: "wey@example.com", ICloud: "wey@example.com"}, false, nil},
		{"background", imessage.Status{State: imessage.StateOff, Automation: true, Disk: true, Checked: true, Account: acct, Background: true, User: "xiaoya"}, false, nil},
		{"self", imessage.Status{State: imessage.StateOff, Automation: true, Disk: true}, true, nil},
		{"pairing", imessage.Status{State: imessage.StatePairing, Mode: imessage.ModePartner, Code: "482913", CodeUntil: time.Now().Add(9 * time.Minute), Account: acct, Automation: true, Disk: true}, false, nil},
		{"linked", imessage.Status{State: imessage.StateOn, Mode: imessage.ModePartner, Handle: "+86 138 0000 0000", Account: acct, Automation: true, Disk: true}, false, nil},
		{"own", imessage.Status{State: imessage.StateOwnID, Mode: imessage.ModePartner, Automation: true, Disk: true}, false, nil},
		{"elsewhere", imessage.Status{State: imessage.StateOff, Automation: true, Disk: true}, false, []protocol.IMessageCarrier{{Computer: "Mac mini", State: "on"}}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, s := range states {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Backend = &fakeBackend{}
			app.IMessage = (&fakeIMessage{}).set(s.st)
			app.imessage.self = s.self
			app.Receive(protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{{Kind: "telegram", State: "off"}, {Kind: "slack", State: "off"}}, IMessageAt: s.at})
			app.openTab(TabChats)
			tt := ui.NewTesterWith(app.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			for i := 0; i < 4; i++ {
				tt.Frame()
			}
			save(t, dir, fmt.Sprintf("mac-imessage-%s-%s.png", s.name, lang), tt)
		}
	}
}
