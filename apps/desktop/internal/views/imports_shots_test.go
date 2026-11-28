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

// D655 (research/246 §3.10): Settings › 导入 / Import's shots: the pane as it is before a run,
// the consent card all literal, the quiet line after one, and removal asking what it hides; Mac
// 1000 and 1400, zh and en, light and dark, with a 2x crop of the row.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/import2/mac \
//	  go test ./internal/views -run ImportPaneShots
func TestImportPaneShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	frame := func(row protocol.ImportSourceRow) protocol.ServerFrame {
		return protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{row}}}
	}
	base := protocol.ImportSourceRow{ID: "lody", App: "Lody", State: "ready"}
	total := 12
	base.Total = &total
	after := func() protocol.ImportSourceRow {
		r := base
		r.Consented, r.Imported, r.ImportedDay = true, 4, "2026-11-20"
		zero := 8
		r.Fresh = &zero
		r.Last = &protocol.ImportLast{At: "2026-11-28T10:00:00Z", Threads: 4, Oldest: "2026-11-20", Skipped: 2}
		return r
	}
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
				app.Receive(frame(base))
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
				crop := func(name string) {
					img := tt.Image()
					b := img.Bounds()
					y1 := 380 * 2
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
				save("import-before")
				if width == 1000 {
					crop("import-before")
				}
				app.imports.consent = "lody"
				save("import-consent")
				if width == 1000 {
					crop("import-consent")
				}
				app.imports.consent = ""
				app.Receive(frame(after()))
				save("import-after")
				app.imports.remove = "lody"
				save("import-removal")
			}
		}
	}
}

// TestImportOfferShots is the one line Past tasks offers under 也在这台电脑上 / Also on this
// computer, before anything came in: Mac 1000 and 1400, zh and en, light and dark.
func TestImportOfferShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, width := range []int{1000, 1400} {
				app, sent := pastApp(t, lang)
				if dark {
					app.T = theme.PebbleDark()
				}
				n := 12
				app.Receive(protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{
					Sources: []protocol.ImportSourceRow{{ID: "lody", App: "Lody", State: "ready", Total: &n}},
					Offer:   &protocol.ImportOffer{ID: "lody", App: "Lody", Total: &n},
				}})
				app.OpenPast("")
				q, _ := lastPast[protocol.PastReq](*sent)
				app.Receive(pastResult(nil, q.ID))
				tt := ui.NewTesterWith(app.View, width, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(120 * time.Millisecond)
				}
				shotTester(t, tt, fmt.Sprintf("mac-offer-%s-%s-%d", lang, mode, width))
			}
		}
	}
}
