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

// D295: Settings › 记忆 and › 连上的 AI agent at 1280 and 900, full length,
// against the demo core and its pretend Nowledge Mem (DEMO_MEM, apps/web/demo-mem.ts):
//
//	DUCTER_PORT=7895 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_MEM=cloud bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7895/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_TAG=cloud \
//	  DUCTER_SHOTS_DIR=../../../../.shots/d295/after go test ./internal/views -run MemoryLiveShots
func TestMemoryLiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	tag := os.Getenv("DUCTER_SHOTS_TAG")
	if tag != "" {
		tag = "-" + tag
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	shot := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s%s-%d-%s.png", name, tag, w, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	h.until("settings", func() bool { return true })
	tabs := []string{TabMemory}
	if os.Getenv("DUCTER_SHOTS_PEERS") != "0" {
		tabs = append(tabs, TabPeers)
	}
	for _, tab := range tabs {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		// The glance at Mem arrives in a second frame.
		for i := 0; i < 20; i++ {
			h.until("settings", func() bool { return true })
			h.tt.Advance(100 * time.Millisecond)
		}
		shot("settings-"+tab, 1280, 2300)
		shot("settings-"+tab, 900, 2700)
	}
}
