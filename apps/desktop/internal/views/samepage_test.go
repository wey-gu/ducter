package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D187, the author's Settings › 更新和关于 at 00:48 on 2026-11-11: the top
// card said 现在还查不到新版本 (the app's own check, refused by GitHub's
// rate limit), and the same page's 各台电脑上的 Ducter said this Mac, a
// worker of hel renamed "Macbook Pro M3", 有新版本 0.0.13. One page, two
// answers. Now the home's answer reaches the app's updater, and this Mac's
// row is itself the way to update, found by the worker's device id even
// when neither name matches any more.
func TestThisMacsRowAndTheTopCardAgree(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, _ := iaApp(t, lang)
		app.LocaleFixed = true
		app.URL = "wss://hel.example/ws"
		app.ThisComputer = "Weys-MacBook-Pro" // the Mac's host name, renamed since it paired
		app.MacWorker = &macWorkOn{on: true}  // worker.json: dev_mac
		up := &fakeUpdates{st: update.Status{State: update.NoFeed, Current: "0.0.12"}}
		app.Updates = up
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
			{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake, Version: "0.0.13",
				Update: &protocol.DeviceUpdate{Current: "0.0.13", Latest: "0.0.13", How: "self"}},
			{ID: "dev_mac", Name: "Macbook Pro M3", Computer: "Siweis-MacBook-Pro", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64", Version: "0.0.12",
				Update: &protocol.DeviceUpdate{Current: "0.0.12", Latest: "0.0.13", Available: true, How: "app"}},
		}})
		app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{}})
		if len(up.hints) == 0 || up.hints[len(up.hints)-1] != "0.0.13" {
			t.Fatalf("%s: the home's 0.0.13 never reached the app's updater: %v", lang, up.hints)
		}
		app.openTab(TabAbout)
		tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		if tt.HasText(L.T("devup.how.app", "Macbook Pro M3")) {
			t.Errorf("%s: this Mac told to open Ducter on that Mac: %q", lang, tt.Texts())
		}
		if _, ok := tt.Find(L.T("devup.button") + " · Macbook Pro M3"); !ok {
			t.Errorf("%s: this Mac's 有新版本 row has no %s: %q", lang, L.T("devup.button"), tt.Texts())
		}
	}
}
