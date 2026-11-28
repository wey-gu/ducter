package views

// D673 (research/248 phase 1): the look's shots. Run with the theme demo core (which installs
// and applies Midnight):
//
//	DUCTER_PORT=7551 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-theme.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7551/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/r248/mac> \
//	  DUCTER_SHOTS_WIDTHS=1000,1400 go test ./internal/views -run PluginsShots -v
//
// It shoots Settings › 外观和声音 / Look and sound (Pebble + Midnight, the preview tiles) and
// Settings › 插件 / Plugins at 1000 and 1400, zh and en, light and dark. The geometry/contrast
// truth these shots rest on is in plugins_view_test.go and theme/theme_json_test.go: a theme's
// token reaches a.T, and Pebble is restored by Back to Pebble.

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

func pluginsShotsWrite(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	pluginsShotsSave(t, tt.Image(), name)
}

func pluginsShotsSave(t *testing.T, img image.Image, name string) {
	t.Helper()
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}

func TestPluginsShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	widths := []int{1000, 1400}
	if ws := os.Getenv("DUCTER_SHOTS_WIDTHS"); ws != "" {
		widths = nil
		for _, w := range strings.Split(ws, ",") {
			var n int
			fmt.Sscanf(w, "%d", &n)
			widths = append(widths, n)
		}
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	for _, mode := range []string{"light", "dark"} {
		if mode == "dark" {
			h.tt.SetDark(true)
		} else {
			h.tt.SetDark(false)
		}
		h.app.Local.SetAppearance(mode)
		for _, width := range widths {
			h.tt.SetSize(width, 760)
			for _, tab := range []string{TabLook, TabPlugins} {
				h.app.openTab(tab)
				h.until("themes", func() bool { return h.app.S.Themes != nil && h.app.S.Themes.Active == "midnight" })
				settle()
				pluginsShotsWrite(t, h.tt, fmt.Sprintf("mac-%s-%s-%d-%s", tab, mode, width, lang))
				// A 2x crop of the theme rows (the tiles, the selection, 换回 Pebble).
				if tab == TabLook && width == widths[0] {
					if r, ok := h.tt.Find("Pebble"); ok {
						h.tt.SetScale(2)
						settle()
						img := h.tt.Image()
						x0, y0 := int(r.X-160)*2, int(r.Y-30)*2
						crop := img.SubImage(image.Rect(max(0, x0), max(0, y0), min(img.Bounds().Max.X, x0+700*2), min(img.Bounds().Max.Y, y0+200*2)))
						pluginsShotsSave(t, crop, fmt.Sprintf("mac-look-rows-%s-%s-crop-2x", mode, lang))
						h.tt.SetScale(1)
					}
				}
			}
			// The conversation under the theme.
			h.app.Route = RouteConversation
			settle()
			pluginsShotsWrite(t, h.tt, fmt.Sprintf("mac-conv-%s-%d-%s", mode, width, lang))
		}
	}
}
