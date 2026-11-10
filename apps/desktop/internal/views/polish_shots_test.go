package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// polishLook is an OOMOL Hosted source shaped like a real one: two Gmail
// accounts whose local parts say little, two Slack workspaces, Discord, and
// a WeCom bot the person said not to read.
func polishConn() protocol.ConnectionView {
	ago := time.Now().Add(-4 * time.Minute).UTC().Format(time.RFC3339)
	return protocol.ConnectionView{ID: "h1", Name: "OOMOL", Source: "oomol", Via: "manual", State: "ok", Look: &protocol.SourceLook{Watching: false, Apps: []protocol.AppWatch{
		{Service: "gmail", Title: "Gmail", Account: "w@nowledge-labs.ai", Watch: true, LastReadAt: ago},
		{Service: "gmail", Title: "Gmail", Account: "weyl.gu@gmail.com", Watch: true},
		{Service: "discord", Title: "Discord", Account: "wey", Watch: true},
		{Service: "slack", Title: "Slack", Account: "Nowledge Labs, Inc", Watch: true},
		{Service: "slack", Title: "Slack", Account: "nowledge-community", Watch: true},
		{Service: "wecom_bot", Title: "WeCom bot", Account: "wecom-sales-bot", Watch: false, Excluded: true},
	}}}
}

// polishConnBefore is the same source as the server sent it before the
// titles fix: each tile titled by the first account's display name.
func polishConnBefore() protocol.ConnectionView {
	cv := polishConn()
	titles := map[string]string{"gmail": "w-nowledge-mail", "slack": "nowledge-labs-inc", "discord": "wey", "wecom_bot": "wecom-sales-bot"}
	for i := range cv.Look.Apps {
		cv.Look.Apps[i].Title = titles[cv.Look.Apps[i].Service]
	}
	return cv
}

// Before/after shots of the accounts card (DUCTER_SHOTS=1):
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/polish go test ./internal/views -run PolishAccountsShots
func TestPolishAccountsShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	tag := os.Getenv("DUCTER_SHOTS_TAG")
	if tag == "" {
		tag = "after"
	}
	shot := func(app *App, name string, w, h int) {
		tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := map[i18n.Lang]string{i18n.ZH: "zh", i18n.EN: "en"}[lang]
		mk := func(tile string) *App {
			app, _ := iaApp(t, lang)
			app.Status = client.Connected
			f := settingsFrame()
			f.Settings.Proactive = "off"
			app.Receive(f)
			conn := polishConn()
			if tag == "before" {
				conn = polishConnBefore()
			}
			app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{conn}})
			app.openTab(TabAccounts)
			if tile != "" {
				app.cards().tile["h1"] = tile
			}
			return app
		}
		shot(mk("slack:Nowledge Labs, Inc"), fmt.Sprintf("mac-accounts-slack-%s-%s", tag, l), 1280, 1300)
		shot(mk("gmail:w@nowledge-labs.ai"), fmt.Sprintf("mac-accounts-gmail-%s-%s", tag, l), 1280, 1300)
		shot(mk("wecom_bot:wecom-sales-bot"), fmt.Sprintf("mac-accounts-excluded-%s-%s", tag, l), 1280, 1300)
		shot(mk(""), fmt.Sprintf("mac-accounts-closed-%s-%s", tag, l), 1280, 1000)
		shot(mk("slack:Nowledge Labs, Inc"), fmt.Sprintf("mac-accounts-narrow-%s-%s", tag, l), 760, 1300)
	}
}
