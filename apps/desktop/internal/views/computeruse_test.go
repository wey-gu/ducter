package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D234 + D235 on the author's own setup: hel (a Linux server) is the home,
// the MacBook its worker. The MacBook's card gets + 用手机 (the install
// sheet asks the MacBook) and + 用电脑; added without macOS's two switches,
// 用电脑 says which and opens the guide on the MacBook; a task in its apps
// shows there with 停下 / Stop.
func TestWorkerMacPhoneAndComputer(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		mac := func(app *App, abs ...protocol.DeviceAbility) {
			app.S.Device("dev_mac").Abilities = abs
		}
		app := sheetApp(t, lang, "awake")
		mac(app, protocol.DeviceAbility{ID: "web", State: "on", Where: "chrome"}, protocol.DeviceAbility{ID: "computer", State: "off"}, protocol.DeviceAbility{ID: "phone", State: "off"})
		var sent []any
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		tt := sheetTester(app, 1280, 860, true)

		// + 用手机 on the worker's card: the terms come from that Mac.
		click(t, tt, "+ "+L.T("chip.phone"))
		if r, ok := lastSent[protocol.PhoneTermsReq](sent); !ok || r.Device != "dev_mac" {
			t.Fatalf("%s: + 用手机 sent %#v", lang, sent)
		}
		app.pu.installFor = "" // close the sheet
		tt.Frame()

		// + 用电脑: saved on that Mac.
		click(t, tt, "+ "+L.T("chip.computer"))
		if r, ok := lastSent[protocol.AbilityReq](sent); !ok || !r.On || r.Ability != "computer" || r.Device != "dev_mac" {
			t.Fatalf("%s: + 用电脑 sent %#v", lang, sent)
		}

		// Added, but macOS hasn't given the two switches: the chip fails, its ⓘ says which, and the guide opens on the MacBook.
		app = sheetApp(t, lang, "awake")
		mac(app, protocol.DeviceAbility{ID: "web", State: "on", Where: "chrome"}, protocol.DeviceAbility{ID: "computer", State: "unavailable", Reason: "computer_permissions", Perms: &protocol.ComputerPerms{Accessibility: true}})
		sent = nil
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		tt = sheetTester(app, 1280, 860, true)
		click(t, tt, L.T("chip.computer")+" · "+L.T("chip.failed"))
		for _, s := range []string{L.T("computeruse.perms", "MacBook"), L.T("computeruse.perm.accessibility"), L.T("computeruse.perm.screen"), L.T("computeruse.perm.on"), L.T("computeruse.perm.off")} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
			}
		}
		click(t, tt, L.T("computeruse.guide", "MacBook"))
		if r, ok := lastSent[protocol.ComputerGrantReq](sent); !ok || r.Device != "dev_mac" {
			t.Fatalf("%s: the guide sent %#v", lang, sent)
		}
		if !tt.HasText(L.T("computeruse.guide.sent", "MacBook")) {
			t.Fatalf("%s: the guide isn't said to be open: %q", lang, tt.Texts())
		}

		// On, with a task in Mail there: the card says so, and 停下 stops it.
		app = sheetApp(t, lang, "awake")
		mac(app, protocol.DeviceAbility{ID: "web", State: "on", Where: "chrome"}, protocol.DeviceAbility{ID: "computer", State: "on", Perms: &protocol.ComputerPerms{Accessibility: true, Screen: true}})
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t9", Title: "回张三的邮件", Place: protocol.Place{Kind: "none", Device: "dev_mac"}, Harness: "claude-code", Attention: protocol.Working, Computing: &protocol.Computing{Device: "dev_mac", App: "Mail"}}}}})
		sent = nil
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		tt = sheetTester(app, 1280, 860, true)
		if !tt.HasText(L.T("computeruse.using", "回张三的邮件", "Mail")) {
			t.Fatalf("%s: the card doesn't say the task is in Mail: %q", lang, tt.Texts())
		}
		click(t, tt, L.T("computeruse.stop")+" · 回张三的邮件")
		if r, ok := lastSent[protocol.ComputerStopReq](sent); !ok || r.TaskID != "t9" {
			t.Fatalf("%s: 停下 sent %#v", lang, sent)
		}
	}
}

// The home (hel) is a Linux server: 用电脑 stays a ghost there that explains
// it is Macs only for now.
func TestComputerGhostOnLinuxHome(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app := sheetApp(t, lang, "awake")
		app.devState().sel = "local"
		tt := sheetTester(app, 1280, 860, true)
		click(t, tt, L.T("chip.computer")+" · "+L.T("chip.state.later"))
		if !tt.HasText(L.T("ability.computer.later")) {
			t.Fatalf("%s: the ghost doesn't explain: %q", lang, tt.Texts())
		}
	}
}
