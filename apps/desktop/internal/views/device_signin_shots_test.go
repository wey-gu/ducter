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

// D599: the one-time-code sign-in card and an ask's own links and codes on
// the Mac, at 1150, with 2x crops of the card: the conversation and the
// opened task. A live run only, against the demo home:
//
//	DUCTER_PORT=7599 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_STAGE=waiting bun apps/web/demo-device-signin.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7599/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_STAGE=waiting DUCTER_SHOTS_DIR=<.shots/device-signin/after> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D599Shots -count=1
func TestD599Shots(t *testing.T) {
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
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.Decisions) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 12; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(400 * time.Millisecond)
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
	name := func(s string) string { return fmt.Sprintf("mac-%s-%s-1150-%s-%s.png", stage, s, lang, paper) }
	h.tt.SetSize(1150, 900)
	h.tt.Move(2, 2)
	settle()
	if stage == "copied" {
		if err := h.tt.Click(h.app.L.T("dsi.copy")); err != nil {
			t.Logf("copy: %v", err)
		}
		settle()
	}
	save(name("conv"), h.tt.Image())
	// The card: from the partner's words to the end of its rows.
	var top, bottom float32 = -1, -1
	for _, w := range []string{h.app.L.T("dsi.line", "GitHub"), h.app.L.T("dsi.expired"), "8694-B656", "fnm install 22", "https://github.com/login/device",
		"它需要你在 GitHub 网页上授权一下，才能克隆这个私有仓库。", "It needs you to approve it on GitHub's page before it can clone the private repo.",
		"haswell 上的 gh 要登录 GitHub，才能克隆这个私有仓库。", "gh on haswell needs a GitHub sign-in to clone the private repo."} {
		if r, ok := h.tt.Find(w); ok && (top < 0 || r.Y < top) {
			top = r.Y
		}
	}
	for _, w := range []string{h.app.L.T("dsi.left", 14), h.app.L.T("dsi.left", 15), h.app.L.T("decision.reply"), h.app.L.T("dsi.done", "GitHub"), h.app.L.T("decision.no_default")} {
		if r, ok := h.tt.Find(w); ok && r.Y+r.H > bottom {
			bottom = r.Y + r.H
		}
	}
	if top >= 0 && bottom > top {
		crop(name("card-2x"), image.Rect(180, int(top)-90, 840, int(bottom)+24))
	} else {
		t.Logf("card not found in %q", h.tt.Texts())
	}
	// The opened task: the same card on its page.
	for id := range h.app.S.Decisions {
		if d := h.app.S.Decisions[id]; d.TaskID != "" {
			h.app.OpenTask(d.TaskID)
			break
		}
	}
	settle()
	save(name("task"), h.tt.Image())
}
