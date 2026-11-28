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
	// lensOther is the lens key of the tasks of no folder (不在项目里 / Not in a project), and
	// lensComputers of the errands and machine set-ups (电脑上的事 / On your computers).
	lensOther     = "~"
	lensComputers = "~computers"
	// lensColW is the project column's width beside the board.
	lensColW = 244
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
	where   []string
	pinned  bool
	hidden  bool
	renamed bool
	order   *int
	aliases []string
}

// lensGroups are the board's projects in core's order (D654: pinned, then the person's drag
// order, else what needs the person first and the most recent activity); 不在项目里 and 电脑上的事 last.
func (a *App) lensGroups(b store.Board) []lensGroup {
	var list []protocol.ProjectLens
	fromCore := false
	if a.S.OnHand != nil {
		list = a.S.OnHand.ProjectList
		fromCore = len(list) > 0
		// An older home sends only the projects added by hand: each is still its own row.
		if len(list) == 0 {
			for _, p := range a.S.OnHand.Projects {
				key := p.Key
				if key == "" {
					key = p.Name
				}
				pl := p.Place
				list = append(list, protocol.ProjectLens{Key: key, Name: p.Name, Added: true, Place: &pl})
			}
		}
	}
	var out []lensGroup
	for _, g := range projectGroups(b, list, a.routines()) {
		name := g.name
		switch g.key {
		case lensOther:
			name = a.L.T("onhand.other")
		case lensComputers:
			name = a.L.T("onhand.computers")
		}
		if g.key != lensOther && g.key != lensComputers && neverStarted(g.tasks) {
			continue // D471: no place yet: its tasks never started there; they stand under All
		}
		lg := lensGroup{key: g.key, name: name, place: g.place, tasks: g.tasks, routines: g.routines, added: g.added, where: g.where, pinned: g.pinned, hidden: g.hidden, renamed: g.renamed, order: g.order, aliases: g.aliases}
		if lg.where == nil && g.key != lensOther && g.key != lensComputers && a.manyComputers() {
			lg.where = a.groupWhere(g.name, g.tasks, g.routines, nil)
		}
		out = append(out, lg)
	}
	// The person hid this project: its tasks still count under All and needs-you; it shows again
	// the moment something there needs the person.
	shown := out[:0]
	for _, g := range out {
		if g.hidden && a.lensNeeds(g.tasks) == nil {
			continue
		}
		shown = append(shown, g)
	}
	// D654: core sends the order; an older home has no projectList and keeps its urgency order.
	if fromCore {
		at := make(map[string]int, len(list))
		for i, p := range list {
			at[p.Key] = i
		}
		sort.SliceStable(shown, func(i, j int) bool {
			oi, iok := at[shown[i].key]
			oj, jok := at[shown[j].key]
			if iok != jok {
				return iok
			}
			if iok && jok && oi != oj {
				return oi < oj
			}
			return false
		})
	}
	return shown
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

// lensOf is the lens key a task is under, read from core's card (D654, research/245 §3.2).
func lensOf(task *store.Task) string { return lensKey(task) }

// lensBoard is the board narrowed to a lens ("" is all of it).
func lensBoard(b store.Board, lens string) store.Board {
	if lens == "" {
		return b
	}
	var out store.Board
	for i, l := range b.Lanes {
		for _, x := range l {
			if lensOf(x) == lens {
				out.Lanes[i] = append(out.Lanes[i], x)
			}
		}
	}
	out.Counts = protocol.Counts{NeedsYou: len(out.Lanes[store.LaneNeedsYou]), Working: len(out.Lanes[store.LaneWorking]), Waiting: len(out.Lanes[store.LaneWaiting]), DoneToday: store.DoneToday(out.Lanes[store.LaneDone], time.Now())}
	return out
}

// sourceBoard is D341's 来自 / From as a filter over any lens, never a lens of its own
// (D654, research/245 §3.2).
func sourceBoard(b store.Board, key string) store.Board {
	if key == "" {
		return b
	}
	var out store.Board
	for i, l := range b.Lanes {
		for _, x := range l {
			if s := taskTodo(x); s != nil && srcLensPrefix+s.Source == key {
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

// neverStarted: every task of a project couldn't start where it was to
// work (D471: a project is a place work lives; one whose folder was never
// there is not one yet).
func neverStarted(tasks []*store.Task) bool {
	if len(tasks) == 0 {
		return false
	}
	for _, x := range tasks {
		if x.Attention() != protocol.Failed || x.Cant() == nil {
			return false
		}
	}
	return true
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
				a.lensRow(c, "", a.L.T("onhand.lens.all"), all, lens == "", false, "", nil, nil)
				ui.Box(c.Key("gap")).Height(t.S3)
				for i := range groups {
					g := &groups[i]
					if g.kind != "" {
						continue
					}
					if a.oh.projRename == g.key {
						in := a.lineField(c, "lens-rename", a.L.T("onhand.project.rename"), &a.oh.projDraft, a.L.T("onhand.project.rename.ph"), true, func() {
							a.projectChange(protocol.ProjectChange{Act: "rename", Key: g.key, Name: strings.TrimSpace(a.oh.projDraft)})
							a.oh.projRename, a.oh.projDraft = "", ""
						})
						in.Width(lensColW - 2*t.S3)
						continue
					}
					a.lensRow(c, g.key, g.name, g.tasks, lens == g.key, g.key == lensOther || g.key == lensComputers, "", g.where, g)
				}
				// D662: the saved views, under the projects.
				a.viewRows(c, b)
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

// middleEllipsis keeps a project name's start and end on one line: a hyphenated name keeps its
// first and last part (`nowledge-…-website`); otherwise the longest measured head + … + tail fits.
func middleEllipsis(c *ui.Context, s string, width, size float32) string {
	measure := func(x string) float32 {
		w, _ := c.MeasureText(0, ui.Span{Text: x, Size: size, Weight: 600})
		return w
	}
	if measure(s) <= width-8 { // a margin, so the count never touches the name
		return s
	}
	parts := strings.Split(s, "-")
	if len(parts) > 2 {
		return parts[0] + "-…-" + parts[len(parts)-1]
	}
	ell := "…"
	lo, hi, best := 0, len([]rune(s))-1, 0
	runes := []rune(s)
	for lo <= hi {
		n := (lo + hi) / 2
		l, r := (n+1)/2, n/2
		out := string(runes[:l]) + ell + string(runes[len(runes)-r:])
		if measure(out) <= width {
			best, lo = n, n+1
		} else {
			hi = n - 1
		}
	}
	if best < 3 {
		return string(runes[:1]) + ell
	}
	l, r := (best+1)/2, best/2
	return string(runes[:l]) + ell + string(runes[len(runes)-r:])
}

// fitWhere keeps a project row's computers on one line: as many as fit, then +N. Each computer is
// its own element (D291); the row's tooltip carries all of them.
func fitWhere(where []string, budget float32, width func(string) float32) ([]string, int) {
	used := float32(0)
	for i, w := range where {
		add := width(w)
		if i > 0 {
			add += 8
		}
		if i > 0 && used+add > budget {
			return where[:i], len(where) - i
		}
		used += add
	}
	return where, 0
}

// lensRow is one project in the column: its name and what its branches
// changed; at its end the face of its most urgent task and how many it has.
// A to-do source's row (D341) has its app's mark before its name.
func (a *App) lensRow(c *ui.Context, key, name string, tasks []*store.Task, on, other bool, brand string, where []string, g *lensGroup) {
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
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Tooltip(label).Focusable()
	switch {
	case on:
		a.knob(r) // D270: the chosen one is the knob
	default:
		a.rowHover(c, r, groundPage(), false) // D529
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
			// D654: one line, cut in the middle when too long (the full name in the tooltip
			// and the ⋯ menu's head), never two ragged lines at a hyphen.
			nameW := float32(lensColW) - 2*t.S3 - 20 - 2*t.S2
			if g != nil && key != "" && key != lensOther && key != lensComputers {
				nameW -= 26
			}
			uiText(c, middleEllipsis(c, name, nameW, 14)).FontSize(14).FontWeight(600).TextColor(ink).SingleLine().Width(nameW).Clip().MinWidth(0).Tooltip(name).AccessHidden(true)
			// D455: where it lives, each computer its own element (D291), one line; what does not
			// fit is +N, never a cut line. The row's tooltip has the whole list.
			if len(where) > 0 {
				shown, rest := fitWhere(where, nameW, func(s string) float32 { w, _ := c.MeasureText(0, ui.Span{Text: s, Size: t.XS}); return w })
				ui.Row(c.Key("where")).Gap(t.S2).Width(nameW).MinWidth(0).AccessHidden(true).Children(func() {
					for i, w := range shown {
						uiText(c.Key(fmt.Sprint("w", i)), w).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
					}
					if rest > 0 {
						uiText(c.Key("more"), fmt.Sprintf("+%d", rest)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Shrink(0)
					}
				})
			}
		})
		// D471: no line counts (a sum of branches says nothing about a project)
		// and no faces: the count, in the needs-you ink where something needs you.
		n := ""
		if len(tasks) > 0 {
			n = fmt.Sprint(len(tasks))
		}
		ink := t.InkMuted
		if a.lensNeeds(tasks) != nil {
			ink = t.NeedsYou.Ink
		}
		uiText(c.Key("n"), n).FontSize(t.SM).FontWeight(700).TextColor(ink).FontFeatures("tnum").MinWidth(20).TextAlign(ui.End).Shrink(0).AccessHidden(true).Tooltip(words)
		// D654 (research/245 §3.2): the project row's ⋯ (D421's one menu).
		if g != nil && key != "" && key != lensOther && key != lensComputers {
			a.projectMore(c, g)
		}
	})
	// D654 (research/245 §3.2): a drag on a project row keeps the person's order, on the home.
	if g != nil {
		_, dy, held := r.Dragged()
		if held && !a.oh.projDrag {
			a.oh.projDrag, a.oh.projFrom = true, key
		}
		if held && a.oh.projDrag && a.oh.projFrom == key {
			switch {
			case dy > 14:
				a.reorderProjects(key, 1)
				a.oh.projDrag = false
			case dy < -14:
				a.reorderProjects(key, -1)
				a.oh.projDrag = false
			}
		}
		if !held {
			a.oh.projDrag = false
		}
	}
	if r.Clicked() {
		a.Local.SetLens(key)
		a.oh.focus = ""
	}
}

// reorderProjects moves a project one place in the person's order (D654, research/245 §3.2).
func (a *App) reorderProjects(key string, by int) {
	var keys []string
	for _, g := range a.lensGroups(a.S.Board()) {
		if g.key != lensOther && g.key != lensComputers && g.kind == "" {
			keys = append(keys, g.key)
		}
	}
	at := -1
	for i, k := range keys {
		if k == key {
			at = i
		}
	}
	if at < 0 {
		return
	}
	to := at + by
	if to < 0 || to >= len(keys) {
		return
	}
	keys[at], keys[to] = keys[to], keys[at]
	a.projectChange(protocol.ProjectChange{Act: "order", Keys: keys})
}

// projectMore is a project row's ⋯: rename, merge into another project (an undoable alias),
// unmerge, pin, hide. Every one is reversible from the same menu.
func (a *App) projectMore(c *ui.Context, g *lensGroup) {
	a.menuMark(c, "pmore:"+g.key, a.L.T("onhand.project.menu", g.name), 26, func(m *ui.Menu) {
		// The full project name is the menu's head (the row says it in one line, cut in the middle).
		m.Item(g.name).Disabled(true)
		m.Separator()
		if m.Item(a.L.T("onhand.project.rename")).Chosen() {
			a.oh.projRename, a.oh.projDraft = g.key, g.name
		}
		if g.renamed && m.Item(a.L.T("onhand.project.rename.undo")).Chosen() {
			a.projectChange(protocol.ProjectChange{Act: "rename", Key: g.key})
		}
		// A fork the person counts as one: one row per other project (no submenu in the clay menu).
		var others []lensGroup
		for _, x := range a.lensGroups(a.S.Board()) {
			if x.key != g.key && x.key != lensOther && x.key != lensComputers && x.kind == "" {
				others = append(others, x)
			}
		}
		if len(others) > 0 {
			m.Separator()
			m.Submenu(a.L.T("onhand.project.merge"), func(sm *ui.Menu) {
				for _, x := range others {
					x := x
					if sm.Item(a.tp("onhand.project.merge.into", x.name)).Chosen() {
						a.projectChange(protocol.ProjectChange{Act: "merge", Key: g.key, Into: x.key})
					}
				}
			})
		}
		if len(g.aliases) > 0 && m.Item(a.L.T("onhand.project.unmerge")).Chosen() {
			a.projectChange(protocol.ProjectChange{Act: "unmerge", Key: g.key})
		}
		m.Separator()
		pin := a.L.T("onhand.project.pin")
		if g.pinned {
			pin = a.L.T("onhand.project.unpin")
		}
		if m.Item(pin).Chosen() {
			a.projectChange(protocol.ProjectChange{Act: "pin", Key: g.key, Pinned: !g.pinned})
		}
		hide := a.L.T("onhand.project.hide")
		if g.hidden {
			hide = a.L.T("onhand.project.show")
		}
		if m.Item(hide).Chosen() {
			a.projectChange(protocol.ProjectChange{Act: "hide", Key: g.key, Hidden: !g.hidden})
		}
	})
}

// projectChange sends one change to the home, which keeps it for every device.
func (a *App) projectChange(ch protocol.ProjectChange) {
	a.send(protocol.ClientFrame{T: "project_change", Change: &ch})
}

// lensTabs is the lens where the window is too narrow for the column: one
// row of names, the chosen one raised.
func (a *App) lensTabs(c *ui.Context, groups []lensGroup, lens string) {
	t := a.T
	// D654 (research/245 §3.2): one row that never wraps; what does not fit goes into the one
	// 更多 / More menu.
	budget := float32(a.winW) - 48
	if budget < 190 {
		budget = 190
	}
	tabW := func(name string) float32 {
		w := float32(24)
		for _, r := range name {
			if r >= 0x3000 && r <= 0x9fff {
				w += 15
			} else {
				w += 8.5
			}
		}
		return w
	}
	var shown, folded []lensGroup
	used := tabW(a.L.T("onhand.lens.all"))
	for _, g := range groups {
		w := tabW(g.name)
		if len(shown) == 0 || used+w <= budget {
			used += w
			shown = append(shown, g)
		} else {
			folded = append(folded, g)
		}
	}
	ui.Row(c.Key("lens-tabs")).Gap(t.S1).AlignItems(ui.Center).Label(a.L.T("onhand.lens")).Children(func() {
		tab := func(key, name string, tasks []*store.Task) {
			on := key == lens
			_, _, words := a.foldMark(tasks)
			r := ui.Row(c.Key("tab:"+key)).Gap(t.S1+2).Height(34).Padding(0, t.S3).Radius(t.RadiusMD).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, name, words)).Focusable()
			a.arriving(c, r, name)
			switch {
			case on:
				a.knob(r) // D270: the chosen one is the knob
			default:
				a.rowHover(c, r, groundPage(), false) // D529
			}
			r.Children(func() {
				// D471: no faces in a row of names; where something needs you, the name in its ink.
				ink := t.InkMuted
				switch {
				case on:
					ink = t.Ink
				case a.lensNeeds(tasks) != nil:
					ink = t.NeedsYou.Ink
				}
				uiText(c, name).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine().AccessHidden(true)
			})
			if r.Clicked() {
				a.Local.SetLens(key)
				a.oh.focus = ""
			}
		}
		var all []*store.Task
		for _, g := range groups {
			if g.kind == "" {
				all = append(all, g.tasks...)
			}
		}
		tab("", a.L.T("onhand.lens.all"), all)
		for _, g := range shown {
			tab(g.key, g.name, g.tasks)
		}
		if len(folded) > 0 {
			a.menuText(c, "lens-more", a.L.T("onhand.more"), func(m *ui.Menu) {
				for _, g := range folded {
					g := g
					if m.Item(g.name).Chosen() {
						a.Local.SetLens(g.key)
						a.oh.focus = ""
					}
				}
			})
		}
	})
}

// sourceChips is D341's 来自 / From over the board: one chip per to-do source that has a task,
// a filter on any project's lens (D654, research/245 §3.2).
func (a *App) sourceChips(c *ui.Context, b store.Board) {
	t := a.T
	groups := a.sourceLensGroups(b)
	if len(groups) == 0 {
		return
	}
	ui.Row(c.Key("src-chips")).Gap(t.S2).AlignItems(ui.Center).Label(a.L.T("todos.lens")).Children(func() {
		uiText(c.Key("src-h"), a.L.T("todos.lens")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		for _, g := range groups {
			g := g
			on := a.oh.source == g.key
			if a.choice(c, "src:"+g.key, g.name, on, "") {
				if on {
					a.oh.source = ""
				} else {
					a.oh.source = g.key
				}
				a.oh.focus = ""
			}
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
	// D661 (research/245 §3.3): the home derived one state for the whole board; the strip
	// counts that, filtered to the lens, so the Mac and the web cannot disagree.
	if a.S.OnHand != nil && a.S.OnHand.Truth != nil {
		return a.truthCounts(lens)
	}
	sp := a.splitOf(b)
	// D517: 等你 is the person's one count's items (needsyou.go), the Dock
	// badge's and the list of partners' numbers; a stopped line counts once.
	n := [4]int{len(a.needsYouIn(b, loose(lens))), len(sp.working), len(sp.waiting), len(sp.today)}
	if loose(lens) {
		n[2] += len(a.looseWaiters())
	}
	return n
}

// truthCounts are the strip's four counts from the snapshot's one truth (D661,
// research/245 §3.3): needs you, working, waiting and today's done, each filtered to the lens by
// the project key and group core stamped. The task-less waits and other partners' asks are
// already in the list, so nothing is added here.
func (a *App) truthCounts(lens string) [4]int {
	th := a.S.OnHand.Truth
	count := func(items []protocol.TruthItem) int {
		n := 0
		for _, it := range items {
			if a.truthInLens(it, lens) {
				n++
			}
		}
		return n
	}
	today := 0
	for _, it := range th.Done {
		if it.DoneToday && a.truthInLens(it, lens) {
			today++
		}
	}
	return [4]int{count(th.NeedsYou), count(th.Working), count(th.Waiting), today}
}

// truthInLens is whether one truth item stands under the lens: all of them under ""; core's two
// no-project lenses by ProjectGroup (a computer set-up under 电脑上的事, the rest under 不在项目里);
// a project's own key under it.
func (a *App) truthInLens(it protocol.TruthItem, lens string) bool {
	if lens == "" {
		return true
	}
	switch lens {
	case lensOther:
		return it.ProjectKey == "" && it.ProjectGroup != "computer"
	case lensComputers:
		return it.ProjectGroup == "computer"
	}
	return it.ProjectKey == lens
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
		// D654 (research/245 §3.2): 来自 / From filters any lens; it is never a lens itself.
		a.sourceChips(c, b)
		g := groupOf(groups, lens)
		here := g != nil && g.key != lensOther && g.kind == ""
		total := n[0] + n[1] + n[2] + n[3]
		// D662: 概览 / 列表 from eight tasks on; never for the consumer's few.
		offered := a.listOffered(b)
		if !here && total < findFrom && !offered {
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
			if offered {
				sel := 0
				if a.Local.BoardList() {
					sel = 1
				}
				if pick := a.choices(c, "board-mode", a.L.T("onhand.view.label"), []string{a.L.T("onhand.overview"), a.L.T("onhand.list")}, sel); pick >= 0 && pick != sel {
					a.setBoardList(pick == 1)
				}
			}
			if total >= findFrom {
				ui.Row(c.Key("findbox")).Width(260).Shrink(1).MinWidth(180).Children(func() { find = a.findField(c) })
			}
		})
	})
	return find
}

// lensName is what a lens key says.
func (a *App) lensName(key string) string {
	switch key {
	case lensOther:
		return a.L.T("onhand.other")
	case lensComputers:
		return a.L.T("onhand.computers")
	}
	if g := groupOf(a.lensGroups(a.S.Board()), key); g != nil {
		return g.name
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
		if a.waitsForYou(x) {
			return x
		}
	}
	return nil
}
