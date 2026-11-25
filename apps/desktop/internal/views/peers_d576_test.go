package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D576: pi's Mem plugin carries Bridge itself from 0.8.20 (the web's bridge-relay-d448.test.ts and
// d470.test.ts): its row stands from the plugin's version, in its own words.
func piDevices(state, version string, busy bool) []protocol.DeviceView {
	pi := protocol.DeviceHarness{Harness: "pi", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: state, Version: version, Busy: busy}}
	return []protocol.DeviceView{{ID: "local", Name: "Ada's MacBook Air", Home: true, Harnesses: []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.38"}},
		{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.1.53"}},
		pi,
	}}}
}

func TestPiRowWords(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := memApp(t, lang, "on")
		app.S.Devices = piDevices("update", "0.8.19", false)
		rows := app.peersReachRows()
		var pi reachRow
		for _, r := range rows {
			if r.Harness == "pi" {
				pi = r
			}
		}
		if standing(pi) != "talk" || !pi.Update || pi.Device != "local" {
			t.Fatalf("%s: pi %+v", lang, pi)
		}
		for _, k := range []string{"peers.st.ask", "peers.st.talk", "peers.st.updating.talk", "peers.fix.talk", "say.peers.talk"} {
			if w := app.L.T(k); w == "" || w == k {
				t.Fatalf("%s: %s has no words", lang, k)
			}
		}
		// Claude Code and Codex hear back by their next session; pi, a step away, isn't said as a fault.
		app.S.Devices = piDevices("installed", "0.8.20", false)
		say := app.peersSay()
		if !strings.Contains(say, "pi") {
			t.Fatalf("%s: pi 0.8.20 talks both ways, said %q", lang, say)
		}
	}
}

// Pictures of the pi row in each state, Mac at 1150, zh and en, light and dark, at 2x:
//
//	DUCTER_PI_BRIDGE_SHOTS=/path/to/.shots/pi-bridge go test ./internal/views -run PiBridgeShots
func TestPiBridgeShots(t *testing.T) {
	dir := os.Getenv("DUCTER_PI_BRIDGE_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_PI_BRIDGE_SHOTS not set")
	}
	states := []struct {
		name, state, version string
		busy                 bool
	}{{"ask", "installed", "0.8.20", false}, {"talk", "update", "0.8.19", false}, {"updating", "update", "0.8.19", true}, {"install", "absent", "", false}}
	for _, dark := range []bool{false, true} {
		mode := map[bool]string{false: "light", true: "dark"}[dark]
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			for _, s := range states {
				app, _ := memApp(t, lang, "on")
				app.S.Devices = piDevices(s.state, s.version, s.busy)
				app.openTab(TabPeers)
				tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1150-%s-%s-%s.png", lang, mode, s.name)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
