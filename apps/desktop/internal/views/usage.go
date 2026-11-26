package views

import (
	"fmt"
	"math"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D591: where this week's allowance went, where people look
// (design/settings.md "Where the allowance went"): Settings › Overview's
// quiet tray (the agents' shares, the three tasks that used most, each
// opening its task, the rest behind 更多 / More) and the limit card's one
// line naming what used most of that agent. The numbers are D588's count
// from the home's Log (usage_days), asked when one of them shows and at
// most once a minute. Silent when nothing was used or the home can't
// count. The web's twin is apps/web/src/usage-week.tsx.

const usageFresh = time.Minute

// usageShown is how many tasks show before 更多 / More.
const usageShown = 3

// askUsage asks the home for the week's count, unless asked within the minute.
func (a *App) askUsage() {
	now := time.Now()
	if !a.S.Usage.Asked.IsZero() && now.Sub(a.S.Usage.Asked) < usageFresh {
		return
	}
	a.S.Usage.Asked = now
	_, off := now.Zone()
	a.send(protocol.UsageDays{T: "usage_days", Days: 7, Tz: off / 60, Top: 5})
}

// usageShare is a share as people read it: 62%, under one percent <1%
// (protocol's usageShare).
func usageShare(s float64) string {
	switch {
	case !(s > 0):
		return "0%"
	case s < 0.01:
		return "<1%"
	}
	return fmt.Sprintf("%d%%", int(math.Round(s*100)))
}

// usageWeek is Overview's section: nothing at all until something was used.
func (a *App) usageWeek(c *ui.Context) {
	t := a.T
	a.askUsage()
	r := a.S.Usage.Report
	if r == nil || r.Turns == 0 {
		return
	}
	var agents []string
	for _, h := range r.Harnesses {
		if h.Share >= 0.01 && len(agents) < 3 {
			agents = append(agents, a.L.T("usage.agent", harnessName(h.Harness), usageShare(h.Share)))
		}
	}
	tasks := r.Tasks
	rest := []protocol.UsageTask(nil)
	if len(tasks) > usageShown {
		tasks, rest = r.Tasks[:usageShown], r.Tasks[usageShown:]
	}
	const moreKey = "usage-more"
	more := a.open[moreKey]
	task := func(k protocol.UsageTask) {
		if a.trayRow(c, trayLine{key: "u:" + k.TaskID, words: k.Title, time: usageShare(k.Share), goes: a.L.T("usage.open", k.Title)}) {
			a.OpenTask(k.TaskID)
		}
	}
	ui.Column(c.Key("usage")).Gap(t.S3).Padding(t.S4, 0, 0, 0).Children(func() {
		// A section head like the places' (sectionHead): the text edge, the soft ink.
		uiText(c.Key("usage-label"), a.L.T("usage.head")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Padding(0, t.S5).Role(ui.RoleHeading)
		tray := ui.Column(c.Key("usage-tray")).Padding(t.S1, t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).Border(1, t.LineSoft).MinWidth(0)
		tray.Children(func() {
			if len(agents) > 0 {
				ui.Row(c.Key("usage-agents")).Padding(t.S2, t.S3, t.S1, t.S3).MinWidth(0).Children(func() {
					a.facts(c, t.SM, t.Ink, agents...)
				})
			}
			for _, k := range tasks {
				task(k)
			}
			if a.trayRow(c, trayLine{key: "fold", words: a.L.T("usage.more"), open: &more}) {
				if a.open == nil {
					a.open = map[string]bool{}
				}
				a.open[moreKey] = !more
			}
			if !more {
				return
			}
			box := ui.Column(c.Key("usage-more")).Padding(0, 0, t.S1, 0).MinWidth(0)
			a.enter(c, box)
			box.Children(func() {
				for _, k := range rest {
					task(k)
				}
				if r.Talk.Turns > 0 {
					a.trayRow(c, trayLine{key: "talk", words: a.L.T("usage.talk"), time: usageShare(r.Talk.Share)})
				}
				if r.Looks.Turns > 0 {
					a.trayRow(c, trayLine{key: "looks", words: a.L.T("usage.looks"), time: usageShare(r.Looks.Share)})
				}
				ui.Box(c.Key("usage-rule")).Height(1).Background(t.LineSoft).Margin(t.S2, t.S3, t.S1, t.S3)
				ui.Column(c.Key("usage-facts")).Gap(t.S1).Padding(t.S1, t.S3, t.S1, t.S3).MinWidth(0).Children(func() {
					// By model only when one agent ran on two or more of them.
					var models []string
					seen, twice := map[string]bool{}, false
					for _, m := range r.Agents {
						if m.Model != "" && m.Share >= 0.01 && len(models) < 4 {
							models = append(models, a.L.T("usage.agent", m.Model, usageShare(m.Share)))
							twice = twice || seen[m.Harness]
							seen[m.Harness] = true
						}
					}
					if twice {
						ui.Row(c.Key("models")).Gap(t.S3).Wrap().AlignItems(ui.Center).MinWidth(0).Children(func() {
							uiText(c.Key("k"), a.L.T("usage.models")).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
							a.facts(c, t.SM, t.InkSoft, models...)
						})
					}
					whole := r.Total.Weight()
					of := func(s protocol.UsageTokens) float64 {
						if whole <= 0 {
							return 0
						}
						return s.Weight() / whole
					}
					var by []string
					if you := of(r.By.You); you > 0 {
						by = append(by, a.L.T("usage.agent", a.L.T("usage.you"), usageShare(you)))
					}
					if mine := of(r.By.Partner); mine > 0 {
						by = append(by, a.L.T("usage.agent", a.L.T("usage.mine"), usageShare(mine)))
					}
					a.facts(c, t.SM, t.InkSoft, by...)
					uiText(c.Key("note"), keepClauses(a.L.T("usage.note"))).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkMuted)
				})
			})
		})
	})
}

// usageWhy is the limit card's line: what used most of this agent this week
// (this very task, or another); "" while the count isn't known.
func (a *App) usageWhy(harness, taskID string) string {
	a.askUsage()
	r := a.S.Usage.Report
	if r == nil {
		return ""
	}
	for _, h := range r.Harnesses {
		if h.Harness != harness || h.Top == nil {
			continue
		}
		name := harnessName(harness)
		if h.Top.TaskID == taskID {
			return a.L.T("usage.why.this", name, usageShare(h.Top.Share))
		}
		return a.L.T("usage.why", name, h.Top.Title, usageShare(h.Top.Share))
	}
	return ""
}
