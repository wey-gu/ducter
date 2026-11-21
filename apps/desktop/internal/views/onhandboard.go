package views

// On hand as a conductor (D261): projects are a lens, never something to
// manage. Every task with a folder belongs to its folder's project, every
// other one to 其他 / Other, with nothing to set up. From two groups, the
// projects stand in a column at the left of the board (a row of names when
// the window is narrow), each saying at a glance whether anything there
// needs you, works, or came back new, and what its branches changed. The
// board on its right always reads by state, under a strip of four counts
// that are also its filters. Opening a task turns the board into D244's
// rail, narrowed by the same lens: one rail at a time, never two.

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const (
	// lensOther is the lens key of the tasks of no folder (其他 / Other).
	lensOther = "~"
	// lensColW is the project column's width beside the board.
	lensColW = 208
	// quietAfter is how long a wait goes without any change before it
	// folds away under 在等 (D261): it is still there, one tap away.
	quietAfter = 24 * time.Hour
)

// lensGroup is one project of the board: its key ("" never; lensOther
// for no folder), what it says, its folder, its tasks and routines.
type lensGroup struct {
	key, name string
	place     *protocol.Place
	tasks     []*store.Task
	routines  []protocol.Routine
	added     bool   // a project added by hand (D186)
	kind      string // D341: a to-do source's app (key src:<id>); "" for a project
	// where (D455): the computers it lives on, by name, when the home has
	// two or more (one repo on two computers is one project).
	where []string
}

// lensGroups are the board's projects in projectGroups' order (what needs
// you first), Other last.
func (a *App) lensGroups(b store.Board) []lensGroup {
	var added []protocol.ProjectView
	if a.S.OnHand != nil {
		added = a.S.OnHand.Projects
	}
	addedNames := map[string]bool{}
	for _, p := range added {
		addedNames[p.Name] = true
	}
	var out []lensGroup
	for _, g := range projectGroups(b, added, a.routines()) {
		key, name := g.name, g.name
		if g.name == "" {
			key, name = lensOther, a.L.T("onhand.other")
		}
		lg := lensGroup{key: key, name: name, place: g.place, tasks: g.tasks, routines: g.routines, added: addedNames[g.name]}
		if g.name != "" && a.manyComputers() {
			lg.where = a.groupWhere(g.name, g.tasks, g.routines, added)
		}
		out = append(out, lg)
	}
	// D341: then the to-do sources that have tasks, each a lens of its own.
	return append(out, a.sourceLensGroups(b)...)
}

// groupWhere are the computers a project lives on (D455): where its
// tasks ran, its routines start and it was added, by name, home first.
func (a *App) groupWhere(name string, tasks []*store.Task, routines []protocol.Routine, added []protocol.ProjectView) []string {
	seen := map[string]bool{}
	var ids []string
	add := func(pl protocol.Place) {
		if id := a.placeComputer(pl); id != "" && !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	for _, x := range tasks {
		add(x.Place())
	}
	for _, r := range routines {
		if r.Place != nil {
			add(*r.Place)
		}
	}
	for _, p := range added {
		if p.Name == name {
			add(p.Place)
		}
	}
	sort.SliceStable(ids, func(i, j int) bool {
		hi, hj := a.computerOf(ids[i]), a.computerOf(ids[j])
		return hi != nil && hi.Home && (hj == nil || !hj.Home)
	})
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, a.computerName(id))
	}
	return out
}

// lensOn says whether the lens is offered: two groups or more (one
// project with errands beside it is already two kinds of work).
func lensOn(groups []lensGroup) bool {
	return len(groups) >= 2
}

// currentLens is the lens this Mac keeps, if that project is still on the
// board; else all.
func (a *App) currentLens(groups []lensGroup) string {
	k := a.Local.Lens()
	if k == "" || !lensOn(groups) {
		return ""
	}
	for _, g := range groups {
		if g.key == k {
			return k
		}
	}
	return ""
}

// lensOf is the lens key a task is under.
func lensOf(task *store.Task) string {
	if p := projectOf(task); p != "" {
		return p
	}
	return lensOther
}

