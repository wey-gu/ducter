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

// D332: Settings › 终端里的 AI (and the Partner page's one line) against a
// demo core with its pretend Nowledge Mem, light and dark:
//
//	DUCTER_PORT=7995 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_MEM=cloud DEMO_PAST=1 DEMO_PEER=history bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7995/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_TAG=3-connected-history \
//	  DUCTER_SHOTS_DIR=../../../../.shots/d332 go test ./internal/views -run D332LiveShots
func TestD332LiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	tag := os.Getenv("DUCTER_SHOTS_TAG")
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 15; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("settings", func() bool { return true })
	tab := TabPeers
	if os.Getenv("DUCTER_SHOTS_PARTNER") != "" {
		tab = TabPartner
	}
	for _, dark := range []bool{false, true} {
		h.tt.SetDark(dark)
		paper := "light"
		if dark {
			paper = "dark"
		}
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		h.tt.SetSize(1280, 1900)
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s-%s.png", tag, lang, paper, tab)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
