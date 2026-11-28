package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Projects (D128, D186, D261): one group per project. D654 (research/245 §3.2): a project is
// its repository, derived once in core; the Mac reads the card's key and name and never derives one
// from a folder. 其他 / Other became 不在项目里 / Not in a project, and 电脑上的事 / On your computers
// holds the errands and machine set-ups.

type projectGroup struct {
	key      string
	name     string
	place    *protocol.Place // a group's folder, for its "+"
	tasks    []*store.Task
	routines []protocol.Routine
	added    bool // a project added by hand (D186)
	where    []string
	pinned   bool
	hidden   bool
	renamed  bool
	order    *int
	aliases  []string
}

// lensKey is the lens a task is under: core's project key, else 电脑上的事 or 不在项目里.
func lensKey(task *store.Task) string {
	if k := task.ProjectKey(); k != "" {
		return k
	}
	// An older home sends only the project's name (core's old field): it stays that task's lens.
	if p := task.Project(); p != "" {
		return p
	}
	if task.ProjectGroup() == "computer" {
		return lensComputers
	}
	return lensOther
}

// routineProject is the key a routine goes in: its stamped project, else its place's key is not
// known here (the home stamps it); a routine with no key stays on the shelf.
func routineProject(r protocol.Routine) string {
	if r.ProjectKey != "" {
		return r.ProjectKey
	}
	return r.Project
}

// projectGroups are the board's tasks by project, in the order their first task comes on the
// board (what needs the user first), then the projects added by hand with nothing yet, then the
// two no-project lenses. Names, hidden, pinned and order come from the home's project list.
func projectGroups(b store.Board, list []protocol.ProjectLens, routines []protocol.Routine) []projectGroup {
	var out []projectGroup
	at := map[string]int{}
	byKey := map[string]protocol.ProjectLens{}
	for _, p := range list {
		byKey[p.Key] = p
	}
	group := func(key string, pl *protocol.Place) *projectGroup {
		i, ok := at[key]
		if !ok {
			i = len(out)
			at[key] = i
			g := projectGroup{key: key, name: key}
			if p, ok := byKey[key]; ok {
				g.name = p.Name
				g.pinned, g.hidden, g.renamed, g.order = p.Pinned, p.Hidden, p.Renamed, p.Order
				g.where = p.Devices
				g.aliases = p.Aliases
			}
			out = append(out, g)
		}
		g := &out[i]
		if pl != nil && g.place == nil && (pl.Kind == "repo" || pl.Kind == "folder") {
			p := protocol.Place{Kind: pl.Kind, Device: pl.Device, RepoPath: pl.RepoPath, Path: pl.Path}
			g.place = &p
		}
		return g
	}
	var other, computers *projectGroup
	for _, lane := range b.Lanes {
		for _, task := range lane {
			key := lensKey(task)
			switch key {
			case lensOther:
				if other == nil {
					other = &projectGroup{key: lensOther}
				}
				other.tasks = append(other.tasks, task)
				continue
			case lensComputers:
				if computers == nil {
					computers = &projectGroup{key: lensComputers}
				}
				computers.tasks = append(computers.tasks, task)
				continue
			}
			pl := task.Place()
			g := group(key, &pl)
			if g.name == key {
				if n := task.ProjectName(); n != "" {
					g.name = n
				}
			}
			g.tasks = append(g.tasks, task)
		}
	}
	for _, r := range routines {
		if key := routineProject(r); key != "" && key != lensOther && key != lensComputers {
			g := group(key, r.Place)
			if g.name == key && r.ProjectName != "" {
				g.name = r.ProjectName
			}
			g.routines = append(g.routines, r)
		}
	}
	for _, p := range list {
		if _, ok := at[p.Key]; ok {
			continue
		}
		if !p.Added {
			continue
		}
		var pl *protocol.Place
		if p.Place != nil {
			x := *p.Place
			pl = &x
		}
		g := group(p.Key, pl)
		g.added = true
	}
	if other != nil {
		out = append(out, *other)
	}
	if computers != nil {
		out = append(out, *computers)
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
