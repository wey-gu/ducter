package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D-PENDING: 已送达 / 已读 / 「{n}/{m} 已读」 beside a message Ducter sent on the person's behalf:
// Settings › Agent 通信's 来往, the conversation's relay line, and a helper's rounds. A live run:
//
//	DUCTER_PORT=7630 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-bridge-read.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7630/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/bridge-read/mac> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run BridgeReadShots -count=1
func TestBridgeReadShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.OnHand.Keeps) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
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
	save := func(file string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	crop2x := func(file string, r image.Rectangle) {
		src := h.tt.Image()
		r = r.Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
			}
		}
		save(file, out)
	}
	shoot := func(name string, w, hgt int) {
		h.tt.SetSize(w, hgt)
		settle()
		save(fmt.Sprintf("mac-%d-%s-%s-%s.png", w, lang, paper, name), h.tt.Image())
	}

	// Settings › Agent 通信: the 来往 rows, the task's own row, and the several-reader one.
	h.app.openTab(TabPeers)
	h.until("settings", func() bool { return h.app.S.Settings != nil && h.app.S.Bridge != nil })
	settle()
	shoot("peers", 1150, 2400)
	crop2x(fmt.Sprintf("mac-1150-%s-%s-peers-reads-2x.png", lang, paper), image.Rect(220, 900, 1146, 1250))

	// The conversation's relay lines.
	h.app.Route = RouteConversation
	settle()
	shoot("conv", 1150, 1200)

	// The helper's rounds: its task answered the sender.
	var sitter string
	for _, k := range h.app.S.OnHand.Keeps {
		if k.Run == "perItem" {
			sitter = k.ID
		}
	}
	if sitter == "" {
		t.Fatal("no helper Keep in the demo")
	}
	h.app.Route = RouteOnHand
	h.app.openKeep(sitter)
	h.until("page", func() bool { return h.app.S.KeepPages[sitter] != nil })
	settle()
	shoot("helper", 1150, 1500)
	crop2x(fmt.Sprintf("mac-1150-%s-%s-helper-rounds-2x.png", lang, paper), image.Rect(300, 470, 1000, 760))
	h.app.closeKeep()
}
