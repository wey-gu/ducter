package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D276: 设置 › 聊天软件 on the Mac: Telegram linked, Slack not connected yet
// (its steps and the manifest), and a code for an unlinked bot.

func chatsApp(t *testing.T, lang i18n.Lang, channels []protocol.ChannelView) (*App, *[]any, *ui.Tester) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "channels", Channels: channels, SlackManifest: `{"display_information":{"name":"Ducter"}}`})
	app.openTab(TabChats)
	tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, sent, tt
}

func TestChatsPanel(t *testing.T) {
	at := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	_, sent, tt := chatsApp(t, i18n.EN, []protocol.ChannelView{
		{Kind: "telegram", State: "linked", Bot: &protocol.ChannelBot{Name: "Ducter", Handle: "my_ducter_bot"}, Linked: &protocol.ChannelLinked{Name: "Wey", At: at}},
		{Kind: "slack", State: "off"},
	})
	for _, want := range []string{"Chat apps", "Ducter · @my_ducter_bot", "Linked: Wey", "Telegram keeps a copy of your chats.", "This workspace's admins may be able to see what's said here.", "Copy this", "Unlink", "Disconnect Telegram"} {
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	if _, ok := lastSent[protocol.ChannelsReq](*sent); !ok {
		t.Errorf("the panel didn't ask for the chat apps: %#v", *sent)
	}
	if err := tt.Click("Unlink"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, ok := lastSent[protocol.ChannelOpReq](*sent); !ok || r.T != "channel_unlink" || r.Kind != "telegram" {
		t.Errorf("Unlink sent %#v", r)
	}
}

func TestChatsCode(t *testing.T) {
	app, sent, tt := chatsApp(t, i18n.ZH, []protocol.ChannelView{
		{Kind: "telegram", State: "unlinked", Bot: &protocol.ChannelBot{Name: "Ducter", Handle: "my_ducter_bot"}},
		{Kind: "slack", State: "off"},
	})
	if err := tt.Click("让我的账号连上"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if r, ok := lastSent[protocol.ChannelOpReq](*sent); !ok || r.T != "channel_code" {
		t.Fatalf("no code asked: %#v", r)
	}
	app.Receive(protocol.ServerFrame{T: "channel_result", ChannelKind: "telegram", Op: "code", OK: true, Code: "K7QM-4XPA", Link: "https://t.me/my_ducter_bot?start=K7QM4XPA", ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"在 Telegram 里打开", "K7QM-4XPA"} {
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
}
