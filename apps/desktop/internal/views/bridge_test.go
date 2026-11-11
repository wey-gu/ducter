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

// D205: Settings › 伙伴 › 你的其他 AI: the persona's own connection with the
// user's other AI agents, in each state, always findable once the home's Mem
// can make it (no agent has to have written first); with an older Mem, one
// update line and nothing else. 连上 and 断开 (after one confirm) send their
// frames; nothing else does.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/bridge-connect go test ./internal/views -run BridgeRow
func TestBridgeRow(t *testing.T) {
	space := &protocol.BridgeSpace{ID: "6f1c0d2e-personal", Label: "Only me"}
	states := []struct {
		name string
		v    protocol.BridgeView
		want func(L *i18n.Strings) []string
		not  func(L *i18n.Strings) []string
	}{
		{"old-nmem", protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel"},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.update", "hel")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), L.T("peers.reach", "小鸭")} }},
		{"ready", protocol.BridgeView{State: "ready", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.title", "小鸭"), L.T("bridge.connect"), L.T("peers.reach", "小鸭"), "ducter · Only me · 6f1c0d2e-personal"}
			}, nil},
		{"connecting", protocol.BridgeView{State: "connecting", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connecting")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"connected", protocol.BridgeView{State: "connected", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.connected", "ducter", "Only me"), L.T("bridge.undo")}
			},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect")} }},
		{"no-space", protocol.BridgeView{State: "no_space", Identity: "ducter"},
			func(L *i18n.Strings) []string { return []string{L.T("bridge.no_space")} },
			func(L *i18n.Strings) []string { return []string{L.T("bridge.connect"), L.T("bridge.retry")} }},
		{"failed", protocol.BridgeView{State: "failed", Identity: "ducter", Space: space, Detail: "timed out"},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.failed", "timed out"), L.T("bridge.retry")}
			}, nil},
		{"unconfirmed", protocol.BridgeView{State: "unconfirmed", Identity: "ducter", Space: space},
			func(L *i18n.Strings) []string {
				return []string{L.T("bridge.unconfirmed", "ducter"), L.T("bridge.retry"), L.T("bridge.undo")}
			}, nil},
	}
	for _, r := range []string{"authority_missing", "custody_birth_missing", "lifetime_inactive", "attachment_mismatch", "control_denied", "revoked", "conflict"} {
		r := r
		states = append(states, struct {
			name string
			v    protocol.BridgeView
			want func(L *i18n.Strings) []string
			not  func(L *i18n.Strings) []string
		}{"refused-" + r, protocol.BridgeView{State: "refused", Reason: r, Identity: "ducter", Space: space},
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
				app.OpenPartner()
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

// With no Mem that can connect and no agent ever written, the section stays away (J6).
func TestBridgeRowAbsentForAFreshUser(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	f := settingsFrame()
	f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
	app.Receive(f)
	app.OpenPartner()
	tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if tt.HasText(app.L.T("peers.title")) {
		t.Fatalf("你的其他 AI shows for a fresh user: %q", tt.Texts())
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
