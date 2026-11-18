package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D379: a saying never saved as a rule decided who does a task: the task's line says 你说过「…」 and
// one card asks to keep it, on the Mac against the demo core (apps/web/demo-said.ts). Light and dark:
//
//	DUCTER_SAID_URL=ws://127.0.0.1:7979/ws DUCTER_SAID_LANG=zh DUCTER_SHOTS_DIR=… \
//	  go test ./internal/views -run SaidShots -v
func TestSaidShots(t *testing.T) {
	url := os.Getenv("DUCTER_SAID_URL")
	if url == "" {
		t.Skip("DUCTER_SAID_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SAID_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetScale(2)
	s := h.app.S
	h.until("the task and its card", func() bool { return s.Task("t_osaka") != nil && s.Decisions["d_said"] != nil })
	h.tt.Advance(time.Second)
	// The ack's Details open, so the task's line (who and why) shows.
	if h.app.open == nil {
		h.app.open = map[string]bool{}
	}
	for i := 1; i <= 12; i++ {
		h.app.open[fmt.Sprintf("det:m%d", i)] = true
	}
	for _, dark := range []bool{false, true} {
		h.tt.SetDark(dark)
		theme := "light"
		if dark {
			theme = "dark"
		}
		h.app.Route = RouteConversation
		h.tt.SetSize(1280, 900)
		for i := 0; i < 12; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(150 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-conv-1280-%s-%s.png", lang, theme)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
