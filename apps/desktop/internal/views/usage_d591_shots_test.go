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

// D591: Overview's 这周的额度用在了哪儿 and the limit card's line, against a live demo core. A live
// run only (the demo seeds the week with DEMO_USAGE=1; without it, the empty Overview):
//
//	DUCTER_PORT=7961 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_USAGE=1 bun apps/web/demo-settings-real.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7961/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d591> \
//	  [DUCTER_SHOTS_DARK=1] [DUCTER_SHOT_STATE=empty] [DUCTER_SHOT_TASKS=t_lim1,t_lim2] go test ./internal/views -run UsageD591Shots
func TestUsageD591Shots(t *testing.T) {
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
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	state := os.Getenv("DUCTER_SHOT_STATE")
	if state == "" {
		state = "filled"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	save := func(name string, crop image.Rectangle) {
		img := h.tt.Image()
		var out image.Image = img
		if !crop.Empty() {
			out = img.SubImage(crop)
		}
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, out)
		f.Close()
	}
	base := fmt.Sprintf("mac-1150-%s-%s", lang, paper)
	if ids := os.Getenv("DUCTER_SHOT_TASKS"); ids != "" {
		h.tt.SetSize(1150, 900)
		h.tt.SetScale(2) // the card at 2x: the whole window is its crop
		for _, id := range strings.Split(ids, ",") {
			h.app.OpenTask(id)
			h.until("history", func() bool { tk := h.app.S.Task(id); return tk != nil && tk.HistoryLoaded })
			h.until("usage", func() bool { return h.app.S.Usage.Report != nil })
			settle()
			save(fmt.Sprintf("%s-limit-%s", base, id), image.Rectangle{})
		}
		return
	}
	h.app.openTab(TabHome)
	h.until("settings", func() bool { return h.app.S.Settings != nil })
	h.until("usage", func() bool { return h.app.S.Usage.Report != nil })
	h.tt.SetSize(1150, 2000)
	settle()
	save(fmt.Sprintf("%s-overview-%s", base, state), image.Rectangle{})
	if state == "empty" {
		return
	}
	// The section alone, at 2x (the window renders at its own scale).
	crop := func(name string) {
		h.tt.SetScale(2)
		settle()
		defer func() { h.tt.SetScale(1); settle() }()
		r, ok := h.tt.Find(h.app.L.T("usage.head"))
		if !ok {
			t.Fatalf("no section in %q", h.tt.Texts())
		}
		img := h.tt.Image()
		sx := float32(img.Bounds().Dx()) / 1150
		y0 := int((r.Y - 24) * sx)
		y1 := int((r.Y + 520) * sx)
		if y1 > img.Bounds().Dy() {
			y1 = img.Bounds().Dy()
		}
		save(name, image.Rect(0, y0, img.Bounds().Dx(), y1))
	}
	crop(fmt.Sprintf("%s-section-%s", base, state))
	if h.app.open == nil {
		h.app.open = map[string]bool{}
	}
	h.app.open["usage-more"] = true
	settle()
	save(fmt.Sprintf("%s-overview-more", base), image.Rectangle{})
	crop(fmt.Sprintf("%s-section-more", base))
}