// lensBoard is the board narrowed to a lens ("" is all of it).
func lensBoard(b store.Board, lens string) store.Board {
	if lens == "" {
		return b
	}
	var out store.Board
	for i, l := range b.Lanes {
		for _, x := range l {
			if isSourceLens(lens) {
				if s := taskTodo(x); s != nil && srcLensPrefix+s.Source == lens {
					out.Lanes[i] = append(out.Lanes[i], x)
				}
				continue
			}
			if lensOf(x) == lens {
				out.Lanes[i] = append(out.Lanes[i], x)
			}
		}
	}
	out.Counts = protocol.Counts{NeedsYou: len(out.Lanes[store.LaneNeedsYou]), Working: len(out.Lanes[store.LaneWorking]), Waiting: len(out.Lanes[store.LaneWaiting]), DoneToday: store.DoneToday(out.Lanes[store.LaneDone], time.Now())}
	return out
}

// loose says whether the lens holds what belongs to no task: the
// partner's own asks, task-less waits, calls (all, and Other).
func loose(lens string) bool {
	return lens == "" || lens == lensOther
}

// quietWait: a waiting task nothing has changed on for a day.
func (a *App) quietWait(task *store.Task) bool {
	if task.Attention() != protocol.Blocked || task.Card == nil {
		return false
	}
	at := store.ParseTime(task.Card.UpdatedAt)
	if w := a.S.WaiterFor(task.ID); w != nil && w.Changes > 0 {
		if l := store.ParseTime(w.LastLookAt); l.After(at) {
			at = l
		}
	}
	return !at.IsZero() && a.Now().Sub(at) >= quietAfter
}

// groupStat is a group's unmerged changes, summed over its tasks' branches.
func groupStat(tasks []*store.Task) (adds, dels int) {
	for _, x := range tasks {
		if integrated(x) == "merge" {
			continue
		}
		if ch := taskChanges(x); ch != nil {
			adds += ch.Adds
			dels += ch.Dels
		}
	}
	return
}

// ---------- the project column ----------

// projectColumn is the lens at the left of the board: All, each project,
// Other; then Add a folder.
func (a *App) projectColumn(c *ui.Context, b store.Board, groups []lensGroup, lens string) {
	t := a.T
	// D467: the column steps back: no deep ground, a hairline beside the board.
	ui.Column(c.Key("lens-col")).Width(lensColW).Shrink(0).MinHeight(0).BorderWidth(0, 1, 0, 0).BorderColor(t.LineSoft).Label(a.L.T("onhand.lens")).Children(func() {
		ui.Scroll(c.Key("lens-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Gap(2).Padding(t.S5, t.S3, t.S6, t.S3).Children(func() {
				var all []*store.Task
				for _, l := range b.Lanes {
					all = append(all, l...)
				}
				a.lensRow(c, "", a.L.T("onhand.lens.all"), all, lens == "", false, "", nil)
				ui.Box(c.Key("gap")).Height(t.S3)
				srcs := 0
				for _, g := range groups {
					if g.kind != "" {
						srcs++
						continue
					}
					a.lensRow(c, g.key, g.name, g.tasks, lens == g.key, g.key == lensOther, "", g.where)
				}
				// D341: 来自 / From: the to-do sources with tasks, after the projects.
				if srcs > 0 {
					uiText(c.Key("src-head"), a.L.T("todos.lens")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).
						Padding(t.S4, t.S3, t.S1, t.S3).Role(ui.RoleHeading)
					for _, g := range groups {
						if g.kind != "" {
							a.lensRow(c, g.key, g.name, g.tasks, lens == g.key, false, g.kind, nil)
						}
					}
				}
				// D455: on any computer of the home (its own, a worker's, this
				// Mac's), never only this Mac's picker.
				if ok, _ := a.afComputers(); len(ok) > 0 {
					ui.Row(c.Key("add")).Padding(t.S4, t.S3, 0, t.S3).Children(func() {
						if a.quietButton(c, "onhand-add-folder", "＋ "+a.L.T("onhand.addfolder"), a.L.T("addfolder.about"), false, 0) {
							a.OpenAddFolder()
						}
					})
				}
			})
		})
	})
}

