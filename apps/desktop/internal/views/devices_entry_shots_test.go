package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The author's screen: a home on a server called Hetzner Server, a Mac
// that runs tasks for it, a phone.
func entryHome() protocol.DeviceView {
	return protocol.DeviceView{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake, Platform: "linux-x64"}
}

func entryMac() protocol.DeviceView {
	return protocol.DeviceView{ID: "m1", Name: "Wey's MacBook Pro", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64"}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_PHASE=after DUCTER_SHOTS_DIR=$PWD/../../../../.shots/devices-entry go test ./internal/views -run DevicesEntryShots
func TestDevicesEntryShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	phase := os.Getenv("DUCTER_SHOTS_PHASE")
	if phase == "" {
		phase = "after"
	}
	dir := shotsDir(t)
	save := func(tt *ui.Tester, name string) {
		lendFrame(tt)
		lendFrame(tt)
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			p := phase + "-mac-1440-" + string(lang) + "-" + mode + "-"
			app, sent := iaApp(t, lang)
			app.Now = func() time.Time { return lendNow }
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), entryMac()}})
			app.Route = RouteDevices
			_ = sent
			tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			tt.Frame()
			save(tt, p+"01-devices.png")
			app.devState().sel = "m1"
			save(tt, p+"02-worker-card.png")
			app.devState().sel = "local"
			if phase == "after" {
				app.openAdd()
				save(tt, p+"03-add.png")
			}
			app.openLend()
			save(tt, p+"04-lend-question.png")
			app.lend.kind = "linux"
			app.askLend()
			save(tt, p+"05-lend-loading.png")
			app.Receive(lendWaitingFrame(false))
			save(tt, p+"06-lend-waiting.png")
			app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "joined", Device: "a1b2c3d4e5", Name: "nas"})
			save(tt, p+"07-lend-joined.png")
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), entryMac(), lendNas("claude-code", "codex")}})
			app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "here", Device: "a1b2c3d4e5", Name: "nas"})
			save(tt, p+"08-lend-here.png")
			app.lend.open = false
			app.S.Lend = nil
			app.openLend()
			app.lend.kind = "linux"
			app.askLend()
			app.Receive(lendWaitingFrame(false))
			app.Now = func() time.Time { return lendNow.Add(11 * time.Minute) }
			save(tt, p+"09-lend-expired.png")
		}
	}
}
