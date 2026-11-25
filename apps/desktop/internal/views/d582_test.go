package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// TestD582PartnerRowRests: Settings › 伙伴's rows rest as the figure each has;
// 改一下 opens that one row's name, figure, colours and what it thinks with,
// on the name's edge, inside the window at 1000 and 1400, zh and en; a figure
// picked there is said once under the row and stays said after 好 closes it.
// With DUCTER_SHOTS=1 the open row is written at 1150 (light and dark, 2x).
func TestD582PartnerRowRests(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		ps := d568Partners(lang)
		app, sent := d568App(t, lang, ps, "p4")
		_, tt := figsOf(t, app, TabPartner)
		rest := len(tt.Texts())
		app.partners.editing, app.partners.editName = "p4", ps[3].Name
		d513Frames(tt)
		if n := countAccess(tt, ui.RoleRadioGroup, app.L.T("partners.figure")); n != 1 {
			t.Fatalf("%s: one row open, want one figure picker, found %d", lang, n)
		}
		if !hasText(tt, app.L.T("partners.figure")) || !hasText(tt, app.L.T("partners.look")) {
			t.Errorf("%s: the open row names its figure and its colours: %q", lang, tt.Texts())
		}
		for _, w := range []int{1000, 1400} {
			tt.SetSize(w, 2400)
			d513Frames(tt)
			for _, b := range paneGeometry(tt, float32(w)) {
				t.Errorf("%s %d: %s", lang, w, b)
			}
		}
		tt.SetSize(1150, 2400)
		d513Frames(tt)
		label := app.L.T("partners.figure.label", app.L.T("partners.figure.bun"), app.L.T("partners.figure.air.bun"))
		*sent = nil
		if err := tt.Click(label); err != nil {
			t.Fatal(err)
		}
		d513Frames(tt)
		said := app.L.T("said.figure", app.L.T("partners.figure.bun"))
		if !hasText(tt, said) {
			t.Errorf("%s: no word after the figure: %q", lang, tt.Texts())
		}
		if os.Getenv("DUCTER_SHOTS") != "" {
			for _, dark := range []bool{false, true} {
				d582Shot(t, app, lang, dark)
			}
		}
		if err := tt.Click(app.L.T("partners.rename.save")); err != nil {
			t.Fatal(err)
		}
		d513Frames(tt)
		if n := countAccess(tt, ui.RoleRadioGroup, app.L.T("partners.figure")); n != 0 {
			t.Errorf("%s: 好 leaves the picker open (%d)", lang, n)
		}
		if !hasText(tt, said) {
			t.Errorf("%s: the word goes with the picker; it should stay its 4 s", lang)
		}
		if len(tt.Texts()) < rest {
			t.Errorf("%s: fewer texts after closing than at rest", lang)
		}
	}
}

func d582Shot(t *testing.T, app *App, lang i18n.Lang, dark bool) {
	t.Helper()
	tt := ui.NewTesterWith(app.View, 1150, 1500, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetScale(2)
	tt.SetDark(dark)
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	paper := map[bool]string{false: "light", true: "dark"}[dark]
	img := tt.Image()
	name := fmt.Sprintf("mac-1150-%s-%s-partner-open", lang, paper)
	write := func(n string, im image.Image) {
		f, err := os.Create(filepath.Join(shotsDir(t), n+".png"))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, im)
		f.Close()
	}
	write(name, img)
	// The open row, at 2x.
	if r, ok := tt.Find(app.L.T("partners.figure")); ok {
		y := int(r.Y*2) - 260
		write(name+"-2x", img.SubImage(image.Rect(560, max(0, y), 1700, y+1100)))
	}
}
