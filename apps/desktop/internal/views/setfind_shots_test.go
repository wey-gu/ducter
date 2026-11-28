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

// D663: 找设置 / Find a setting on the Mac, against the settings demo core, at 1150 (the common
// laptop window), light or dark (DUCTER_SHOTS_DARK): the empty field, typing, a pane's name,
// nothing found, and the pane after the jump with its row lit.
//
//	DUCTER_PORT=7963 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-settings-real.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7963/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/setfind/mac> \
//	  go test ./internal/views -run SetFindShots
func TestSetFindShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	h.tt.SetSize(1150, 860)
	settle := func(n int) {
		for i := 0; i < n; i++ {
			h.tt.Frame()
			time.Sleep(60 * time.Millisecond)
			h.until("frames", func() bool { return true })
			h.tt.Advance(120 * time.Millisecond)
		}
	}
	shot := func(name string) {
		h.tt.Frame()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1150-%s-%s-%s.png", lang, paper, name)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	typed := func(zh, en string) string {
		if lang == i18n.EN {
			return en
		}
		return zh
	}
	h.app.openTab("")
	h.until("settings", func() bool { return h.app.S.Settings != nil })
	settle(10)
	shot("1-empty")
	h.app.sf.q = typed("安静", "quiet")
	h.app.sf.focus = true
	settle(4)
	shot("2-typing")
	h.app.sf.q = typed("通知", "notif")
	settle(4)
	shot("2b-pane-name")
	h.app.sf.q = typed("飞船", "spaceship")
	settle(4)
	shot("3-none")
	h.app.sf.q = typed("免打扰", "do not disturb")
	settle(3)
	hits := h.app.setFind(h.app.sf.q)
	if len(hits) == 0 || hits[0].e.id != "quiet" {
		t.Fatalf("no quiet hours for %q", h.app.sf.q)
	}
	h.app.setJump(hits[0].e)
	for i := 0; i < 6; i++ {
		h.tt.Frame()
		time.Sleep(60 * time.Millisecond)
		h.until("frames", func() bool { return true })
		h.tt.Advance(110 * time.Millisecond)
	}
	shot("4-landed")
	settle(20)
	shot("5-settled")
}
