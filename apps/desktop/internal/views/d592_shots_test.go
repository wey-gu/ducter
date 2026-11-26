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
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D592: a Keep's page, its rule rows as buttons (at rest and hovered), its
// gestures (暂停, 立即运行, and 结束看守 last, apart; then its ask), and the
// last change's line under the card (two lines, then 展开), at 1150, with
// 2x crops. A live run only, against the demo home:
//
//	DUCTER_PORT=7592 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7592/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/copy-keep/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D592Shots -count=1
func TestD592Shots(t *testing.T) {
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
	crop := func(file string, r image.Rectangle) {
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
	name := func(s string) string { return fmt.Sprintf("mac-%s-1150-%s-%s.png", s, lang, paper) }
	var review string
	for _, k := range h.app.S.OnHand.Keeps {
		if k.Run == "same" {
			review = k.ID
		}
	}
	h.tt.SetSize(1150, 1500)
	h.tt.Move(2, 2)
	h.app.Route = RouteOnHand
	h.app.openKeep(review)
	h.until("page", func() bool { return h.app.S.KeepPages[review] != nil })
	settle()
	save(name("page"), h.tt.Image())
	// The rules card: from its first rule's name to the gestures.
	top, ok1 := h.tt.Find(h.app.L.T("keep.rule.wakes"))
	pause, ok2 := h.tt.Find(h.app.L.T("keep.pause"))
	if !ok1 || !ok2 {
		t.Fatalf("rules card not found: %v %v", ok1, ok2)
	}
	card := image.Rect(int(top.X)-30, int(top.Y)-20, int(top.X)+340, int(pause.Y+pause.H)+20)
	crop(name("rules-2x"), card)
	crop(name("acts-2x"), image.Rect(int(top.X)-30, int(pause.Y)-14, int(top.X)+340, int(pause.Y+pause.H)+14))
	// A rule row under the pointer.
	until, _ := h.tt.Find(h.app.L.T("keep.rule.until"))
	h.tt.Move(until.X+120, until.Y+12)
	settle()
	crop(name("row-hover-2x"), image.Rect(int(top.X)-30, int(until.Y)-24, int(top.X)+340, int(until.Y)+80))
	saidR, ok := h.tt.Find(h.app.L.T("keep.said"))
	if ok {
		h.tt.Move(saidR.X+120, saidR.Y+30)
		settle()
		crop(name("said-hover-2x"), image.Rect(int(saidR.X)-24, int(saidR.Y)-20, int(saidR.X)+520, int(saidR.Y)+120))
	}
	h.tt.Move(2, 2)
	// 结束看守's ask in place.
	h.app.oh.keep.stop = true
	settle()
	crop(name("stop-ask-2x"), image.Rect(int(top.X)-30, int(pause.Y)-14, int(top.X)+340, int(pause.Y)+150))
	h.app.oh.keep.stop = false
	// A long change, then its line under the card.
	k := h.app.S.KeepPages[review]
	goal := map[i18n.Lang]string{
		i18n.ZH: "nowledge-co 组织下请我们评审的 PR 都审完、评审都发到 GitHub 上，并且最后一轮再确认一次没有新的评审请求为止",
		i18n.EN: "until every PR in nowledge-co that asks us for a review is reviewed, each review is on GitHub, and a last look finds no new request",
	}[lang]
	h.app.keepSend(k, "until", protocol.KeepChange{Until: &goal}, false)
	h.until("changed", func() bool { return h.app.oh.keep.edit.status != nil })
	settle()
	save(name("changed"), h.tt.Image())
	if u, ok := h.tt.Find(h.app.L.T("keep.edit.undo")); ok {
		crop(name("changed-2x"), image.Rect(int(top.X)-30, int(u.Y)-70, int(top.X)+340, int(u.Y+u.H)+12))
	}
}