// lensRow is one project in the column: its name and what its branches
// changed; at its end the face of its most urgent task and how many it has.
// A to-do source's row (D341) has its app's mark before its name.
func (a *App) lensRow(c *ui.Context, key, name string, tasks []*store.Task, on, other bool, brand string, where []string) {
	t := a.T
	_, _, words := a.foldMark(tasks)
	label := name
	if len(where) > 0 {
		label = spoken(a.L, label, a.L.T("onhand.where", strings.Join(where, a.L.T("onhand.where.and"))))
	}
	if words != "" {
		label = spoken(a.L, label, words)
	}
	r := ui.Row(c.Key("lens:"+key)).Gap(t.S2).Padding(t.S2+1, t.S3).MinHeight(44).Radius(t.RadiusMD).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable()
	switch {
	case on:
		a.knob(r) // D270: the chosen one is the knob
	case r.Hovered():
		r.Background(t.Ink.Alpha(0.04))
	}
	a.arriving(c, r, name)
	r.Children(func() {
		if brand != "" {
			if src := theme.Brand(brand); src != nil {
				ui.Image(c.Key("brand"), src).Size(16, 16).Shrink(0).AccessHidden(true)
			}
		}
		ui.Column(c.Key("nm")).Grow(1).Shrink(1).MinWidth(0).Gap(1).Children(func() {
			ink := t.InkSoft
			if on {
				ink = t.Ink
			}
			if other && !on {
				ink = t.InkMuted
			}
			uiText(c, name).FontSize(14).FontWeight(600).TextColor(ink).SingleLine().MinWidth(0).AccessHidden(true)
			// D455: where it lives, each computer its own word (D291).
			if len(where) > 0 {
				ui.Row(c.Key("where")).Gap(t.S2).Wrap().MinWidth(0).AccessHidden(true).Children(func() {
					for i, w := range where {
						uiText(c.Key(fmt.Sprint("w", i)), w).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
					}
				})
			}
			if adds, dels := groupStat(tasks); adds+dels > 0 {
				ui.Row(c.Key("stat")).Gap(t.S1 + 2).Children(func() {
					if adds > 0 {
						uiText(c, fmt.Sprintf("+%d", adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
					}
					if dels > 0 {
						uiText(c, fmt.Sprintf("−%d", dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
					}
				})
			}
		})
		// D467 round 3: the partner's face only where something there needs you.
		if x := a.lensNeeds(tasks); x != nil {
			ui.Box(c.Key("mark")).Shrink(0).Tooltip(words).Children(func() { a.statusFace(c, x, stNeeds) })
		}
		n := ""
		if len(tasks) > 0 {
			n = fmt.Sprint(len(tasks))
		}
		uiText(c.Key("n"), n).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).FontFeatures("tnum").MinWidth(20).TextAlign(ui.End).Shrink(0).AccessHidden(true)
	})
	if r.Clicked() {
		a.Local.SetLens(key)
		a.oh.focus = ""
	}
}

// lensTabs is the lens where the window is too narrow for the column: one
// row of names, the chosen one raised.
func (a *App) lensTabs(c *ui.Context, groups []lensGroup, lens string) {
	t := a.T
	ui.Row(c.Key("lens-tabs")).Gap(t.S1).Wrap().AlignItems(ui.Center).Label(a.L.T("onhand.lens")).Children(func() {
		tab := func(key, name string, tasks []*store.Task) {
			on := key == lens
			_, _, words := a.foldMark(tasks)
			r := ui.Row(c.Key("tab:"+key)).Gap(t.S1+2).Height(34).Padding(0, t.S3).Radius(t.RadiusMD).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, name, words)).Focusable()
			a.arriving(c, r, name)
			switch {
			case on:
				a.knob(r) // D270: the chosen one is the knob
			case r.Hovered():
				r.Background(t.Sunken)
			}
			r.Children(func() {
				ink := t.InkMuted
				if on {
					ink = t.Ink
				}
				uiText(c, name).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine().AccessHidden(true)
				if x := a.lensNeeds(tasks); x != nil {
					ui.Box(c.Key("mark")).Size(20, 20).Shrink(0).Children(func() {
						stillFace(c, "f", statusPresence(x, stNeeds), 20)
					})
				}
			})
			if r.Clicked() {
				a.Local.SetLens(key)
				a.oh.focus = ""
			}
		}
		var all []*store.Task
		for _, g := range groups {
			if g.kind == "" { // a source's tasks are in their projects too
				all = append(all, g.tasks...)
			}
		}
		tab("", a.L.T("onhand.lens.all"), all)
		for _, g := range groups {
			tab(g.key, g.name, g.tasks)
		}
	})
}

// ---------- the top of the board ----------

// stateCounts are the strip's four counts in a lens: what needs you (the
// partner's own asks too, in all and Other), working (live calls too),
// waiting (task-less waits too), done today (D310: tasks finished well
// today, the one count every surface says; a failed task and a missed wait
// are in the list with their own words, not counted here).
//
// D467: what stopped and what didn't work out need you too; done today is
// what 今天做完 lists (today's, never yesterday's).
func (a *App) stateCounts(b store.Board, lens string) [4]int {
	sp := a.splitOf(b)
	// A part that didn't work out in a stopped line is the line's: counted once, as the line.
	inLine := map[string]bool{}
	for _, g := range a.boardGroups(b) {
		if g.stopped != nil {
			for id := range g.ids {
				inLine[id] = true
			}
		}
	}
	failed := 0
	for _, x := range sp.failed {
		if !inLine[x.ID] {
			failed++
		}
	}
	n := [4]int{len(sp.needs) + len(sp.stopped) + failed, len(sp.working), len(sp.waiting), len(sp.today)}
	n[0] += a.stoppedGroups(b) // D360: a stopped line waits for the person's word
	if loose(lens) {
		n[0] += len(a.partnerDecisions()) + len(a.otherAsks()) // D312: another partner's own questions too
		n[2] += len(a.looseWaiters())
	}
	return n
}

// boardTop is the board's head: the partner and its sentence (D287), the
// strip of four counts (each one a filter), Find from ten tasks, and
// New task here under a project's lens.
func (a *App) boardTop(c *ui.Context, b store.Board, groups []lensGroup, lens string) ui.Element {
	t := a.T
	n := a.stateCounts(b, lens)
	if f := a.oh.filter; f > 0 && n[f-1] == 0 {
		a.oh.filter = 0 // the last of them went: the filter lets go
	}
	var find ui.Element
	ui.Column(c.Key("top")).Gap(t.S4).Children(func() {
		// D467: the partner's brief in its own voice; no count strip.
		a.brief(c, b, lens, n)
		g := groupOf(groups, lens)
		here := g != nil && g.key != lensOther && g.kind == ""
		total := n[0] + n[1] + n[2] + n[3]
		if !here && total < findFrom {
			return
		}
		ui.Row(c.Key("tools-row")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if here {
				p := protocol.Place{Kind: "none"}
				if g.place != nil {
					p = *g.place
				}
				// D457: a project with nothing yet (one just added) says its first step in words.
				if len(g.tasks) == 0 {
					if a.button(c, a.L.T("onhand.project.start", g.name), btnSecondary, t.ControlSM, t.Bg) {
						a.OpenNewTask(&p)
					}
				} else if a.iconButton(c, a.L.T("onhand.newhere")+" "+g.name, t.ControlSM, btnText, drawPlus) {
					a.OpenNewTask(&p)
				}
			}
			ui.Spacer(c)
			if total >= findFrom {
				ui.Row(c.Key("findbox")).Width(260).Shrink(1).MinWidth(180).Children(func() { find = a.findField(c) })
			}
		})
	})
	return find
}

