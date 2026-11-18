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

// D363: haswell, a fresh server just lent: nothing installed, Ducter can put
// Codex, Claude Code and pi there.
func haswell(hs ...protocol.DeviceHarness) protocol.DeviceView {
	if hs == nil {
		hs = []protocol.DeviceHarness{
			{Harness: "claude-code", Installable: true},
			{Harness: "codex", Installable: true},
			{Harness: "pi", Installable: true},
			{Harness: "deepseek-harness"},
		}
	}
	return protocol.DeviceView{ID: "hw1", Name: "haswell", Kind: "server", State: protocol.DeviceAwake, Platform: "linux-x64", Harnesses: hs}
}

func TestAgentRowLook(t *testing.T) {
	cases := []struct {
		h    protocol.DeviceHarness
		want string
	}{
		{protocol.DeviceHarness{Installable: true}, "install"},
		{protocol.DeviceHarness{Installable: true, Setup: &protocol.AgentSetupState{Phase: "queued"}}, "queued"},
		{protocol.DeviceHarness{Installable: true, Setup: &protocol.AgentSetupState{Phase: "installing"}}, "installing"},
		{protocol.DeviceHarness{Installable: true, Setup: &protocol.AgentSetupState{Phase: "failed", Reason: "network"}}, "failed"},
		{protocol.DeviceHarness{Installed: true}, "signin"},
		{protocol.DeviceHarness{Installed: true, Login: &protocol.AgentLoginState{State: "waiting"}}, "login"},
		{protocol.DeviceHarness{Installed: true, LoggedIn: true, Login: &protocol.AgentLoginState{State: "done"}}, "login"},
		{protocol.DeviceHarness{Installed: true, LoggedIn: true}, "ready"},
		{protocol.DeviceHarness{}, "missing"},
	}
	for _, c := range cases {
		if got := agentRowLook(c.h); got != c.want {
			t.Errorf("%+v: %s, want %s", c.h, got, c.want)
		}
	}
	ids, checked := offerable(haswell().Harnesses)
	if len(ids) != 3 || ids[0] != "codex" || ids[1] != "claude-code" || ids[2] != "pi" || !checked["codex"] || !checked["claude-code"] || checked["pi"] {
		t.Fatalf("offerable: %v %v", ids, checked)
	}
}

// withoutLooks drops the look again a card sends when it opens.
func withoutLooks(sent []any) []any {
	var out []any
	for _, f := range sent {
		if r, ok := f.(protocol.AgentSetupReq); ok && r.Action == "look" {
			continue
		}
		out = append(out, f)
	}
	return out
}

func setupSent(sent []any) []protocol.AgentSetupReq {
	var out []protocol.AgentSetupReq
	for _, f := range sent {
		if r, ok := f.(protocol.AgentSetupReq); ok {
			out = append(out, r)
		}
	}
	return out
}

// The lend sheet's last step: 装上哪些 AI？ with Codex and Claude Code checked;
// 装上 sends exactly those; the card looks again when it opens.
func TestLendAgentsInstallAndCardLook(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Now = func() time.Time { return lendNow }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswell()}})
	app.Route = RouteDevices
	app.openLend()
	app.lend.kind = "linux"
	app.askLend()
	app.Receive(lendWaitingFrame(false))
	app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "here", Device: "hw1", Name: "haswell"})
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("装上哪些 AI？"); !ok {
		t.Fatal("no 装上哪些 AI？ on the lend sheet")
	}
	if err := tt.Click("装上"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	var got []protocol.AgentSetupReq
	for _, r := range setupSent(*sent) {
		if r.Action != "look" {
			got = append(got, r)
		}
	}
	if len(got) != 1 || got[0].Action != "install" || len(got[0].Harnesses) != 2 || got[0].Harnesses[0] != "codex" || got[0].Harnesses[1] != "claude-code" {
		t.Fatalf("sent %+v", got)
	}
	// Installed, not signed in: 登录 on the sheet; a tap starts that agent's sign-in there.
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswell(
		protocol.DeviceHarness{Harness: "claude-code", Installed: true},
		protocol.DeviceHarness{Harness: "codex", Installed: true, Login: &protocol.AgentLoginState{State: "waiting", URL: "https://auth.openai.com/codex/device", Code: "ABCD-EFGHI"}},
		protocol.DeviceHarness{Harness: "pi", Installable: true},
	)}})
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("ABCD-EFGHI"); !ok {
		t.Fatal("Codex's code isn't on the sheet")
	}
	if err := tt.Click("登录"); err != nil {
		t.Fatal(err)
	}
	got = setupSent(*sent)
	if last := got[len(got)-1]; last.Action != "login" || last.Harness != "claude-code" || last.Device != "hw1" {
		t.Fatalf("sent %+v", last)
	}
	// The card: opening it asks that computer to look again, once.
	app.lend.open = false
	app.devState().sel = "hw1"
	tt.Frame()
	tt.Frame()
	looks := 0
	for _, r := range setupSent(*sent) {
		if r.Action == "look" && r.Device == "hw1" {
			looks++
		}
	}
	if looks != 1 {
		t.Fatalf("looks: %d", looks)
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/worker-agents go test ./internal/views -run AgentSetupShots
func TestAgentSetupShots(t *testing.T) {
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
	installing := haswell(
		protocol.DeviceHarness{Harness: "claude-code", Installable: true, Setup: &protocol.AgentSetupState{Phase: "queued"}},
		protocol.DeviceHarness{Harness: "codex", Installable: true, Setup: &protocol.AgentSetupState{Phase: "installing"}},
		protocol.DeviceHarness{Harness: "pi", Installable: true},
	)
	signin := haswell(
		protocol.DeviceHarness{Harness: "claude-code", Installed: true, Version: "2.1.322", How: "npm", Login: &protocol.AgentLoginState{State: "waiting", URL: "https://claude.com/cai/oauth/authorize?code=true&client_id=…", Paste: true}},
		protocol.DeviceHarness{Harness: "codex", Installed: true, Version: "0.169.1", How: "npm", Login: &protocol.AgentLoginState{State: "waiting", URL: "https://auth.openai.com/codex/device", Code: "ABCD-EFGHI"}},
		protocol.DeviceHarness{Harness: "pi", Installable: true},
	)
	ready := haswell(
		protocol.DeviceHarness{Harness: "claude-code", Installed: true, Version: "2.1.322", How: "npm"},
		protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.169.1", How: "npm", CanBePartner: true},
		protocol.DeviceHarness{Harness: "pi", Installable: true},
	)
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			p := "mac-1440-" + string(lang) + "-" + mode + "-"
			app, _ := iaApp(t, lang)
			app.Now = func() time.Time { return lendNow }
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswell()}})
			app.Route = RouteDevices
			tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			app.openLend()
			app.lend.kind = "linux"
			app.askLend()
			app.Receive(lendWaitingFrame(false))
			app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "here", Device: "hw1", Name: "haswell"})
			save(tt, p+"01-lend-which.png")
			app.ag.skipped["hw1"] = true // 装上 pressed
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), installing}})
			save(tt, p+"02-lend-installing.png")
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), signin}})
			save(tt, p+"03-lend-signin.png")
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), ready}})
			save(tt, p+"04-lend-ready.png")
			app.lend.open = false
			app.devState().sel = "hw1"
			app.devState().card.sheet.coin = coinKey("hw1", "+")
			save(tt, p+"05-card-install.png")
			app.devState().card.sheet.coin = coinKey("hw1", "claude-code")
			save(tt, p+"06-card-signin.png")
		}
	}
}
