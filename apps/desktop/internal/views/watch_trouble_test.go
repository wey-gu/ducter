package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D402: an app the watch stopped by itself says so on its row and in its
// detail, never a silent "watching" (hel: Discord read nothing for a week).
func TestWatchTroubleSaidOnTheRow(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		L := i18n.New(lang)
		app.Status = client.Connected
		f := settingsFrame()
		f.Settings.Proactive = "three"
		app.Receive(f)
		look := acctLook()
		look.Apps = append(look.Apps,
			protocol.AppWatch{Service: "discordbot", Title: "Discord Bot", Account: "wey", Watch: true, Trouble: "unsupported"},
			protocol.AppWatch{Service: "gmail", Title: "Gmail", Account: "old@example.com", Watch: true, Trouble: "reconnect"},
		)
		app.Receive(protocol.ServerFrame{T: "connections", Oo: &protocol.OoDetect{Installed: true, Account: true}, Connections: []protocol.ConnectionView{
			{ID: "c1", Name: "OOMOL", Source: "oomol", Via: "oomol", State: "ok", Look: look},
		}})
		app.openTab(TabAccounts)
		tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		for _, want := range []string{L.T("tile.trouble.unsupported"), L.T("tile.trouble.reconnect")} {
			if !tt.HasText(want) {
				t.Errorf("%s: no row state %q in %q", lang, want, tt.Texts())
			}
		}
		// The bot's detail says why, and not the mentions line it can't keep.
		app.cards().tile["c1"] = "discordbot:wey"
		tt.Frame()
		if !tt.HasText(L.T("tile.trouble.unsupported.chat")) {
			t.Errorf("%s: no unsupported note", lang)
		}
		if tt.HasText(L.T("tile.mentions")) {
			t.Errorf("%s: the mentions line beside a watch that can't read them", lang)
		}
		// The account to connect again: its note names the place, and the link opens it.
		app.cards().tile["c1"] = "gmail:old@example.com"
		tt.Frame()
		if !tt.HasText(L.T("tile.trouble.reconnect.note", "OOMOL")) {
			t.Errorf("%s: no reconnect note in %q", lang, tt.Texts())
		}
		if !tt.HasText(L.T("tile.trouble.reconnect.go", "OOMOL")) {
			t.Errorf("%s: no reconnect link", lang)
		}
		_ = sent
	}
}
