package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D468: the Settings panes other than Memory and Agent messaging, at the window's usual 1280 and its
// narrowest 760, against apps/web/demo-settings-real.ts. Shots only; the geometry findings are written
// beside each shot.
//
//	DUCTER_PORT=7961 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-settings-real.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7961/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d468/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D468Shots
func TestD468Shots(t *testing.T) {
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
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	for _, tab := range []string{TabPartner, TabNotify, TabAccounts, TabTodos, TabChats, TabAutofill, TabLook, TabRun, TabAbout} {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		settle()
		for _, w := range []int{1280, 760} {
			h.tt.SetSize(w, pass3Height(tab))
			settle()
			name := fmt.Sprintf("mac-%d-%s-%s-%s", w, paper, lang, tab)
			f, err := os.Create(filepath.Join(dir, name+".png"))
			if err != nil {
				t.Fatal(err)
			}
			_ = png.Encode(f, h.tt.Image())
			f.Close()
			if bad := paneGeometry(h.tt, float32(w)); len(bad) > 0 {
				_ = os.WriteFile(filepath.Join(dir, name+".geo.txt"), []byte(strings.Join(bad, "\n")), 0o644)
				t.Logf("%s: %d geometry findings", name, len(bad))
			}
		}
	}
}
