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
)

// D556: New tasks start from both 自动 to Codex picked, as frames: the column opens and the coin
// comes in, the words of every row and the foot moving over together.
//
//	DUCTER_D556_SHOTS=<dir> go test ./internal/views -run TestD556Shots
func TestD556Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_D556_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D556_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Memory's offer to connect your own agents to Nowledge Mem: one agent is 它 / it, two are 它们 / them.
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, mode := range []string{"light", "dark"} {
			for _, w := range []int{1000, 1150, 1400} {
				for n, agents := range map[string][]string{"one": {"claude-code"}, "two": {"claude-code", "codex"}} {
					var hs []protocol.DeviceHarness
					for _, h := range agents {
						hs = append(hs, protocol.DeviceHarness{Harness: h, Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}})
					}
					app, _ := memHealthApp(t, lang, &protocol.MemHealth{Issue: "plugin", Agents: agents}, hs)
					app.Local.SetAppearance(mode)
					tt := ui.NewTester(app.View, w, 2400)
					tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
					for i := 0; i < 6; i++ {
						tt.Frame()
						tt.Advance(300 * time.Millisecond)
					}
					head, ok := tt.Find("Nowledge Mem")
					if !ok {
						t.Fatalf("no head in %q", tt.Texts())
					}
					var img image.Image = tt.Image()
					s := float32(img.Bounds().Dx()) / float32(w)
					if sub, ok := img.(interface {
						SubImage(r image.Rectangle) image.Image
					}); ok {
						img = sub.SubImage(image.Rect(0, int((head.Y-60)*s), img.Bounds().Dx(), int((head.Y+220)*s)))
					}
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-memplugin-%s-%d-%s-%s.png", n, w, lang, mode)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, img)
					f.Close()
					_ = L
				}
			}
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, mode := range []string{"light", "dark"} {
			for _, w := range []int{1000, 1150, 1400} {
				app, _ := d510App(t, lang, nil)
				app.Local.SetAppearance(mode)
				tt := ui.NewTester(app.View, w, 2400)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 6; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
				shoot := func(name string) {
					head, ok := tt.Find(L.T("newtasks.title"))
					foot, ok2 := tt.Find(L.T("newtasks.foot"))
					if !ok || !ok2 {
						t.Fatalf("no group in %q", tt.Texts())
					}
					var img image.Image = tt.Image()
					s := float32(img.Bounds().Dx()) / float32(w)
					r := image.Rect(0, int((head.Y-16)*s), img.Bounds().Dx(), int((foot.Y+foot.H+40)*s))
					if sub, ok := img.(interface {
						SubImage(r image.Rectangle) image.Image
					}); ok {
						img = sub.SubImage(r)
					}
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-newtasks-%d-%s-%s-%s.png", w, lang, mode, name)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, img)
					f.Close()
				}
				shoot("auto")
				// The pick as the track makes it (Codex appears elsewhere on the pane too).
				app.S.Settings.NewTasks = &protocol.NewTasks{Agent: "codex"}
				for i, ms := range []int{0, 60, 60, 60, 120, 400} {
					tt.Advance(time.Duration(ms) * time.Millisecond)
					tt.Frame()
					shoot(fmt.Sprintf("pick-f%d", i))
				}
			}
		}
	}
}
