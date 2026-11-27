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
		{protocol.DeviceHarness{Installed: true, LoggedIn: true, Login: &protocol.AgentLoginState{State: "done"}}, "ready"}, // D518: 登录好了 on a ready row
		{protocol.DeviceHarness{Installed: true, LoggedIn: true}, "ready"},
		// D549: signed in or not, it won't run as root where Ducter runs as root.
		{protocol.DeviceHarness{Installed: true, LoggedIn: true, Trouble: &protocol.AgentTrouble{Kind: "root"}}, "cant"},
		{protocol.DeviceHarness{Installed: true, Trouble: &protocol.AgentTrouble{Kind: "root"}}, "cant"},
		// D625: this build can't run it yet (Dim before the next OAR release).
		{protocol.DeviceHarness{Trouble: &protocol.AgentTrouble{Kind: "coming"}}, "coming"},
		// D630: Cursor's SDK child needs Node 22.13+, said plainly and with no button.
		{protocol.DeviceHarness{Installed: true, Trouble: &protocol.AgentTrouble{Kind: "node_old", Need: "22.13.0", Have: "20.11.0", Via: "ducter"}}, "cant"},
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

// The lend sheet's last step: 安装哪些 AI？ with Codex and Claude Code checked;
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
	if _, ok := tt.Find("安装哪些 AI？"); !ok {
		t.Fatal("no 安装哪些 AI？ on the lend sheet")
	}
	if err := tt.Click("安装"); err != nil {
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
	// D625: Dim on a device while this build carries no createDimRuntime.
	dimComing := haswell(
		protocol.DeviceHarness{Harness: "claude-code", Installed: true, Version: "2.1.322", How: "npm"},
		protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.169.1", How: "npm", CanBePartner: true},
		protocol.DeviceHarness{Harness: "dim", Trouble: &protocol.AgentTrouble{Kind: "coming"}},
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
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), dimComing}})
			app.devState().card.sheet.coin = coinKey("hw1", "+")
			save(tt, p+"07-card-dim-coming.png")
		}
	}
}

// D630: Cursor on a Mac's device card: install (SDK missing), sign-in (OAR's
// cursor.com link), Node too old, and ready. Every state, zh and en, light and dark.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/cursor go test ./internal/views -run CursorSetupShots
func TestCursorSetupShots(t *testing.T) {
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
	base := []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.322", How: "npm", CanBePartner: true},
		{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.169.1", How: "npm", CanBePartner: true},
	}
	with := func(c protocol.DeviceHarness) protocol.DeviceView { return haswell(append(base, c)...) }
	states := []struct {
		name string
		dv   protocol.DeviceView
	}{
		{"install", with(protocol.DeviceHarness{Harness: "cursor", Installable: true})},
		{"signin", with(protocol.DeviceHarness{Harness: "cursor", Installed: true, Version: "1.4.1", How: "ducter", Login: &protocol.AgentLoginState{State: "waiting", URL: "https://cursor.com/login?challenge=abc"}})},
		{"node-old", with(protocol.DeviceHarness{Harness: "cursor", Installed: true, Version: "1.4.1", How: "ducter", Trouble: &protocol.AgentTrouble{Kind: "node_old", Need: "22.13.0", Have: "20.11.0", Via: "ducter"}})},
		{"ready", with(protocol.DeviceHarness{Harness: "cursor", Installed: true, LoggedIn: true, Version: "1.4.1", How: "ducter"})},
	}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			for _, st := range states {
				p := "mac-1440-" + string(lang) + "-" + mode + "-" + st.name + ".png"
				app, _ := iaApp(t, lang)
				// A clock that moves, so the live line's entrance finishes inside the shot.
				now := lendNow
				app.Now = func() time.Time { now = now.Add(time.Second); return now }
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), st.dv}})
				app.Route = RouteDevices
				tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				app.devState().sel = "hw1"
				open := "cursor"
				if st.name == "install" {
					open = "+"
				}
				app.devState().card.sheet.coin = coinKey("hw1", open)
				save(tt, p)
			}
		}
	}
}

// D630: an old Node is Node's, not Ducter's: the card offers to update that Node and says
// nothing about updating Ducter, and promises no sign-in while Cursor cannot run.
func TestNodeOldCardOffersNodeOnly(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Now = func() time.Time { return lendNow }
	dv := haswell(protocol.DeviceHarness{Harness: "cursor", Installed: true, Version: "1.4.1", How: "ducter", Trouble: &protocol.AgentTrouble{Kind: "node_old", Need: "22.13.0", Have: "20.11.0", Via: "ducter"}})
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), dv}})
	app.Route = RouteDevices
	app.devState().sel = "hw1"
	app.devState().card.sheet.coin = coinKey("hw1", "cursor")
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	L := i18n.New(i18n.ZH)
	if _, ok := tt.Find(L.T("ag.node.update")); !ok {
		t.Errorf("the card should offer %q", L.T("ag.node.update"))
	}
	if _, ok := tt.Find(L.T("ag.node_old.why.ducter", "20.11.0", "22.13.0")); !ok {
		t.Errorf("the card should say which Node is old")
	}
	if _, ok := tt.Find(L.T("coin.signin.why", "haswell")); ok {
		t.Errorf("a Node too old to run Cursor must not promise a sign-in")
	}
	if _, ok := tt.Find(L.T("ag.trouble.root.why", "Cursor")); ok {
		t.Errorf("a Node too old must not be said as root trouble")
	}
}
