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

// D371: DeepSeek Harness on a Mac. The author's MacBook: the desktop app
// installed and signed in, its own dsh inside it.
func dshMac(dsh protocol.DeviceHarness) protocol.DeviceView {
	dsh.Harness = "deepseek-harness"
	return protocol.DeviceView{ID: "m1", Name: "Wey's MacBook Pro", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64", Harnesses: []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.322", How: "installer", CanBePartner: true},
		{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.169.1", How: "npm", CanBePartner: true},
		dsh,
	}}
}

var dshKeyLogin = &protocol.AgentLoginState{State: "waiting", Key: true, URL: "https://platform.deepseek.com/api_keys", App: "DeepSeek Harness"}

// A copy inside the app says it updates with the app; signing in opens the
// app there and takes a pasted key; the key goes to that computer only.
func TestDshSignInRow(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Now = func() time.Time { return lendNow }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), dshMac(protocol.DeviceHarness{Installed: true, Version: "0.2.2-rc.3", How: "app", Login: dshKeyLogin})}})
	app.Route = RouteDevices
	app.devState().sel = "m1"
	app.devState().card.sheet.coin = coinKey("m1", "deepseek-harness")
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, s := range []string{"已经在 Wey's MacBook Pro 上打开了 DeepSeek Harness。在那里登录你的 DeepSeek 账号，这里会自己变成可以用了。", "在 DeepSeek 上生成一个"} {
		if !tt.HasText(s) {
			t.Fatalf("missing %q", s)
		}
	}
	app.ag.code = map[string]string{coinKey("m1", "deepseek-harness"): "sk-not-a-real-key"}
	tt.Frame()
	if err := tt.Click("检查"); err != nil {
		t.Fatal(err)
	}
	got := setupSent(*sent)
	if last := got[len(got)-1]; last.Action != "code" || last.Harness != "deepseek-harness" || last.Device != "m1" || last.Code != "sk-not-a-real-key" {
		t.Fatalf("sent %+v", last)
	}
	if app.ag.code[coinKey("m1", "deepseek-harness")] != "" {
		t.Fatal("the key stays in the field after it was sent")
	}
	if agentAppName("deepseek-harness") != "DeepSeek Harness" {
		t.Fatal("app name")
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/dsh-flow/mac go test ./internal/views -run DshFlowShots
func TestDshFlowShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	save := func(tt *ui.Tester, name string) {
		tt.Frame()
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	before := dshMac(protocol.DeviceHarness{})
	before.Harnesses = before.Harnesses[:2] // the author's card on 0.0.81: no DeepSeek Harness at all
	steps := []struct {
		name string
		dv   protocol.DeviceView
		coin string
	}{
		{"00-before-no-dsh", before, "+"},
		{"01-ready-with-app", dshMac(protocol.DeviceHarness{Installed: true, LoggedIn: true, Version: "0.2.2-rc.3", How: "app", CanBePartner: true}), "deepseek-harness"},
		{"02-signin-app-and-key", dshMac(protocol.DeviceHarness{Installed: true, Version: "0.2.2-rc.3", How: "app", Login: dshKeyLogin}), "deepseek-harness"},
		{"03-wrong-key", dshMac(protocol.DeviceHarness{Installed: true, Version: "0.2.2-rc.3", How: "app", Login: &protocol.AgentLoginState{State: "waiting", Key: true, URL: "https://platform.deepseek.com/api_keys", App: "DeepSeek Harness", Reason: "wrong_key"}}), "deepseek-harness"},
		{"04-socket-install", dshMac(protocol.DeviceHarness{Installable: true}), "+"},
		{"05-signed-in", dshMac(protocol.DeviceHarness{Installed: true, LoggedIn: true, Version: "0.2.2-rc.3", How: "app", Login: &protocol.AgentLoginState{State: "done"}}), "deepseek-harness"},
	}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			p := "mac-1440-" + string(lang) + "-" + mode + "-"
			for _, s := range steps {
				app, _ := iaApp(t, lang)
				app.Now = func() time.Time { return lendNow }
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), s.dv}})
				app.Route = RouteDevices
				app.devState().sel = "m1"
				app.devState().card.sheet.coin = coinKey("m1", s.coin)
				tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				save(tt, p+s.name+".png")
			}
			// The lend sheet: DeepSeek Harness offered, not checked.
			app, _ := iaApp(t, lang)
			app.Now = func() time.Time { return lendNow }
			hw := haswell(
				protocol.DeviceHarness{Harness: "claude-code", Installable: true},
				protocol.DeviceHarness{Harness: "codex", Installable: true},
				protocol.DeviceHarness{Harness: "pi", Installable: true},
				protocol.DeviceHarness{Harness: "deepseek-harness", Installable: true},
			)
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), hw}})
			app.Route = RouteDevices
			tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			app.openLend()
			app.lend.kind = "linux"
			app.askLend()
			app.Receive(lendWaitingFrame(false))
			app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "here", Device: "hw1", Name: "haswell"})
			save(tt, p+"06-lend-offers-dsh.png")
		}
	}
}
