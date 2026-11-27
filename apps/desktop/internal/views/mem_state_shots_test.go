package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D646: Mem's states as the Mac draws them, at the two laptop widths (1150 and 1400): Memory,
// Agent messaging and Overview, in zh or en, light or dark. A live run only, against a demo core:
//
//	DUCTER_PORT=7941 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_MEM=closed bun apps/web/demo-memory.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7941/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/memstate/after> \
//	  DUCTER_SHOTS_STAGE=closed go test ./internal/views -run MemStateShots -count=1
func TestMemStateShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	stage := os.Getenv("DUCTER_SHOTS_STAGE")
	if stage == "" {
		stage = "state"
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
		for i := 0; i < 10; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	shoot := func(name string, w, hgt int) {
		h.tt.SetSize(w, hgt)
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%d-%s-%s-%s-%s.png", w, lang, stage, name, paper)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
	for _, tab := range []struct{ name, key string }{{"memory", TabMemory}, {"peers", TabPeers}, {"overview", TabHome}} {
		h.app.openTab(tab.key)
		h.until("tab", func() bool { return h.app.S.Settings != nil })
		settle()
		for _, w := range []int{1150, 1400} {
			shoot(tab.name, w, 2200)
		}
	}
}
