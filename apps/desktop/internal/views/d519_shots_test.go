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

// D519: a Keep's page re-made (the review loop of the author's 0.1.35 shot),
// at 1400, 1150 and 1000: the page, its talk box (the conversation's
// composer) empty, focused with words, and sending, a round's 看细节 open,
// and 2x crops of the composer and the rail. A live run only:
//
//	DUCTER_PORT=7521 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7521/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/keep-page-v2/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D519Shots -count=1
func TestD519Shots(t *testing.T) {
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
	shoot := func(file string) { save(file, h.tt.Image()) }
	// crop saves a 2x crop of a region (the window draws at 1x here: each
	// pixel doubled, so corners and junctions can be read).
	crop := func(file string, r image.Rectangle) {
		src := h.tt.Image()
		r = r.Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				c := src.At(r.Min.X+x, r.Min.Y+y)
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{c}, image.Point{}, draw.Src)
			}
		}
		save(file, out)
	}
	var review string
	for _, k := range h.app.S.OnHand.Keeps {
		if k.Run == "same" {
			review = k.ID
		}
	}
	for _, w := range []int{1400, 1150, 1000} {
		h.tt.SetSize(w, 1500)
		h.tt.Move(2, 2)
		h.app.Route = RouteOnHand
		h.app.closeKeep()
		settle()
		shoot(fmt.Sprintf("mac-onhand-%d-%s-%s.png", w, lang, paper))
		h.app.openKeep(review)
		h.until("page", func() bool { return h.app.S.KeepPages[review] != nil })
		settle()
		shoot(fmt.Sprintf("mac-review-%d-%s-%s.png", w, lang, paper))
		if w == 1400 {
			crop(fmt.Sprintf("mac-rail-2x-%s-%s.png", lang, paper), image.Rect(0, 60, 300, 420))
		}
		// 看细节 open on the round that reported to Ducter in its own words.
		for _, r := range h.app.S.KeepPages[review].Rounds {
			if r.Report != "" && r.Did != "" && len(r.Report) > 60 {
				h.app.oh.keep.round = r.At + "|" + r.TaskID
				break
			}
		}
		settle()
		shoot(fmt.Sprintf("mac-review-details-%d-%s-%s.png", w, lang, paper))
		h.app.oh.keep.round = ""
		// The talk box: focused with words (ready), then sending.
		ph := h.app.L.T("keep.talk", h.app.L.T("keep.talk.every"))
		h.app.oh.keep.said = h.app.L.T("keep.talk.every")
		_ = h.tt.Click(ph)
		settle()
		shoot(fmt.Sprintf("mac-talk-ready-%d-%s-%s.png", w, lang, paper))
		if w == 1400 {
			crop(fmt.Sprintf("mac-talk-ready-2x-%s-%s.png", lang, paper), image.Rect(640, 1010, 1020, 1110))
		}
		h.app.oh.keep.sending, h.app.oh.keep.sentAt = "shot-sending", time.Now()
		settle()
		shoot(fmt.Sprintf("mac-talk-sending-%d-%s-%s.png", w, lang, paper))
		if w == 1400 {
			crop(fmt.Sprintf("mac-talk-sending-2x-%s-%s.png", lang, paper), image.Rect(640, 1010, 1020, 1110))
		}
		h.app.oh.keep.sending, h.app.oh.keep.said, h.app.oh.keep.told = "", "", review
		settle()
		shoot(fmt.Sprintf("mac-talk-told-%d-%s-%s.png", w, lang, paper))
		h.app.oh.keep.told = ""
	}
	// The conversation's composer, the same component: empty and with words.
	h.app.closeKeep()
	for _, w := range []int{1400, 1000} {
		h.tt.SetSize(w, 900)
		h.app.Route = RouteConversation
		h.app.draft = ""
		settle()
		shoot(fmt.Sprintf("mac-conv-empty-%d-%s-%s.png", w, lang, paper))
		h.app.draft = h.app.L.T("keep.talk.every")
		settle()
		shoot(fmt.Sprintf("mac-conv-ready-%d-%s-%s.png", w, lang, paper))
		h.app.draft = ""
	}
}
