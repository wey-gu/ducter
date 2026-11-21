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

// D287: On hand pictured against a seeded demo core in one of its moments
// (apps/web/demo-onhand.ts, DEMO_STATE=author|quiet|one|busy|waiting, or the
// long day), at 900, 1280 and 1600 points:
//
//	DEMO_STATE=author DUCTER_PORT=7851 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-onhand.ts
//	DUCTER_ONHAND_URL=ws://127.0.0.1:7851/ws DUCTER_ONHAND_NAME=author DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=../../../../.shots/d287 go test ./internal/views -run OnHandShots
func TestOnHandShots(t *testing.T) {
	url := os.Getenv("DUCTER_ONHAND_URL")
	if url == "" {
		t.Skip("DUCTER_ONHAND_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	name := os.Getenv("DUCTER_ONHAND_NAME")
	dir := shotsDir(t)
	h := dial(t, url, lang)
	if os.Getenv("DUCTER_ONHAND_SEEN") != "" {
		h.app.Local.SeenSince(time.Now().Add(-3 * time.Hour)) // D467: this Mac has kept track for a while
	}
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	if os.Getenv("DUCTER_ONHAND_EMPTY") == "" { // D467: an empty board pictured too
		h.until("the board", func() bool { return len(h.app.S.Tasks) > 0 })
	}
	h.app.Route = RouteOnHand
	if os.Getenv("DUCTER_ONHAND_SOURCES") != "" { // D467: the to-dos group needs its sources
		h.app.askTodos()
		h.until("the sources", func() bool { return h.app.S.Sources != nil && len(h.app.S.Sources.Sources) > 0 })
	}
	h.app.oh.srcAll = os.Getenv("DUCTER_ONHAND_SRCALL") != "" // D467: the whole sort, opened
	// D315: DUCTER_ONHAND_ROUTE=conv pictures the conversation, task:<id> an opened task.
	switch r := os.Getenv("DUCTER_ONHAND_ROUTE"); {
	case r == "conv":
		h.app.Route = RouteConversation
	case len(r) > 5 && r[:5] == "task:":
		h.app.OpenTask(r[5:])
	}
	paper := ""
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "-dark"
	}
	// D467: DUCTER_ONHAND_WIDTHS=1000,1400 pictures other widths.
	widths := []int{900, 1280, 1600}
	if ws := os.Getenv("DUCTER_ONHAND_WIDTHS"); ws != "" {
		widths = widths[:0]
		for _, f := range strings.Split(ws, ",") {
			if n, err := strconv.Atoi(strings.TrimSpace(f)); err == nil {
				widths = append(widths, n)
			}
		}
	}
	height := 1100
	if hs := os.Getenv("DUCTER_ONHAND_HEIGHT"); hs != "" {
		height, _ = strconv.Atoi(hs)
	}
	// D467: DUCTER_ONHAND_MOTION=n pictures n frames 1.2 s apart at the first width (the trail, the peek).
	if m, _ := strconv.Atoi(os.Getenv("DUCTER_ONHAND_MOTION")); m > 0 {
		h.tt.SetSize(widths[0], height)
		for i := 1; i <= m; i++ {
			time.Sleep(1200 * time.Millisecond)
			h.until("frames", func() bool { return true })
			h.tt.Advance(1200 * time.Millisecond)
			h.until("frames", func() bool { return true })
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-motion-%02d%s.png", name, i, paper)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, h.tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
		return
	}
	for _, w := range widths {
		h.tt.SetSize(w, height)
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s%s%s.png", name, w, lang, paper, os.Getenv("DUCTER_ONHAND_SUFFIX"))))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
