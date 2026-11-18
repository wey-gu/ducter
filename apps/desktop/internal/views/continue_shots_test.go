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

// D373 (continuity first): the trip, one task carried on by each follow-up, on the Mac against the
// demo core (apps/web/demo-continue.ts): the conversation shows the task under the newest ask, and
// On hand keeps one card. Light and dark, wide and narrow:
//
//	DUCTER_CONTINUE_URL=ws://127.0.0.1:7911/ws DUCTER_CONTINUE_LANG=zh DUCTER_SHOTS_DIR=… \
//	  go test ./internal/views -run ContinueShots -v
func TestContinueShots(t *testing.T) {
	url := os.Getenv("DUCTER_CONTINUE_URL")
	if url == "" {
		t.Skip("DUCTER_CONTINUE_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_CONTINUE_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetScale(2)
	s := h.app.S
	// D376: the same shots of another demo task (DUCTER_CONTINUE_TASK, apps/web/demo-continue-more.ts).
	task := os.Getenv("DUCTER_CONTINUE_TASK")
	if task == "" {
		task = "t_trip"
	}
	h.until("the task", func() bool { return s.Task(task) != nil && len(s.Channel) > 0 })
	h.tt.Advance(time.Second)
	for _, dark := range []bool{false, true} {
		h.tt.SetDark(dark)
		theme := "light"
		if dark {
			theme = "dark"
		}
		for _, w := range []int{1280, 900} {
			for _, route := range []Route{RouteConversation, RouteOnHand} {
				h.app.Route = route
				h.tt.SetSize(w, 900)
				for i := 0; i < 12; i++ {
					h.until("frames", func() bool { return true })
					h.tt.Advance(150 * time.Millisecond)
				}
				name := "conversation"
				if route == RouteOnHand {
					name = "onhand"
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s-%s.png", name, w, theme, lang)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, h.tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
