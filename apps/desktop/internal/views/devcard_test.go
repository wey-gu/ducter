package views

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D148: each device card (the home on a server, a Mac doing tasks, a
// phone), the quiet dot of a device that's behind, the update's steps in
// words, rename in place and 断开 with a confirm, against the mock main.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/update go test ./internal/views -run DeviceCards

// cardWorld is a home on a VPS that's one version behind, a Mac mini doing
// tasks for it (it updates with its app), and an iPhone.
func cardWorld(h *harness) {
	h.hub.SetDevices(func(list []protocol.DeviceView, reach *protocol.Reach) []protocol.DeviceView {
		home := list[0]
		home.Name, home.Kind, home.Platform, home.Version = "vps-1", "server", "linux-x64", "0.0.3"
		home.Harnesses = []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true},
			{Harness: "codex", Installed: false},
		}
		home.Update = &protocol.DeviceUpdate{Current: "0.0.3", Latest: "0.0.4", Available: true, How: "self",
			NotesBy: map[string][]string{
				"zh": {"Ducter 和它的电脑都能原地更新，出错会换回来"},
				"en": {"Update Ducter and its computers in place, with a rollback", "Device cards you can rename where they are"},
			}}
		mini := list[1]
		mini.Name, mini.Kind, mini.Platform, mini.Version = "Mac mini", "mini", "darwin-arm64", "0.0.3"
		mini.Update = &protocol.DeviceUpdate{Current: "0.0.3", Latest: "0.0.4", Available: true, How: "app"}
		reach.Clients = []protocol.ReachClient{{ID: "c1", Name: "Wey 的 iPhone", Platform: "ios-safari", Connected: false, LastSeen: time.Now().Add(-3 * time.Hour).UTC().Format(time.RFC3339)}}
		return []protocol.DeviceView{home, mini}
	})
	h.until("world", func() bool {
		d := h.app.S.Device("local")
		return d != nil && d.Update != nil && len(h.app.S.Reach.Clients) == 1
	})
	h.settle(300 * time.Millisecond)
}

func TestDeviceCards(t *testing.T) {
	if dir := os.Getenv("DUCTER_SHOTS_DIR"); dir != "" {
		_ = os.MkdirAll(filepath.Clean(dir), 0o755)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			cardWorld(h)
			d := h.app.devState()
			shot := func(name string) { h.settle(200 * time.Millisecond); h.shotAs(fmt.Sprintf("card-%s-%s", lang, name)) }

			// The home: what it is in plain words, the dot, what's new, one button.
			d.sel = "local"
			h.settle(200 * time.Millisecond)
			for _, want := range []string{
				L.T("card.status.home", h.app.S.PersonaName),
				L.T("card.ducter.update", "0.0.4"),
				map[i18n.Lang]string{i18n.ZH: "Ducter 和它的电脑都能原地更新，出错会换回来", i18n.EN: "Update Ducter and its computers in place, with a rollback"}[lang],
				L.T("coin.socket"),
			} {
				if !h.tt.HasText(want) {
					t.Fatalf("home card: missing %q in %q", want, h.tt.Texts())
				}
			}
			// What's new is in the card's own language, never the other one's (D172).
			if other := map[i18n.Lang]string{i18n.ZH: "Update Ducter and its computers in place, with a rollback", i18n.EN: "Ducter 和它的电脑都能原地更新，出错会换回来"}[lang]; h.tt.HasText(other) {
				t.Fatalf("home card: the other language's notes %q in %q", other, h.tt.Texts())
			}
			if h.tt.HasText("Codex") {
				t.Fatalf("an AI that isn't installed shows before + Sign in another AI: %q", h.tt.Texts())
			}
			shot("home-behind")

			// Each step in words.
			for _, step := range []struct{ phase, want string }{
				{"downloading", L.T("devup.phase.downloading.pct", "0.0.4", 40)},
				{"waiting", L.T("devup.phase.waiting")},
				{"restarting", L.T("devup.phase.restarting")},
				{"failed", L.T("devup.phase.rolledback", "0.0.3")},
			} {
				h.hub.UpdateStep("local", step.phase, 0.4)
				h.until(step.phase, func() bool { return h.tt.HasText(step.want) })
				shot("home-" + step.phase)
			}
			// One tap: the mock runs the steps; back on the new version.
			cardWorld(h)
			d.sel = "local"
			h.settle(100 * time.Millisecond)
			h.click(L.T("devup.button") + " · vps-1")
			h.until("back", func() bool { return h.tt.HasText(L.T("devup.phase.done", "0.0.4")) })
			shot("home-done")

			// A Mac doing tasks: it updates with its own app, so no button here.
			d.sel = "a3f9c2d1e0"
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText(L.T("devup.how.app", "Mac mini")) {
				t.Fatalf("mac card: %q", h.tt.Texts())
			}
			shot("mac-worker")

			// Rename in place: click the name, type, Enter (here: the keep button).
			h.click(L.T("device.rename") + " · Mac mini")
			h.settle(100 * time.Millisecond)
			d.rename.draft = "Studio"
			h.click(L.T("device.rename.ok"))
			h.until("renamed", func() bool { x := h.app.S.Device("a3f9c2d1e0"); return x != nil && x.Name == "Studio" })
			// Esc cancels an edit instead of leaving the page.
			h.click(L.T("device.rename") + " · Studio")
			if !h.app.escDevice() || d.rename.device != "" || h.app.Route != RouteDevices {
				t.Fatalf("esc: %+v route %v", d.rename, h.app.Route)
			}

			// The phone: what it is, when it was last here, and 断开 with a confirm.
			d.selClient = "c1"
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText(L.T("card.via", L.T("card.via.safari"))) || !h.tt.HasText(L.T("device.last_seen", L.T("time.ago.hour", 3))) {
				t.Fatalf("phone card: %q", h.tt.Texts())
			}
			shot("phone")
			h.click(L.T("card.disconnect.device", "Wey 的 iPhone"))
			h.settle(100 * time.Millisecond)
			if !h.tt.HasText(L.T("device.disconnect.ask", "Wey 的 iPhone")) {
				t.Fatalf("confirm: %q", h.tt.Texts())
			}
			shot("phone-disconnect")
			h.click(L.T("device.disconnect.ok") + " · Wey 的 iPhone")
			h.until("gone", func() bool { return len(h.app.S.Reach.Clients) == 0 })
			for _, s := range h.tt.Texts() {
				if s == L.T("ability.remote.how") {
					t.Fatalf("a terminal line in the UI")
				}
			}

			// Settings › Updates and about: every computer's version, and the night switch.
			cardWorld(h)
			h.app.OpenAbout()
			h.settle(300 * time.Millisecond)
			if !h.tt.HasText(L.T("settings.versions.title")) {
				t.Fatalf("settings: %q", h.tt.Texts())
			}
			h.tt.SetSize(1280, 2000)
			shot("settings")
		})
	}
}
