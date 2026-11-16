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

// D262: every place in one shell, pictured against a seeded demo core
// (apps/web/demo.ts), so the Mac and the web can be laid side by side:
//
//	DUCTER_PORT=7811 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7811/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=../../../../.shots/shell/mac \
//	  go test ./internal/views -run ShellShots
func TestShellShots(t *testing.T) {
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
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	shot := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", name, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	s := h.app.S
	h.until("the result", func() bool { return s.Task("t_flaky") != nil && len(s.Channel) > 0 })
	shot("conversation", 1280, 820)
	shot("conversation-narrow", 900, 700)
	h.app.Route = RouteOnHand
	shot("onhand", 1280, 820)
	h.app.OpenTask("t_flaky")
	h.until("history", func() bool { return s.Task("t_flaky").HistoryLoaded })
	shot("task", 1280, 820)
	shot("task-narrow", 900, 700)
	// D268: a long run through a service, its next turn under way, from its end and its head.
	if s.Task("t_conduct") != nil {
		h.app.OpenTask("t_conduct")
		h.until("history", func() bool { return s.Task("t_conduct").HistoryLoaded })
		shot("conduct", 1280, 900)
		shot("conduct-wide", 1680, 1000)
		scrollTaskTo(h.app, "t_conduct", 0)
		shot("conduct-top", 1280, 900)
		// Its finished turn opened, each run of steps opened.
		for _, tu := range turnsOf(h.app.blocks(s.Task("t_conduct"))) {
			h.app.open[fmt.Sprintf("turn:t_conduct:%d", tu.Seq)] = true
		}
		shot("conduct-open", 1280, 900)
		scrollTaskTo(h.app, "t_conduct", 0.5)
		shot("conduct-mid", 1280, 900)
		openStretches(h.app, "t_conduct")
		scrollTaskTo(h.app, "t_conduct", 0.5)
		shot("conduct-groups", 1280, 1100)
	}
	h.app.OpenDevices()
	h.until("devices", func() bool { return len(s.Devices) > 0 })
	shot("devices", 1280, 820)
	for _, tab := range []string{TabPartner, TabMemory, TabNotify, TabAccounts, TabAbout} {
		h.app.openTab(tab)
		shot("settings-"+tab, 1280, 820)
	}
	h.app.Route = RouteConversation
	h.app.OpenNewTask(nil)
	shot("newtask", 1280, 820)
}
