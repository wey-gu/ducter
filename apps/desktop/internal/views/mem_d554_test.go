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

// D554: Claude Code on the home without Mem's plugin is an offer under the
// head, never the head in the failed ink; step 2 of connecting Mem says an
// account comes first, with the quiet link to get one.
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/mem-experience/d554/after go test ./internal/views -run D554
func TestMemD554(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	absent := []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
		{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.1.53"}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, dark := range []bool{false, true} {
			paper := "light"
			if dark {
				paper = "dark"
			}
			for _, state := range []string{"plugin", "fresh"} {
				var app *App
				if state == "plugin" {
					app, _ = memHealthApp(t, lang, &protocol.MemHealth{Issue: "plugin", Agents: []string{"claude-code"}}, absent)
				} else {
					app, _ = memApp(t, lang, "fresh")
					app.openTab(TabMemory)
				}
				tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetDark(dark)
				for i := 0; i < 8; i++ {
					tt.Advance(150 * time.Millisecond)
					tt.Frame()
				}
				// What the crop is around: the Nowledge Mem head, or step 2.
				anchor := "Nowledge Mem"
				if state == "fresh" {
					anchor = L.T("mem.step.signin")
				}
				var r ui.Rect
				found := false
				for _, s := range []string{L.T("mem.health.ok"), L.T("mem.health.plugin", "Claude Code"), anchor} {
					if state == "fresh" && s != anchor {
						continue
					}
					if rr, ok := tt.Find(s); ok {
						r, found = rr, true
						break
					}
				}
				if !found {
					t.Fatalf("%s %s: nothing to crop in %q", lang, state, tt.Texts())
				}
				if dir == "" {
					continue
				}
				_ = os.MkdirAll(dir, 0o755)
				save := func(name string, img image.Image) {
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-%s-%s-%s.png", name, state, lang, paper)))
					if err != nil {
						t.Fatal(err)
					}
					defer f.Close()
					if err := png.Encode(f, img); err != nil {
						t.Fatal(err)
					}
				}
				save("mac-1150", tt.Image())
				tt.SetScale(2)
				for i := 0; i < 3; i++ {
					tt.Advance(150 * time.Millisecond)
					tt.Frame()
				}
				img := tt.Image()
				y0 := max(0, int(r.Y-60)*2)
				save("mac-2x", img.SubImage(image.Rect(max(0, int(r.X-120)*2), y0, img.Bounds().Dx(), min(img.Bounds().Dy(), int(r.Y+260)*2))))
			}
		}
	}
}

// D554: the plugin offer never colours Mem's head; step 2 says an account first.
func TestMemD554Words(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, sent := memHealthApp(t, lang, &protocol.MemHealth{Issue: "plugin", Agents: []string{"claude-code"}}, []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
		})
		tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		for i := 0; i < 6; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		for _, s := range []string{L.T("mem.health.ok"), L.T("mem.health.plugin", "Claude Code"), unjoin(keepClauses(L.T("mem.health.plugin.why.one")))} { // D556: one agent is 它
			if !hasText(tt, s) {
				t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
			}
		}
		if err := tt.Click(L.T("mem.health.plugin.go")); err != nil {
			t.Fatal(err)
		}
		n := 0
		for _, f := range *sent {
			if m, ok := f.(protocol.MemPluginInstall); ok && m.Harness == "claude-code" {
				n++
			}
		}
		if n != 1 {
			t.Fatalf("%s: %d installs", lang, n)
		}
		fresh, _ := memApp(t, lang, "fresh")
		fresh.openTab(TabMemory)
		tf := ui.NewTesterWith(fresh.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tf.Frame()
		tf.Frame()
		for _, s := range []string{L.T("mem.step.account", "hel"), L.T("mem.step.account.go")} {
			if !hasText(tf, s) {
				t.Fatalf("%s: no %q in %q", lang, s, tf.Texts())
			}
		}
	}
}
