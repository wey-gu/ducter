package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D415: hel, a Linux worker, with Antigravity in each of its states.
func helWith(agy protocol.DeviceHarness) protocol.DeviceView {
	agy.Harness = "antigravity"
	return protocol.DeviceView{ID: "hel", Name: "hel", Kind: "server", State: protocol.DeviceAwake, Platform: "linux-x64", Harnesses: []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true},
		{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true},
		agy,
	}}
}

var (
	agyAppOnly = protocol.DeviceHarness{Installable: true, Trouble: &protocol.AgentTrouble{Kind: "app_only", App: "Antigravity"}}
	agyTooOld  = protocol.DeviceHarness{Installable: true, Version: "1.4.9", Trouble: &protocol.AgentTrouble{Kind: "too_old", Need: "1.5.0"}}
	agyBroken  = protocol.DeviceHarness{Installable: true, Trouble: &protocol.AgentTrouble{Kind: "broken"}}
	agySignIn  = protocol.DeviceHarness{Installed: true, Version: "1.5.13", How: "installer", Login: &protocol.AgentLoginState{State: "waiting", URL: "https://accounts.google.com/o/oauth2/v2/auth?client_id=demo", Paste: true}}
)

// The row says what is really there, and its one button says what it does.
func TestAntigravityRow(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Now = func() time.Time { return lendNow }
	if got := harnessName("antigravity"); got != "Antigravity" {
		t.Fatalf("name %q", got)
	}
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	show := func(h protocol.DeviceHarness) {
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), helWith(h)}})
		app.Route = RouteDevices
		app.devState().sel = "hel"
		app.devState().card.sheet.coin = coinKey("hel", "+")
		if h.Installed {
			app.devState().card.sheet.coin = coinKey("hel", "antigravity")
		}
		tt.Frame()
		tt.Frame()
	}
	must := func(s string) {
		t.Helper()
		if _, ok := tt.Find(s); !ok {
			t.Fatalf("%q not on the card", s)
		}
	}
	show(agyAppOnly)
	must("只有 Antigravity 的桌面 app，没有它的命令行")
	must("装的是它的命令行 agy，大约 85 MB，放在 ~/.local/bin，和 Google 自己的安装方式一样。")
	if err := tt.Click("安装"); err != nil {
		t.Fatal(err)
	}
	if r := setupSent(withoutLooks(*sent)); len(r) == 0 || r[len(r)-1].Action != "install" || r[len(r)-1].Harnesses[0] != "antigravity" {
		t.Fatalf("sent %+v", r)
	}
	show(agyTooOld)
	must("版本 1.4.9 太旧，至少要 1.5.0")
	if err := tt.Click("更新"); err != nil {
		t.Fatal(err)
	}
	show(agyBroken)
	must("装坏了，打不开")
	must("重新安装")
	show(agySignIn)
	must("Google 的条款说：用第三方程序访问 Antigravity 违反条款，账号可能被停用；个人套餐也不支持把 agy 放进别的应用里用。登录前请自己掂量。")
	must("在任意设备上打开这个链接，用 Google 登录，再把页面给你的码（或者最后停在的那个网址）粘贴到这里：")
	// D415: signed in, it can be signed out from its row with its own sign-out.
	show(protocol.DeviceHarness{Installed: true, LoggedIn: true, Version: "1.5.13", How: "installer"})
	if err := tt.Click("退出登录"); err != nil {
		t.Fatal(err)
	}
	if r := setupSent(withoutLooks(*sent)); r[len(r)-1].Action != "logout" || r[len(r)-1].Harness != "antigravity" {
		t.Fatalf("sent %+v", r[len(r)-1])
	}
	show(protocol.DeviceHarness{Installed: true, LoggedIn: true, Login: &protocol.AgentLoginState{State: "signing_out"}})
	must("正在退出登录…")
	show(protocol.DeviceHarness{Installed: true, LoggedIn: true, Login: &protocol.AgentLoginState{State: "failed", Reason: "signout_failed"}})
	must("没退出登录，它还是登录着的。")
	// Offered last on the lend sheet, unchecked.
	ids, checked := offerable([]protocol.DeviceHarness{{Harness: "antigravity", Installable: true}, {Harness: "codex", Installable: true}})
	if len(ids) != 2 || ids[1] != "antigravity" || checked["antigravity"] {
		t.Fatalf("offerable %v %v", ids, checked)
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/antigravity go test ./internal/views -run AntigravityShots
func TestAntigravityShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			for _, s := range []struct {
				name string
				h    protocol.DeviceHarness
			}{{"app-only", agyAppOnly}, {"too-old", agyTooOld}, {"broken", agyBroken}, {"signin", agySignIn}, {"ready", protocol.DeviceHarness{Installed: true, LoggedIn: true, Version: "1.5.13", How: "installer"}}} {
				app, _ := iaApp(t, lang)
				app.Now = func() time.Time { return lendNow }
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), helWith(s.h)}})
				app.Route = RouteDevices
				app.devState().sel = "hel"
				app.devState().card.sheet.coin = coinKey("hel", "+")
				if s.h.Installed {
					app.devState().card.sheet.coin = coinKey("hel", "antigravity")
				}
				tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, "mac-1440-"+string(lang)+"-"+mode+"-"+s.name+".png"))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
