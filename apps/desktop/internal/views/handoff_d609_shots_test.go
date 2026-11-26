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

// D609: the sender's one line in each state and the helper's Keep grouped 手上的事, at 1150,
// zh, light and dark, against apps/web/demo-handoff.ts:
//
//	DUCTER_PORT=7610 DEMO_LANG=zh bun apps/web/demo-handoff.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7610/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/handoff/mac/light> \
//	  go test ./internal/views -run D609Shots -count=1
//	DUCTER_SHELL_URL=... DUCTER_SHOTS_DARK=1 DUCTER_SHOTS_DIR=<.shots/handoff/mac/dark> ...
func TestD609Shots(t *testing.T) {
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
	h.tt.SetSize(1150, 1800)
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
	save(fmt.Sprintf("mac-keep-1150-%s-%s.png", lang, paper), h.tt.Image())
	// 2x crop of the grouped 手上的事.
	src := h.tt.Image()
	r := image.Rect(0, 260, 760, 980).Intersect(src.Bounds())
	out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
	for y := 0; y < r.Dy(); y++ {
		for x := 0; x < r.Dx(); x++ {
			draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
		}
	}
	save(fmt.Sprintf("mac-keep-holding-2x-1150-%s-%s.png", lang, paper), out)
	h.app.closeKeep()

	for _, id := range []string{"t_given", "t_taken", "t_done", "t_returned", "t_declined", "t_withdrawn"} {
		h.app.Route, h.app.TaskID = RouteTask, id
		h.app.ensureHistory(id)
		h.until("task "+id, func() bool {
			tsk := h.app.S.Task(id)
			return tsk != nil && tsk.Card != nil && tsk.Card.Handoff != nil && tsk.HistoryLoaded
		})
		settle()
		save(fmt.Sprintf("mac-task-%s-1150-%s-%s.png", id, lang, paper), h.tt.Image())
	}
}
