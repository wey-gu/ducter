package views

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// TestFloatShots pictures the mini window (D438) beside the person's editor:
// a code editor with Ducter's own main.go open, the mini window at the top
// right under the menu bar, as the panel floats there. zh and en, light and
// dark, each of its lines.
//
//	DUCTER_FLOAT_SHOTS=$PWD/.shots/float go test ./internal/views -run TestFloatShots
func TestFloatShots(t *testing.T) {
	dir := os.Getenv("DUCTER_FLOAT_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_FLOAT_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	src, _ := os.ReadFile(filepath.Join("..", "..", "main.go"))
	code := strings.Split(string(src), "\n")
	start := 0
	for i, l := range code {
		if strings.Contains(l, "func (tm *trayMenu) refresh(force bool)") {
			start = max(i-6, 0)
		}
	}
	code = code[start:min(start+44, len(code))]
	const W, H, scale = 1440, 900, 2
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := map[bool]string{false: "light", true: "dark"}[dark]
			back := editorBackdrop(t, code, W, H, dark, lang)
			for _, scene := range []string{"working", "wait", "reply", "first", "quiet"} {
				app, rec, _ := floatApp(t, lang, scene)
				tt := ui.NewTesterWith(app.FloatView, FloatW, FloatMaxH, ui.TesterOptions{Dark: dark, Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(scale)
				tt.SetWindowActive(false)
				for i := 0; i < 6; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				h := rec.heights[len(rec.heights)-1]
				tt.SetSize(FloatW, h)
				for i := 0; i < 3; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				img := tt.Image()
				// The panel alone, and over the editor.
				writePNG(t, filepath.Join(dir, fmt.Sprintf("float-%s-%s-%s.png", scene, lang, paper)), img)
				out := image.NewRGBA(back.Bounds())
				draw.Draw(out, out.Bounds(), back, image.Point{}, draw.Src)
				x, y := (W-FloatW-16)*scale, (24+12)*scale
				panelOver(out, img, x, y, 16*scale, dark)
				writePNG(t, filepath.Join(dir, fmt.Sprintf("desk-%s-%s-%s.png", scene, lang, paper)), out)
			}
		}
	}
}

func writePNG(t *testing.T, path string, img image.Image) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}

// panelOver lays the panel's picture at x, y with its rounded corners and a
// soft shadow, as macOS draws a floating panel.
func panelOver(dst *image.RGBA, src *image.RGBA, x, y, radius int, dark bool) {
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	inside := func(px, py, grow int) float64 {
		// distance outside the rounded rect grown by grow (negative inside)
		r := float64(radius + grow)
		cx := math.Max(math.Max(float64(-grow)+r-float64(px), float64(px)-(float64(w+grow)-r)), 0)
		cy := math.Max(math.Max(float64(-grow)+r-float64(py), float64(py)-(float64(h+grow)-r)), 0)
		return math.Hypot(cx, cy) - r
	}
	// The shadow: 24 points of soft falloff, a little below.
	alpha := 0.22
	if dark {
		alpha = 0.55
	}
	sh := 140
	for py := -sh; py < h+sh; py++ {
		for px := -sh; px < w+sh; px++ {
			d := inside(px, py-12, 0)
			if d <= 0 {
				continue
			}
			k := alpha * math.Exp(-(d*d)/(2*36*36))
			if k < 0.004 {
				continue
			}
			X, Y := x+px, y+py
			if !(image.Point{X, Y}.In(dst.Bounds())) {
				continue
			}
			c := dst.RGBAAt(X, Y)
			dst.SetRGBA(X, Y, color.RGBA{uint8(float64(c.R) * (1 - k)), uint8(float64(c.G) * (1 - k)), uint8(float64(c.B) * (1 - k)), 255})
		}
	}
	for py := 0; py < h; py++ {
		for px := 0; px < w; px++ {
			d := inside(px, py, 0)
			cov := math.Min(math.Max(0.5-d, 0), 1)
			if cov == 0 {
				continue
			}
			s, b := src.RGBAAt(px, py), dst.RGBAAt(x+px, y+py)
			mix := func(a, c uint8) uint8 { return uint8(float64(a)*cov + float64(c)*(1-cov)) }
			dst.SetRGBA(x+px, y+py, color.RGBA{mix(s.R, b.R), mix(s.G, b.G), mix(s.B, b.B), 255})
		}
	}
}

