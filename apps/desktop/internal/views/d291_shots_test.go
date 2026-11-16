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

// D291 (no joined text): the surfaces it rebuilt, shot against a demo
// core, before and after.
//
//	DUCTER_PORT=7891 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_D291_URL=ws://127.0.0.1:7891/ws DUCTER_SHOTS_DIR=… go test ./internal/views -run TestD291Shots -v
//
// DUCTER_D291_SET=devices shoots only the Devices page (for
// apps/web/demo-devices.ts with DEMO_HANDHELDS=1).
func TestD291Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D291_URL")
	if url == "" {
		t.Skip("DUCTER_D291_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetSize(1440, 900)
	s := h.app.S
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	shot := func(name string) {
		t.Helper()
		settle()
		dir := os.Getenv("DUCTER_SHOTS_DIR")
		if dir == "" {
			return
		}
		_ = os.MkdirAll(dir, 0o755)
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", name, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	h.app.OpenDevices()
	h.until("devices", func() bool { return len(s.Devices) > 0 })
	shot("devices")
	if os.Getenv("DUCTER_D291_SET") == "devices" {
		return
	}
	h.app.Route = RouteConversation
	shot("conversation")
	h.app.Route = RouteOnHand
	shot("onhand")
	for _, id := range []string{"t_flaky", "t_rebase", "t_loop"} {
		if s.Task(id) == nil {
			continue
		}
		h.app.OpenTask(id)
		h.until("history", func() bool { return s.Task(id).HistoryLoaded })
		shot("task-" + id)
		if id == "t_loop" {
			scrollTaskTo(h.app, id, 0.5)
			if hoverLocator(h.app, h.tt) {
				shot("task-" + id + "-locator")
			}
		}
	}
}
