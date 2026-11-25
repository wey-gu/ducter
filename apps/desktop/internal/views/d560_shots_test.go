package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D560: Agent messaging's 你的 agent rows, said from Mem's facts (the next session, an old plugin's
// update), against apps/web/demo-d560.ts, at 1150 (and 1000, 1400), zh and en, light and dark, with
// a 2x crop of the agents group. A live run only:
//
//	DUCTER_PORT=7601 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_STAGE=next bun apps/web/demo-d560.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7601/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/mailbox-loop/after> \
//	  DUCTER_SHOTS_STAGE=next [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D560Shots
func TestD560Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	stage := os.Getenv("DUCTER_SHOTS_STAGE")
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	name := func(w int, what string) string {
		return filepath.Join(dir, fmt.Sprintf("mac-%d-%s-%s-%s-%s.png", w, lang, paper, stage, what))
	}
	save := func(path string, img image.Image) {
		f, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	h.app.openTab(TabPeers)
	h.until("settings", func() bool { return h.app.S.Settings != nil && h.app.S.Bridge != nil && len(h.app.S.Devices) > 1 })
	for _, w := range []int{1150, 1000, 1400} {
		h.tt.SetSize(w, 1500)
		settle()
		img := h.tt.Image()
		save(name(w, "peers"), img)
		if w != 1150 {
			continue
		}
		// The 2x crop of the agents group, from its title down (the rows and the button).
		if r, ok := h.tt.Find(h.app.L.T("peers.agents.title")); ok {
			h.tt.SetScale(2)
			settle()
			big := h.tt.Image()
			x0, y0 := int((r.X-40)*2), int((r.Y-24)*2)
			save(name(w, "agents-2x"), cropShot(big, image.Rect(x0, y0, w*2, y0+int(360*2))))
			h.tt.SetScale(1)
			settle()
		}
	}
}

// cropShot cuts one rectangle out of a shot (the image is already at 2x).
func cropShot(img image.Image, r image.Rectangle) image.Image {
	type sub interface {
		SubImage(image.Rectangle) image.Image
	}
	if s, ok := img.(sub); ok {
		return s.SubImage(r.Intersect(img.Bounds()))
	}
	return img
}

// D560: the review loop's page (apps/web/demo-keep-v2.ts) at 1150, with a 2x crop of its newest rounds:
// what woke each one is a sentence (#11093 有新提交), never a bare 变了. A live run only:
//
//	DUCTER_PORT=7611 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7611/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/mailbox-loop/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D560KeepShots -count=1
func TestD560KeepShots(t *testing.T) {
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
	var review string
	for _, k := range h.app.S.OnHand.Keeps {
		if k.Run == "same" {
			review = k.ID
		}
	}
	h.tt.SetSize(1150, 1500)
	h.app.Route = RouteOnHand
	h.app.openKeep(review)
	h.until("page", func() bool { return h.app.S.KeepPages[review] != nil })
	settle()
	save(fmt.Sprintf("mac-1150-%s-%s-keep.png", lang, paper), h.tt.Image())
	// The newest rounds, from the first round's line down.
	p := h.app.S.KeepPages[review]
	if p == nil || len(p.Rounds) == 0 {
		t.Fatal("no rounds")
	}
	line := h.app.keepRoundWoke(p.Rounds[0], p)
	r, ok := h.tt.Find(line)
	if !ok {
		t.Logf("round line %q not found on the page", line)
		return
	}
	h.tt.SetScale(2)
	settle()
	big := h.tt.Image()
	x0, y0 := int((r.X-120)*2), int((r.Y-30)*2)
	save(fmt.Sprintf("mac-1150-%s-%s-keep-rounds-2x.png", lang, paper), cropShot(big, image.Rect(x0, y0, 1150*2, y0+int(300*2))))
	h.tt.SetScale(1)
	settle()
}
