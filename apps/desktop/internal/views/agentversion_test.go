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

// D156: each AI agent's version in the device card: quiet when current,
// a dot and 有新版本 with 更新 when behind, an honest line when Ducter
// hasn't checked the version, a copy inside an app or inside Ducter saying
// where its update comes from, and the steps after a tap.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/agent-versions go test ./internal/views -run AgentVersions

func agentWorld(h *harness) {
	no := false
	h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
		home := list[0]
		home.Name, home.Kind, home.Platform, home.Version = "hel", "server", "linux-x64", "0.0.4"
		home.Update = &protocol.DeviceUpdate{Current: "0.0.4", Latest: "0.0.4", How: "self"}
		home.Harnesses = []protocol.DeviceHarness{
			{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.167.0", How: "npm", Latest: "0.168.0", Available: true, Standing: "verified", LatestVerified: &no},
			{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.321", How: "installer", Latest: "2.1.321", Standing: "newer", LatestVerified: &no},
			{Harness: "pi", Installed: true, LoggedIn: true, Version: "1.5.0", How: "ducter", Standing: "newer"},
		}
		mini := list[1]
		mini.Name, mini.Kind, mini.Platform, mini.Version = "Mac mini", "mini", "darwin-arm64", "0.0.4"
		mini.Harnesses = []protocol.DeviceHarness{
			{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.166.0", How: "app", Standing: "older"},
		}
		return []protocol.DeviceView{home, mini}
	})
	h.until("world", func() bool {
		d := h.app.S.Device("local")
		return d != nil && len(d.Harnesses) == 3 && d.Harnesses[0].Version != ""
	})
	h.settle(300 * time.Millisecond)
}

func TestAgentVersions(t *testing.T) {
	if dir := os.Getenv("DUCTER_SHOTS_DIR"); dir != "" {
		_ = os.MkdirAll(filepath.Clean(dir), 0o755)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			agentWorld(h)
			d := h.app.devState()
			shot := func(name string) { h.settle(200 * time.Millisecond); h.shotAs(fmt.Sprintf("agents-%s-%s", lang, name)) }

			d.sel = "local"
			h.settle(200 * time.Millisecond)
			// D161: the card shows one dot; the versions are in each coin's detail.
			if h.tt.HasText(L.T("agentv.unverified")) || h.tt.HasText(L.T("coin.version", "0.167.0", L.T("coin.how.npm"))) {
				t.Fatalf("per-version facts on the card itself: %q", h.tt.Texts())
			}
			open := func(name string, wants ...string) {
				t.Helper()
				h.app.devState().card.sheet.coin = ""
				h.click(name)
				h.settle(200 * time.Millisecond)
				for _, want := range wants {
					if !h.tt.HasText(want) {
						t.Fatalf("%s detail: missing %q in %q", name, want, h.tt.Texts())
					}
				}
			}
			open("Codex · hel · "+L.T("agentv.available", "0.168.0"),
				L.T("coin.version", "0.167.0", L.T("coin.how.npm")),
				L.T("agentv.available", "0.168.0"),
				L.T("agentv.latest.unverified", "0.168.0"))
			shot("home-behind")
			open("Claude Code · hel", L.T("coin.version", "2.1.321", L.T("coin.how.installer")), L.T("agentv.unverified"))
			open("pi · hel", L.T("coin.version", "1.5.0", L.T("agentv.how.ducter")))
			open("Codex · hel · " + L.T("agentv.available", "0.168.0"))

			// Each step in words.
			for _, step := range []struct{ phase, want string }{
				{"waiting", L.T("agentv.phase.waiting")},
				{"updating", L.T("agentv.phase.updating", "0.168.0")},
				{"failed", L.T("agentv.phase.rolledback", "0.167.0")},
			} {
				h.hub.AgentStep("local", "codex", step.phase)
				h.until(step.phase, func() bool { return h.tt.HasText(step.want) })
				shot("codex-" + step.phase)
			}

			// One tap: the mock runs the steps; done on the new version.
			agentWorld(h)
			d.sel = "local"
			h.settle(100 * time.Millisecond)
			if d.card.sheet.coin != "local|codex" {
				h.click("Codex · hel · " + L.T("agentv.available", "0.168.0"))
			}
			h.settle(100 * time.Millisecond)
			h.click(L.T("agentv.button") + " · Codex")
			h.until("done", func() bool { return h.tt.HasText(L.T("agentv.phase.done", "0.168.0")) })
			shot("codex-done")

			// A copy inside the Codex app: where its update comes from, never a button.
			d.sel = "a3f9c2d1e0"
			h.settle(200 * time.Millisecond)
			h.click("Codex · Mac mini")
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText(L.T("coin.version", "0.166.0", L.T("agentv.how.app", "Codex"))) || h.tt.HasText(L.T("agentv.button")+" · Codex") {
				t.Fatalf("mac card: %q", h.tt.Texts())
			}
			shot("mac-app-copy")
		})
	}
}
