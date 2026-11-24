package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D531: Slack's setup walked as Slack is today, state by state: the four
// steps, the code with 在 Slack 里打开 / Open in Slack, linked, and the one
// line that asks an older app for a reinstall.
//
//	DUCTER_SLACK_SHOTS=1 DUCTER_SHOTS_DIR=/Users/weyl/dev/ducter/.shots/slack-setup go test ./internal/views -run SlackSetupShots

const slackShotManifest = "{\n  \"display_information\": { \"name\": \"Ducter\" },\n  \"features\": { \"bot_user\": { \"display_name\": \"Ducter\" } },\n  \"oauth_config\": { \"scopes\": { \"bot\": [\"app_mentions:read\", \"chat:write\", \"chat:write.customize\"] } },\n  \"settings\": { \"socket_mode_enabled\": true, \"token_rotation_enabled\": false }\n}"

func slackSetupApp(t *testing.T, lang i18n.Lang, dark bool, w, h int, state string) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Receive(settingsFrame())
	app.Backend = &fakeBackend{}
	at := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	bot := &protocol.ChannelBot{Name: "Ducter", Team: "Nowledge Labs"}
	var v protocol.ChannelView
	switch state {
	case "steps":
		v = protocol.ChannelView{Kind: "slack", State: "off"}
	case "unlinked", "code":
		v = protocol.ChannelView{Kind: "slack", State: "unlinked", Bot: bot}
	case "linked":
		v = protocol.ChannelView{Kind: "slack", State: "linked", Bot: bot, Linked: &protocol.ChannelLinked{Name: "Wey Gu", At: at}}
	case "reinstall":
		v = protocol.ChannelView{Kind: "slack", State: "linked", Bot: bot, Linked: &protocol.ChannelLinked{Name: "Wey Gu", At: at}, Reinstall: true}
	}
	app.Receive(protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{v, {Kind: "telegram", State: "off"}, {Kind: "wechat", State: "off"}}, SlackManifest: slackShotManifest})
	if state == "code" {
		app.Receive(protocol.ServerFrame{T: "channel_result", ChannelKind: "slack", Op: "code", OK: true, Code: "ZH5J-ZRVD", Link: "https://slack.com/app_redirect?app=A0DUCTER&team=T0NOWLEDGE", ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
	}
	app.openTab(TabChats)
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}, Dark: dark})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	if state == "steps" {
		app.chats.open["slack"] = true
	}
	for i := 0; i < 4; i++ {
		tt.Frame()
	}
	return app, tt, sent
}

// The steps say Slack's own names in Slack's order, the code comes with a
// way into the app's messages, and an older app is asked to reinstall.
func TestSlackSetupWalk(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		_, tt, _ := slackSetupApp(t, lang, false, 1400, 1600, "steps")
		for _, k := range []string{"chats.sl.step2", "chats.sl.step3", "chats.sl.step3.skip", "chats.sl.step4", "chats.sl.face"} {
			if !tt.HasText(L.T(k)) {
				t.Errorf("%s: steps miss %s", lang, k)
			}
		}
		_, tt, _ = slackSetupApp(t, lang, false, 1400, 1200, "unlinked")
		if err := tt.Click(L.T("chats.code.get")); err != nil {
			t.Errorf("%s: %v", lang, err)
		}
		_, tt, _ = slackSetupApp(t, lang, false, 1400, 1200, "code")
		for _, s := range []string{"ZH5J-ZRVD", L.T("chats.sl.open.dm"), L.T("chats.sl.find", "Ducter")} {
			if !tt.HasText(s) {
				t.Errorf("%s: the code misses %q", lang, s)
			}
		}
		_, tt, _ = slackSetupApp(t, lang, false, 1400, 1200, "reinstall")
		if !tt.HasText(L.T("chats.sl.re.title")) {
			t.Errorf("%s: no reinstall line", lang)
		}
	}
}

func TestSlackSetupShots(t *testing.T) {
	if os.Getenv("DUCTER_SLACK_SHOTS") == "" {
		t.Skip("DUCTER_SLACK_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, mode := range []string{"light", "dark"} {
			for i, state := range []string{"steps", "unlinked", "code", "linked", "reinstall"} {
				_, tt, _ := slackSetupApp(t, lang, mode == "dark", 1400, 1500, state)
				save(t, dir, fmt.Sprintf("mac-1400-%s-%s-%02d-%s.png", lang, mode, i, state), tt)
			}
		}
	}
}
