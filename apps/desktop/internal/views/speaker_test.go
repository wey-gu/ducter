package views

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// d568Partners is the author's home as he reported it (0.1.67): Ducter
// the default, 多比 in sky, 小新 in plum, 小玛 in coral thinking with Claude
// Code, here given the sprout so its figure differs from the default's too.
func d568Partners(lang i18n.Lang) []protocol.PartnerInfo {
	en := lang == i18n.EN
	pick := func(z, e string) string {
		if en {
			return e
		}
		return z
	}
	return []protocol.PartnerInfo{
		{ID: "default", Name: "Ducter", Look: "sand"},
		{ID: "p2", Name: pick("多比", "Dobby"), Look: "sky"},
		{ID: "p3", Name: pick("小新", "Sunny"), Look: "plum"},
		{ID: "p4", Name: pick("小玛", "Mara"), Look: "apricot", Figure: "sprout", Brain: &protocol.Brain{Harness: "claude-code", Model: "opus"}},
	}
}

// d568App is that home with the window on 小玛.
func d568App(t *testing.T, lang i18n.Lang, partners []protocol.PartnerInfo, shown string) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.LocaleFixed = true
	name := ""
	for _, p := range partners {
		if p.ID == shown {
			name = p.Name
		}
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: shown, PersonaName: name, HeadSeq: 0})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	app.Receive(protocol.ServerFrame{T: "partners", Shown: shown, Partners: partners})
	st := settingsFrame()
	st.Settings.Name = "Ducter"
	st.Settings.Brain = &protocol.Brain{Harness: "codex", Model: "gpt-6.2-astra"}
	app.Receive(st)
	return app, sent
}

// figsOf draws a tab and returns every figure it drew with whom it stood for.
func figsOf(t *testing.T, app *App, tab string) ([]drawnFig, *ui.Tester) {
	t.Helper()
	var figs []drawnFig
	app.figs = &figs
	app.openTab(tab)
	tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	app.figs = nil
	return figs, tt
}

// TestD568OneIdentityPerFigure: with the window on a partner that is not
// the default (another clay, another figure), every Settings pane draws
// each figure as the one its name says: the shown partner as itself, a
// partner's row as that partner, the product's card as the brand pebble.
// The author's report: the About card, the Partner pane's head ("Ducter"
// beside 小玛's clay), the rail's mark and Overview all wore 小玛's clay.
func TestD568OneIdentityPerFigure(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		ps := d568Partners(lang)
		mara := ps[3]
		app, _ := d568App(t, lang, ps, "p4")
		byName := map[string]protocol.PartnerInfo{}
		for _, p := range ps {
			byName[p.Name] = p
		}
		for _, tab := range settingsTabs {
			figs, tt := figsOf(t, app, tab)
			brands := 0
			for _, f := range figs {
				if f.Brand {
					brands++
					if tab != TabAbout || f.Who != brandName || !sameWear(f.Wear, theme.BrandWear) {
						t.Errorf("%s %s: a brand figure %+v (only About's card is the product's, in the brand clay)", lang, tab, f)
					}
					continue
				}
				p, ok := byName[f.Who]
				if !ok {
					t.Errorf("%s %s: figure %s stands for %q, no partner of that name", lang, tab, f.Key, f.Who)
					continue
				}
				if want := theme.Wear(p.Look, p.Figure); !sameWear(f.Wear, want) {
					t.Errorf("%s %s: figure %s beside %q wears %q, its own is %q", lang, tab, f.Key, f.Who, f.Wear, want)
				}
			}
			if tab == TabAbout && brands == 0 {
				t.Errorf("%s about: the product's card has no brand figure", lang)
			}
			if tab == TabPartner {
				// The head speaks as 小玛, not as "Ducter" in 小玛's clay.
				head := false
				for _, f := range figs {
					head = head || (f.Key == "avatar" && f.Who == mara.Name)
				}
				if !head {
					t.Errorf("%s partner: the head is not %s's: %+v", lang, mara.Name, figs)
				}
				say := app.L.T("partner.say", app.homeName(), app.speakerThinks(app.speakerFor(speakShown)))
				if !hasText(tt, say) || strings.Contains(say, "Codex") {
					t.Errorf("%s partner: the head should say what %s thinks with (Claude Code): %q", lang, mara.Name, say)
				}
			}
		}
	}
}

// TestD568PickerForEveryone: each partner's row has the six figures, the
// default's too, and a home with one partner gives that one its row and
// the picker (D565 left the one partner without either), and its figure
// is worn wherever it shows.
func TestD568PickerForEveryone(t *testing.T) {
	lang := i18n.ZH
	ps := d568Partners(lang)
	app, sent := d568App(t, lang, ps, "p4")
	_, tt := figsOf(t, app, TabPartner)
	// D582: every row rests as its figure; 改一下 opens the six on that row, the default's too.
	if n := countAccess(tt, ui.RoleRadioGroup, app.L.T("partners.figure")); n != 0 {
		t.Fatalf("want no figure picker open at rest, found %d", n)
	}
	if n := countAccess(tt, ui.RoleButton, app.L.T("partners.change")); n < len(ps) {
		t.Fatalf("want 改一下 on each of %d rows (the default's too), found %d", len(ps), n)
	}
	if err := tt.Click(app.L.T("partners.change")); err != nil {
		t.Fatal(err)
	}
	d513Frames(tt)
	if n := countAccess(tt, ui.RoleRadioGroup, app.L.T("partners.figure")); n != 1 {
		t.Fatalf("改一下 should open one row's figures, found %d", n)
	}

	one := []protocol.PartnerInfo{{ID: "default", Name: "Ducter", Look: "sand", Figure: "bun"}}
	app, sent = d568App(t, lang, one, "default")
	figs, tt := figsOf(t, app, TabPartner)
	label := app.L.T("partners.figure.label", app.L.T("partners.figure.cloud"), app.L.T("partners.figure.air.cloud"))
	if err := tt.Click(app.L.T("partners.change")); err != nil {
		t.Fatal(err)
	}
	d513Frames(tt)
	if _, ok := tt.Find(label); !ok {
		t.Fatalf("one partner: no figure picker: %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click(label); err != nil {
		t.Fatal(err)
	}
	d513Frames(tt)
	ok := false
	for _, f := range *sent {
		if s, is := f.(protocol.PartnerSet); is && s.ID == "default" && s.Figure == "cloud" {
			ok = true
		}
	}
	if !ok {
		t.Errorf("one partner: no partner_set for the default's figure: %+v", *sent)
	}
	worn := false
	for _, f := range figs {
		worn = worn || (f.Key == "avatar" && theme.FigureOf(f.Wear) == "bun")
	}
	if !worn {
		t.Errorf("one partner: its bun is not worn by the head: %+v", figs)
	}
}

// countAccess is how many elements of a role carry an accessible name.
func countAccess(tt *ui.Tester, r ui.Role, name string) int {
	n := 0
	for _, x := range tt.AccessAll() {
		if x.Role == r && x.Name == name {
			n++
		}
	}
	return n
}
