package views

import (
	"fmt"
	"sort"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D445: Settings, the second round: show what a setting does for the
// person, live, instead of saying it (D43). Notifications shows the
// notification itself; Replies in shows the partner's voice in the language
// picked; a choice of many (Codex's six models, a time of day) is one pill
// at the row's right edge opening its list, like the reply language.

// notifyPreview is Notifications' stage: the notification the partner would
// send now, drawn as one, with this pane's choices in it. The default wait
// is its last line (the person's own 30 分钟), quiet hours the line under
// it; with notifications off the card sinks into the paper and says where
// the ask waits instead. The partner on it smiles for a moment after a
// change here, as Look's preview does.
func (a *App) notifyPreview(c *ui.Context, st *protocol.Settings, wait string) {
	t := a.T
	face := theme.Idle
	if since := a.Now().UnixNano() - a.settings.cheer; a.settings.cheer != 0 && since < int64(cheerFor) {
		face = theme.Done
		c.After(time.Duration(int64(cheerFor) - since))
	}
	on := st.Notify
	under := a.L.T("notify.pv.anytime")
	switch {
	case !on:
		under = a.L.T("notify.pv.off")
	case st.Quiet != nil:
		under = a.L.T("notify.pv.quiet", st.Quiet.Start, st.Quiet.End)
	}
	ui.Column(c.Key("notify-preview")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S5, t.S6).Radius(t.RadiusXL).Background(t.Bg).Border(1, t.Line).
		Role(ui.RoleGroup).Label(a.L.T("notify.pv")).Children(func() {
		card := ui.Row(c.Key("notify-pv-card")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusLG).WidthPercent(100).MaxWidth(460).AlignItems(ui.Center)
		ink, soft := t.Ink, t.InkMuted
		if on {
			card.Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
		} else {
			card.Background(t.SurfaceSunken)
			ink = t.InkSoft
		}
		card.Children(func() {
			a.avatar(c, face, 52)
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					uiText(c, a.S.PersonaName).FontSize(t.SM).FontWeight(800).TextColor(ink).SingleLine().Grow(1).MinWidth(0)
					uiText(c, a.L.T("notify.pv.now")).FontSize(t.XS).TextColor(soft).Shrink(0)
				})
				uiText(c, a.L.T("notify.pv.ask")).FontSize(t.MD).LineHeight(a.leading(1.45)).TextColor(ink)
				if wait != "" {
					uiText(c, a.L.T("notify.pv.default", wait)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(soft)
				}
			})
		})
		an := t.Nav.Across
		ui.Row(c.Key("notify-pv-under:"+under)).Gap(t.S2).AlignItems(ui.Center).Padding(0, t.S1).
			Transition(ui.ElementTransition{Animation: &an, Enter: &ui.Motion{Y: 4}}).Children(func() {
			uiText(c, under).FontSize(t.SM).FontWeight(600).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
		})
	})
}

// defaultWaitLabel is the default wait as the choice says it (30 分钟, 1 小时).
func (a *App) defaultWaitLabel(m int) string {
	if m <= 0 {
		return ""
	}
	if m >= 60 {
		return a.L.T("partner.default.hour", m/60)
	}
	return a.L.T("partner.default.min", m)
}

// quietTimes are the times a quiet hour starts or ends on: every half hour.
var quietTimes = func() []string {
	out := make([]string, 0, 48)
	for h := 0; h < 24; h++ {
		out = append(out, fmt.Sprintf("%02d:00", h), fmt.Sprintf("%02d:30", h))
	}
	return out
}()

// timePill is a time of day as a pill opening the half hours, 24-hour in
// every language and region (Ducter's own words say 23:00 to 08:00 too),
// the chosen one in sight when the list opens. It reports a new pick.
func (a *App) timePill(c *ui.Context, key, about, cur string, open *bool, just *bool) (string, bool) {
	t := a.T
	picked, ok := "", false
	e, click := a.pill(c, key, spoken(a.L, about, cur), *open, func() {
		uiText(c, cur).FontSize(t.MD).TextColor(t.Ink).FontFeatures("tnum").SingleLine().AccessHidden(true)
	})
	if click {
		*open = !*open
		*just = *open
	}
	if !*open {
		return "", false
	}
	list := append([]string(nil), quietTimes...)
	if !contains(list, cur) {
		list = append(list, cur) // a saved 22:15 stays in sight
		sort.Strings(list)
	}
	a.listPanel(c, e, open, about, 140, func() {
		for _, v := range list {
			v := v
			row, hit := a.menuRowEl(c, key+":"+v, v, v == cur, false, func() {
				uiText(c, v).FontSize(t.MD).TextColor(t.Ink).FontFeatures("tnum").SingleLine().Grow(1).MinWidth(0)
			})
			if v == cur && *just {
				row.ScrollIntoView(ui.ScrollIntoViewOptions{Block: ui.ScrollCenter})
			}
			if hit && v != cur {
				picked, ok = v, true
				*open = false
			}
		}
	})
	*just = false
	return picked, ok
}

// talkSample is the partner's reply in the language it answers in, as a
// small partner bubble under Replies in: picking 日本語 shows its voice in
// Japanese at once. Follow me shows it in this window's language. A
// language without a sample shows nothing.
func (a *App) talkSample(c *ui.Context, tag string) {
	t := a.T
	if tag == "" {
		tag = string(a.L.Lang)
	}
	text, ok := lang.Samples[tag]
	if !ok {
		return
	}
	r := t.BubbleRadius
	an := t.Nav.Across
	ui.Row(c.Key("talk-sample:" + tag)).Transition(ui.ElementTransition{Animation: &an, Enter: &ui.Motion{Y: 4}}).Children(func() {
		uiText(c, text).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.OnPartnerBubble).Lang(tag).
			Padding(t.S1+2, t.S3).Radius(r[1], r[0], r[3], r[2]).Background(t.PartnerBubble).Border(1, t.LineSoft).Shadow(0, 2, 0, 0, t.Line)
	})
}

// modelPill is the model choice as one pill at the row's right edge, the
// models in its list (D445: Codex's six no longer wrap onto two lines under
// the row). It reports the index picked.
func (a *App) modelPill(c *ui.Context, labels []string, sel int, open *bool) int {
	t := a.T
	hit := -1
	title := a.L.T("loadout.brain.model")
	e, click := a.pill(c, "brain-model-pill", spoken(a.L, title, labels[sel]), *open, func() {
		uiText(c, labels[sel]).FontSize(t.MD).TextColor(t.Ink).SingleLine().AccessHidden(true)
	})
	if click {
		*open = !*open
	}
	if !*open {
		return -1
	}
	a.listPanel(c, e, open, title, 240, func() {
		for i, l := range labels {
			i, l := i, l
			if a.menuRow(c, "brain-model:"+l, l, i == sel, false, func() {
				uiText(c, l).FontSize(t.MD).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0)
			}) && i != sel {
				hit = i
				*open = false
			}
		}
	})
	return hit
}

// rowUnder is a.row with something shown under its title in place of the
// muted line (Replies in's sample bubble).
func (a *App) rowUnder(c *ui.Context, key, label string, under func(), control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("row:"+key)).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		a.wordsThenControl(c, func() {
			uiText(c, label).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			ui.Box(c).Height(t.S1).Shrink(0)
			under()
		}, control)
	})
}
