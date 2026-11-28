package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D668 (research/246 §3.6, §3.10): an added plugin's row and its literal consent card:
// before anything came in, the card naming each declared path, after a run, and a newer pin.
// Mac 1000 and 1400, zh and en, light and dark, with a 2x crop of the heading and row.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/plughost/mac \
//	  go test ./internal/views -run PluginImportShots
func TestPluginImportShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	frame := func(over ...func(*protocol.ImportSourceRow)) protocol.ServerFrame {
		total := 12
		lody := protocol.ImportSourceRow{ID: "lody", App: "Lody", Kind: "builtin", State: "ready", Total: &total}
		row := protocol.ImportSourceRow{
			ID:         "fixture-reader",
			App:        "Fixture Notes",
			Kind:       "plugin",
			State:      "ready",
			Added:      true,
			Repo:       "https://github.com/acme/fixture-reader",
			Author:     "Ducter tests",
			Reads:      []string{"./threads.json", "~/Library/Notes/**/*.sqlite*"},
			Unreviewed: true,
		}
		for _, f := range over {
			f(&row)
		}
		return protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{lody, row}}}
	}
	lodyOnly := func() protocol.ServerFrame {
		total := 12
		return protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{{ID: "lody", App: "Lody", Kind: "builtin", State: "ready", Total: &total}}}}
	}
	after := func() func(*protocol.ImportSourceRow) {
		return func(r *protocol.ImportSourceRow) {
			r.Consented = true
			r.Imported = 2
			r.ImportedDay = "2026-11-28"
			r.Last = &protocol.ImportLast{At: "2026-11-28T10:00:00Z", Threads: 2, Oldest: "2026-10-02", Skipped: 1}
		}
	}
	update := func(r *protocol.ImportSourceRow) { r.Update = &protocol.ImportUpdate{Version: "0.2.0"} }
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, width := range []int{1000, 1400} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				if dark {
					app.T = theme.PebbleDark()
				}
				app.Receive(settingsFrame())
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "Lin's MacBook Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake}}})
				app.openTab(TabImport)
				tt := ui.NewTesterWith(app.View, width, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				settle := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(120 * time.Millisecond)
					}
				}
				save := func(name string) {
					tt.Move(float32(width)/2, 300)
					settle()
					shotTester(t, tt, fmt.Sprintf("mac-%s-%s-%s-%d", name, lang, mode, width))
				}
				crop := func(name string, height int) {
					img := tt.Image()
					b := img.Bounds()
					y1 := height * 2
					if y1 > b.Dy() {
						y1 = b.Dy()
					}
					sub := img.SubImage(image.Rect(0, 0, b.Dx(), y1))
					f, err := os.Create(filepath.Join(shotsDir(t), fmt.Sprintf("crop-2x-mac-%s-%s-%s-%d.png", name, lang, mode, width)))
					if err != nil {
						t.Fatal(err)
					}
					defer f.Close()
					_ = png.Encode(f, sub)
				}
				app.Receive(lodyOnly())
				save("plugin-phase2")
				app.Receive(frame())
				save("plugin-before")
				if width == 1000 {
					crop("plugin-before", 900)
				}
				app.imports.consent = "fixture-reader"
				save("plugin-consent")
				if width == 1000 {
					crop("plugin-consent", 1200)
				}
				app.imports.consent = ""
				app.Receive(frame(after()))
				save("plugin-after")
				app.Receive(frame(update))
				save("plugin-update")
			}
		}
	}
}
