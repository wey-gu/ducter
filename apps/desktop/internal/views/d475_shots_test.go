package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D475, D500: every Settings pane but Memory and Agent messaging at the window's usual 1280 and its
// narrowest 760 (DUCTER_SHOTS_WIDTHS overrides), against apps/web/demo-settings-real.ts (DEMO_NEEDS=1 for the
// "needs" state). Each shot is cut below the pane's last drawn text.
//
//	DUCTER_SHELL_URL=ws://127.0.0.1:7751/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d475/after> \
//	  DUCTER_SHOTS_STATE=real [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D475Shots
func TestD475Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	state := os.Getenv("DUCTER_SHOTS_STATE")
	if state == "" {
		state = "real"
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	tabs := []string{TabHome, TabPartner, TabNotify, TabAccounts, TabTodos, TabChats, TabAutofill, TabLook, TabRun, TabAbout}
	if only := os.Getenv("DUCTER_SHOTS_TABS"); only != "" {
		tabs = strings.Split(only, ",")
	}
	for _, tab := range tabs {
		if dev, ok := strings.CutPrefix(tab, "devices:"); ok {
			// D556: a device's card, the computer named (its role tag among the partners).
			h.app.OpenDevices()
			h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
			for _, d := range h.app.S.Devices {
				if d.Name == dev {
					h.app.devState().sel = d.ID
				}
			}
		} else {
			h.app.openTab(tab)
		}
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		settle()
		widths := []int{1280, 760}
		if ws := os.Getenv("DUCTER_SHOTS_WIDTHS"); ws != "" {
			widths = nil
			for _, f := range strings.Split(ws, ",") {
				var n int
				fmt.Sscan(f, &n)
				widths = append(widths, n)
			}
		}
		for _, w := range widths {
			h.tt.SetSize(w, pass3Height(tab))
			settle()
			name := fmt.Sprintf("mac-%d-%s-%s-%s-%s", w, lang, paper, state, strings.ReplaceAll(strings.ReplaceAll(tab, ":", "-"), " ", "_"))
			var img image.Image = h.tt.Image()
			bottom := float32(0)
			for _, s := range h.tt.Texts() {
				if r, ok := h.tt.Find(s); ok && r.Y+r.H > bottom {
					bottom = r.Y + r.H
				}
			}
			if b := img.Bounds(); bottom > 0 && int(bottom)+120 < b.Dy() {
				if sub, ok := img.(interface {
					SubImage(r image.Rectangle) image.Image
				}); ok {
					img = sub.SubImage(image.Rect(0, 0, b.Dx(), max(860, int(bottom)+120)))
				}
			}
			f, err := os.Create(filepath.Join(dir, name+".png"))
			if err != nil {
				t.Fatal(err)
			}
			_ = png.Encode(f, img)
			f.Close()
			_ = os.WriteFile(filepath.Join(dir, name+".txt"), []byte(strings.Join(h.tt.Texts(), "\n")), 0o644)
			if bad := paneGeometry(h.tt, float32(w)); len(bad) > 0 {
				_ = os.WriteFile(filepath.Join(dir, name+".geo.txt"), []byte(strings.Join(bad, "\n")), 0o644)
				t.Logf("%s: %d geometry findings", name, len(bad))
			}
		}
	}
}
