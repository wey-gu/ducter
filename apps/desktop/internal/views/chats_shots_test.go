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
	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D283: Settings › 聊天软件 / Chat apps pictured in each state, Telegram,
// Slack and iMessage, for review:
//
//	DUCTER_CHATS_SHOTS=1 DUCTER_SHOTS_DIR=../../../../.shots/d283/after go test ./internal/views -run ChatsShots
//
// and against a demo core (the states it really has):
//
//	DUCTER_SHELL_URL=ws://127.0.0.1:7831/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=… go test ./internal/views -run ChatsLiveShots
func TestChatsShots(t *testing.T) {
	if os.Getenv("DUCTER_CHATS_SHOTS") == "" {
		t.Skip("DUCTER_CHATS_SHOTS not set")
	}
	dir := shotsDir(t)
	at := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	manifest := "{\n  \"display_information\": { \"name\": \"小鸭\" },\n  \"features\": { \"bot_user\": { \"display_name\": \"小鸭\" } },\n  \"settings\": { \"socket_mode_enabled\": true }\n}"
	states := map[string][]protocol.ChannelView{
		"off": {{Kind: "telegram", State: "off"}, {Kind: "slack", State: "off"}},
		"linked": {
			{Kind: "telegram", State: "linked", Bot: &protocol.ChannelBot{Name: "小鸭", Handle: "xiaoya_bot"}, Linked: &protocol.ChannelLinked{Name: "Wey", At: at}},
			{Kind: "slack", State: "unlinked", Bot: &protocol.ChannelBot{Name: "小鸭", Team: "Nowledge"}},
		},
		"bad": {
			{Kind: "telegram", State: "cant_connect", Reason: "token"},
			{Kind: "slack", State: "cant_connect", Reason: "network", Bot: &protocol.ChannelBot{Name: "小鸭", Team: "Nowledge"}},
		},
	}
	ims := map[string]imessage.Status{
		"off":    {State: imessage.StateOff, Automation: true, Disk: true},
		"linked": {State: imessage.StateOn, Mode: imessage.ModePartner, Handle: "+86 138 0000 0000", Automation: true, Disk: true},
		"bad":    {State: imessage.StateNeedsDisk, Mode: imessage.ModePartner, Automation: false, Disk: false},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, name := range []string{"off", "linked", "bad"} {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Backend = &fakeBackend{}
			app.IMessage = (&fakeIMessage{}).set(ims[name])
			app.Receive(protocol.ServerFrame{T: "channels", Channels: states[name], SlackManifest: manifest})
			if name == "linked" {
				app.Receive(protocol.ServerFrame{T: "channel_result", ChannelKind: "slack", Op: "code", OK: true, Code: "K7QM-4XPA", ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
			}
			app.openTab(TabChats)
			tt := ui.NewTesterWith(app.View, 1280, 1900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			for i := 0; i < 4; i++ {
				tt.Frame()
			}
			save(t, dir, fmt.Sprintf("mac-chats-%s-%s.png", name, lang), tt)
			if name == "linked" {
				app.openTab(TabNotify)
				for i := 0; i < 4; i++ {
					tt.Frame()
				}
				save(t, dir, fmt.Sprintf("mac-notify-%s.png", lang), tt)
			}
		}
	}
}

func save(t *testing.T, dir, name string, tt *ui.Tester) {
	t.Helper()
	f, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func TestChatsLiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.app.openTab(TabChats)
	h.until("the chat apps", func() bool { return h.app.S.Channels != nil })
	for _, sz := range [][2]int{{1280, 820}, {900, 1100}} {
		h.tt.SetSize(sz[0], sz[1])
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		save(t, dir, fmt.Sprintf("mac-chats-live-%d-%s.png", sz[0], lang), h.tt)
	}
}
