package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D205/D225/D229, placed by D257: the persona's own connection with the
// user's other AI agents is Settings › 你的其他 AI; the home's own Nowledge
// Mem steps (put in, update, move, sign in) are Settings › 记忆. Each state
// shows on its tab; 连上, 断开 (after one confirm), 装上 and 更新 send their
// frames; nothing else does.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/bridge-connect go test ./internal/views -run BridgeRow
func TestBridgeRow(t *testing.T) {
	space := &protocol.BridgeSpace{ID: "6f1c0d2e-personal", Label: "Only me"}
	type tc struct {
		name string
		tab  string
		v    protocol.BridgeView
		want func(L *i18n.Strings) []string
		not  func(L *i18n.Strings) []string
	}
	states := []tc{
		// An older Mem whose version Ducter doesn't know: update it where it came from.
		{"old-nmem", TabMemory, protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel"},
			func(L *i18n.Strings) []string { return []string{L.T("mem.update.needed"), L.T("bridge.update", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), L.T("bridge.mem.update.go")} }},
		{"old-nmem-peers", TabPeers, protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel"},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.mem.update", "hel", "0.10.118"), L.T("peers.mem.go")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), L.T("peers.reach", "小鸭")} }},
		// D225: the home's own Mem command line, put in, updated and signed in, in Memory.
		{"install", TabMemory, protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.install", "hel"), L.T("bridge.mem.install.go"), L.T("mem.hero.missing", "小鸭")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"install-need-pipx", TabMemory, protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", Need: "pipx"},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.install.need", "hel"), L.T("bridge.retry")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.install.go")} }},
		{"update-pip", TabMemory, protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel", Version: "0.10.116", CanRun: true},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.update", "hel", "0.10.116", "0.10.118"), L.T("bridge.mem.update.go")}
			}, nil},
		{"updating", TabMemory, protocol.BridgeView{State: "updating", Identity: "ducter", Home: "hel"},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.updating", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.update.go")} }},
		{"sign-in", TabMemory, protocol.BridgeView{State: "sign_in", Identity: "ducter", Home: "hel", Version: "0.10.118", SignIn: "used"},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.signin", "hel"), L.T("bridge.mem.signin.used"), L.T("bridge.mem.signin.go")}
			}, nil},
		{"local", TabMemory, protocol.BridgeView{State: "local_mem", Identity: "ducter", Home: "hel"},
			func(L *i18n.Strings) []string { return []string{L.T("mem.app.local", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"local-peers", TabPeers, protocol.BridgeView{State: "local_mem", Identity: "ducter", Home: "hel"},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.local", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		// D229: hel's pip copy past the mark: a quiet move in Memory; moving; done; a failed move kept the old copy.
		{"upkeep-move", TabMemory, protocol.BridgeView{State: "ready", Identity: "ducter", Space: space, Home: "hel", Upkeep: &protocol.BridgeUpkeep{Kind: "move"}},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.upkeep.move", "hel"), L.T("bridge.mem.upkeep.move.go")}
			}, nil},
		{"moving", TabMemory, protocol.BridgeView{State: "updating", Identity: "ducter", Home: "hel", Upkeep: &protocol.BridgeUpkeep{Kind: "move"}},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.moving", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.upkeep.move.go")} }},
		{"moved", TabMemory, protocol.BridgeView{State: "ready", Identity: "ducter", Space: space, Home: "hel", Done: "moved"},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.done.moved", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.mem.upkeep.move.go"), "%!("} }},
		{"move-failed-kept", TabMemory, protocol.BridgeView{State: "ready", Identity: "ducter", Space: space, Home: "hel", Upkeep: &protocol.BridgeUpkeep{Kind: "move", Detail: "ERROR: boom", Kept: true}},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.update.failed") + " " + L.T("bridge.mem.kept"), L.T("bridge.retry")}
			}, nil},
		{"ready", TabPeers, protocol.BridgeView{State: "ready", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.title", "小鸭"), L.T("bridge.connect"), L.T("peers.reach", "小鸭"), "ducter · Only me · 6f1c0d2e-personal"}
			}, nil},
		{"connecting", TabPeers, protocol.BridgeView{State: "connecting", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connecting")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"connected", TabPeers, protocol.BridgeView{State: "connected", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.connected", "ducter", "Only me"), L.T("bridge.undo")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"no-space", TabPeers, protocol.BridgeView{State: "no_space", Identity: "ducter"},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.no_space")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), L.T("bridge.retry")} }},
		{"failed", TabPeers, protocol.BridgeView{State: "failed", Identity: "ducter", Space: space, Detail: "timed out"},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.failed", "timed out"), L.T("bridge.retry")}
			}, nil},
		// D257: it doesn't connect and Mem says a newer one is out: that's the first thing to try.
		{"failed-newer", TabPeers, protocol.BridgeView{State: "failed", Identity: "ducter", Space: space, Detail: "timed out", Newer: ptr("0.10.121")},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.mem.newer"), L.T("peers.mem.go"), L.T("bridge.retry")}
			}, nil},
		{"unconfirmed", TabPeers, protocol.BridgeView{State: "unconfirmed", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.unconfirmed", "ducter"), L.T("bridge.retry"), L.T("bridge.undo")}
			}, nil},
	}
	for _, r := range []string{"authority_missing", "custody_birth_missing", "lifetime_inactive", "attachment_mismatch", "control_denied", "revoked", "conflict", "unavailable", "unknown"} {
		r := r
		states = append(states, tc{"refused-" + r, TabPeers, protocol.BridgeView{State: "refused", Reason: r, Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.refused."+r, "ducter"), L.T("bridge.retry")}
			}, nil})
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, s := range states {
			t.Run(fmt.Sprintf("%s-%s", lang, s.name), func(t *testing.T) {
				app, sent := iaApp(t, lang)
				app.Status = 2
				f := settingsFrame()
				f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
				v := s.v
				f.Bridge = &v
				app.Receive(f)
				app.openTab(s.tab)
				tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.Frame()
				tt.Frame()
				L := app.L
				for _, w := range s.want(L) {
					if !tt.HasText(w) {
						t.Fatalf("no %q in %q", w, tt.Texts())
					}
				}
				if s.not != nil {
					for _, w := range s.not(L) {
						for _, got := range tt.Texts() {
							if got == w {
								t.Fatalf("%q shows in %s", w, s.name)
							}
						}
					}
				}
				bridgeShot(t, tt, fmt.Sprintf("mac-%s-%s", lang, s.name))
				n := len(*sent)
				switch s.name {
				case "install", "update-pip":
					label := L.T("bridge.mem.install.go")
					if s.name == "update-pip" {
						label = L.T("bridge.mem.update.go")
					}
					if err := tt.Click(label); err != nil {
						t.Fatal(err)
					}
					if len(*sent) != n+1 || (*sent)[n].(protocol.BridgeAction).T != "bridge_mem_install" {
						t.Fatalf("装上 sent %v", (*sent)[n:])
					}
				case "old-nmem-peers":
					// 去「记忆」 goes to Memory, where the update is.
					if err := tt.Click(L.T("peers.mem.go")); err != nil {
						t.Fatal(err)
					}
					if app.settingsTab() != TabMemory {
						t.Fatalf("去「记忆」 opened %q", app.settingsTab())
					}
				case "ready":
					if err := tt.Click(L.T("bridge.connect")); err != nil {
						t.Fatal(err)
					}
					if len(*sent) != n+1 || (*sent)[n].(protocol.BridgeAction).T != "bridge_connect" {
						t.Fatalf("连上 sent %v", (*sent)[n:])
					}
				case "connected":
					// The first tap asks; the second disconnects.
					if err := tt.Click(L.T("bridge.undo")); err != nil {
						t.Fatal(err)
					}
					tt.Frame()
					if len(*sent) != n || !tt.HasText(L.T("bridge.undo.ask")) {
						t.Fatalf("断开 ran without asking: %v", (*sent)[n:])
					}
					bridgeShot(t, tt, fmt.Sprintf("mac-%s-disconnect-ask", lang))
					if err := tt.Click(L.T("bridge.undo")); err != nil {
						t.Fatal(err)
					}
					if len(*sent) != n+1 || (*sent)[n].(protocol.BridgeAction).T != "bridge_disconnect" {
						t.Fatalf("断开 sent %v", (*sent)[n:])
					}
				}
			})
		}
	}
}

func ptr[T any](v T) *T { return &v }

// With no Mem that can connect and no agent ever written, 你的其他 AI stays
// away (J6): not in the rail, and its tab falls back to the partner's.
func TestBridgeRowAbsentForAFreshUser(t *testing.T) {
	for _, b := range []*protocol.BridgeView{nil, {State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true}, {State: "sign_in", Identity: "ducter", Home: "hel"}} {
		app, _ := iaApp(t, i18n.ZH)
		f := settingsFrame()
		f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
		f.Bridge = b
		app.Receive(f)
		app.OpenPartner()
		tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		if tt.HasText(app.L.T("settings.tab.peers")) {
			t.Fatalf("你的其他 AI shows for a fresh user (%v): %q", b, tt.Texts())
		}
	}
}

func bridgeShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	if os.Getenv("DUCTER_SHOTS") == "" {
		return
	}
	tt.Frame()
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}
