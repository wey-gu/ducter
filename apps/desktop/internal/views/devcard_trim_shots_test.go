package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D420: the device card trimmed. The author's own moment: this Mac
// ("Macbook Pro M3") doing tasks for the home on Hetzner Server, with
// Nowledge Mem carried from the home; then haswell in Mem's other looks,
// the home, and the Pixel Fold lent to tasks.

func trimFrame(mac, hw *protocol.DeviceMemView) protocol.ServerFrame {
	f := passFrame()
	f.Devices[1] = protocol.DeviceView{ID: "dev_mac", Name: "Macbook Pro M3", Computer: "Weys-MacBook-Pro", Kind: "laptop", State: protocol.DeviceAwake,
		Platform: "darwin-arm64", Via: f.Devices[1].Via, Harnesses: passAgents("claude-code", "codex"), Mem: mac,
		Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "chrome"}, {ID: "computer", State: "on"}, {ID: "phone", State: "off"}}}
	f.Devices[2].Mem = hw
	return f
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_PHASE=before DUCTER_SHOTS_DIR=$PWD/../../../../.shots/devcard-trim go test ./internal/views -run DevcardTrimShots
func TestDevcardTrimShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	phase := os.Getenv("DUCTER_SHOTS_PHASE")
	if phase == "" {
		phase = "after"
	}
	dir := shotsDir(t)
	carried := &protocol.DeviceMemView{State: "ready", Version: "0.10.120", Agents: []string{"claude-code", "codex"}, Carried: true}
	looks := []struct {
		name   string
		sel    string
		cl     string
		mac    *protocol.DeviceMemView
		hw     *protocol.DeviceMemView
		darkOK bool
	}{
		{"mac-carried-ready", "dev_mac", "", carried, nil, true},
		{"mac-carried-signin", "dev_mac", "", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Carried: true}, nil, false},
		{"mac-carried-absent", "dev_mac", "", &protocol.DeviceMemView{State: "absent", Installable: true, Carried: true}, nil, false},
		{"mac-carried-trouble", "dev_mac", "", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Carried: true, Health: &protocol.MemHealth{Issue: "signed_out"}}, nil, false},
		{"haswell-absent", "haswell", "", nil, &protocol.DeviceMemView{State: "absent", Installable: true}, false},
		{"haswell-ready", "haswell", "", nil, &protocol.DeviceMemView{State: "ready", Version: "0.10.120", Agents: []string{"claude-code", "codex"}}, false},
		{"haswell-unreachable", "haswell", "", nil, &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Health: &protocol.MemHealth{Issue: "unreachable"}}, false},
		{"haswell-mem-off", "haswell", "", nil, nil, false},
		{"home", "local", "", nil, nil, true},
		{"pixel", "", "pix", nil, nil, true},
	}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			app, _ := iaApp(t, lang)
			app.Status = client.Connected
			app.LocaleFixed = true
			app.URL = "wss://ducter.example.dev/ws"
			app.Now = func() time.Time { return passNow }
			app.ThisComputer = "Weys-MacBook-Pro"
			app.MacWorker = &macWorkOn{on: true}
			app.Route = RouteDevices
			tt := ui.NewTesterWith(app.View, 1400, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			for _, l := range looks {
				if dark && !l.darkOK {
					continue
				}
				app.Receive(trimFrame(l.mac, l.hw))
				app.devState().sel, app.devState().selClient = l.sel, l.cl
				lendFrame(tt)
				lendFrame(tt)
				name := phase + "-" + l.name + "-" + string(lang) + "-" + mode + ".png"
				f, err := os.Create(filepath.Join(dir, name))
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
