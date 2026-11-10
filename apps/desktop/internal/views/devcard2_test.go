package views

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D155: Devices as the author saw it, the Mac app connected to a server
// home "hel": the command line folds into its Mac's card, every card
// renames in place and says what it is and does in plain words, "Let this
// Mac do tasks for hel" on and off, and the page is one scroll (nothing
// clipped) at a small, the default and a large window.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/device-cards-2 go test ./internal/views -run 'DevicesHel'

const thisMac = "Siweis-MacBook-Pro"

func helWorld(h *harness) {
	ago := func(d time.Duration) string { return time.Now().Add(-d).UTC().Format(time.RFC3339) }
	h.hub.SetDevices(func(list []protocol.DeviceView, reach *protocol.Reach) []protocol.DeviceView {
		home := list[0]
		home.Name, home.Kind, home.Platform, home.Version = "hel", "server", "linux-x64", "0.0.4"
		home.Harnesses = []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true},
			{Harness: "codex", Installed: true, LoggedIn: true},
		}
		home.Abilities = []protocol.DeviceAbility{
			{ID: protocol.AbilityWeb, State: protocol.AbilityOn, Where: protocol.WhereDucter, Detail: "1.52.0"},
			{ID: protocol.AbilityComputer, State: protocol.AbilityLater},
			{ID: protocol.AbilityRemote, State: protocol.AbilityOn},
			{ID: protocol.AbilityPhone, State: protocol.AbilityLater},
			{ID: protocol.AbilityCall, State: protocol.AbilityLater},
		}
		home.Update = &protocol.DeviceUpdate{Current: "0.0.4", Latest: "0.0.4", How: "self"}
		reach.Clients = []protocol.ReachClient{
			{ID: "app1", Name: thisMac, Platform: "darwin", Connected: true, Form: "app", Computer: thisMac},
			// Paired before D155: only its name says it's the command line.
			{ID: "cli1", Name: "CLI on " + thisMac, Platform: "darwin", LastSeen: ago(26 * time.Hour)},
			{ID: "ph1", Name: "iPhone · Safari", Platform: "ios-safari", Connected: true},
			{ID: "ph2", Name: "iPhone · Safari · 2", Platform: "ios-safari", LastSeen: ago(3 * 24 * time.Hour)},
		}
		return []protocol.DeviceView{home}
	})
	h.until("hel", func() bool { d := h.app.S.Device("local"); return d != nil && d.Name == "hel" })
	h.receive(protocol.ServerFrame{T: "browser_sites", Ready: true, Sites: []protocol.SiteView{
		{Site: "github.com", SignedInAt: ago(48 * time.Hour), Cookies: 12},
		{Site: "x.com", SignedInAt: ago(5 * 24 * time.Hour), Cookies: 30},
	}})
	h.app.sites.askedAt = h.app.Now()
	h.settle(300 * time.Millisecond)
}

// fakeWork is this Mac's worker without launchd or a home: on, it pairs
// (the mock home shows the Mac as a worker); off, it says which to revoke.
type fakeWork struct {
	h       *harness
	on      bool
	starts  int
	stopped int
}

func (f *fakeWork) On() (bool, string) {
	if f.on {
		return true, "w-mac"
	}
	return false, ""
}

func (f *fakeWork) Start(context.Context) error {
	f.on = true
	f.starts++
	f.h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
		return append(list, protocol.DeviceView{
			ID: "w-mac", Name: thisMac, Computer: thisMac, Kind: "laptop", Platform: "darwin-arm64", State: protocol.DeviceAwake, Version: "0.0.4",
			Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: true}, {Harness: "codex", Installed: true, LoggedIn: false}},
			Abilities: []protocol.DeviceAbility{{ID: protocol.AbilityWeb, State: protocol.AbilityUnavailable, Reason: "home_only"}, {ID: protocol.AbilityComputer, State: protocol.AbilityLater}},
			Update:    &protocol.DeviceUpdate{Current: "0.0.4", Latest: "0.0.4", How: "app"},
		})
	})
	return nil
}

func (f *fakeWork) Stop() (string, error) {
	f.on = false
	f.stopped++
	return "w-mac", nil
}

