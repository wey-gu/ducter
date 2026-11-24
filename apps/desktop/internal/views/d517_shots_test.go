package views

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D517: the list of partners after the author's review of 0.1.35, at 1000,
// 1150 and 1400, light and dark, its On hand (the one count, each item under
// 等你), and a switch as frames (the list still, the pebble gliding, the
// conversation coming in), against a demo core:
//
//	DUCTER_PORT=7933 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PARTNERS=1 DEMO_PARTNER_NEW=1 DEMO_PARTNER_FOUR=1 bun apps/web/demo.ts
//	DUCTER_D517_URL=ws://127.0.0.1:7933/ws DUCTER_D517_NAME=4p DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/partners-rail-v2 go test ./internal/views -run D517Shots
func TestD517Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D517_URL")
	if url == "" {
		t.Skip("DUCTER_D517_URL not set")
	}
	name := os.Getenv("DUCTER_D517_NAME")
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	both := func(shot string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		d302Both(t, h.app, h.tt, settle, name+"-"+shot+"-"+itoa(int64(w)), lang)
	}
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.Partners != nil })
	for _, w := range []int{1400, 1150, 1000} {
		both("conv", w, 900)
	}
	// The top-left corner at 2x, light and dark, wide and slim: the window's
	// traffic lights drawn where the window puts them (the tester has none).
	for _, w := range []int{1400, 1150} {
		for _, mode := range []string{"light", "dark"} {
			h.app.Local.SetAppearance(mode)
			h.tt.SetSize(w, 900)
			settle()
			h.tt.SetScale(2)
			h.tt.Frame()
			d517Corner(t, h.tt, w, fmt.Sprintf("mac-%s-corner-%d-%s-%s@2x", name, w, mode, lang))
			h.tt.SetScale(1)
		}
	}
	h.app.Local.SetAppearance("system")
	h.app.Route = RouteOnHand
	both("onhand", 1150, 1100)
	h.app.Route = RouteConversation
	if len(h.app.S.Partners) < 2 {
		return
	}
	// A switch, frame by frame, light, at 1150: the list never leaves.
	h.app.Local.SetAppearance("light")
	// With motion (the harness's tester has Reduce Motion on): the glide and the entrance show.
	h.tt = ui.NewTesterWith(h.app.View, 1150, 900, ui.TesterOptions{})
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle()
	next := h.app.S.Partners[1].ID
	h.app.SwitchPartner(next)
	for i, ms := range []int{0, 40, 80, 140, 220, 320, 480} {
		if i > 0 {
			h.until("frames", func() bool { return true })
			h.tt.Advance(time.Duration(ms-[]int{0, 0, 40, 80, 140, 220, 320}[i]) * time.Millisecond)
		}
		h.tt.Frame()
		d302Write(t, h.tt, fmt.Sprintf("mac-%s-switch-1150-%02d-%03dms-%s", name, i, ms, lang))
	}
	h.until("the other partner", func() bool { return h.app.S.Welcomed && h.app.S.Persona == next })
	settle()
	d302Write(t, h.tt, fmt.Sprintf("mac-%s-switch-1150-99-done-%s", name, lang))
	h.app.Local.SetAppearance("system")
}

// d517Corner writes the window's top-left corner (360 x 200 points) at the
// tester's scale, with the three window controls drawn where TrafficLights
// puts them (12-point circles, 20 apart), so the shot shows what sits by them.
func d517Corner(t *testing.T, tt *ui.Tester, w int, name string) {
	t.Helper()
	src := tt.Image()
	sc := float32(src.Bounds().Dx()) / float32(w)
	out := image.NewRGBA(image.Rect(0, 0, int(360*sc), int(200*sc)))
	draw.Draw(out, out.Bounds(), src, image.Point{}, draw.Src)
	for i, col := range []color.RGBA{{0xFF, 0x5F, 0x57, 0xFF}, {0xFE, 0xBC, 0x2E, 0xFF}, {0x28, 0xC8, 0x40, 0xFF}} {
		cx, cy, r := (TrafficLights.X+6+float32(i)*20)*sc, (TrafficLights.Y+6)*sc, 6*sc
		for y := int(cy - r); y <= int(cy+r); y++ {
			for x := int(cx - r); x <= int(cx+r); x++ {
				if dx, dy := float32(x)-cx, float32(y)-cy; dx*dx+dy*dy <= r*r {
					out.Set(x, y, col)
				}
			}
		}
	}
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, out); err != nil {
		t.Fatal(err)
	}
}
