package views

import (
	"context"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
)

type fakeIMessage struct {
	st      imessage.Status
	enabled []imessage.Mode
	probed  int
	off     int
	mode    imessage.Mode
}

func (f *fakeIMessage) Status() imessage.Status { return f.st }
func (f *fakeIMessage) Enable(_ context.Context, m imessage.Mode) error {
	f.enabled = append(f.enabled, m)
	f.st = imessage.Status{State: imessage.StatePairing, Mode: m, Code: "482913", CodeUntil: time.Now().Add(10 * time.Minute), Automation: true, Disk: true}
	return nil
}
func (f *fakeIMessage) NewCode() string                     { return "111111" }
func (f *fakeIMessage) SetMode(m imessage.Mode)             { f.mode = m }
func (f *fakeIMessage) Disable()                            { f.off++; f.st = imessage.Status{State: imessage.StateOff} }
func (f *fakeIMessage) Probe(context.Context) error         { f.probed++; return nil }
func (f *fakeIMessage) Kick()                               {}
func (f *fakeIMessage) set(s imessage.Status) *fakeIMessage { f.st = s; return f }

func imessageApp(t *testing.T, lang i18n.Lang, br *fakeIMessage) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.Receive(settingsFrame())
	app.Backend = &fakeBackend{}
	app.IMessage = br
	app.openTab(TabChats)
	tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	return app, tt
}

// D277: off, Settings offers whose Apple ID and Connect; Connect starts
// linking in the mode chosen, and the code shows with the two permissions.
func TestIMessageConnectShowsTheCodeAndThePermissions(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StateOff, Automation: true, Disk: true})
	_, tt := imessageApp(t, i18n.ZH, br)
	for _, want := range []string{"iMessage", "小鸭自己的 Apple ID（推荐）", "给自己发信息", "连上"} {
		if !tt.HasText(want) {
			t.Fatalf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("给自己发信息"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("连上"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	if len(br.enabled) != 1 || br.enabled[0] != imessage.ModeSelf {
		t.Fatalf("enabled %v", br.enabled)
	}
	for _, want := range []string{"用你的手机给自己发这串数字：", "482913", "完全磁盘访问权限", "自动化 › 信息"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
}

// Each state says itself in words; a missing permission opens its pane.
func TestIMessageStatesInWords(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StateNeedsDisk, Mode: imessage.ModePartner, Handle: "+8613800000000", Automation: true, Disk: false})
	app, tt := imessageApp(t, i18n.EN, br)
	if !tt.HasText("Allow") || !tt.HasText("One permission to go") {
		t.Fatalf("needs disk: %q", tt.Texts())
	}
	br.set(imessage.Status{State: imessage.StateOn, Mode: imessage.ModePartner, Handle: "+8613800000000", Automation: true, Disk: true, Stranger: time.Now()})
	tt.Frame()
	if !tt.HasText("Connected · +8613800000000") || !tt.HasText("Someone else wrote to 小鸭 in iMessage. It didn't answer, and kept nothing of theirs.") {
		t.Fatalf("on: %q", tt.Texts())
	}
	br.set(imessage.Status{State: imessage.StateOwnID, Mode: imessage.ModePartner, Handle: "+8613800000000", Automation: true, Disk: true})
	tt.Frame()
	if err := tt.Click("Switch to Message yourself"); err != nil {
		t.Fatalf("%v: %q", err, tt.Texts())
	}
	if br.mode != imessage.ModeSelf {
		t.Error("the switch did nothing")
	}
	_ = app
}

// D283: iMessage lives on Chat apps, as the third group, and no longer on
// Notifications; a chat app's name shows once (its group's first row).
func TestIMessageOnChatApps(t *testing.T) {
	br := (&fakeIMessage{}).set(imessage.Status{State: imessage.StateOff, Automation: true, Disk: true})
	app, tt := imessageApp(t, i18n.ZH, br)
	if !tt.HasText("iMessage") || !tt.HasText("经过这台 Mac 收发，这台 Mac 要开着。") {
		t.Fatalf("no iMessage on Chat apps: %q", tt.Texts())
	}
	n := 0
	for _, s := range tt.Texts() {
		if s == "iMessage" {
			n++
		}
	}
	if n > 2 { // the visible name and the group's accessible label
		t.Errorf("iMessage named %d times: %q", n, tt.Texts())
	}
	app.openTab(TabNotify)
	tt.Frame()
	tt.Frame()
	if tt.HasText("iMessage") {
		t.Errorf("iMessage still on Notifications: %q", tt.Texts())
	}
}
