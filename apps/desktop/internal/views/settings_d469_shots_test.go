package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D469: Settings as a whole, every pane against the author's real counts (demo-settings-real.ts),
// at 1280 and 760, zh and en, light and dark. A live run only:
//
//	DUCTER_PORT=7951 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-settings-real.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7951/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d469/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run SettingsD469Shots
func TestSettingsD469Shots(t *testing.T) {
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
	widths := []int{1280, 760}
	if s := os.Getenv("DUCTER_SHOT_WIDTHS"); s != "" {
		widths = nil
		for _, p := range strings.Split(s, ",") {
			if n, err := strconv.Atoi(p); err == nil {
				widths = append(widths, n)
			}
		}
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	for _, tab := range settingsTabs {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		settle()
		for _, w := range widths {
			h.tt.SetSize(w, pass3Height(tab))
			settle()
			name := fmt.Sprintf("mac-%d-%s-%s-%s", w, lang, paper, tab)
			f, err := os.Create(filepath.Join(dir, name+".png"))
			if err != nil {
				t.Fatal(err)
			}
			_ = png.Encode(f, h.tt.Image())
			f.Close()
		}
	}
}
