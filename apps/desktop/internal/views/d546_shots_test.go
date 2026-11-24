package views

import (
	"fmt"
	"image"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D546: On hand and an opened task with four partners while another one is
// shown, before and after, at 1150, with 2x crops of the rows and the head,
// against a demo core with tasks of several partners:
//
//	DUCTER_D546_URL=ws://127.0.0.1:<port>/ws DUCTER_D546_SHOW=小玛 DUCTER_D546_TASK=<task id> \
//	  DUCTER_D546_ROWS='<title>|<title>' DUCTER_D546_MODE=light DUCTER_D546_TAG=after DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/owner-marks/mac go test ./internal/views -run D546Shots
func TestD546Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D546_URL")
	if url == "" {
		t.Skip("DUCTER_D546_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	mode := firstNonEmpty(os.Getenv("DUCTER_D546_MODE"), "light")
	tag := firstNonEmpty(os.Getenv("DUCTER_D546_TAG"), "after")
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.app.Local.SetAppearance(mode)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("partners", func() bool { return len(h.app.S.Partners) > 1 })
	show := os.Getenv("DUCTER_D546_SHOW")
	for _, p := range h.app.S.Partners {
		if p.Name == show {
			h.app.SwitchPartner(p.ID)
			h.until("the shown partner", func() bool { return h.app.S.Welcomed && h.app.S.Persona == p.ID })
		}
	}
	const w, hgt = 1150, 1000
	h.tt.SetSize(w, hgt)
	name := func(place string) string { return fmt.Sprintf("mac-%s-%s-%d-%s-%s", tag, place, w, lang, mode) }
	h.app.Route = RouteOnHand
	settle()
	d302Write(t, h.tt, name("onhand"))
	crop := func(place string, find string, pad float32) {
		r, ok := h.tt.Find(find)
		if !ok {
			t.Logf("no %q to crop", find)
			return
		}
		h.tt.SetScale(2)
		h.tt.Frame()
		img := h.tt.Image()
		sc := float32(img.Bounds().Dx()) / float32(w)
		y0, y1 := int((r.Y-pad)*sc), int((r.Y+r.H+pad)*sc)
		x0, x1 := int(max(0, r.X-pad-60)*sc), int(min(float32(w), r.X+r.W+pad+360)*sc)
		d302WriteImage(t, img.SubImage(image.Rect(x0, max(0, y0), x1, min(img.Bounds().Dy(), y1))), name(place)+"@2x")
		h.tt.SetScale(1)
		h.tt.Frame()
	}
	for i, title := range strings.Split(os.Getenv("DUCTER_D546_ROWS"), "|") {
		if title != "" {
			crop(fmt.Sprintf("onhand-row%d", i+1), title, 14)
		}
	}
	if id := os.Getenv("DUCTER_D546_TASK"); id != "" {
		h.app.OpenTask(id)
		settle()
		d302Write(t, h.tt, name("task"))
		// The head and the brief, and the rail's rows beside them, at 2x.
		h.tt.SetScale(2)
		h.tt.Frame()
		img := h.tt.Image()
		sc := float32(img.Bounds().Dx()) / float32(w)
		at := func(x0, y0, x1, y1 float32) image.Rectangle {
			return image.Rect(int(x0*sc), int(y0*sc), int(x1*sc), int(y1*sc))
		}
		d302WriteImage(t, img.SubImage(at(380, 64, 1070, 330)), name("task-head")+"@2x")
		d302WriteImage(t, img.SubImage(at(0, 64, 300, 600)), name("task-rail")+"@2x")
		h.tt.SetScale(1)
		h.tt.Frame()
	}
	h.app.Local.SetAppearance("system")
}
