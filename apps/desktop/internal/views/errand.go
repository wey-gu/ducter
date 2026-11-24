package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D436: 跑腿到付款 / An errand to the checkout (design/errand.md). The 去付款 /
// Go to checkout card: what it buys, the total, the site (read by code), the
// page's picture; 去付款 opens the same tab live in the person's turn, where
// they pay with their own tap, and 付好了 answers the card. A step on a page
// that's theirs (a CAPTCHA, a code by text) opens the same view: 去处理 / Do it.

// checkoutItemsShown is how many of the items the card lists before 还有 n 样.
const checkoutItemsShown = 5

// checkoutTitle is 到 {site} 的付款这一步了 / Ready to pay on {site}.
func (a *App) checkoutTitle(site string) string { return a.L.T("co.title", site) }

// checkoutButtons is the card's receipt, the page, and Not now · Go to checkout.
func (a *App) checkoutButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	co := d.Checkout
	open := d.Resolved == nil && d.Pending == ""
	ui.Column(c.Key("co:" + d.DecisionID)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
		fact := func(k, v string, big bool) {
			// D441: the label sits on the value's baseline (the total is bigger).
			ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
				uiText(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted).Width(72)
				size, weight := t.SM, 700
				if big {
					size, weight = t.XL, 800
				}
				uiText(c, v).FontSize(size).FontWeight(weight).Grow(1).MinWidth(0)
			})
		}
		fact("co.what", co.What, false)
		for i, it := range co.Items {
			if i == checkoutItemsShown {
				ui.Row(c).Gap(t.S3).Children(func() {
					ui.Box(c).Width(72).Shrink(0)
					uiText(c, a.L.T("co.more", len(co.Items)-checkoutItemsShown)).FontSize(t.SM).TextColor(t.InkMuted).Grow(1).MinWidth(0)
				})
				break
			}
			ui.Row(c).Gap(t.S3).Children(func() {
				ui.Box(c).Width(72).Shrink(0)
				uiText(c, it).FontSize(t.SM).TextColor(t.InkSoft).Grow(1).MinWidth(0)
			})
		}
		if co.Total != "" {
			fact("co.total", strings.TrimSpace(co.Currency+" "+co.Total), true)
		}
		fact("co.where", co.Site, false)
	})
	if len(co.Media) > 0 {
		a.messageMedia(c, "co-pic:"+d.DecisionID, co.Media[:1], nil, false, "co:"+d.DecisionID)
	}
	if !open {
		msg := a.L.T("co.resolved.hold")
		if (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go" {
			msg = a.L.T("co.resolved")
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			uiText(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	uiText(c, a.L.T("co.why")).FontSize(t.XS).TextColor(t.InkMuted)
	ui.Row(c.Key("co-go:" + d.DecisionID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("co.go"), co.Site, btnPrimary, st.height, st.quietBg) {
			a.OpenLive(d.DecisionID, co.Site)
		}
		if a.buttonFor(c, a.L.T("co.hold"), co.Site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
	})
}

// stepButtons is a step on a page that's the person's: the step in the
// task's words, what it can't see, and Not now · Do it.
func (a *App) stepButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	s := d.SignIn
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("step.resolved")
		if (d.Resolved != nil && d.Resolved.Option == "hold") || d.Pending == "hold" {
			msg = a.L.T("step.resolved.hold")
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			uiText(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	ui.Box(c.Key("step:"+d.DecisionID)).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
		uiText(c, s.Step).FontSize(t.SM).FontWeight(600)
	})
	uiText(c, a.L.T("step.why")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
	ui.Row(c.Key("step-go:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("step.open"), s.Site, btnPrimary, st.height, st.quietBg) {
			a.OpenLive(d.DecisionID, s.Site)
		}
		if a.buttonFor(c, a.L.T("step.later"), s.Site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
	})
}

// liveCardWords are the live view's words for the card behind it: a checkout
// or a step (ok false: a sign-in's own words).
func (a *App) liveCardWords(lv *store.LiveView) (title, band, hold, done string, ok bool) {
	d := a.S.Decisions[lv.DecisionID]
	switch {
	case d == nil:
		return "", "", "", "", false
	case d.Checkout != nil:
		return a.L.T("co.live.title", d.Checkout.Site), a.L.T("co.live.band"), a.L.T("co.live.notyet"), a.L.T("co.live.paid"), true
	case d.SignIn != nil && d.SignIn.Step != "":
		return a.L.T("step.title", d.SignIn.Site), "", a.L.T("step.later"), a.L.T("step.live.done"), true
	}
	return "", "", "", "", false
}
