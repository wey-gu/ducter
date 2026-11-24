package views

import (
	"fmt"
	"math"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D538: 关于这台 / About this computer, on a device card: what the computer
// measured of itself in plain words (内存 64 GB，现在空着 41 GB), and what
// the person said about it: their computer rules (多放 / 少放 this computer
// for heavy work, web work or all work), each changed or removed here, and
// one added here as well as by saying it. The facts follow
// packages/protocol/src/about-computer.ts (the web's about-computer.tsx).

const (
	gib        = float64(1 << 30)
	heavyFree  = 3 * gib // protocol/src/room.ts HEAVY_FREE
	heavyPer   = 8 * gib // HEAVY_PER
	aboutFoldK = "about:"
)

// sizeWords is bytes as a person reads them: 7.6 GB, 64 GB, 512 MB.
func sizeWords(n float64) string {
	switch {
	case n < gib:
		return fmt.Sprintf("%d MB", int(math.Max(1, math.Round(n/float64(1<<20)))))
	case n < 10*gib:
		return fmt.Sprintf("%.1f GB", math.Round(n/gib*10)/10)
	}
	return fmt.Sprintf("%d GB", int(math.Round(n/gib)))
}

func heavySlots(total float64) int {
	return int(math.Max(1, math.Floor(total/heavyPer)))
}

// aboutFacts is the measured facts, memory first (what placement reads).
func (a *App) aboutFacts(dv *protocol.DeviceView) []string {
	var out []string
	if r := dv.Resources; r != nil {
		out = append(out, a.L.T("about.mem", sizeWords(r.MemTotal), sizeWords(r.MemFree)))
		if r.MemFree >= heavyFree {
			out = append(out, a.L.T("about.heavy", heavySlots(r.MemTotal)))
		} else {
			out = append(out, a.L.T("about.heavy.none"))
		}
		key := "about.cores"
		if r.Load != nil && r.Cores > 0 {
			switch per := *r.Load / float64(r.Cores); {
			case per < 0.5:
				key = "about.cores.calm"
			case per < 1:
				key = "about.cores.some"
			default:
				key = "about.cores.busy"
			}
		}
		out = append(out, a.L.T(key, r.Cores))
		if r.DiskFree != nil {
			out = append(out, a.L.T("about.disk", sizeWords(*r.DiskFree)))
		}
		if r.GPU != "" {
			out = append(out, a.L.T("about.gpu", r.GPU))
		}
		if len(r.OOM) > 0 {
			out = append(out, a.L.T("about.oom", len(r.OOM)))
		}
	}
	if dv.AlwaysOn {
		out = append(out, a.L.T("about.on"))
	} else if dv.Kind == "laptop" {
		out = append(out, a.L.T("about.sleeps"))
	}
	return out
}

// rulesAbout is this computer's rules, oldest first (by its name, as the
// rule store keeps them).
func (a *App) rulesAbout(dv *protocol.DeviceView) []protocol.RuleView {
	var out []protocol.RuleView
	for _, r := range a.S.Rules {
		if r.Where == nil || r.Device == "" {
			continue
		}
		if strings.EqualFold(r.Device, dv.Name) || r.Device == dv.ID || (dv.Home && r.Device == "local") {
			out = append(out, r)
		}
	}
	return out
}

func ruleWork(r protocol.RuleView) string {
	switch {
	case r.Where != nil && r.Where.Heavy:
		return "heavy"
	case r.Where != nil && r.Where.Web:
		return "web"
	}
	return "all"
}

// ruleLine is a rule in literal words: 这台多放构建、测试、浏览器这类重活.
func (a *App) ruleLine(avoid bool, work string) string {
	key := "about.rule.more"
	if avoid {
		key = "about.rule.less"
	}
	return a.L.T(key, a.L.T("about.rule.w."+work))
}

// aboutState is the section's own state: the rule being changed, or a new
// one being added, with its two choices.
type aboutState struct {
	device  string // the card the edit is on
	editing string // a rule's id, or "+" for a new one
	avoid   bool
	work    string
	asked   bool // the rules frame was asked for
}

// aboutComputer is the card's 关于这台 fold.
func (a *App) aboutComputer(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	s := &a.about
	summary := ""
	if r := dv.Resources; r != nil {
		summary = a.L.T("about.sum", sizeWords(r.MemTotal), sizeWords(r.MemFree))
	}
	a.sheetFold(c, aboutFoldK+dv.ID, a.L.T("about.title"), summary, false, func() {
		// The rules frame is asked for once the fold opens (this socket stays told of changes).
		if !s.asked {
			s.asked = true
			a.send(protocol.RulesReq{T: "rules"})
		}
		ui.Column(c.Key("about:"+dv.ID)).Gap(t.S4).Padding(t.S2, t.S2, t.S1, t.S2).Children(func() {
			if facts := a.aboutFacts(dv); len(facts) > 0 {
				ui.Column(c).Gap(t.S2).Children(func() {
					uiText(c, a.L.T("about.measured")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
					ui.Column(c).Gap(t.S1).Children(func() {
						for _, f := range facts {
							uiText(c, f).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
						}
					})
				})
			}
			ui.Column(c).Gap(t.S2).Children(func() {
				uiText(c, a.L.T("about.said")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
				mine := a.rulesAbout(dv)
				adding := s.device == dv.ID && s.editing == "+"
				if len(mine) == 0 && !adding {
					uiText(c, a.L.T("about.none")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
				for _, r := range mine {
					if s.device == dv.ID && s.editing == r.ID {
						a.aboutEdit(c, dv, r.ID, r.Text)
						continue
					}
					a.aboutRule(c, dv, r)
				}
				// One edit at a time: Add one waits while a rule is being changed.
				switch {
				case adding:
					a.aboutEdit(c, dv, "", "")
				case s.device == dv.ID && s.editing != "":
					// a rule is being changed above
				default:
					if a.button(c, a.L.T("about.add"), btnSecondary, t.ControlSM, t.Surface) {
						*s = aboutState{device: dv.ID, editing: "+", work: "heavy", asked: true}
					}
				}
			})
		})
	})
}

// aboutRule is one of the person's rules about this computer: their words,
// the rule in literal words under them, 改 and 移除.
func (a *App) aboutRule(c *ui.Context, dv *protocol.DeviceView, r protocol.RuleView) {
	t := a.T
	avoid := r.Where != nil && r.Where.Avoid
	// Their words take the row's whole width; the literal rule and its two
	// quiet actions share the line under them.
	ui.Column(c.Key("about-rule:"+r.ID)).Gap(2).Padding(t.S2+2, t.S3, t.S1, t.S3).Radius(t.RadiusSM).Background(t.Bg).Children(func() {
		uiText(c, r.Text).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).LineHeight(a.leading(1.45))
		ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			uiText(c, a.ruleLine(avoid, ruleWork(r))).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.45)).Grow(1).Basis(0).MinWidth(0)
			if a.buttonFor(c, a.L.T("about.edit"), r.Text, btnText, t.ControlSM-4, t.Bg) {
				a.about = aboutState{device: dv.ID, editing: r.ID, avoid: avoid, work: ruleWork(r), asked: true}
			}
			if a.quietDanger(c, "about-rm:"+r.ID, a.L.T("about.remove"), r.Text) {
				a.send(protocol.RuleRemove{T: "rule_remove", ID: r.ID})
			}
		})
		if r.Where != nil && r.Where.Mem != "" {
			uiText(c, a.L.T("about.inmem")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.45)).Margin(0, 0, t.S1, 0)
		}
	})
}

