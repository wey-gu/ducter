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

// D205/D225/D229, placed by D257, simplified by D332: the partner's link with
// the person's own agents is Settings › 和你的其他 agent 通信; the home's own Nowledge
// Mem steps (put in, update, move, sign in) are on Settings › 记忆 and walked
// in place on 和你的其他 agent 通信 before it connects. Each state shows on its tab;
// opening the pane while Mem is ready connects (no tap), the switch
// connects or revokes, 装上 and 更新 send their frames; nothing else does.
// Identity, place and 断开 never show.
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
				return []string{L.T("peers.mem.what"), L.T("bridge.update", "hel"), L.T("peers.mem.then")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), L.T("peers.switch", "小鸭")} }},
		// D332: no Mem yet: one sentence of what it is, and its steps in place.
		{"install-peers", TabPeers, protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.pic.to", "小鸭"), L.T("peers.mem.what"), L.T("bridge.mem.install.go"), L.T("mem.step.signin")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), "ducter"} }},
		// D225: the home's own Mem command line, put in, updated and signed in, in Memory.
		{"install", TabMemory, protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.install", "hel"), L.T("bridge.mem.install.go"), L.T("say.memory.first")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"install-need-pipx", TabMemory, protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", Need: "pipx"},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.mem.install.need.below", "hel"), L.T("bridge.retry")}
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
			func(L *i18n.Strings) []string { return []string{L.T("mem.app.kept.local", "hel")} },
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
				return []string{L.T("peers.pic.to", "小鸭"), L.T("peers.joining", "小鸭"), L.T("peers.switch", "小鸭")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"connecting", TabPeers, protocol.BridgeView{State: "connecting", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string { return []string{L.T("peers.joining", "小鸭")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"connected", TabPeers, protocol.BridgeView{State: "connected", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.ex.title"), L.T("peers.ex.empty"), L.T("peers.agents.title"), L.T("peers.switch", "小鸭"), L.T("peers.switch.on", "小鸭")}
			},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.connect"), L.T("bridge.undo"), "ducter", "Only me", L.T("mem.details")}
			}},
		// D400: Mem itself also tells the person about the partner's mail: one quiet line, nothing to tap.
		{"connected-notices", TabPeers, protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Notices: true},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.notices.title", "小鸭"), L.T("peers.notices.line", "小鸭")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), "%!("} }},
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
				return []string{L.T("bridge.unconfirmed", "ducter"), L.T("bridge.retry")}
			}, nil},
		// D324: another home answers the partner's mailbox: where, and 改由这台收 (no plain Connect).
		{"elsewhere", TabPeers, protocol.BridgeView{State: "elsewhere", Identity: "ducter", Space: space, Others: []protocol.BridgeOther{{Label: "ducter-on-hel-1a2b3c", Home: "hel"}}},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.elsewhere", "小鸭", "hel"), L.T("peers.elsewhere.go")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		// D324: two homes read it (from before D324: the other's label names no computer).
		{"twice", TabPeers, protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Others: []protocol.BridgeOther{{Label: "ducter"}}},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.twice.title", "小鸭", L.T("peers.where.other")), L.T("peers.twice.line"), L.T("peers.twice.go")}
			}, nil},
		{"twice-stuck", TabPeers, protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Others: []protocol.BridgeOther{{Label: "ducter-on-hel-1a2b3c", Home: "hel", Stuck: true}}},
			func(L *i18n.Strings) []string {
				return []string{L.T("peers.twice.title", "小鸭", "hel"), L.T("peers.twice.stuck", "hel")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("peers.twice.go")} }},
	}
	for _, r := range []string{"authority_missing", "custody_birth_missing", "lifetime_inactive", "attachment_mismatch", "control_denied", "revoked", "conflict", "unavailable", "unknown"} {
		r := r
		states = append(states, tc{"refused-" + r, TabPeers, protocol.BridgeView{State: "refused", Reason: r, Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.TFamily("bridge.refused."+r, "ducter"), L.T("bridge.retry")}
			}, nil})
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, s := range states {
			t.Run(fmt.Sprintf("%s-%s", lang, s.name), func(t *testing.T) {
				app, sent := iaApp(t, lang)
				app.Status = 2
				f := settingsFrame()
				f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
				f.OwnAgents = []string{"claude-code", "codex"}
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
				case "ready":
					// D332: opening the pane while Mem is ready connects, with no tap.
					got := false
					for _, m := range *sent {
						if a, ok := m.(protocol.BridgeAction); ok && a.T == "bridge_connect" {
							got = true
						}
					}
					if !got {
						t.Fatalf("ready didn't connect by itself: %v", *sent)
					}
				case "elsewhere", "twice":
					// D324: the first tap asks in place; the second sends bridge_only_here.
					goLabel, ask := L.T("peers.elsewhere.go"), L.T("peers.elsewhere.ask", "hel", "小鸭")
					if s.name == "twice" {
						goLabel, ask = L.T("peers.twice.go"), L.T("peers.twice.ask", L.T("peers.where.other"), "小鸭")
					}
					if err := tt.Click(spoken(L, goLabel, "ducter")); err != nil {
						t.Fatal(err)
					}
					tt.Frame()
					if len(*sent) != n || !tt.HasText(ask) {
						t.Fatalf("%s ran without asking: %v %q", goLabel, (*sent)[n:], tt.Texts())
					}
					bridgeShot(t, tt, fmt.Sprintf("mac-%s-%s-ask", lang, s.name))
					if err := tt.Click(spoken(L, goLabel, "ducter")); err != nil {
						t.Fatal(err)
					}
					if len(*sent) != n+1 || (*sent)[n].(protocol.BridgeAction).T != "bridge_only_here" {
						t.Fatalf("%s sent %v", goLabel, (*sent)[n:])
					}
				case "connected":
					// D332: the one switch: off is a settings change (core revokes), no confirm.
					sw, ok := tt.AccessByRole(ui.RoleSwitch, L.T("peers.switch", "小鸭"))
					if !ok {
						t.Fatalf("no switch")
					}
					tt.ClickAt(sw.Bounds.X+sw.Bounds.W/2, sw.Bounds.Y+sw.Bounds.H/2)
					tt.Frame()
					var off bool
					for _, m := range (*sent)[n:] {
						if p, ok := m.(protocol.SettingsSet); ok && p.Patch.Peers != nil && p.Patch.Peers.Reach == "off" {
							off = true
						}
					}
					if !off {
						t.Fatalf("the switch sent %v", (*sent)[n:])
					}
				}
			})
		}
	}
}

func ptr[T any](v T) *T { return &v }

// D332: for someone Ducter hasn't seen run agents of their own (and no agent
// ever written), 和你的其他 agent 通信 stays out of the rail whatever Mem says (J6);
// the Partner page carries one quiet line that opens it.
func TestBridgeRowAbsentForAFreshUser(t *testing.T) {
	for _, b := range []*protocol.BridgeView{nil, {State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true}, {State: "sign_in", Identity: "ducter", Home: "hel"}, {State: "ready", Identity: "ducter"}} {
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
			t.Fatalf("和你的其他 agent 通信 shows for a fresh user (%v): %q", b, tt.Texts())
		}
		if b != nil && !tt.HasText(app.L.T("peers.invite")) {
			t.Fatalf("no invitation on the Partner page (%v): %q", b, tt.Texts())
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
