package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D151: 上网 on a server in Devices: getting ready, the one command when
// libraries are missing, and 已登录的网站 / Signed-in sites with 退出.
func serverWith(web protocol.DeviceAbility) protocol.ServerFrame {
	return protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
		ID: "local", Name: "hetzner-1", Kind: "server", Home: true, State: protocol.DeviceAwake,
		Abilities: []protocol.DeviceAbility{web, {ID: "computer", State: "later"}, {ID: "remote", State: "on"}},
	}}, Reach: &protocol.Reach{}}
}

func devicesApp(t *testing.T, lang i18n.Lang, web protocol.DeviceAbility) (*App, *[]any, *ui.Tester) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Receive(serverWith(web))
	app.OpenDevices()
	app.devState().ability = protocol.AbilityWeb
	tt := ui.NewTesterWith(app.View, 1100, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetScale(2)
	tt.Frame()
	tt.Frame()
	return app, sent, tt
}

func TestServerBrowseTheWeb(t *testing.T) {
	// Getting ready: one line, no "can't add here".
	_, _, tt := devicesApp(t, i18n.ZH, protocol.DeviceAbility{ID: "web", State: "on", Where: "ducter", Setup: "installing"})
	if !tt.HasText("正在安装浏览器……第一次要下载一会儿") || tt.HasText("这台还装不了") {
		t.Errorf("installing: %q", tt.Texts())
	}

	// Missing libraries (not root): the command and Try again, which adds it again.
	_, sent, tt := devicesApp(t, i18n.EN, protocol.DeviceAbility{ID: "web", State: "unavailable", Reason: "browser_deps", Where: "ducter", Detail: "sudo apt-get install -y --no-install-recommends libnss3"})
	if !tt.HasText("sudo apt-get install -y --no-install-recommends libnss3") || !tt.HasText("Chrome needs a few system libraries this device doesn't have yet. Run this line on it once, then try again.") {
		t.Errorf("deps: %q", tt.Texts())
	}
	if err := tt.Click("Try again"); err != nil {
		t.Fatal(err)
	}
	if req, ok := lastSent[protocol.AbilityReq](*sent); !ok || !req.On || req.Ability != "web" {
		t.Errorf("Try again sent %#v", *sent)
	}

	// Ready: the sites signed in to, each with Sign out; Clear all asks first.
	app, sent, tt := devicesApp(t, i18n.ZH, protocol.DeviceAbility{ID: "web", State: "on", Where: "ducter", Detail: "157.0.8103.38"})
	// D161: Try it and the sites are in 上网's ⓘ, one tap away.
	if err := tt.Click("这是做什么的 · 上网"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	if req, ok := lastSent[protocol.BrowserSitesReq](*sent); !ok || req.T != "browser_sites" {
		t.Fatalf("the sites weren't asked for: %#v", *sent)
	}
	app.Receive(protocol.ServerFrame{T: "browser_sites", Ready: true, Sites: []protocol.SiteView{
		{Site: "github.com", SignedInAt: "2026-11-10T01:00:00Z", Cookies: 6},
		{Site: "appstoreconnect.apple.com", SignedInAt: "2026-11-09T08:00:00Z", Cookies: 0},
	}})
	tt.Frame()
	for _, want := range []string{"已登录的网站", "github.com", "网站那边已经退出了", "全部清除", "让这台电脑用 Ducter 自己的浏览器替你上网：查资料、看网页、整理找到的东西。它和你自己的 Chrome 分开。要登录的网站由你自己登录，提交和付款都留给你。"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	shoot(t, tt, "desktop-sites-zh.png")
	// The first 退出 is github.com's row.
	if err := tt.Click("退出"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if req, ok := lastSent[protocol.BrowserSitesReq](*sent); !ok || req.T != "browser_site_signout" || req.Site != "github.com" {
		t.Errorf("退出 sent %#v", *sent)
	}
	if err := tt.Click("全部清除"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText("清除以后，这些网站都要你重新登录。") {
		t.Fatalf("Clear all doesn't ask first: %q", tt.Texts())
	}
	if err := tt.Click("清除"); err != nil {
		t.Fatal(err)
	}
	if req, ok := lastSent[protocol.BrowserSitesReq](*sent); !ok || req.T != "browser_sites_clear" {
		t.Errorf("清掉 sent %#v", *sent)
	}
}