// aboutEdit is a rule being changed (id) or added (""): more or less here,
// and which work; 算了 and 记下.
func (a *App) aboutEdit(c *ui.Context, dv *protocol.DeviceView, id, words string) {
	t := a.T
	s := &a.about
	works := []string{"heavy", "web", "all"}
	ui.Column(c.Key("about-edit:" + dv.ID + id)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusSM).Background(t.Bg).Children(func() {
		// The rule being changed, in the person's words, so the choices read as about it.
		if words != "" {
			uiText(c, words).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).LineHeight(a.leading(1.45))
		}
		way := 0
		if s.avoid {
			way = 1
		}
		if i := a.choices(c, "about-way:"+dv.ID, a.L.T("about.way"), []string{a.L.T("about.more"), a.L.T("about.less")}, way); i >= 0 {
			s.avoid = i == 1
		}
		sel := 0
		for i, w := range works {
			if w == s.work {
				sel = i
			}
		}
		if i := a.choices(c, "about-work:"+dv.ID, a.L.T("about.which"), []string{a.L.T("about.w.heavy"), a.L.T("about.w.web"), a.L.T("about.w.all")}, sel); i >= 0 {
			s.work = works[i]
		}
		ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
			if a.button(c, a.L.T("about.cancel"), btnSecondary, t.ControlSM, t.Bg) {
				*s = aboutState{asked: true}
			}
			if a.button(c, a.L.T("about.keep"), btnPrimary, t.ControlSM, t.Bg) {
				a.send(protocol.RuleWhere{T: "rule_where", ID: id, Device: dv.Name, Avoid: s.avoid, Work: s.work, Lang: string(a.L.Lang)})
				*s = aboutState{asked: true}
			}
		})
	})
}