// lensName is what a lens key says.
func (a *App) lensName(key string) string {
	if key == lensOther {
		return a.L.T("onhand.other")
	}
	if isSourceLens(key) { // D341
		if g := groupOf(a.sourceLensGroups(a.S.Board()), key); g != nil {
			return g.name
		}
	}
	return key
}

func groupOf(groups []lensGroup, key string) *lensGroup {
	for i := range groups {
		if groups[i].key == key {
			return &groups[i]
		}
	}
	return nil
}

// stripCell is one count of the strip: a calm numeral and its state's
// name on one line. A count of none is faint and does nothing; pressed, it
// narrows the board to that state (the knob), and pressed again lets go
// (Esc too).
func (a *App) stripCell(c *ui.Context, i int, name string, n int) {
	t := a.T
	on := a.oh.filter == i
	cell := ui.Row(c.Key(fmt.Sprint("cell", i))).Gap(t.S1+2).Height(28).Padding(0, t.S3).Radius(t.RadiusSM - 3).AlignItems(ui.Center)
	if n > 0 {
		label := fmt.Sprintf("%s %d", name, n)
		cell.Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable()
		switch {
		case on:
			a.knob(cell)
			cell.AccessSelected(true)
		case cell.Hovered():
			cell.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
		}
	} else {
		cell.Label(fmt.Sprintf("%s 0", name))
	}
	cell.Children(func() {
		num, lab := t.Ink, t.InkMuted
		switch {
		case n == 0:
			num, lab = t.Faint, t.Faint
		case i == 1:
			num = t.NeedsYou.Ink
		}
		if on {
			lab = t.Ink
		}
		uiText(c, fmt.Sprint(n)).FontSize(t.SM + 1).FontWeight(600).TextColor(num).FontFeatures("tnum").AccessHidden(true)
		uiText(c, name).FontSize(t.SM).FontWeight(500).TextColor(lab).SingleLine().AccessHidden(true)
	})
	if n > 0 && cell.Clicked() {
		if on {
			a.oh.filter = 0
		} else {
			a.oh.filter = i
		}
		a.oh.focus = ""
	}
}