func (f *fakeWork) Log() string { return "~/Library/Application Support/Ducter/worker.log" }

func openHel(t *testing.T, lang i18n.Lang) (*harness, *fakeWork) {
	h := openDevices(t, lang, false)
	w := &fakeWork{h: h}
	h.app.MacWorker, h.app.ThisComputer, h.app.URL = w, thisMac, "wss://hel.siwei.info/ws"
	helWorld(h)
	return h, w
}

// shotPage is the window, then the page scrolled to its end.
func (h *harness) shotPage(name string) {
	h.settle(200 * time.Millisecond)
	h.shotAs(name)
	w, hh := h.tt.Image().Bounds().Dx(), h.tt.Image().Bounds().Dy()
	h.tt.Scroll(float32(w)/2, float32(hh)/2, 0, 4000)
	h.settle(200 * time.Millisecond)
	h.shotAs(name + "-end")
	h.tt.Scroll(float32(w)/2, float32(hh)/2, 0, -4000)
	h.settle(100 * time.Millisecond)
}

func TestDevicesHelColumn(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h, _ := openHel(t, lang)
			for _, sz := range []struct {
				name string
				w, h int
			}{{"small", 1100, 720}, {"default", 1280, 860}, {"large", 1680, 1050}} {
				h.tt.SetSize(sz.w, sz.h)
				h.settle(200 * time.Millisecond)
				// The card's first line is never under the column's edge.
				if r, ok := h.tt.Find(h.app.L.T("card.status.home", h.app.S.PersonaName)); !ok || r.Y < float32(ChromeH) {
					t.Fatalf("%s: the card's status line is clipped: %v %v", sz.name, r, ok)
				}
				h.shotPage(fmt.Sprintf("column-%s-%s", lang, sz.name))
			}
			// One scroll: the card's last chip is reachable, whole.
			h.tt.SetSize(1280, 860)
			h.tt.Scroll(640, 430, 0, 4000)
			h.settle(200 * time.Millisecond)
			if r, ok := h.tt.Find(h.app.L.T("chip.remote")); !ok || r.Y+r.H > 860 {
				t.Fatalf("the card's last chip is cut off: %v %v", r, ok)
			}
		})
	}
}

