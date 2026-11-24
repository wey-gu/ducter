package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D535: the navigation pass, against the D519 demo core (the author's setup:
// the PR babysitter, the review loop, the fare watch, and what waits on him).
// At 1000, 1150 and 1400: the conversation with its count and the line over
// the composer; the door stepping through (frames); a Keep's page with its
// breadcrumb and its left column; On hand after leaving a Keep's page; 2x
// crops of the headers. A live run only:
//
//	DUCTER_PORT=7535 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-keep-v2.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7535/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/nav-pass/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D535Shots -count=1
func TestD535Shots(t *testing.T) {
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
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 50*time.Millisecond })
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
	name := func(what string, w int) string { return fmt.Sprintf("mac-%s-%d-%s-%s.png", what, w, lang, paper) }
	shoot := func(what string, w int) { save(name(what, w), h.tt.Image()) }
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
	header := func(what string, w int) {
		crop(fmt.Sprintf("mac-%s-head-2x-%d-%s-%s.png", what, w, lang, paper), image.Rect(0, 0, min(w, 760), ChromeH+8))
	}
	var sitter string
	for _, k := range h.app.S.OnHand.Keeps {
		if strings.Contains(k.Title, "Babysitter") {
			sitter = k.ID
		}
	}
	if sitter == "" {
		sitter = h.app.S.OnHand.Keeps[0].ID
	}
	needs := func() string {
		for _, s := range h.app.countParts(h.app.barBoard()) {
			if s == h.app.L.T("header.needs", h.app.barNeeds(h.app.barBoard())) {
				return s
			}
		}
		return ""
	}
	for _, w := range shotWidths() {
		h.tt.SetSize(w, 900)
		h.tt.Move(2, 2)
		// 1. The conversation: its count, and the line over the composer.
		h.app.closeKeep()
		h.app.Route = RouteConversation
		settle()
		shoot("conv", w)
		header("conv", w)
		crop(fmt.Sprintf("mac-conv-foot-2x-%d-%s-%s.png", w, lang, paper), image.Rect(0, 900-190, min(w, 900), 900))
		// 2. The door, step by step: the count, then the line, each a frame strip.
		n := needs()
		// Each tap starts at the conversation (its count is there); the find
		// runs on the app's clock, so the frames are taken in real time.
		for step := 1; step <= 6 && n != ""; step++ {
			h.app.Route = RouteConversation
			settle()
			click := n
			if _, ok := h.tt.Find(spoken(h.app.L, n, h.app.L.T("door.line.about"))); ok {
				click = spoken(h.app.L, n, h.app.L.T("door.line.about"))
			}
			// The find runs on the app's clock: held still here, then walked
			// frame by frame once the page has come in.
			at0 := time.Now()
			clock := at0
			h.app.Now = func() time.Time { return clock }
			if err := h.tt.Click(click); err != nil {
				t.Logf("%d: click %q: %v", w, n, err)
			}
			settle()
			frames := []time.Duration{60, 200, 380, 620, 900, 1600}
			if step != 1 && step != 4 {
				frames = frames[2:3]
			}
			for f, at := range frames {
				clock = at0.Add(at)
				h.tt.Advance(16 * time.Millisecond)
				h.tt.Frame()
				shoot(fmt.Sprintf("door-step%d-f%d", step, f), w)
				if os.Getenv("DUCTER_SHOTS_DEBUG") != "" {
					t.Logf("step %d f%d: route %v door %q focus %q", step, f, h.app.Route, h.app.door.last, h.app.oh.focus)
				}
			}
			h.app.Now = time.Now
		}
		// 3. A Keep's page: the breadcrumb, the left column.
		h.app.Route = RouteOnHand
		h.app.openKeep(sitter)
		h.until("page", func() bool { return h.app.S.KeepPages[sitter] != nil })
		settle()
		shoot("keep", w)
		header("keep", w)
		if w >= railFrom {
			crop(fmt.Sprintf("mac-keep-col-2x-%d-%s-%s.png", w, lang, paper), image.Rect(0, ChromeH-8, 300, ChromeH+260))
		}
		// 4. Away and back: On hand's overview (before: the page left open).
		h.app.Route = RouteConversation
		settle()
		h.app.Route = RouteOnHand
		settle()
		shoot("onhand-return", w)
		header("onhand-return", w)
	}
}

func shotWidths() []int {
	if os.Getenv("DUCTER_SHOTS_W") != "" {
		var w int
		fmt.Sscan(os.Getenv("DUCTER_SHOTS_W"), &w)
		return []int{w}
	}
	return []int{1400, 1150, 1000}
}