// editorBackdrop is a code editor and the macOS menu bar over it: the
// person's own work, Ducter's main.go, at w × h.
func editorBackdrop(t *testing.T, code []string, w, h int, dark bool, lang i18n.Lang) *image.RGBA {
	t.Helper()
	bg, side, ink, muted, line, bar, kw := ui.RGB(0xFA, 0xF9, 0xF6), ui.RGB(0xF0, 0xEE, 0xEA), ui.RGB(0x2B, 0x2B, 0x2B), ui.RGB(0x9A, 0x96, 0x90), ui.RGB(0xE4, 0xE1, 0xDC), ui.RGBA(0xF6, 0xF4, 0xF0, 0.92), ui.RGB(0x8A, 0x3F, 0xB8)
	if dark {
		bg, side, ink, muted, line, bar, kw = ui.RGB(0x1E, 0x1F, 0x22), ui.RGB(0x18, 0x19, 0x1B), ui.RGB(0xD7, 0xD9, 0xDC), ui.RGB(0x6E, 0x72, 0x78), ui.RGB(0x2C, 0x2E, 0x32), ui.RGBA(0x24, 0x25, 0x28, 0.94), ui.RGB(0xC6, 0x8A, 0xF0)
	}
	files := []string{"apps", "  desktop", "    cmd", "    internal", "      views", "        float.go", "        alive.go", "        tray.go", "    appwindow.go", "    main.go", "  web", "design", "  ui.md", "  decisions.md", "docs", "packages"}
	clock := map[i18n.Lang]string{i18n.ZH: "11月21日 周六 21:14", i18n.EN: "Sat Nov 21  9:14 PM"}[lang]
	view := func(c *ui.Context) {
		mono := theme.Pebble().Mono
		ui.Column(c).Fill().Background(bg).Children(func() {
			ui.Row(c.Key("menubar")).Height(24).Background(bar).Padding(0, 14).Gap(18).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "").FontSize(13)
				for _, m := range []string{"Code", "File", "Edit", "Selection", "View", "Go"} {
					ui.Text(c, m).FontSize(13).TextColor(ink).FontWeight(map[bool]int{true: 700, false: 500}[m == "Code"])
				}
				ui.Box(c).Grow(1)
				ui.Text(c, clock).FontSize(13).TextColor(ink)
			})
			ui.Row(c.Key("win")).Grow(1).AlignItems(ui.Stretch).Children(func() {
				ui.Column(c.Key("side")).Width(230).Background(side).Padding(14, 12).Gap(5).Children(func() {
					ui.Text(c, "DUCTER").FontSize(11).FontWeight(700).TextColor(muted)
					for _, f := range files {
						col := ink
						if strings.TrimSpace(f) == "main.go" {
							col = kw
						}
						ui.Text(c.Key("f:"+f), f).Font(mono).FontSize(12.5).TextColor(col)
					}
				})
				ui.Column(c.Key("code")).Grow(1).Children(func() {
					ui.Row(c.Key("tabs")).Height(36).Background(side).AlignItems(ui.Center).Padding(0, 16).Gap(20).Children(func() {
						ui.Text(c, "main.go").FontSize(13).TextColor(ink).FontWeight(600)
						ui.Text(c, "float.go").FontSize(13).TextColor(muted)
						ui.Text(c, "ui.md").FontSize(13).TextColor(muted)
					})
					ui.Box(c).Height(1).Background(line)
					ui.Column(c.Key("lines")).Padding(12, 0).Gap(0).Children(func() {
						for i, l := range code {
							ui.Row(c.Key(fmt.Sprint("l", i))).Height(19).Children(func() {
								ui.Text(c, fmt.Sprint(i+300)).Font(mono).FontSize(12.5).TextColor(muted).Width(56).Padding(0, 14, 0, 0).TextAlign(ui.End)
								col := ink
								tl := strings.TrimSpace(l)
								if strings.HasPrefix(tl, "//") {
									col = muted
								} else if strings.HasPrefix(tl, "func ") || strings.HasPrefix(tl, "if ") || strings.HasPrefix(tl, "for ") || strings.HasPrefix(tl, "return") {
									col = kw
								}
								ui.Text(c, strings.ReplaceAll(l, "\t", "    ")).Font(mono).FontSize(12.5).TextColor(col).SingleLine()
							})
						}
					})
				})
			})
		})
	}
	tt := ui.NewTesterWith(view, w, h, ui.TesterOptions{Dark: dark})
	tt.SetScale(2)
	tt.Frame()
	tt.Frame()
	return tt.Image()
}

// TestD450FloatShots pictures what D450 added to the mini window: another
// AI's point left on a Go and on a result, and the partner held on its own
// agent (another thinking for it; nobody can until a time). zh and en,
// light and dark, the panel alone and over the editor.
//
//	DUCTER_D450_SHOTS=$PWD/.shots/seams-450 go test ./internal/views -run TestD450FloatShots
func TestD450FloatShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D450_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D450_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	src, _ := os.ReadFile(filepath.Join("..", "..", "main.go"))
	code := strings.Split(string(src), "\n")
	code = code[:min(44, len(code))]
	const W, H, scale = 1440, 900, 2
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := map[bool]string{false: "light", true: "dark"}[dark]
			back := editorBackdrop(t, code, W, H, dark, lang)
			for _, scene := range []string{"look-ask", "look-reply", "held", "held-waits", "talk-cant"} {
				var app *App
				switch scene {
				case "talk-cant":
					// The microphone tapped with nothing to think with (D440).
					app, _, _ = floatApp(t, lang, "quiet")
					app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first", NoBrain: true, KeyRoutes: routesElsewhere}})
					app.talkTap()
				case "look-ask":
					app = floatLookApp(t, lang, "ask")
				case "look-reply":
					app = floatLookApp(t, lang, "reply")
				default:
					k := heldCase(scene == "held-waits")
					app, _, _ = floatApp(t, lang, "working")
					app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Brain: k.setting}, BrainNow: k.brain})
				}
				tt := ui.NewTesterWith(app.FloatView, FloatW, FloatMaxH, ui.TesterOptions{Dark: dark, Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(scale)
				tt.SetWindowActive(false)
				for i := 0; i < 6; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				tt.SetSize(FloatW, app.float.h)
				for i := 0; i < 3; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				img := tt.Image()
				writePNG(t, filepath.Join(dir, fmt.Sprintf("float-%s-%s-%s.png", scene, lang, paper)), img)
				out := image.NewRGBA(back.Bounds())
				draw.Draw(out, out.Bounds(), back, image.Point{}, draw.Src)
				panelOver(out, img, (W-FloatW-16)*scale, (24+12)*scale, 16*scale, dark)
				writePNG(t, filepath.Join(dir, fmt.Sprintf("desk-%s-%s-%s.png", scene, lang, paper)), out)
			}
		}
	}
}
