package views

import (
	"fmt"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// On hand by project (D128): one group per repo, 其他 / Other for the tasks
// of no place; a row is face · title · branch · +adds −dels · state. A
// group's "+" is 在这儿开一件 / New task here.

type projectGroup struct {
	name  string
	place *protocol.Place // a repo group's place, for its "+"
	tasks []*store.Task
}

// projectOf is the group a task goes in: the card's project, else its
// repo's folder name, else "" (Other).
func projectOf(task *store.Task) string {
	if p := task.Project(); p != "" {
		return p
	}
	if pl := task.Place(); pl.Kind == "repo" {
		return lastPath(pl.RepoPath)
	}
	return ""
}

// projectGroups are the board's tasks by project, in the order their first
// task comes on the board (what needs the user first, then working,
// waiting, done today), Other last.
func projectGroups(b store.Board) []projectGroup {
	var out []projectGroup
	at := map[string]int{}
	var other *projectGroup
	for _, lane := range b.Lanes {
		for _, task := range lane {
			name := projectOf(task)
			if name == "" {
				if other == nil {
					other = &projectGroup{}
				}
				other.tasks = append(other.tasks, task)
				continue
			}
			i, ok := at[name]
			if !ok {
				i = len(out)
				at[name] = i
				out = append(out, projectGroup{name: name})
			}
			g := &out[i]
			if pl := task.Place(); pl.Kind == "repo" && g.place == nil {
				p := protocol.Place{Kind: "repo", Device: pl.Device, RepoPath: pl.RepoPath}
				g.place = &p
			}
			g.tasks = append(g.tasks, task)
		}
	}
	if other != nil {
		out = append(out, *other)
	}
	return out
}

// byProject is On hand grouped by project.
func (a *App) byProject(c *ui.Context, b store.Board) {
	t := a.T
	for _, d := range a.partnerDecisions() {
		a.partnerDecisionCard(c.Key("pd:"+d.DecisionID), d)
	}
	ui.Column(c.Key("by-project")).Gap(t.S6).MaxWidth(960).Width(960).MaxWidthPercent(100).AlignSelf(ui.Center).Children(func() {
		for _, g := range projectGroups(b) {
			a.projectGroup(c.Key("group:"+g.name), g)
		}
	})
	if ws := a.looseWaiters(); len(ws) > 0 {
		ui.Column(c.Key("loose")).Gap(t.S3).Children(func() {
			for _, w := range ws {
				a.waiterRow(c.Key("w:"+w.WaiterID), w)
			}
		})
	}
}

func (a *App) projectGroup(c *ui.Context, g projectGroup) {
	t := a.T
	name := g.name
	if name == "" {
		name = a.L.T("onhand.other")
	}
	ui.Column(c).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.heading(c, name, t.XL).SingleLine().Shrink(1).MinWidth(0)
			a.heading(c, fmt.Sprint(len(g.tasks)), t.XL).TextColor(t.InkMuted).FontFeatures("tnum")
			ui.Spacer(c)
			label := a.L.T("onhand.newhere")
			if a.iconButton(c, label+" "+name, t.ControlSM, btnText, drawPlus) {
				p := protocol.Place{Kind: "none"}
				if g.place != nil {
					p = *g.place
				}
				a.OpenNewTask(&p)
			}
		})
		ui.Column(c).Padding(t.S1, t.S4).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
			Dividers(1, t.LineSoft).Children(func() {
			for _, task := range g.tasks {
				a.projectRow(c.Key(task.ID), task)
			}
		})
	})
}

// projectRow is one task of a group, in one line.
func (a *App) projectRow(c *ui.Context, task *store.Task) {
	t := a.T
	att := task.Attention()
	row := ui.Row(c).Gap(t.S3).Padding(t.S3, 0).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
	row.Children(func() {
		ui.Box(c.Key("face")).Size(32, 32).Shrink(0).Children(func() {
			a.avatar(c, taskPresence(task), 32)
		})
		title := ui.Text(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD).FontWeight(700).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(task.Title())
		if row.Hovered() {
			title.Underline()
		}
		if p := task.Place(); p.Kind == "repo" && p.Branch != "" {
			ui.Text(c, p.Branch).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(2).MinWidth(0).MaxWidth(240).Tooltip(p.Branch)
		}
		if ch := taskChanges(task); ch != nil {
			ui.Row(c.Key("stat")).Gap(t.S1 + 2).Shrink(0).Children(func() {
				ui.Text(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
				ui.Text(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
			})
		}
		ink := t.InkMuted
		switch att {
		case protocol.NeedsYou:
			ink = t.NeedsYou.Ink
		case protocol.Failed:
			ink = t.Failed.Ink
		}
		ui.Text(c, a.stateLabel(att)).FontSize(t.XS).FontWeight(700).TextColor(ink).Shrink(0).Width(64).TextAlign(ui.End).SingleLine()
	})
	if row.Clicked() {
		a.OpenTask(task.ID)
	}
}

// taskChanges is a repo task's counted diff stat, nil until counted (never
// shown as 0).
func taskChanges(task *store.Task) *protocol.DiffStat {
	if task.Card == nil || task.Card.Changes == nil {
		return nil
	}
	if ch := task.Card.Changes; ch.Files > 0 || ch.Adds > 0 || ch.Dels > 0 {
		return ch
	}
	return nil
}

// drawPlus is a plus: open a new one here.
func drawPlus(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-6, cy)
		m.LineTo(cx+6, cy)
		m.MoveTo(cx, cy-6)
		m.LineTo(cx, cy+6)
		p.StrokePath(&m, 2.2, col)
	}
}
