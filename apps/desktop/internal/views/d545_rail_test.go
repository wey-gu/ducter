package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D545: the list of partners beside the conversation narrows to a strip of
// faces, hides, and comes back, by the bar's toggle; the choice is this
// Mac's. Hidden, the others' faces in the bar are the way back and carry
// what waits on the person in them. The composer never moves while the list
// slides; the bar's words stay clear of the window's controls.

func d545App(t *testing.T, lang i18n.Lang) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d513Partners(lang)})
	app.Receive(protocol.ServerFrame{T: "events", Events: d541Talk(map[i18n.Lang]string{i18n.ZH: "工作", i18n.EN: "Work"}[lang], 1000, 60)})
	// What waits in the others: 小家's and 小新's own questions (On hand lists them, D312).
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Asks: []protocol.PartnerAsk{
		{Persona: "p2", DecisionID: "d_home", Question: "约周六 9:30 吗？", At: "2026-11-24T04:00:00Z"},
		{Persona: "p4", DecisionID: "d_money", Question: "让司机重开那张打车发票吗？", At: "2026-11-24T05:00:00Z"},
	}}})
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	return app, tt
}

func TestD545RailToggle(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := d545App(t, lang)
		L := app.L
		toggle := func(want string) {
			t.Helper()
			if _, ok := tt.Find(L.T(want)); !ok {
				t.Fatalf("%s: no %q in the bar: %q", lang, L.T(want), tt.Texts())
			}
			tt.Click(L.T(want))
			d513Frames(tt)
		}
		if app.partnerRailW() != 88 {
			t.Fatalf("%s: at 1150 the list is %v wide", lang, app.partnerRailW())
		}
		// Narrower: a strip of faces; every partner still a row, by its label.
		toggle("partners.rail.thin")
		if app.Local.RailMode() != "thin" || app.partnerRailW() != railThinW {
			t.Fatalf("%s: thin: mode %q, width %v", lang, app.Local.RailMode(), app.partnerRailW())
		}
		for _, p := range app.S.Partners {
			if _, ok := tt.Find(L.T("partners.switch.asks", p.Name, 1)); !ok && p.ID != "default" {
				if _, ok := tt.Find(L.T("partners.switch", p.Name)); !ok {
					t.Errorf("%s thin: no row for %s", lang, p.Name)
				}
			}
		}
		// The bar's words start clear of the window's controls (78) though the strip is narrower.
		if r, ok := tt.Find(L.T("partners.rail.hide")); !ok || r.X < 78 {
			t.Errorf("%s thin: the toggle sits under the window's controls: %v", lang, r)
		}
		// Hidden: no list; the others' faces carry what waits in them, and bring the list back.
		toggle("partners.rail.hide")
		if app.partnerRailShown() {
			t.Fatalf("%s: hidden, the list still shows", lang)
		}
		others := 0
		for _, p := range app.S.Partners {
			if p.ID != "default" {
				others += app.partnerNeeds(p)
			}
		}
		if others == 0 {
			t.Fatalf("%s: the fixture has nothing waiting in the others", lang)
		}
		if _, ok := tt.Find(L.T("partners.back.asks", others)); !ok {
			t.Fatalf("%s hidden: no way back with what waits (%d): %q", lang, others, tt.Texts())
		}
		tt.Click(L.T("partners.back.asks", others))
		d513Frames(tt)
		if app.Local.RailMode() != "" || !app.partnerRailShown() {
			t.Fatalf("%s: the faces didn't bring the list back: %q", lang, app.Local.RailMode())
		}
	}
}

// TestD545ComposerStill: while the list slides in, the composer stays where
// it was put at the press (the conversation is laid out once, never mid-motion).
func TestD545ComposerStill(t *testing.T) {
	app, _ := d545App(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	app.setRail("thin")
	tt.Frame()
	at, ok := tt.Find("发送")
	if !ok {
		t.Fatalf("no send button: %q", tt.Texts())
	}
	for i := 0; i < 12; i++ {
		tt.Advance(16 * time.Millisecond)
		if r, _ := tt.Find("发送"); r != at {
			t.Fatalf("frame %d: the composer moved mid-slide: %v, was %v", i, r, at)
		}
	}
}

// TestD545Shots: full, thin and hidden at 1000 and 1150, zh and en, light
// and dark, the corner at 2x with the window's controls drawn, and the
// toggle's frames. DUCTER_SHOTS_DIR=<repo>/.shots/rail-collapse go test ./internal/views -run D545Shots
func TestD545Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := d545App(t, lang)
		for _, w := range []int{1150, 1000} {
			for _, mode := range []string{"", "thin", "hidden"} {
				for _, look := range []string{"light", "dark"} {
					app.Local.SetAppearance(look)
					app.setRail(mode)
					app.rail.changed = time.Time{}
					tt.SetSize(w, 900)
					d513Frames(tt)
					name := mode
					if name == "" {
						name = "full"
					}
					d302Write(t, tt, fmt.Sprintf("mac-%s-%d-%s-%s", name, w, lang, look))
					tt.SetScale(2)
					tt.Frame()
					d517Corner(t, tt, w, fmt.Sprintf("mac-%s-%d-%s-%s-corner@2x", name, w, lang, look))
					tt.SetScale(1)
				}
			}
		}
		app.Local.SetAppearance("system")
		app.setRail("")
	}
	// The toggle's frames, with motion: full to thin, thin to hidden, hidden back.
	app, _ := d545App(t, i18n.ZH)
	app.Local.SetAppearance("light")
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	for _, step := range []string{"thin", "hidden", ""} {
		app.setRail(step)
		name := step
		if name == "" {
			name = "back"
		}
		for i, ms := range []int{0, 50, 100, 150, 220, 320} {
			if i == 0 {
				tt.Frame()
			} else {
				tt.Advance(time.Duration(ms-[]int{0, 0, 50, 100, 150, 220}[i]) * time.Millisecond)
			}
			d302Write(t, tt, fmt.Sprintf("mac-toggle-%s-1150-zh-light-f%d-%03dms", name, i, ms))
		}
		d513Frames(tt)
	}
}
