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

// D539: 复制密钥 / Copy a key on the Mac at 1150, light and dark: the card in
// the conversation, the task waiting on it in 等你, the task's own card, and
// Ducter 存着的密钥 on this computer's card, with 2x crops of the card's edges
// and buttons, against a demo core:
//
//	DUCTER_PORT=7941 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_KEYCOPY=1 bun apps/web/demo.ts
//	DUCTER_D539_URL=ws://127.0.0.1:7941/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/secret-copy go test ./internal/views -run D539Shots
func TestD539Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D539_URL")
	if url == "" {
		t.Skip("DUCTER_D539_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	// The card's first fact (変量名 / Variable): the title stands above it (its words keep a no-break space).
	title := h.app.L.T("key.env")
	goLabel, holdLabel, note := h.app.L.T("copykey.go"), h.app.L.T("copykey.hold"), h.app.L.T("copykey.note")
	// The card and its buttons at 2x, light and dark: from its title to under its buttons.
	crop := func(name, top string) {
		t.Helper()
		for _, mode := range []string{"light", "dark"} {
			h.app.Local.SetAppearance(mode)
			settle()
			h.tt.SetScale(2)
			h.tt.Frame()
			tr, ok := h.tt.Find(top)
			hr, ok2 := h.tt.Find(note)
			if !ok || !ok2 {
				t.Fatalf("no %q or %q to crop in %q", top, holdLabel, h.tt.Texts())
			}
			// The buttons under the note: 复制 / Copy first, left of 先不 / Not now.
			gr, _ := h.tt.Find(goLabel + "，STI_MCP_API_KEY")
			if lang == i18n.EN {
				gr, _ = h.tt.Find(goLabel + ", STI_MCP_API_KEY")
			}
			nr, _ := h.tt.Find(holdLabel + map[bool]string{true: ", STI_MCP_API_KEY", false: "，STI_MCP_API_KEY"}[lang == i18n.EN])
			if gr.X >= nr.X {
				t.Errorf("%s: 复制 / Copy must come first (left of 先不), at %v and %v", name, gr.X, nr.X)
			}
			d539Crop(t, h.tt, 1150, image.Rect(int(tr.X-40), int(tr.Y-96), int(tr.X+620), int(hr.Y+hr.H+72)), fmt.Sprintf("mac-1150-%s-%s-%s@2x", name, mode, lang))
			h.tt.SetScale(1)
		}
		h.app.Local.SetAppearance("system")
	}
	h.until("the copy cards", func() bool { return h.app.S.Decisions["d_copy_both"] != nil })
	h.tt.SetSize(1150, 900)
	d302Both(t, h.app, h.tt, settle, "1150-01-conversation", lang)
	crop("01-conversation-card-crop", title)
	h.app.Route = RouteOnHand
	d302Both(t, h.app, h.tt, settle, "1150-02-onhand-needs-you", lang)
	crop("02-onhand-card-crop", title)
	h.app.OpenTask("t_prow")
	d302Both(t, h.app, h.tt, settle, "1150-03-task-card", lang)
	h.app.OpenDevices()
	h.until("the devices", func() bool { return h.app.S.Devices != nil })
	h.app.devState().sel = "local"
	settle()
	h.app.devState().card.sheet.fold = "kept:local"
	h.tt.SetSize(1150, 1400)
	d302Both(t, h.app, h.tt, settle, "1150-04-settings-kept-keys", lang)
}

// d539Crop writes the part r (in points) of the window drawn at its scale.
func d539Crop(t *testing.T, tt *ui.Tester, w int, r image.Rectangle, name string) {
	t.Helper()
	src := tt.Image()
	sc := float64(src.Bounds().Dx()) / float64(w)
	px := image.Rect(int(float64(r.Min.X)*sc), int(float64(r.Min.Y)*sc), int(float64(r.Max.X)*sc), int(float64(r.Max.Y)*sc)).Intersect(src.Bounds())
	out := image.NewRGBA(image.Rect(0, 0, px.Dx(), px.Dy()))
	draw.Draw(out, out.Bounds(), src, px.Min, draw.Src)
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, out); err != nil {
		t.Fatal(err)
	}
}
