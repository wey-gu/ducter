package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// TestAliveShots pictures the waiting line against apps/web/demo-alive.ts
// (D425): the conversation (or On hand with DUCTER_ALIVE_ROUTE=onhand) at
// 1280, light or dark, still or as a frame strip.
//
//	DUCTER_PORT=7990 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=checking bun apps/web/demo-alive.ts &
//	DUCTER_ALIVE_URL=ws://127.0.0.1:7990/ws DUCTER_SHELL_LANG=zh DUCTER_ALIVE_NAME=before-checking \
//	  DUCTER_SHOTS_DIR=$PWD/.shots/alive go test ./internal/views -run TestAliveShots
//
// DUCTER_ALIVE_FRAMES=n writes n frames DUCTER_ALIVE_GAP ms apart (default
// 100); DUCTER_SHOTS_DARK=1 the dark paper; DUCTER_ALIVE_REDUCE=1 Reduce
// Motion.
func TestAliveShots(t *testing.T) {
	url := os.Getenv("DUCTER_ALIVE_URL")
	if url == "" {
		t.Skip("DUCTER_ALIVE_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	name := os.Getenv("DUCTER_ALIVE_NAME")
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	if os.Getenv("DUCTER_ALIVE_REDUCE") != "" {
		h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	}
	h.until("the conversation", func() bool { return len(h.app.S.Channel) > 0 })
	h.app.Route = RouteConversation
	if os.Getenv("DUCTER_ALIVE_ROUTE") == "onhand" {
		h.app.Route = RouteOnHand
	}
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	h.tt.SetSize(1280, 860)
	for i := 0; i < 10; i++ {
		h.until("frames", func() bool { return true })
		h.tt.Advance(200 * time.Millisecond)
	}
	// DUCTER_ALIVE_WAIT=s holds the stage for s seconds on both clocks
	// (the reassurance lines count a step's time).
	if s, _ := strconv.Atoi(os.Getenv("DUCTER_ALIVE_WAIT")); s > 0 {
		time.Sleep(time.Duration(s) * time.Second)
		h.tt.Advance(time.Duration(s) * time.Second)
		h.until("frames", func() bool { return true })
		h.tt.Advance(200 * time.Millisecond)
	}
	frames, _ := strconv.Atoi(os.Getenv("DUCTER_ALIVE_FRAMES"))
	gap, _ := strconv.Atoi(os.Getenv("DUCTER_ALIVE_GAP"))
	if gap == 0 {
		gap = 100
	}
	shoot := func(file string) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	base := fmt.Sprintf("%s-mac-1280-%s-%s", name, lang, paper)
	if frames <= 1 {
		shoot(base + ".png")
		return
	}
	for i := range frames {
		shoot(fmt.Sprintf("%s-%02d.png", base, i))
		h.until("frames", func() bool { return true })
		h.tt.Advance(time.Duration(gap) * time.Millisecond)
	}
}
