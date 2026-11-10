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

// D169: Nowledge Mem in the user's own agents, one line per agent in a
// device card: 已装 with its version, 没装 with 装上 (asked in place: what
// changes and where), 要看一下 with 理一下; a task on it says 正在装; a
// computer that is away shows the line alone. And Ducter's one card, with
// 装上 / 先不装.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/mem-tasks go test ./internal/views -run MemPlugin

func memWorld(h *harness) {
	h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
		home := list[0]
		home.Name, home.Kind, home.Platform, home.Version = "hel", "server", "linux-x64", "0.0.7"
		home.Harnesses = []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.321", How: "installer", Standing: "verified", Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.34"}},
			{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.167.0", How: "npm", Standing: "verified", Mem: &protocol.MemPluginView{State: "review", Why: "multiple"}},
			{Harness: "pi", Installed: true, LoggedIn: true, Version: "1.5.0", How: "ducter", Standing: "verified", Mem: &protocol.MemPluginView{State: "absent"}},
		}
		mini := list[1]
		mini.Name, mini.Kind, mini.Platform, mini.Version = "Mac mini", "mini", "darwin-arm64", "0.0.7"
		mini.State, mini.LastSeen = protocol.DeviceUnreachable, time.Now().Add(-2*time.Hour).UTC().Format(time.RFC3339)
		mini.Harnesses = []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.321", How: "installer", Mem: &protocol.MemPluginView{State: "absent"}},
		}
		return []protocol.DeviceView{home, mini}
	})
	h.until("world", func() bool {
		d := h.app.S.Device("local")
		return d != nil && len(d.Harnesses) == 3 && d.Harnesses[0].Mem != nil
	})
	h.settle(300 * time.Millisecond)
}

func TestMemPluginLines(t *testing.T) {
	if dir := os.Getenv("DUCTER_SHOTS_DIR"); dir != "" {
		_ = os.MkdirAll(filepath.Clean(dir), 0o755)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			memWorld(h)
			d := h.app.devState()
			shot := func(name string) { h.settle(200 * time.Millisecond); h.shotAs(fmt.Sprintf("mem-%s-%s", lang, name)) }

			d.sel = "local"
			coin := func(dev, harness string) {
				d.card.sheet.coin = coinKey(dev, harness)
				h.settle(250 * time.Millisecond)
			}
			// The card itself says nothing about it: the line is in each coin's detail (D161).
			h.settle(200 * time.Millisecond)
			if h.tt.HasText(L.T("memp.installed", "0.7.34")) {
				t.Fatalf("Mem line on the card itself: %q", h.tt.Texts())
			}
			coin("local", "claude-code")
			if !h.tt.HasText(L.T("memp.installed", "0.7.34")) || h.tt.HasText(L.T("memp.btn.install")+" · Claude Code · Nowledge Mem") {
				t.Fatalf("claude coin: %q", h.tt.Texts())
			}
			shot("coin-installed")
			coin("local", "codex")
			if !h.tt.HasText(L.T("memp.review.multiple")) {
				t.Fatalf("codex coin: %q", h.tt.Texts())
			}
			shot("coin-review")

			// 装上 asks in place first: what changes, and where.
			coin("local", "pi")
			if !h.tt.HasText(L.T("memp.absent")) {
				t.Fatalf("pi coin: %q", h.tt.Texts())
			}
			shot("coin-absent")
			h.click(L.T("memp.btn.install") + " · pi · Nowledge Mem")
			h.until("ask", func() bool { return h.tt.HasText(L.T("memp.means", "pi", "hel")) })
			shot("coin-ask")
			h.click(L.T("memp.ok") + " · pi · Nowledge Mem")
			h.until("installed", func() bool { return h.tt.HasText(L.T("memp.installed", "0.7.34")) && !h.tt.HasText(L.T("memp.absent")) })
			shot("coin-installed-after")

			// A computer that is away: the line alone.
			d.sel = "a3f9c2d1e0"
			coin("a3f9c2d1e0", "claude-code")
			if !h.tt.HasText(L.T("memp.absent")) || h.tt.HasText(L.T("memp.btn.install")+" · Claude Code · Nowledge Mem") {
				t.Fatalf("away coin: %q", h.tt.Texts())
			}
			shot("coin-away")
		})
	}
}

func TestMemPluginCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := newHarness(t, lang)
			L := h.app.L
			h.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				protocol.NewEvent(900, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{
					DecisionID: "d_mem", Question: "raw", GoLabel: "装上", DefaultOption: "hold", Reversible: true, DefaultAt: time.Now().Add(4 * time.Hour).UTC().Format(time.RFC3339),
					MemPlugin: &protocol.MemPluginAsk{Device: "w1", DeviceName: "Mac mini", Harness: "codex"},
				}),
			}})
			h.app.Route = RouteConversation
			want := L.T("memp.card.question", "Codex", "Mac mini")
			h.until("card", func() bool { return h.tt.HasText(want) })
			for _, b := range []string{L.T("memp.card.go"), L.T("memp.card.hold")} {
				found := false
				for _, s := range h.tt.Texts() {
					if s == b {
						found = true
					}
				}
				if !found {
					t.Fatalf("card: missing button %q in %q", b, h.tt.Texts())
				}
			}
			h.shotAs(fmt.Sprintf("mem-%s-card", lang))
		})
	}
}
