package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Projects (D128, D186, D261): one group per project (a folder the user
// works in: a repo's or one they added by hand), 其他 / Other for the
// tasks of no place. On hand draws them as its lens (onhandboard.go);
// what starts later or repeats in a folder shows under its project
// (D185); a project added by hand shows before its first task.

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

// projectRoutineRow is something in this folder that starts later or
// repeats (D185): its calendar page, its name, when, and when next.
func (a *App) projectRoutineRow(c *ui.Context, r *protocol.Routine) {
	t := a.T
	paused := r.State == "paused"
	ui.Row(c).Gap(t.S3).Padding(t.S3, t.S4+2).AlignItems(ui.Center).Label(r.Name).Children(func() {
		ui.Box(c.Key("face")).Size(32, 36).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
			a.calendarBadge(c, r, 30)
		})
		name := uiText(c, keepWords(autospace(r.Name))).FontSize(t.MD).FontWeight(700).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(r.Name)
		if paused {
			name.TextColor(t.InkMuted)
		}
		uiText(c, r.TriggerWords).FontSize(t.XS).TextColor(t.InkSoft).SingleLine().Shrink(2).MinWidth(0).MaxWidth(260)
		uiText(c, a.routineState(r)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Shrink(0).TextAlign(ui.End).SingleLine()
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
