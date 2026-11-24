package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// d513Partners is four partners as the author has them: two with their own
// questions, one never talked to, one whose last words were the person's.
func d513Partners(lang i18n.Lang) []protocol.PartnerInfo {
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	return []protocol.PartnerInfo{
		{ID: "default", Name: "Ducter", Look: "sand", About: pick("工作、代码和发布", "work, code and releases"), Last: &protocol.PartnerLast{Text: pick("明早的站会挪到十点吗？", "Move tomorrow's stand-up to 10?"), At: "2026-11-24T05:00:00Z"}},
		{ID: "p2", Name: pick("小家", "Home"), Look: "sage", Asks: 1, About: pick("家里的事、看病、孩子", "home, the doctor, the kids"), Last: &protocol.PartnerLast{Text: pick("周六上午带小米去看牙，帮我约一下社区那家诊所", "Book Mia a dentist appointment at the clinic down the road, Saturday morning"), At: "2026-11-24T04:00:00Z", You: true}},
		{ID: "p3", Name: pick("多比", "Dobby"), Look: "sky", About: pick("读书、跑步和周末的安排", "reading, running and weekend plans")},
		{ID: "p4", Name: pick("小新", "Sunny"), Look: "plum", Asks: 1, About: pick("账单、报销和保险", "bills, expenses and insurance")},
	}
}

func d513Frames(tt *ui.Tester) {
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(200 * time.Millisecond)
	}
}

// TestD513PartnerList: with one partner the conversation has no list (nothing
// new to learn); with four, every partner is a row at the left, the names and
// last lines from 1360 and the figures alone under it, and the bar's left
// clears the traffic lights only when the list doesn't hold them.
func TestD513PartnerList(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.LocaleFixed = true
		tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		d513Frames(tt)
		if app.partnerRailShown() || tt.HasText(app.L.T("partners.title")) {
			t.Fatalf("%s: one partner shows a list", lang)
		}
		app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d513Partners(lang)})
		d513Frames(tt)
		if !app.partnerRailShown() {
			t.Fatalf("%s: four partners and no list", lang)
		}
		ps := d513Partners(lang)
		for _, p := range ps {
			if !tt.HasText(p.Name) {
				t.Errorf("%s 1400: %s has no row", lang, p.Name)
			}
		}
		if !tt.HasText(app.L.T("partners.you", ps[1].Last.Text)) || !tt.HasText(app.L.T("partners.about.shown", ps[2].About)) {
			t.Errorf("%s 1400: the last lines (the person's own marked, else what it looks after): %q", lang, tt.Texts())
		}
		for _, b := range paneGeometry(tt, 1400) {
			t.Errorf("%s 1400: %s", lang, b)
		}
		tt.SetSize(1000, 900)
		d513Frames(tt)
		if tt.HasText(app.L.T("partners.you", ps[1].Last.Text)) {
			t.Errorf("%s 1000: the slim list keeps the figures only", lang)
		}
		if app.partnerRailW() > 100 {
			t.Errorf("%s 1000: the list is %v wide", lang, app.partnerRailW())
		}
		for _, b := range paneGeometry(tt, 1000) {
			t.Errorf("%s 1000: %s", lang, b)
		}
		// The numbers on the rows add up to the person's one count.
		sum := 0
		for _, p := range app.S.Partners {
			sum += app.partnerNeeds(p)
		}
		if sum != app.WaitingCount() {
			t.Errorf("%s: rows say %d, the person's count is %d", lang, sum, app.WaitingCount())
		}
		app.SwitchPartner("p4")
		if app.Local.Partner() != "p4" {
			t.Errorf("%s: a row shows its partner", lang)
		}
	}
}

// TestD513PartnerRowsFit: Settings › 伙伴 with four partners at the Mac's
// widths: each row's name, line and colours have their room (D513 found the
// web's one-line row squeezed the words to a character a line on a phone).
func TestD513PartnerRowsFit(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1400} {
			app, _ := iaApp(t, lang)
			app.LocaleFixed = true
			app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d513Partners(lang)})
			app.Receive(settingsFrame())
			app.openTab(TabPartner)
			tt := ui.NewTesterWith(app.View, w, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			d513Frames(tt)
			for _, p := range d513Partners(lang) {
				line := app.L.T("partners.about.shown", p.About)
				r, ok := tt.Find(line)
				if !ok {
					t.Fatalf("%s %d: no %q", lang, w, line)
				}
				if r.W < 160 || r.H > 48 {
					t.Errorf("%s %d: %q is squeezed: %+v", lang, w, line, r)
				}
			}
			for _, b := range paneGeometry(tt, float32(w)) {
				t.Errorf("%s %d: %s", lang, w, b)
			}
		}
	}
}

// TestD517RailCorner: the list owns the title bar's zone (D517). At every
// width, with the window's controls and in full screen, the band is the
// bar's height and nothing of the list sits in it; the slim list is wider
// than the controls; every name is a gap below the band; no row has a tooltip.
func TestD517RailCorner(t *testing.T) {
	lights := TrafficLights.X + 3*12 + 2*8 // the third control's right edge
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1150, 1199, 1200, 1400} {
			for _, left := range []float32{78, 0} { // the controls, then full screen
				app, _ := iaApp(t, lang)
				app.LocaleFixed = true
				ps := d513Partners(lang)
				// The longest a name may be (24), in each language: cut inside its row, never out of it.
				ps[3].Name = map[i18n.Lang]string{i18n.ZH: "账单报销保险和每个月的家庭开支都归它管着呢", i18n.EN: "Bills, receipts and taxes"}[lang]
				app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: ps})
				tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: left})
				d513Frames(tt)
				if rw := app.partnerRailW(); rw < lights+12 {
					t.Fatalf("%s %d: the list (%v) is no wider than the window's controls (%v)", lang, w, rw, lights)
				}
				for _, p := range ps {
					r, ok := tt.Find(p.Name)
					if !ok {
						t.Fatalf("%s %d: %s has no name on screen", lang, w, p.Name)
					}
					if r.Y < ChromeH+8 {
						t.Errorf("%s %d: %s's name at %v is in or touching the title bar's band (%v)", lang, w, p.Name, r.Y, ChromeH)
					}
					if r.X < 0 || r.X+r.W > app.partnerRailW() {
						t.Errorf("%s %d: %s's name runs out of the list: %+v", lang, w, p.Name, r)
					}
				}
			}
		}
	}
}
