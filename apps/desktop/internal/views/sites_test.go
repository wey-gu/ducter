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
	if err := tt.Click("这是做什么的，上网"); err != nil {
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

// D505 (rev.): with a Mac whose 上网 is the person's own Chrome, the empty
// line says the ask that comes first; 直接用你的 Chrome lists the sites said
// yes to, one compact line each on the head's left edge, with a quiet 移除
// that keeps the others.
func TestServerChromeSites(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		app.Status = client.Connected
		f := serverWith(protocol.DeviceAbility{ID: "web", State: "on", Where: "ducter", Detail: "157.0.8103.38"})
		f.Devices[0].Name = "hel"
		f.Devices = append(f.Devices, protocol.DeviceView{ID: "dev_mac", Name: "MacBook", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64",
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "chrome"}}})
		app.Receive(f)
		app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Memory: true, Notify: true, DefaultAfterMin: 30, ChromeSites: []string{"jd.com", "github.com"}}})
		app.OpenDevices()
		app.devState().ability = protocol.AbilityWeb
		tt := ui.NewTesterWith(app.View, 1100, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.Frame()
		tt.Frame()
		info := map[i18n.Lang]string{i18n.ZH: "这是做什么的，上网", i18n.EN: "What this does, Browse"}[lang]
		if err := tt.Click(info); err != nil {
			t.Fatalf("%s: %v %q", lang, err, tt.Texts())
		}
		tt.Frame()
		app.Receive(protocol.ServerFrame{T: "browser_sites", Ready: true})
		tt.Frame()
		tt.Frame()
		want := map[i18n.Lang][]string{
			i18n.ZH: {"还没有。任务要登录哪个网站，会先问你：换到 MacBook 上你已登录的 Chrome 接着做，还是在这里登录。", "直接用你的 Chrome", "jd.com", "github.com", "移除"},
			i18n.EN: {"None yet. When a task needs you signed in to a site, it asks first: carry on in your Chrome on MacBook, where you're signed in, or sign in here.", "Straight to your Chrome", "jd.com", "Remove"},
		}[lang]
		for _, w := range want {
			if !tt.HasText(w) {
				t.Errorf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		shoot(t, tt, "mac-sites-chrome-"+string(lang)+".png")
		if err := tt.Click(map[i18n.Lang]string{i18n.ZH: "移除", i18n.EN: "Remove"}[lang]); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		req, ok := lastSent[protocol.SettingsSet](*sent)
		if !ok || req.Patch.ChromeSites == nil || len(*req.Patch.ChromeSites) != 1 || (*req.Patch.ChromeSites)[0] != "github.com" {
			t.Errorf("%s: 移除 sent %#v", lang, *sent)
		}
	}
}
