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

// D534: @ and / in the Mac's composers, on the author's real work: the
// conversation's sent chips, the @ list (nothing typed, then words, then the
// mark in the words after a pick), the / list, and in an opened task its
// sent chip, the @ list with files and the agent's own commands; 1400 and
// 1000, with 2x crops of the list and the composer. A live run only:
//
//	DUCTER_PORT=7591 DEMO_LANG=zh bun .shots/composer-mentions/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7591/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/composer-mentions/mac> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D534Shots -count=1
func TestD534Shots(t *testing.T) {
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
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.Task("t_mentions") != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
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
	save := func(file string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, img)
		f.Close()
	}
	shoot := func(file string) { save(file, h.tt.Image()) }
	crop := func(file string, r image.Rectangle) {
		src := h.tt.Image()
		r = r.Intersect(src.Bounds())
		if r.Empty() {
			return
		}
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				c := src.At(r.Min.X+x, r.Min.Y+y)
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{c}, image.Point{}, draw.Src)
			}
		}
		save(file, out)
	}
	// popRect is the list's box with a margin, from where the composer stands.
	popRect := func(w int, below int) image.Rectangle {
		return image.Rect(0, below-420, w, below+120)
	}
	typeIn := func(label, s string) {
		_ = h.tt.Click(label)
		settle()
		h.tt.Type(s)
		settle()
	}
	for _, w := range []int{1400, 1000} {
		tag := fmt.Sprintf("%d-%s-%s", w, lang, paper)
		h.tt.SetSize(w, 900)
		h.tt.Move(2, 2)
		h.app.Route = RouteConversation
		h.app.draft = ""
		settle()
		shoot("mac-conv-sent-" + tag + ".png")
		ph := h.app.L.T("composer.placeholder", h.app.S.PersonaName)
		typeIn(ph, "@")
		h.until("@ list", func() bool { return h.app.S.Mentions.List != nil })
		settle()
		shoot("mac-conv-at-" + tag + ".png")
		crop("mac-conv-at-pop-2x-"+tag+".png", popRect(w/2+200, 840))
		word := "登录"
		if lang == i18n.EN {
			word = "sign"
		}
		h.tt.Type(word)
		settle()
		h.tt.Key(0, ui.KeyDown)
		settle()
		shoot("mac-conv-at-q-" + tag + ".png")
		h.tt.Key(0, ui.KeyUp)
		h.tt.Key(0, ui.KeyEnter)
		settle()
		h.tt.Type("Safari")
		settle()
		shoot("mac-conv-picked-" + tag + ".png")
		crop("mac-conv-picked-2x-"+tag+".png", image.Rect(0, 780, w, 900))
		h.app.draft = ""
		settle()
		typeIn(ph, "/")
		h.until("/ list", func() bool { return h.app.S.Mentions.Slash[""] != nil })
		settle()
		shoot("mac-conv-slash-" + tag + ".png")
		crop("mac-conv-slash-pop-2x-"+tag+".png", popRect(w/2+200, 840))
		h.tt.Key(0, ui.KeyEscape)
		h.app.draft = ""
		settle()
		// The opened task.
		h.app.OpenTask("t_mentions")
		settle()
		shoot("mac-task-sent-" + tag + ".png")
		tph := h.app.L.T("composer.task")
		typeIn(tph, "@composer")
		settle()
		shoot("mac-task-at-" + tag + ".png")
		h.tt.Key(0, ui.KeyEscape)
		h.app.taskDrafts["t_mentions"] = ""
		settle()
		typeIn(tph, "/")
		h.until("task / list", func() bool { return h.app.S.Mentions.Slash["t_mentions"] != nil })
		settle()
		shoot("mac-task-slash-" + tag + ".png")
		crop("mac-task-slash-pop-2x-"+tag+".png", image.Rect(w/3, 380, w, 900))
		h.tt.Key(0, ui.KeyEscape)
		h.app.taskDrafts["t_mentions"] = ""
		settle()
	}
}
