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

// TestD568Shots walks Settings with the window on 小玛 against a demo core
// with the author's four partners (apps/web/demo-settings-real.ts with
// DEMO_PARTNERS=1 DEMO_VERSION=0.1.67): Overview, Partners (each row's
// picker), Memory, Updates & About, at 2x, and crops every figure that
// stands beside a name.
//
//	DUCTER_SHELL_URL=ws://127.0.0.1:7961/ws DUCTER_SHELL_LANG=zh [DUCTER_SHOTS_DARK=1] \
//	  DUCTER_SHOTS_DIR=<dir> go test ./internal/views -run TestD568Shots
func TestD568Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.Partners) == 4 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.app.SwitchPartner("p4")
	h.until("小玛", func() bool { return h.app.S.Welcomed && h.app.S.Persona == "p4" })
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetScale(2)
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
	save := func(name string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	const w = 1150
	for _, tab := range []string{TabHome, TabPartner, TabMemory, TabAbout} {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		h.tt.SetSize(w, pass3Height(tab))
		var figs []drawnFig
		h.app.figs = &figs
		settle()
		h.app.figs = nil
		name := fmt.Sprintf("mac-%d-%s-%s-%s", w, lang, paper, tab)
		img := h.tt.Image()
		bottom := float32(0)
		for _, s := range h.tt.Texts() {
			if r, ok := h.tt.Find(s); ok && r.Y+r.H > bottom {
				bottom = r.Y + r.H
			}
		}
		full := image.Image(img)
		if b := img.Bounds(); bottom > 0 && int(bottom*2)+240 < b.Dy() {
			full = img.SubImage(image.Rect(0, 0, b.Dx(), max(1720, int(bottom*2)+240)))
		}
		save(name, full)
		_ = os.WriteFile(filepath.Join(dir, name+".txt"), []byte(strings.Join(h.tt.Texts(), "\n")), 0o644)
		// 2x crops: each figure with the words beside it (the row it heads).
		seen := map[string]bool{}
		for _, f := range figs {
			who := f.Who
			if seen[f.Key+who] {
				continue
			}
			seen[f.Key+who] = true
			r, ok := h.tt.Find(who)
			if !ok {
				continue
			}
			x0, y0 := int((r.X-120)*2), int((r.Y-60)*2)
			crop := image.Rect(max(0, x0), max(0, y0), min(img.Bounds().Dx(), x0+int(620*2)), min(img.Bounds().Dy(), y0+int(150*2)))
			save(fmt.Sprintf("crop-%s-%s-%s-%s-%s", lang, paper, tab, strings.ReplaceAll(f.Key, ":", "-"), who), img.SubImage(crop))
		}
	}
}
