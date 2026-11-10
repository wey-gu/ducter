package views

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// On hand by project (D128, D186): one group per project (a folder the
// user works in: a repo's or one they added by hand), 其他 / Other for the
// tasks of no place; a row is face · title · what kind (等 …, 第 n 次) ·
// branch · +adds −dels · state. What starts later or repeats in that
// folder sits in its group too, with when it starts next (D185). A group's
// "+" is 在这儿开一件 / New task here; a project added by hand shows before
// its first task; 加一个文件夹 adds one (D186).

type projectGroup struct {
	name     string
	place    *protocol.Place // a group's folder, for its "+"
	tasks    []*store.Task
	routines []protocol.Routine
}

// projectOf is the group a task goes in: the card's project, else its
// folder's name, else "" (Other).
func projectOf(task *store.Task) string {
	if p := task.Project(); p != "" {
		return p
	}
	if pl := task.Place(); pl.Kind == "repo" || pl.Kind == "folder" {
		return lastPath(placePath(pl))
	}
	return ""
}

// routineProject is the group a routine goes in: its project, else its
// folder's name, else "" (no group: it stays on the shelf).
func routineProject(r protocol.Routine) string {
	if r.Project != "" {
		return r.Project
	}
	if r.Place != nil && (r.Place.Kind == "repo" || r.Place.Kind == "folder") {
		return lastPath(placePath(*r.Place))
	}
	return ""
}

// projectGroups are the board's tasks by project, in the order their first
// task comes on the board (what needs the user first, then working,
// waiting, done today); then the projects added by hand with nothing yet;
// Other last. Routines with a folder join their project's group.
func projectGroups(b store.Board, added []protocol.ProjectView, routines []protocol.Routine) []projectGroup {
	var out []projectGroup
	at := map[string]int{}
	group := func(name string, pl *protocol.Place) *projectGroup {
		i, ok := at[name]
		if !ok {
			i = len(out)
			at[name] = i
			out = append(out, projectGroup{name: name})
		}
		g := &out[i]
		if pl != nil && g.place == nil && (pl.Kind == "repo" || pl.Kind == "folder") {
			p := protocol.Place{Kind: pl.Kind, Device: pl.Device, RepoPath: pl.RepoPath, Path: pl.Path}
			g.place = &p
		}
		return g
	}
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
			pl := task.Place()
			g := group(name, &pl)
			g.tasks = append(g.tasks, task)
		}
	}
	for _, r := range routines {
		if name := routineProject(r); name != "" {
			g := group(name, r.Place)
			g.routines = append(g.routines, r)
		}
	}
	for _, p := range added {
		pl := p.Place
		group(p.Name, &pl)
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
	var added []protocol.ProjectView
	if a.S.OnHand != nil {
		added = a.S.OnHand.Projects
	}
	ui.Column(c.Key("by-project")).Gap(t.S6).MaxWidth(960).Width(960).MaxWidthPercent(100).AlignSelf(ui.Center).Children(func() {
		for _, g := range projectGroups(b, added, a.routines()) {
			a.projectGroup(c.Key("group:"+g.name), g)
		}
		if a.canAddFolder() {
			if a.quietButton(c, "onhand-add-folder", "＋ "+a.L.T("onhand.addfolder"), a.L.T("newtask.addfolder.title"), false, 0) {
				a.addFolder()
			}
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
			if n := len(g.tasks); n > 0 {
				a.heading(c, fmt.Sprint(n), t.XL).TextColor(t.InkMuted).FontFeatures("tnum")
			}
			if g.place != nil {
				ui.Text(c, tildePath(placePath(*g.place))).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).SingleLine().Shrink(2).MinWidth(0)
			}
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
			for i := range g.routines {
				a.projectRoutineRow(c.Key("rt:"+g.routines[i].RoutineID), &g.routines[i])
			}
			if len(g.tasks) == 0 && len(g.routines) == 0 {
				ui.Row(c.Key("empty")).Height(56).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.L.T("onhand.project.empty")).FontSize(t.SM).TextColor(t.InkMuted)
				})
			}
		})
	})
}

// taskKind is what kind of work a row is, in a few words, when it isn't
// plain: what it waits for (等 PR #1592 通过), or which try of a loop it is
// (第 3 次). "" for a plain task.
func (a *App) taskKind(task *store.Task) string {
	if u := task.Card; u != nil && u.Until != nil && u.Until.State == "on" {
		return a.L.T("until.n", len(u.Until.Tries)+1)
	}
	if task.Attention() == protocol.Blocked {
		// A wait names what is awaited ("PR #1592 通过"): said as 等 …; any
		// other reason is already in words.
		if w := a.S.WaiterFor(task.ID); w != nil && strings.TrimSpace(w.Reason) != "" {
			return a.waitLine(w.Reason)
		}
		return a.waitReason(task)
	}
	return ""
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
		if k := a.taskKind(task); k != "" {
			ui.Text(c.Key("kind"), k).FontSize(t.XS).TextColor(t.InkSoft).SingleLine().Shrink(2).MinWidth(0).MaxWidth(260).Tooltip(k)
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

// projectRoutineRow is something in this folder that starts later or
// repeats (D185): its calendar page, its name, when, and when next.
func (a *App) projectRoutineRow(c *ui.Context, r *protocol.Routine) {
	t := a.T
	paused := r.State == "paused"
	ui.Row(c).Gap(t.S3).Padding(t.S3, 0).AlignItems(ui.Center).Label(r.Name).Children(func() {
		ui.Box(c.Key("face")).Size(32, 36).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
			a.calendarBadge(c, r, 30)
		})
		name := ui.Text(c, keepWords(autospace(r.Name))).FontSize(t.MD).FontWeight(700).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(r.Name)
		if paused {
			name.TextColor(t.InkMuted)
		}
		ui.Text(c, r.TriggerWords).FontSize(t.XS).TextColor(t.InkSoft).SingleLine().Shrink(2).MinWidth(0).MaxWidth(260)
		ui.Text(c, a.routineState(r)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Shrink(0).TextAlign(ui.End).SingleLine()
	})
}

// routineState is a routine's one word on a row: paused, running, or when
// it starts next.
func (a *App) routineState(r *protocol.Routine) string {
	switch {
	case r.State == "paused":
		return a.L.T("routine.paused.asked")
	case r.Running != "":
		return strings.TrimSuffix(strings.TrimSpace(a.L.T("routine.running")), " →")
	case r.NextAt != "":
		return a.tp("routine.next", a.when(store.ParseTime(r.NextAt)))
	}
	return ""
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
