package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D408 (the Mac walk of 0.0.99: the window once showed 关于 by itself):
// the settings rail never shrinks under the pointer. Once 和你的其他 agent
// 通信 is listed it stays for the session, so a frame that no longer calls
// for it can't move 关于 up under a click meant for 在哪儿运行.
func TestRailKeepsItsTabs(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	withPeers := settingsFrame()
	withPeers.Settings.Peers = &protocol.Peers{Reach: "trusted", Muted: []string{"claude-code@hel"}}
	app.Receive(withPeers)
	app.openTab(TabRun)
	tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	run, ok := tt.AccessByRole(ui.RoleTab, app.tabName(TabRun))
	if !ok {
		t.Fatal("no 在哪儿运行 tab")
	}
	if _, ok := tt.AccessByRole(ui.RoleTab, app.L.T("settings.short.peers")); !ok {
		t.Fatal("the fixture doesn't list 和你的其他 agent 通信")
	}
	// The home's next settings frame no longer calls for it.
	app.Receive(settingsFrame())
	tt.Frame()
	if _, ok := tt.AccessByRole(ui.RoleTab, app.L.T("settings.short.peers")); !ok {
		t.Error("the rail dropped a tab it had listed")
	}
	again, _ := tt.AccessByRole(ui.RoleTab, app.tabName(TabRun))
	if again.Bounds != run.Bounds {
		t.Errorf("在哪儿运行 moved from %v to %v", run.Bounds, again.Bounds)
	}
	// A click where 在哪儿运行 was stays there.
	tt.ClickAt(run.Bounds.X+run.Bounds.W/2, run.Bounds.Y+run.Bounds.H/2)
	tt.Frame()
	if app.Route != RouteSettings || app.settings.tab != TabRun {
		t.Errorf("a click on 在哪儿运行 went to %v / %q", app.Route, app.settings.tab)
	}
}

// D408: a restart that fails opens Updates and about only when the person
// pressed Restart to update here; one asked from the phone (D187) or by an
// Update all plan leaves the window where it is.
func TestUpdateFailedOnlyAfterTheirClick(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Route = RouteOnHand
	app.PuttingIn = true
	app.UpdateFailed()
	if app.Route != RouteOnHand || app.PuttingIn {
		t.Errorf("a restart asked from elsewhere moved the window: %v (putting in %v)", app.Route, app.PuttingIn)
	}
	app.restartClicked = app.Now()
	app.UpdateFailed()
	if app.Route != RouteSettings || app.settings.tab != TabAbout {
		t.Errorf("their own failed restart didn't open its card: %v / %q", app.Route, app.settings.tab)
	}
	app.Route = RouteOnHand
	app.restartClicked = app.Now().Add(-restartOwn - time.Second)
	app.UpdateFailed()
	if app.Route != RouteOnHand {
		t.Errorf("a click long ago still moved the window: %v", app.Route)
	}
}

// D408: what the home sends never changes the page the person is on. On
// each place and every settings page, frames from the mock home (the
// seeded Log, devices, settings, connections, a task's run) arrive for a
// while and the page stays.
func TestFramesNeverMoveThePage(t *testing.T) {
	noRelayWait(t)
	h := newHarness(t, i18n.ZH)
	h.tt.Type("帮我看下 HawDB #1592 的 CI 为什么挂了")
	h.tt.Key(0, ui.KeyEnter)
	type page struct {
		route Route
		tab   string
	}
	stay := func(open func(), want page) {
		t.Helper()
		open()
		end := time.Now().Add(300 * time.Millisecond)
		h.until("frames", func() bool { return time.Now().After(end) })
		got := page{h.app.Route, ""}
		if got.route == RouteSettings {
			got.tab = h.app.settings.tab
		}
		if got != want {
			t.Errorf("the page moved by itself: %+v, want %+v", got, want)
		}
	}
	stay(func() { h.app.Route = RouteConversation }, page{RouteConversation, ""})
	stay(func() { h.app.Route = RouteOnHand }, page{RouteOnHand, ""})
	stay(h.app.OpenDevices, page{RouteDevices, ""})
	for _, tab := range settingsTabs {
		stay(func() { h.app.openTab(tab) }, page{RouteSettings, tab})
	}
}
