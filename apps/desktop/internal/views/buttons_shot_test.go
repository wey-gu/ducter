package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// The button family side by side (D76): ink, cream and orange, at rest and
// pressed, on the paper, on a needs-you card and on an ink surface.
// DUCTER_BUTTONS_SHOT=<name> writes <name>.png to shotsDir:
//
//	DUCTER_BUTTONS_SHOT=buttons-after go test ./internal/views -run ButtonsShot
func TestButtonsShot(t *testing.T) {
	name := os.Getenv("DUCTER_BUTTONS_SHOT")
	if name == "" {
		t.Skip("DUCTER_BUTTONS_SHOT not set")
	}
	app, _ := iaApp(t, i18n.EN)
	th := app.T
	row := func(c *ui.Context, key string, on ui.Color, pressed bool) {
		app.pressAll = pressed
		ui.Row(c.Key(key)).Gap(th.S3).AlignItems(ui.Center).Children(func() {
			label := "At rest"
			if pressed {
				label = "Pressed"
			}
			ink := th.InkMuted
			if on == th.Ink {
				ink = th.Faint
			}
			ui.Text(c, label).FontSize(th.SM).FontWeight(700).TextColor(ink).Width(70)
			app.button(c, "Merge into main", btnPrimary, th.ControlMD, on)
			app.button(c, "Open draft PR", btnSecondary, th.ControlMD, on)
			app.button(c, "Add to this Mac", btnAccent, th.ControlMD, on)
			app.button(c, "Go", btnPrimary, th.ControlLG, on)
		})
		app.pressAll = false
	}
	surface := func(c *ui.Context, key string, bg, base ui.Color) {
		ui.Column(c.Key(key)).Gap(th.S5).Padding(th.S5+4).Radius(th.RadiusLG).Background(bg).Shadow(0, 4, 0, 0, base).Children(func() {
			row(c, "rest", bg, false)
			row(c, "pressed", bg, true)
		})
	}
	view := func(c *ui.Context) {
		ui.Column(c).Fill().Background(th.Bg).Font(th.Body).Padding(th.S6).Gap(th.S6).Children(func() {
			surface(c, "paper", th.Bg, th.Line)
			surface(c, "needs", th.NeedsYou.Surface, th.NeedsYou.Ledge)
			surface(c, "ink", th.Ink, th.Ink.Mix(ui.Hex("#000000"), 0.5))
		})
	}
	tt := ui.NewTesterWith(view, 760, 720, ui.TesterOptions{Preferences: ui.Preferences{}})
	tt.SetScale(2)
	tt.Frame()
	tt.Advance(time.Second)
	tt.Frame()
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}
