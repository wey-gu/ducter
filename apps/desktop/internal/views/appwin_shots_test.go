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

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D603: the app window with the composer one gesture away, in its states: the first open (its
// line), at rest, the composer up, words in it, the change being made, 改好了, the partner
// answering in words, 「⋯」, and the review board at rest; at the window's default size (600) and
// at 1150, zh and en, light and dark, with 2x crops of the title bar and the foot. DUCTER_APP_PAGES
// holds pictures of the pages (the test renderer has no web view): trip-v1, trip-v2, board, each
// -<stage width>-<lang>-<light|dark>.png.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<dir> DUCTER_APP_PAGES=<dir> go test ./internal/views -run AppWinComposeShots
func TestAppWinComposeShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	pages := os.Getenv("DUCTER_APP_PAGES")
	still := func(name string, stage int, lang i18n.Lang, mode string) *ui.Bitmap {
		f, err := os.Open(filepath.Join(pages, fmt.Sprintf("%s-%d-%s-%s.png", name, stage, lang, mode)))
		if err != nil {
			return nil
		}
		defer f.Close()
		img, err := png.Decode(f)
		if err != nil {
			return nil
		}
		return ui.NewBitmap(img)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, width := range []int{600, 1150} {
				stage := width - 32
				tag := fmt.Sprintf("%d-%s-%s", width, lang, mode)
				app, _ := shelfApp(t, lang, shelfFixture(lang), nil)
				if dark {
					app.T = theme.PebbleDark()
				}
				w := app.NewAppWin("a1b2c3")
				w.Still = still("trip-v1", stage, lang, mode)
				tt := ui.NewTesterWith(app.AppWinView(w), width, 860, ui.TesterOptions{})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: AppWinHeadH, Left: 78})
				settle := func() {
					for i := 0; i < 5; i++ {
						tt.Frame()
						tt.Advance(120 * time.Millisecond)
					}
				}
				save := func(name string) {
					tt.Move(float32(width)/2, 400)
					settle()
					shotTester(t, tt, fmt.Sprintf("mac-%s-%s", name, tag))
				}
				crop := func(name string, y0, y1 int) {
					img := tt.Image()
					b := img.Bounds()
					if y1 > b.Dy() {
						y1 = b.Dy()
					}
					if y0 < 0 {
						y0 = b.Dy() + y0
					}
					sub := img.SubImage(image.Rect(0, y0, b.Dx(), y1))
					f, err := os.Create(filepath.Join(shotsDir(t), fmt.Sprintf("crop-2x-mac-%s-%s.png", name, tag)))
					if err != nil {
						t.Fatal(err)
					}
					defer f.Close()
					_ = png.Encode(f, sub)
				}
				titleBar := func(name string) { crop(name, 0, (AppWinHeadH+56)*2) }
				foot := func(name string) { crop(name, -150*2, 1<<20) }
				save("1-first-open")
				titleBar("titlebar-first")
				tt.Advance(9 * time.Second)
				save("3-rest")
				titleBar("titlebar-rest")
				foot("foot-rest")
				// 「⋯」: who sees it and when it changed.
				if err := tt.Click(app.L.T("apps.more", app.appByID("a1b2c3").Name)); err == nil {
					save("2-menu")
					tt.Key(0, ui.KeyEscape)
					settle()
				}
				// Revealed: its frames as it comes up from the bottom edge.
				_ = tt.Click(spoken(app.L, app.L.T("app.edit"), app.appByID("a1b2c3").Name))
				for i := 0; i < 4; i++ {
					tt.Frame()
					shotTester(t, tt, fmt.Sprintf("mac-4-reveal-frame%d-%s", i, tag))
					tt.Advance(60 * time.Millisecond)
				}
				save("4-revealed")
				foot("foot-revealed")
				w.said = appWords(lang, "每天加个小计，超过 800 的那天标红", "Show each day's subtotal; a day over 800 in red")
				save("5-typed")
				_ = tt.Click(app.L.T("app.ask.send"))
				save("6-sending")
				foot("foot-sending")
				// The partner changed it.
				apps := shelfFixture(lang)
				apps[0].Version, apps[0].Note = 3, appWords(lang, "每天加了小计，超过 ¥800 的那天标红", "each day's subtotal; a day over ¥800 shows red")
				w.Still = still("trip-v2", stage, lang, mode)
				app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: apps}})
				save("7-done")
				foot("foot-done")
				tt.Advance(9 * time.Second)
				save("8-settled")
				// An ask the partner answered in words, with no new version.
				w.said = appWords(lang, "能导出成表格吗", "Can it export a spreadsheet?")
				w.compose = true
				settle()
				_ = tt.Click(app.L.T("app.ask.send"))
				settle()
				live := shelfFixture(lang)
				live[0].Version = 3
				live[0].Live = &protocol.AppLive{Changing: &struct{}{}}
				app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: live}})
				settle()
				live[0].Live = nil
				app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: live}})
				settle()
				tt.Advance(2 * time.Second)
				save("8b-replied")
				foot("foot-replied")
				// The author's case: the review board a routine keeps, opened before.
				app2, _ := shelfApp(t, lang, shelfFixture(lang), nil)
				if dark {
					app2.T = theme.PebbleDark()
				}
				w2 := app2.NewAppWin("a9e8d7")
				w2.Still = still("board", stage, lang, mode)
				tt2 := ui.NewTesterWith(app2.AppWinView(w2), width, 860, ui.TesterOptions{})
				tt2.SetScale(2)
				tt2.SetDark(dark)
				tt2.SetTitleBar(ui.TitleBar{Height: AppWinHeadH, Left: 78})
				for i := 0; i < 5; i++ {
					tt2.Frame()
					tt2.Advance(120 * time.Millisecond)
				}
				shotTester(t, tt2, "mac-9-board-"+tag)
			}
		}
	}
}
