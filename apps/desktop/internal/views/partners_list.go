package views

// D513: 伙伴们 / Your partners as a messaging app lists its chats, the same
// as the web's (apps/web/src/partners.tsx PartnerList). With more than one
// partner, the conversation has a column at its left: each row the
// partner's figure in its own clay, its name, the last thing said in its
// conversation and, on the figure's shoulder, the number of what of its own
// waits on the person; the one shown sits on the surface. Under 1360 points
// the column keeps the figures and numbers (the name is the row's label and
// tooltip). With one partner there is no column: nothing new to learn.

import (
	"fmt"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// partnerRailWide is the window width from which the list shows names and
// last lines; under it, the figures only.
const partnerRailWide = 1360

// partnerRailW is the column's width: wide with words, slim without.
func (a *App) partnerRailW() float32 {
	if a.winW >= partnerRailWide {
		return 272
	}
	return 80
}

// partnerRailShown: the conversation has the list at its left (D513).
func (a *App) partnerRailShown() bool {
	return a.S.Welcomed && a.manyPartners()
}

// partnerGone: the partner this window showed was removed (D486): it shows
// the default's.
func (a *App) partnerGone() {
	if id := a.S.Persona; id != "" && id != protocol.DefaultPartner && a.S.Partners != nil && a.S.Welcomed {
		for _, p := range a.S.Partners {
			if p.ID == id {
				return
			}
		}
		a.SwitchPartner(protocol.DefaultPartner)
	}
}

// partnerLastWords is what a row says under the name: the last thing said
// (the person's own words marked as theirs), else what it looks after, else
// that nothing was said yet.
func (a *App) partnerLastWords(p protocol.PartnerInfo) string {
	if p.Last != nil && p.Last.Text != "" {
		if p.Last.You {
			return a.L.T("partners.you", p.Last.Text)
		}
		return p.Last.Text
	}
	if p.About != "" {
		return a.L.T("partners.about.shown", p.About)
	}
	return a.L.T("partners.empty")
}

// conversationWithPartners is the conversation, with the list of partners
// at its left once there is more than one.
func (a *App) conversationWithPartners(c *ui.Context) {
	a.partnerGone()
	if !a.partnerRailShown() {
		a.conversation(c)
		return
	}
	ui.Row(c.Key("conv-with-partners")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		a.partnerRail(c)
		ui.Column(c.Key("conv-beside-partners")).Grow(1).MinWidth(0).MinHeight(0).Children(func() {
			a.conversation(c)
		})
	})
}

// partnerRail draws the column: room for the traffic lights on top (it is
// the window's left edge), its title when wide, then a row per partner.
func (a *App) partnerRail(c *ui.Context) {
	t := a.T
	w := a.partnerRailW()
	wide := w > 100
	shown := a.shownPartnerID()
	ui.Column(c.Key("partner-rail")).Width(w).Shrink(0).Background(t.Chrome).BorderWidth(0, 1, 0, 0).BorderColor(t.ChromeLine).
		Role(ui.RoleNavigation).Label(a.L.T("partners.title")).Children(func() {
		// The bar's height, clear of the traffic lights: the window drags here.
		ui.Row(c.Key("partner-rail-top")).Height(ChromeH).Shrink(0).AlignItems(ui.End).Padding(0, t.S4, t.S2, t.S5).DragWindow().Children(func() {
			if wide {
				ui.Box(c).Grow(1)
			}
		})
		if wide {
			uiText(c, a.L.T("partners.title")).FontSize(barText).FontWeight(600).TextColor(t.Ink).Padding(t.S2, t.S5, t.S2, t.S5).SingleLine()
		}
		ui.Scroll(c.Key("partner-rail-rows")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Gap(2).Padding(t.S1, t.S2+2, t.S4, t.S2+2).Children(func() {
				for i, p := range a.S.Partners {
					a.partnerRailRow(c, i, p, p.ID == shown, wide)
				}
			})
		})
	})
}

// partnerRailRow is one partner in the list.
func (a *App) partnerRailRow(c *ui.Context, i int, p protocol.PartnerInfo, on, wide bool) {
	t := a.T
	needs := a.partnerNeeds(p)
	label := a.L.T("partners.switch", p.Name)
	switch {
	case on:
		label = a.L.T("partners.here", p.Name)
	case needs > 0:
		label = a.L.T("partners.switch.asks", p.Name, needs)
	}
	tip := p.Name
	if i < 4 {
		tip += " (⌥⌘" + fmt.Sprint(i+1) + ")"
	}
	row := ui.Row(c.Key("prow:"+p.ID)).Gap(t.S3).AlignItems(ui.Center).MinHeight(64).Padding(t.S2, t.S3).Radius(t.RadiusMD).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Tooltip(tip).AccessSelected(on).Focusable()
	if !wide {
		row.Justify(ui.Center).Padding(t.S2, 0)
	}
	switch {
	case on:
		row.Background(t.Surface).Shadow(0, 4, 0, 0, t.Line)
	case row.Hovered() || row.Pressed():
		row.Background(t.SurfaceSunken)
	}
	ring := t.Chrome
	if on {
		ring = t.Surface
	}
	row.Children(func() {
		ui.Box(c.Key("pface:"+p.ID)).Size(46, 44).Shrink(0).AccessHidden(true).Children(func() {
			a.stone(c, "rail-"+p.ID, p.Look, 40).Absolute().Left(2).Top(4)
			if needs > 0 {
				ui.Box(c.Key("pn:"+p.ID)).Absolute().Left(28).Top(-2).MinWidth(18).Height(18).Padding(0, 5).Radius(9).
					Background(t.NeedsYou.Surface).Border(2, ring).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
					uiText(c, fmt.Sprint(needs)).FontSize(11).FontWeight(700).TextColor(t.NeedsYou.Ink)
				})
			}
		})
		if !wide {
			return
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			uiText(c, p.Name).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).SingleLine()
			uiText(c, a.partnerLastWords(p)).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
		})
	})
	if row.Clicked() {
		a.SwitchPartner(p.ID)
	}
}