func TestDevicesHelFolding(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h, w := openHel(t, lang)
			L := h.app.L
			d := h.app.devState()
			// No ghost device: the command line is a line in this Mac's card.
			for _, s := range h.tt.Texts() {
				if strings.Contains(s, "CLI on") {
					t.Fatalf("a CLI device shows on its own: %q", s)
				}
			}
			d.selClient = "app1"
			h.settle(200 * time.Millisecond)
			for _, want := range []string{L.T("card.status.this"), L.T("card.via", L.T("card.via.app")+L.T("card.via.and")+L.T("card.via.cli")), L.T("chip.worker", "hel")} {
				if !h.tt.HasText(want) {
					t.Fatalf("this Mac's card: missing %q in %q", want, h.tt.Texts())
				}
			}
			h.shotPage(fmt.Sprintf("mac-%s-cli-folded", lang))

			// The command line's own 断开, inside the ⋯ in place, confirmed in place.
			h.click(L.T("card.via.more"))
			h.settle(100 * time.Millisecond)
			h.click(L.T("device.disconnect") + " · " + L.T("device.cli.name", thisMac))
			h.settle(100 * time.Millisecond)
			ask := L.T("device.disconnect.ask", L.T("device.cli.name", thisMac))
			if !h.tt.HasText(ask) || !h.tt.HasText(L.T("device.disconnect.means.cli")) {
				t.Fatalf("cli confirm: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("mac-%s-cli-disconnect", lang))
			h.click(L.T("device.disconnect.ok") + " · " + L.T("device.cli.name", thisMac))
			h.until("cli gone", func() bool {
				for _, cl := range h.app.S.Reach.Clients {
					if cl.ID == "cli1" {
						return false
					}
				}
				return true
			})
			if h.app.S.Reach.Clients[0].ID != "app1" {
				t.Fatal("the app window went with the command line")
			}

			// Let this Mac do tasks for hel: on, the Mac stands as a worker, the app folds into it.
			h.app.setWork(true) // the switch's change (its label is the title's)
			h.until("worker", func() bool { return h.app.S.Device("w-mac") != nil })
			if w.starts != 1 {
				t.Fatalf("starts %d", w.starts)
			}
			d.selClient, d.sel = "", "w-mac"
			h.settle(200 * time.Millisecond)
			for _, want := range []string{L.T("card.via", L.T("card.via.app")), L.T("chip.worker", "hel")} {
				if !h.tt.HasText(want) {
					t.Fatalf("worker card: missing %q in %q", want, h.tt.Texts())
				}
			}
			h.shotPage(fmt.Sprintf("mac-%s-work-on", lang))
			// Off: stopped here, and revoked there.
			h.app.setWork(false)
			h.until("worker gone", func() bool { return h.app.S.Device("w-mac") == nil })
			if w.stopped != 1 || w.on {
				t.Fatalf("stopped %d on %v", w.stopped, w.on)
			}
			d.sel, d.selClient = "", "app1"
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText(L.T("chip.worker", "hel")) || h.tt.HasText(L.T("work.mac.note.off", "hel")) {
				t.Fatalf("off: the chip, its helper behind ⓘ: %q", h.tt.Texts())
			}
			h.shotPage(fmt.Sprintf("mac-%s-work-off", lang))

			// The same switch in Settings › Where it runs.
			h.app.Route, h.app.settings.tab = RouteSettings, TabRun
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText(L.T("work.mac.title", "hel")) {
				t.Fatalf("settings: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("settings-%s-where", lang))
		})
	}
}

func TestDevicesHelClientCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h, _ := openHel(t, lang)
			L := h.app.L
			d := h.app.devState()
			d.selClient = "ph2"
			h.settle(200 * time.Millisecond)
			for _, want := range []string{L.T("card.via", L.T("card.via.safari")), L.T("card.disconnect.device", "iPhone · Safari · 2")} {
				if !h.tt.HasText(want) {
					t.Fatalf("phone card: missing %q in %q", want, h.tt.Texts())
				}
			}
			h.shotAs(fmt.Sprintf("phone-%s-card", lang))
			// Rename in place: click the name; the field; keep it.
			h.click(L.T("device.rename") + " · iPhone · Safari · 2")
			h.settle(100 * time.Millisecond)
			d.rename.draft = "Wey 的 iPhone"
			h.settle(100 * time.Millisecond)
			h.shotAs(fmt.Sprintf("phone-%s-rename", lang))
			h.click(L.T("device.rename.ok"))
			h.until("renamed", func() bool {
				for _, cl := range h.app.S.Reach.Clients {
					if cl.ID == "ph2" {
						return cl.Name == "Wey 的 iPhone"
					}
				}
				return false
			})
			h.settle(200 * time.Millisecond)
			h.shotAs(fmt.Sprintf("phone-%s-renamed", lang))

			// The home renames in place too.
			d.selClient, d.sel = "", "local"
			h.settle(100 * time.Millisecond)
			h.click(L.T("device.rename") + " · hel")
			d.rename.draft = "hel 小鸭"
			h.click(L.T("device.rename.ok"))
			h.until("home renamed", func() bool { return h.app.S.Device("local").Name == "hel 小鸭" })

			// A command line alone stands as its computer, never "CLI on …".
			h.hub.SetDevices(func(list []protocol.DeviceView, reach *protocol.Reach) []protocol.DeviceView {
				reach.Clients = []protocol.ReachClient{{ID: "cli9", Name: "CLI on mini", Platform: "darwin", Form: "cli", Computer: "mini", Connected: true}}
				return list
			})
			h.until("lone cli", func() bool { return len(h.app.S.Reach.Clients) == 1 })
			d.selClient, d.sel = "cli9", ""
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText("mini") || !h.tt.HasText(L.T("card.via", L.T("card.via.cli"))) || !h.tt.HasText(L.T("device.client.now")) {
				t.Fatalf("lone cli: %q", h.tt.Texts())
			}
			for _, s := range h.tt.Texts() {
				if strings.Contains(s, "CLI on") {
					t.Fatalf("lone cli named %q", s)
				}
			}
			h.shotAs(fmt.Sprintf("cli-%s-alone", lang))
		})
	}
}
