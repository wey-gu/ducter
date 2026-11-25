package views

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// d565Partners are four partners of four figures (D565): the pebble, the
// bun, the cloud and the cube, each in its own suggested clay.
func d565Partners(lang i18n.Lang) []protocol.PartnerInfo {
	ps := d513Partners(lang)
	for i, f := range []string{"pebble", "bun", "cloud", "cube"} {
		if f != "pebble" {
			ps[i].Figure = f
		}
		ps[i].Look = protocol.FigureLook[f]
	}
	return ps
}

// TestD565FigureArt: every figure has every pose, its blink and its lids,
// in every clay; a figure this app doesn't know draws the pebble.
func TestD565FigureArt(t *testing.T) {
	for _, f := range protocol.PartnerFigures {
		for _, l := range protocol.PartnerLooks {
			wear := theme.Wear(l, f)
			for _, p := range theme.Presences {
				for _, px := range []float32{48, 400} {
					if theme.FaceAs(wear, p, px) == nil || theme.ArtAs(wear, p, px) == nil {
						t.Errorf("%s in %s: no %s at %v", f, l, p, px)
					}
				}
			}
			if theme.FaceClosedAs(wear, 200) == nil {
				t.Errorf("%s in %s: no blink", f, l)
			}
			for _, lid := range append(theme.LidsOf(wear), theme.SquareLidsOf(wear)...) {
				if lid.X <= 0 || lid.Y <= 0 || lid.X+lid.W >= 1 || lid.Y+lid.H >= 1 {
					t.Errorf("%s: a lid off its art: %+v", f, lid)
				}
			}
		}
	}
	// One optical table for both clients (tools/art/figures.py writes both): the web's matches.
	ts, err := os.ReadFile("../../../../packages/protocol/src/figures-gen.ts")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range theme.Figures {
		o := theme.OpticalOf(theme.Wear("sand", f))
		if o < 0.85 || o > 1.12 || !strings.Contains(string(ts), fmt.Sprintf("  %s: %v,", f, o)) {
			t.Errorf("%s: optical %v not the web's", f, o)
		}
	}
	if theme.Wear("sky", "star") != "sky" || theme.FigureOf(theme.Wear("sky", "bun")) != "bun" {
		t.Errorf("wear: an unknown figure is the pebble, a known one is kept")
	}
}

// TestD565Picker: Settings › 伙伴 shows each partner's figure above its
// colours; a click sends the new figure and the partner says one line in it.
func TestD565Picker(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d565Partners(i18n.ZH)})
	app.Receive(settingsFrame())
	app.openTab(TabPartner)
	tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	label := app.L.T("partners.figure.label", app.L.T("partners.figure.sprout"), app.L.T("partners.figure.air.sprout"))
	if _, ok := tt.Find(label); !ok {
		t.Fatalf("no figure picker: %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click(label); err != nil {
		t.Fatal(err)
	}
	d513Frames(tt)
	ok := false
	for _, f := range *sent {
		if s, is := f.(protocol.PartnerSet); is && s.Figure == "sprout" {
			ok = true
		}
	}
	if !ok {
		t.Errorf("no partner_set with the figure: %+v", *sent)
	}
	if !hasText(tt, app.L.T("said.figure", app.L.T("partners.figure.sprout"))) {
		t.Errorf("the partner says nothing after the change: %q", tt.Texts())
	}
	for _, b := range paneGeometry(tt, 1150) {
		t.Errorf("1150: %s", b)
	}
}

// The Mac's figures at 1000, 1150 and 1400, zh and en, light and dark: the
// conversation of each partner with the list beside it, Settings › 伙伴's
// picker, the meeting's frames and the one met walking in.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<dir> go test ./internal/views -run FigureShots
func TestD565FigureShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			mode := map[bool]string{false: "light", true: "dark"}[dark]
			tester := func(app *App, w, h int, still bool) *ui.Tester {
				tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: still}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				return tt
			}
			for _, width := range []int{1000, 1150, 1400} {
				for _, id := range []string{"default", "p2", "p3", "p4"} {
					app, _ := iaApp(t, lang)
					app.LocaleFixed = true
					app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d565Partners(lang)})
					app.SwitchPartner(id)
					tt := tester(app, width, 820, true)
					shotTester(t, tt, fmt.Sprintf("mac-conv-%s-%d-%s-%s", id, width, lang, mode))
				}
				app, _ := iaApp(t, lang)
				app.LocaleFixed = true
				app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d565Partners(lang)})
				app.SwitchPartner("p3") // shown: the cloud; the pane is still the default's (D565)
				app.Receive(settingsFrame())
				app.openTab(TabPartner)
				tt := tester(app, width, 1500, true)
				shotTester(t, tt, fmt.Sprintf("mac-settings-%d-%s-%s", width, lang, mode))
			}
			// The meeting: three partners, the add form open, a click on the bean, its hop as frames.
			app, _ := iaApp(t, lang)
			app.LocaleFixed = true
			app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d565Partners(lang)[:1]}) // one: no picker rows share the six's labels
			app.Receive(settingsFrame())
			app.openTab(TabPartner)
			tt := tester(app, 1150, 1500, false)
			_ = tt.Click(app.L.T("partners.add"))
			for i := 0; i < 3; i++ {
				tt.Frame()
				tt.Advance(300 * time.Millisecond)
			}
			shotTester(t, tt, fmt.Sprintf("mac-meet-0-rest-%s-%s", lang, mode))
			_ = tt.Click(app.L.T("partners.figure.label", app.L.T("partners.figure.bean"), app.L.T("partners.figure.air.bean")))
			for i, step := range []time.Duration{0, 90, 120, 160, 260} {
				tt.Advance(step * time.Millisecond)
				tt.Frame()
				shotTester(t, tt, fmt.Sprintf("mac-meet-%d-hop-%s-%s", i+1, lang, mode))
			}
			// The one met walks into its conversation (its first screen).
			made := d565Partners(lang)[:3]
			made = append(made, protocol.PartnerInfo{ID: "p4", Name: appWords(lang, "豆豆", "Beanie"), Look: "sage", Figure: "bean"})
			app2, _ := iaApp(t, lang)
			app2.LocaleFixed = true
			app2.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: made})
			tt2 := tester(app2, 1150, 820, false)
			app2.partners.meetID, app2.partners.meetAt = "p4", app2.Now()
			app2.SwitchPartner("p4")
			for i, step := range []time.Duration{0, 150, 150, 200, 400} {
				tt2.Advance(step * time.Millisecond)
				tt2.Frame()
				shotTester(t, tt2, fmt.Sprintf("mac-walkin-%d-%s-%s", i+1, lang, mode))
			}
		}
	}
}