// waitNext is when a wait looks again, in words, with how far along the
// interval it is (for the small ring); "" when it doesn't look on its own.
func (a *App) waitNext(w *protocol.Waiter) (string, float32) {
	if w == nil {
		return "", 0
	}
	if w.Limit != nil {
		return a.limitNext(w)
	}
	if w.Check != nil || w.Event != nil {
		next := store.ParseTime(w.NextLookAt)
		if next.IsZero() || !next.After(a.Now()) {
			return "", 0
		}
		last := store.ParseTime(firstNonEmpty(w.LastLookAt, w.ArmedAt))
		f := float32(0)
		if !last.IsZero() && next.After(last) {
			f = float32(a.Now().Sub(last)) / float32(next.Sub(last))
		}
		return a.tp("onhand.wait.next", a.soon(next)), f
	}
	if at := store.ParseTime(w.At); !at.IsZero() && at.After(a.Now()) {
		from := store.ParseTime(w.ArmedAt)
		f := float32(0)
		if !from.IsZero() && at.After(from) {
			f = float32(a.Now().Sub(from)) / float32(at.Sub(from))
		}
		return a.tp("onhand.wait.at", a.soon(at)), f
	}
	return "", 0
}

// soon is a time of day, with its day only when it isn't today.
func (a *App) soon(at time.Time) string {
	if i18n.Day(a.L.Lang, at, a.Now()) == i18n.Day(a.L.Lang, a.Now(), a.Now()) {
		return i18n.Clock(at)
	}
	return a.when(at)
}

// arriving rings a project just added from the sheet (D457): an accent
// ring that fades over arriveFor, at once gone under Reduce Motion.
func (a *App) arriving(c *ui.Context, r ui.Element, name string) {
	p, live := a.arrivalFor(name)
	if !live {
		return
	}
	if c.Preferences().ReduceMotion {
		return // no ring under Reduce Motion; the chosen lens says it
	}
	// Full for the first eighth, then down to nothing.
	k := float32(1)
	if p > 0.12 {
		k = 1 - (p-0.12)/0.88
	}
	r.Border(2.5, a.T.Accent.Alpha(k)).Background(a.T.Accent.Alpha(0.10 * k))
	c.Invalidate()
}

// lensNeeds is a project's task that needs the person (a question, a wait
// that stopped, one that didn't work out), or nil (D467 round 3).
func (a *App) lensNeeds(tasks []*store.Task) *store.Task {
	for _, x := range tasks {
		if x.Attention() == protocol.NeedsYou || x.Attention() == protocol.Failed || a.stoppedWait(x) {
			return x
		}
	}
	return nil
}
