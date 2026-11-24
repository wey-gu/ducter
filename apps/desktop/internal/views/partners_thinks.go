package views

// D536: what each partner thinks with, in Settings › 伙伴's 伙伴们, the same
// as the web (apps/web/src/partners.tsx): a line under its name (its agent's
// coin, the agent, its model and effort as separate facts; or one quiet line,
// the same as the default partner's), and in 改一下 the pickers: the same as
// the default's or an agent the home has, its model and its effort. A pick
// applies at once, as a colour does.

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// brainModelsFor is the models the home offers an agent to think with
// (settings.brainOptions, else brainNow's own).
func (a *App) brainModelsFor(harness string) []protocol.BrainModel {
	for _, o := range a.S.BrainOptions {
		if o.Harness == harness {
			return o.Models
		}
	}
	if bn := a.S.BrainNow; bn != nil && bn.Harness == harness {
		return bn.Models
	}
	return nil
}

// thinksOf is what a partner thinks with as set: its own, the default's
// for the default partner, nil when it follows the default's.
func (a *App) thinksOf(p protocol.PartnerInfo) *protocol.Brain {
	if p.ID == protocol.DefaultPartner {
		b := a.brain()
		return &b
	}
	return p.Brain
}

// brainModelLabel is a model's name as the home's list says it.
func (a *App) brainModelLabel(harness, id string) string {
	for _, m := range a.brainModelsFor(harness) {
		if m.ID == id && m.Label != "" {
			return m.Label
		}
	}
	return prettyModel(id)
}

// thinksLine is the line under a partner's name.
func (a *App) thinksLine(c *ui.Context, p protocol.PartnerInfo) {
	t := a.T
	b := a.thinksOf(p)
	if b == nil {
		uiText(c, a.L.T("partners.thinks.same", a.defaultName())).FontSize(t.SM).TextColor(t.InkMuted).MaxLines(2)
		return
	}
	model, effort, def := "", "", ""
	if b.Model != "" {
		model = a.brainModelLabel(b.Harness, b.Model)
	}
	if b.Effort != "" {
		effort = a.L.T("partners.thinks.effort", a.effortWord(b.Effort))
	}
	if p.ID == protocol.DefaultPartner && a.manyPartners() {
		def = a.L.T("partners.thinks.default")
	}
	ui.Row(c.Key("thinks:"+p.ID)).Gap(t.S2).AlignItems(ui.Start).MinWidth(0).Children(func() {
		if bmp := theme.Clay(coinArt(b.Harness, false)); bmp != nil {
			ui.Image(c, bmp).Size(18, 18).Shrink(0).AccessHidden(true)
		}
		a.facts(c, t.SM, t.InkSoft, a.L.T("partners.thinks.with", harnessName(b.Harness)), model, effort, def)
	})
}

// thinksPick is 改一下's 想事情用 for another partner.
func (a *App) thinksPick(c *ui.Context, p protocol.PartnerInfo) {
	if p.ID == protocol.DefaultPartner || len(a.S.BrainOptions) == 0 {
		return
	}
	t := a.T
	ps := &a.partners
	own := p.Brain
	set := func(b any) {
		ps.thinksOpen = ""
		a.send(protocol.PartnerSet{T: "partner_set", ID: p.ID, Brain: b})
	}
	agents := []string{a.L.T("partners.thinks.same.pick", a.defaultName())}
	sel := 0
	for i, o := range a.S.BrainOptions {
		agents = append(agents, harnessName(o.Harness))
		if own != nil && own.Harness == o.Harness {
			sel = i + 1
		}
	}
	var models []protocol.BrainModel
	var model *protocol.BrainModel
	if own != nil {
		models = a.brainModelsFor(own.Harness)
		for i := range models {
			if models[i].ID == own.Model {
				model = &models[i]
			}
		}
		if model == nil {
			for i := range models {
				if models[i].Default {
					model = &models[i]
				}
			}
		}
		if model == nil && len(models) > 0 {
			model = &models[0]
		}
	}
	pick := func(key, title string, labels []string, sel int, apply func(i int)) {
		ui.Column(c.Key("thinks-pick:"+key)).Gap(t.S1).MinWidth(0).Children(func() {
			uiText(c, title).FontSize(t.SM).TextColor(t.InkMuted)
			open := ps.thinksOpen == key
			if i := a.pickPill(c, "thinks-"+key+":"+p.ID, title, labels, sel, &open); i >= 0 {
				apply(i)
			}
			if open {
				ps.thinksOpen = key
			} else if ps.thinksOpen == key {
				ps.thinksOpen = ""
			}
		})
	}
	ui.Row(c.Key("thinks-picks:"+p.ID)).Gap(t.S4).Wrap().AlignItems(ui.Start).Padding(0, 0, 0, 52).Children(func() {
		title := a.L.T("partners.thinks.title")
		pick("agent", title, agents, sel, func(i int) {
			if i == sel {
				return
			}
			if i == 0 {
				set(protocol.SameBrain{})
				return
			}
			o := a.S.BrainOptions[i-1]
			nb := protocol.Brain{Harness: o.Harness}
			for _, m := range o.Models {
				if m.Default {
					nb.Model = m.ID
				}
			}
			if nb.Model == "" && len(o.Models) > 0 {
				nb.Model = o.Models[0].ID
			}
			set(nb)
		})
		if own == nil || model == nil {
			return
		}
		if len(models) > 1 {
			labels := make([]string, len(models))
			at := 0
			for i, m := range models {
				labels[i] = m.Label
				if m.ID == model.ID {
					at = i
				}
			}
			pick("model", a.L.T("loadout.brain.model"), labels, at, func(i int) {
				if models[i].ID != own.Model {
					set(protocol.Brain{Harness: own.Harness, Model: models[i].ID})
				}
			})
		}
		if len(model.Efforts) > 0 {
			labels := []string{a.L.T("newtask.effort.default")}
			at := 0
			for i, e := range model.Efforts {
				labels = append(labels, a.effortWord(e))
				if strings.EqualFold(e, own.Effort) {
					at = i + 1
				}
			}
			pick("effort", a.L.T("newtask.effort"), labels, at, func(i int) {
				nb := protocol.Brain{Harness: own.Harness, Model: model.ID}
				if i > 0 {
					nb.Effort = model.Efforts[i-1]
				}
				set(nb)
			})
		}
	})
}

// partnersOnAgent is the other partners that think with this agent of their
// own, for 做事的's line (D536).
func (a *App) partnersOnAgent(harness string) string {
	var names []string
	for _, p := range a.S.Partners {
		if p.Brain != nil && p.Brain.Harness == harness {
			names = append(names, p.Name)
		}
	}
	if len(names) == 0 {
		return ""
	}
	return a.L.T("partners.thinks.acct", strings.Join(names, a.L.T("partners.thinks.and")))
}
