package views

// 列表 / List (D662, research/245 §3.5): the same board as one dense table,
// for the builder with forty tasks over five repositories, three computers
// and seven agents. One row per task (tableRow, 32 tall): its state glyph,
// title, project, computer, agent, age, last step (its gist; before it, the
// task's own words muted behind 它说), and its PR and CI as cells of their
// own. Filter chips, a sort, the selection's bar with its one ask and ten
// seconds of Undo, saved views under the projects, and the keys. Offered
// from eight tasks on and kept per Mac; never the default by itself. The
// web's onhand-list.tsx.

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// listFrom is how many tasks it takes before the list is offered (the web's LIST_FROM).
	listFrom = 8
	// listMax is the widest the table runs; listNarrow the width under which
	// the computer and agent columns step out (their filter chips stay).
	listMax    = 1060
	listNarrow = 760
	longRun    = 6 * time.Hour
)

// tableState is the list's state that outlives a frame (onHandState.tbl).
type tableState struct {
	filter protocol.TaskFilter
	sort   string // urgency (""), changed, age
	sel    map[string]bool
	// prs: some row on screen has a PR, so the PR and CI columns are drawn (else their room is the title's).
	prs    bool
	anchor string
	// ask is the bulk action whose one ask stands in the bar; to and toName
	// its computer or agent (move, reassign).
	ask, to, toName string
	// gAt is when g was pressed (g p, g s).
	gAt time.Time
	// saving: 存成视图's name field is open, with its draft.
	saving, focusName bool
	draft             string
	// done are the bulk answers still to be said (a toast needs a frame).
	done []protocol.BulkResult
	// field is the name field this frame (the keys stand aside while it has focus).
	field ui.Element
}

// tableTasks are the board's tasks, one row each: a card shown under
// another holder's PR is not a second row (D661 rule 5).
func tableTasks(b store.Board) []*store.Task {
	var out []*store.Task
	for _, l := range b.Lanes {
		for _, x := range l {
			if x.HeldUnder() != nil {
				continue
			}
			if att := x.Attention(); att == protocol.Superseded || att == protocol.Dropped {
				continue
			}
			out = append(out, x)
		}
	}
	return out
}

// listOffered: eight tasks or more on the board, and not beside an opened task.
func (a *App) listOffered(b store.Board) bool {
	return a.oh.room != "rail" && len(tableTasks(b)) >= listFrom
}

// listOn: this Mac chose 列表 and the board offers it.
func (a *App) listOn(b store.Board) bool {
	return a.Local.BoardList() && a.listOffered(b)
}

// setBoardList switches the way of looking on this Mac.
func (a *App) setBoardList(on bool) {
	a.Local.SetBoardList(on)
	a.oh.tbl.ask = ""
}

// truthState is the task's one state as the list sorts it (D661); a
// failure is the done tier's, as the references order them.
func truthState(task *store.Task) string {
	if tr := task.Truth(); tr != nil {
		switch tr.State {
		case protocol.TruthNeedsYou, protocol.TruthStopped, protocol.TruthWorking, protocol.TruthWaiting:
			return string(tr.State)
		}
		return "done"
	}
	switch task.Attention() {
	case protocol.NeedsYou:
		return "needs_you"
	case protocol.Working, protocol.Queued:
		return "working"
	case protocol.Blocked:
		return "waiting"
	}
	return "done"
}

var stateRank = map[string]int{"needs_you": 0, "stopped": 1, "working": 2, "waiting": 3, "done": 4}

// stateSince is when the task came into the state it is in.
func stateSince(task *store.Task) time.Time {
	if tr := task.Truth(); tr != nil && tr.Since != "" {
		if t := store.ParseTime(tr.Since); !t.IsZero() {
			return t
		}
	}
	if task.Card != nil {
		if t := store.ParseTime(task.Card.UpdatedAt); !t.IsZero() {
			return t
		}
		return store.ParseTime(task.Card.OpenedAt)
	}
	return time.Time{}
}

func lastChange(task *store.Task) time.Time {
	if task.Card != nil {
		if t := store.ParseTime(task.Card.UpdatedAt); !t.IsZero() {
			return t
		}
		return store.ParseTime(task.Card.OpenedAt)
	}
	return time.Time{}
}

func taskDevice(task *store.Task) string {
	p := task.Place()
	if p.Kind == "none" && p.Device == "" {
		return ""
	}
	if p.Device == "" {
		return "local"
	}
	return p.Device
}

func taskSource(task *store.Task) string {
	if s := taskTodo(task); s != nil {
		return s.Source
	}
	return ""
}

// runningLong: working, or in rounds, for more than six hours.
func runningLong(task *store.Task, now time.Time) bool {
	s := truthState(task)
	if s != "working" && (task.Card == nil || task.Card.Rounds == nil) {
		return false
	}
	at := stateSince(task)
	return !at.IsZero() && now.Sub(at) >= longRun
}

// prWaiting: an open PR (or one ready to merge) has something to say.
func prWaiting(task *store.Task) bool {
	if task.Card == nil {
		return false
	}
	pr := store.PROf(task.Card.PRs)
	if pr == nil {
		return false
	}
	ph := store.SayPR(*pr).Phase
	return pr.State == "open" && ph != "merged" && ph != "closed" && ph != "let_go" && ph != "duplicate"
}

// tableMatches says whether the task is in the filter.
func tableMatches(task *store.Task, f protocol.TaskFilter, now time.Time) bool {
	switch {
	case f.State != "" && truthState(task) != f.State:
		return false
	case f.Project != "" && lensKey(task) != f.Project:
		return false
	case f.Computer != "" && taskDevice(task) != f.Computer:
		return false
	case f.Agent != "" && task.Harness() != f.Agent:
		return false
	case f.Source != "" && taskSource(task) != f.Source:
		return false
	case f.Long && !runningLong(task, now):
		return false
	case f.PR && !prWaiting(task):
		return false
	}
	return true
}

// tableRows are the rows drawn: the filter, Find's words, then the order.
func (a *App) tableRows(tasks []*store.Task, f protocol.TaskFilter, by, q string) []*store.Task {
	now := a.Now()
	var rows []*store.Task
	for _, x := range tasks {
		if tableMatches(x, f, now) && (q == "" || a.findMatches(x, q)) {
			rows = append(rows, x)
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		x, y := rows[i], rows[j]
		switch by {
		case "age":
			return stateSince(x).Before(stateSince(y))
		case "changed":
			return lastChange(x).After(lastChange(y))
		}
		if d := stateRank[truthState(x)] - stateRank[truthState(y)]; d != 0 {
			return d < 0
		}
		return stateSince(x).Before(stateSince(y))
	})
	return rows
}

// prCells are the PR number and the CI count, each its own cell (never joined).
func (a *App) prCells(task *store.Task) (pr, ci string) {
	if task.Card == nil {
		return "", ""
	}
	p := store.PROf(task.Card.PRs)
	if p == nil {
		return "", ""
	}
	if i := strings.LastIndex(p.PR, "#"); i >= 0 {
		pr = p.PR[i:]
	}
	s := store.SayPR(*p)
	switch {
	case s.Checks != nil && s.Checks.Total > 0:
		ci = a.L.T("onhand.list.ci", s.Checks.Passed, s.Checks.Total)
	case s.Phase == "failing":
		ci = a.L.T("onhand.list.ci.failed")
	}
	return pr, ci
}

// tableAge is the state's own time, short.
func (a *App) tableAge(task *store.Task) string {
	at := stateSince(task)
	if at.IsZero() {
		return ""
	}
	if d := a.Now().Sub(at); d >= 48*time.Hour {
		return a.L.T("time.ago.day", int(d.Hours()/24+0.5))
	}
	return a.ago(at.UTC().Format(time.RFC3339Nano))
}

// tableProject is the row's project words.
func (a *App) tableProject(task *store.Task) string {
	if n := task.ProjectName(); n != "" {
		return n
	}
	if k := lensKey(task); k != lensOther && k != lensComputers {
		return k
	}
	return a.lensName(lensKey(task))
}

// viewName is a built-in's own words, else the person's name for it.
func (a *App) viewName(v protocol.BoardView) string {
	if v.Builtin != "" {
		return a.L.T("onhand.view." + v.Builtin)
	}
	return v.Name
}

// boardViews are what the project column lists: the built-ins with rows,
// then the person's own.
func (a *App) boardViews(tasks []*store.Task) []protocol.BoardView {
	now := a.Now()
	var out []protocol.BoardView
	for _, v := range protocol.BuiltinViews {
		for _, x := range tasks {
			if tableMatches(x, v.Filter, now) {
				out = append(out, v)
				break
			}
		}
	}
	return append(out, a.S.Views...)
}

// applyView takes a view's filter, sort and mode (a source rides on 来自's chip).
func (a *App) applyView(v protocol.BoardView) {
	f := v.Filter
	a.oh.source = ""
	if f.Source != "" {
		a.oh.source = srcLensPrefix + f.Source
		f.Source = ""
	}
	a.oh.tbl.filter = f
	a.oh.tbl.sort = v.Sort
	if v.Sort == "urgency" {
		a.oh.tbl.sort = ""
	}
	a.Local.SetLens("")
	a.setBoardList(v.Mode != "overview")
}

// saveView sends 存成视图 to the home (views.json).
func (a *App) saveView(name string) {
	f := a.oh.tbl.filter
	f.Source = strings.TrimPrefix(a.oh.source, srcLensPrefix)
	by := a.oh.tbl.sort
	if by == "" {
		by = "urgency"
	}
	if len([]rune(name)) > protocol.ViewNameMax {
		name = string([]rune(name)[:protocol.ViewNameMax])
	}
	a.send(protocol.ViewSave{T: "view_save", View: protocol.BoardView{ID: "v_" + strconv.FormatInt(a.Now().UnixNano(), 36), Name: name, Filter: f, Sort: by, Mode: "list"}})
}

// viewRows lists the views in the project column, under the projects.
func (a *App) viewRows(c *ui.Context, b store.Board) {
	t := a.T
	tasks := tableTasks(b)
	if len(tasks) < listFrom {
		return // the consumer stays calm: no views, as there is no list
	}
	vs := a.boardViews(tasks)
	if len(vs) == 0 {
		return
	}
	ui.Column(c.Key("views")).Gap(2).Padding(t.S4, 0, 0, 0).Label(a.L.T("onhand.views")).Children(func() {
		uiText(c.Key("vh"), a.L.T("onhand.views")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(0, t.S3)
		for _, v := range vs {
			v := v
			ui.Row(c.Key("v:"+v.ID)).Padding(0, t.S3).Children(func() {
				if a.quietButton(c, "view:"+v.ID, a.viewName(v), a.L.T("onhand.views"), false, 0) {
					a.applyView(v)
				}
			})
		}
	})
}

// ---------- the table ----------

// tableGlyph is the state's drawn mark, 18 points.
func (a *App) tableGlyph(c *ui.Context, s string) {
	t := a.T
	box := ui.Box(c.Key("g")).Size(18, 18).Shrink(0).AccessHidden(true)
	switch s {
	case "needs_you", "stopped":
		box.Draw(drawGroupMark("needs", t.NeedsYou.Dot, t.Surface))
	case "working":
		box.Draw(drawPebble(t.Working.Dot, time.Time{}, true))
	case "waiting":
		box.Draw(drawRing(t.Waiting.Ink.Alpha(0.5), t.Waiting.Ink, 0))
	default:
		box.Draw(drawGroupMark("done", t.Done.Dot, t.Surface))
	}
}

// cell is one column's words: one line, cut at its end.
func (a *App) cell(c *ui.Context, key, words string, w float32, ink ui.Color) {
	t := a.T
	e := uiText(c.Key(key), words).FontSize(t.XS).TextColor(ink).SingleLine().MinWidth(0)
	if w > 0 {
		e.Width(w).Shrink(0)
	}
	if words != "" {
		e.Tooltip(words)
	}
}

// tableCols are the fixed columns' widths at a table width.
func tableCols(w float32) (project, computer, agent, age, pr, ci float32, narrow bool) {
	narrow = w < listNarrow
	if narrow {
		return 96, 0, 0, 72, 56, 64, true
	}
	// The title is what the eye reads first: the fixed columns stay as narrow as their words
	// ("这台 Mac", "Claude Code", "20 分钟前", "#11230", "CI 6/11") so it keeps the room.
	return 104, 72, 92, 68, 56, 60, false
}

func (a *App) tableHead(c *ui.Context, w float32) {
	t := a.T
	pw, cw, aw, gw, rw, iw, narrow := tableCols(w)
	ui.Row(c.Key("thead")).Height(28).Gap(t.S2).Padding(0, t.S3).AlignItems(ui.Center).Background(t.SurfaceSunken).Shrink(0).
		BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft).AccessHidden(true).Children(func() {
		ui.Box(c.Key("h0")).Size(18, 1).Shrink(0)
		head := func(k, words string, w float32) {
			e := uiText(c.Key(k), words).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().MinWidth(0)
			if w > 0 {
				e.Width(w).Shrink(0)
			}
		}
		uiText(c.Key("ht"), a.L.T("onhand.col.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Grow(2.6).Basis(0).MinWidth(0)
		head("hp", a.L.T("onhand.col.project"), pw)
		if !narrow {
			head("hc", a.L.T("onhand.col.computer"), cw)
			head("ha", a.L.T("onhand.col.agent"), aw)
		}
		head("hg", a.L.T("onhand.col.age"), gw)
		uiText(c.Key("hs"), a.L.T("onhand.col.step")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Grow(1).Basis(0).MinWidth(0)
		if a.oh.tbl.prs {
			head("hr", "PR", rw)
			head("hi", "CI", iw)
		}
	})
}

func (a *App) tableLine(c *ui.Context, task *store.Task, w float32) {
	t := a.T
	pw, cw, aw, gw, rw, iw, narrow := tableCols(w)
	s := truthState(task)
	st := a.storyOf(task)
	pr, ci := a.prCells(task)
	title := task.Title()
	label := spoken(a.L, a.L.T("onhand.state."+s), title)
	clicked, mods := a.tableRow(c, task.ID, label, a.oh.focus == task.ID, a.oh.tbl.sel[task.ID], func() {
		a.tableGlyph(c, s)
		ink, wt := t.Ink, 600
		if s == "needs_you" {
			ink = t.NeedsYou.Ink
		}
		uiText(c.Key("t"), sayName(title, 80)).FontSize(t.SM).FontWeight(wt).TextColor(ink).SingleLine().Grow(2.6).Basis(0).MinWidth(0).Tooltip(title)
		a.cell(c, "p", a.tableProject(task), pw, t.InkMuted)
		if !narrow {
			dev := taskDevice(task)
			where := ""
			if dev != "" {
				where = a.computerName(dev)
			}
			a.cell(c, "c", where, cw, t.InkMuted)
			a.cell(c, "a", harnessName(task.Harness()), aw, t.InkMuted)
		}
		uiText(c.Key("age"), a.tableAge(task)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Width(gw).Shrink(0)
		step := uiText(c.Key("s"), st.words).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Grow(1).Basis(0).MinWidth(0)
		if st.said {
			step.TextColor(t.InkMuted.Alpha(0.8))
		}
		if st.words != "" {
			step.Tooltip(st.words)
		}
		if a.oh.tbl.prs {
			uiText(c.Key("r"), pr).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Width(rw).Shrink(0)
			uiText(c.Key("i"), ci).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Width(iw).Shrink(0)
		}
	})
	if !clicked {
		return
	}
	switch {
	case mods&ui.Shift != 0:
		a.tableExtend(task.ID)
	case mods&ui.Cmd != 0:
		a.tablePick(task.ID)
	default:
		a.oh.focus, a.oh.walked = task.ID, task.ID
		a.OpenTask(task.ID)
	}
}

// onHandTable draws 列表: the filter bar, the table, the selection's bar,
// and the keys at its foot.
func (a *App) onHandTable(c *ui.Context, b store.Board, w float32) {
	t := a.T
	all := tableTasks(b)
	tb := &a.oh.tbl
	if tb.sel == nil {
		tb.sel = map[string]bool{}
	}
	ids := map[string]bool{}
	for _, x := range all {
		ids[x.ID] = true
	}
	for id := range tb.sel {
		if !ids[id] {
			delete(tb.sel, id)
		}
	}
	rows := a.tableRows(all, tb.filter, tb.sort, strings.TrimSpace(a.oh.find))
	a.oh.order = a.oh.order[:0]
	for _, x := range rows {
		a.oh.order = append(a.oh.order, x.ID)
	}
	a.oh.tbl.prs = false
	for _, x := range rows {
		if pr, ci := a.prCells(x); pr != "" || ci != "" {
			a.oh.tbl.prs = true
			break
		}
	}
	a.sayBulk(c)
	a.filterBar(c, all)
	ui.Column(c.Key("otable")).Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LineSoft).Clip().Label(a.L.T("onhand.list")).Children(func() {
		a.tableHead(c, w)
		for i, x := range rows {
			if i > 0 {
				ui.Box(c.Key("rule:" + x.ID)).Height(1).Background(t.LineSoft).Shrink(0)
			}
			a.tableLine(c.Key("row"), x, w)
		}
	})
	if len(rows) == 0 {
		uiText(c.Key("none"), a.L.T("onhand.list.none")).FontSize(t.SM).TextColor(t.InkMuted)
	}
	a.keyCaps(c, "list", [][2]string{
		{"j k", a.L.T("onhand.keys.walk")}, {"\r", a.L.T("onhand.keys.open")}, {"esc", a.L.T("onhand.keys.back")},
		{"x", a.L.T("onhand.keys.pick")}, {"⇧", a.L.T("onhand.keys.extend")}, {"⌘A", a.L.T("onhand.keys.all")},
		{"/", a.L.T("onhand.keys.find")}, {"g p", a.L.T("onhand.keys.project")}, {"g s", a.L.T("onhand.keys.state")},
		{"e", a.L.T("onhand.keys.end")}, {"p", a.L.T("onhand.keys.pause")}, {"m", a.L.T("onhand.keys.move")},
		{"a", a.L.T("onhand.keys.agent")}, {a.L.T("onhand.keys.drop.cap"), a.L.T("onhand.keys.drop")},
	})
}

// filterBar is the chips (state, project, computer, agent; 来自 stays the
// board's own chip above), the sort, Clear and 存成视图.
func (a *App) filterBar(c *ui.Context, all []*store.Task) {
	t := a.T
	tb := &a.oh.tbl
	type opt struct{ v, words string }
	var projects, computers, agents []opt
	seen := map[string]bool{}
	for _, x := range all {
		if k := lensKey(x); !seen["p:"+k] {
			seen["p:"+k] = true
			projects = append(projects, opt{k, a.tableProject(x)})
		}
		if d := taskDevice(x); d != "" && !seen["c:"+d] {
			seen["c:"+d] = true
			computers = append(computers, opt{d, a.computerName(d)})
		}
		if h := x.Harness(); h != "" && !seen["a:"+h] {
			seen["a:"+h] = true
			agents = append(agents, opt{h, harnessName(h)})
		}
	}
	chip := func(key, name string, cur *string, opts []opt) {
		if len(opts) < 2 && *cur == "" {
			return // one value has nothing to filter
		}
		label := name
		for _, o := range opts {
			if o.v == *cur {
				label = o.words
			}
		}
		kind := btnText
		if *cur != "" {
			kind = btnSecondary
		}
		a.menuOpener(c, "f:"+key, label, name, kind, t.ControlSM, t.Bg, func(m *ui.Menu) {
			if m.Item(a.L.T("onhand.filter.any")).Checked(*cur == "").Chosen() {
				*cur = ""
			}
			m.Separator()
			for _, o := range opts {
				if m.Item(o.words).Checked(*cur == o.v).Chosen() {
					*cur = o.v
				}
			}
		})
	}
	states := []opt{{"needs_you", a.L.T("onhand.state.needs_you")}, {"stopped", a.L.T("onhand.state.stopped")}, {"working", a.L.T("onhand.state.working")}, {"waiting", a.L.T("onhand.state.waiting")}, {"done", a.L.T("onhand.state.done")}}
	ui.Row(c.Key("fbar")).Gap(t.S1).AlignItems(ui.Center).Wrap().MinWidth(0).Label(a.L.T("onhand.filter")).Children(func() {
		chip("state", a.L.T("onhand.filter.state"), &tb.filter.State, states)
		chip("project", a.L.T("onhand.filter.project"), &tb.filter.Project, projects)
		chip("computer", a.L.T("onhand.filter.computer"), &tb.filter.Computer, computers)
		chip("agent", a.L.T("onhand.filter.agent"), &tb.filter.Agent, agents)
		ui.Spacer(c)
		by := tb.sort
		if by == "" {
			by = "urgency"
		}
		a.menuOpener(c, "f:sort", a.L.T("onhand.sort."+by), a.L.T("onhand.sort"), btnText, t.ControlSM, t.Bg, func(m *ui.Menu) {
			for _, s := range []string{"urgency", "changed", "age"} {
				if m.Item(a.L.T("onhand.sort." + s)).Checked(by == s).Chosen() {
					tb.sort = s
					if s == "urgency" {
						tb.sort = ""
					}
				}
			}
		})
		if !tb.filter.Empty() && a.quietButton(c, "f:clear", a.L.T("onhand.filter.clear"), "", false, 0) {
			tb.filter = protocol.TaskFilter{}
		}
		if !tb.saving {
			if a.quietButton(c, "f:save", a.L.T("onhand.view.save"), "", true, 0) {
				tb.saving, tb.draft, tb.focusName = true, "", true
			}
			return
		}
		save := func() {
			if n := strings.TrimSpace(tb.draft); n != "" {
				a.saveView(n)
				tb.saving, tb.draft = false, ""
			}
		}
		tb.field = a.lineField(c, "view-name", a.L.T("onhand.view.name"), &tb.draft, a.L.T("onhand.view.name.ph"), false, save)
		tb.field.Width(220).Height(t.ControlSM).FontSize(t.SM)
		if tb.focusName {
			tb.field.Focus()
			tb.focusName = false
		}
		if a.buttonFor(c, a.L.T("onhand.view.save.go"), "", btnSecondary, t.ControlSM, t.Bg) {
			save()
		}
		if a.quietButton(c, "f:save-no", a.L.T("onhand.bulk.cancel"), "", false, 0) {
			tb.saving, tb.draft = false, ""
		}
	})
}

// ---------- many at once ----------

// bulkCounts: how many of the selection are at work, and how many are done.
func bulkCounts(rows []*store.Task) (working, done int) {
	for _, x := range rows {
		switch truthState(x) {
		case "working":
			working++
		case "done":
			done++
		}
	}
	return
}

// bulkAsk is the one ask's words: the count, and what is skipped.
func (a *App) bulkAsk(op string, rows []*store.Task, to string) string {
	n := len(rows)
	working, done := bulkCounts(rows)
	switch op {
	case "end":
		if working > 0 {
			return a.L.T("onhand.bulk.ask.end", n, working)
		}
		return a.L.T("onhand.bulk.ask.end.all", n)
	case "pause":
		if n-working > 0 {
			return a.L.T("onhand.bulk.ask.pause", n, n-working)
		}
		return a.L.T("onhand.bulk.ask.pause.all", n)
	case "continue":
		if working > 0 {
			return a.L.T("onhand.bulk.ask.continue", n, working)
		}
		return a.L.T("onhand.bulk.ask.continue.all", n)
	case "drop":
		if done > 0 {
			return a.L.T("onhand.bulk.ask.drop", n, done)
		}
		return a.L.T("onhand.bulk.ask.drop.all", n)
	case "move":
		return a.L.T("onhand.bulk.ask.move", n, to)
	case "reassign":
		return a.L.T("onhand.bulk.ask.reassign", n, to)
	}
	return ""
}

func (a *App) selected(all []*store.Task) []*store.Task {
	var out []*store.Task
	for _, x := range all {
		if a.oh.tbl.sel[x.ID] {
			out = append(out, x)
		}
	}
	return out
}

// bulkBar is the selection's bar: the six actions, or the one ask in their place.
func (a *App) bulkBar(c *ui.Context, all []*store.Task) {
	t := a.T
	tb := &a.oh.tbl
	rows := a.selected(all)
	working, done := bulkCounts(rows)
	if a.selectionBar(c, a.L.T("onhand.sel.n", len(rows)), a.L.T("onhand.sel.clear"), func() {
		if tb.ask != "" {
			uiText(c.Key("ask"), a.bulkAsk(tb.ask, rows, tb.toName)).FontSize(t.SM).TextColor(t.Ink).MinWidth(0).Shrink(1)
			if a.buttonFor(c, a.L.T("onhand.bulk.go"), a.bulkAsk(tb.ask, rows, tb.toName), btnSecondary, t.ControlSM, t.Surface) {
				a.runBulk(rows)
			}
			if a.quietButton(c, "ask-no", a.L.T("onhand.bulk.cancel"), "", false, 0) {
				tb.ask = ""
			}
			return
		}
		act := func(op string, n int) {
			if n > 0 && a.quietButton(c, "b:"+op, a.L.T("onhand.bulk."+op), "", true, 0) {
				tb.ask = op
			}
		}
		act("end", len(rows))
		act("pause", working)
		act("continue", len(rows)-working)
		if len(rows)-done > 0 {
			a.menuOpener(c, "b:move", a.L.T("onhand.bulk.move"), "", btnText, t.ControlSM, t.Surface, func(m *ui.Menu) {
				for _, d := range a.S.Devices {
					id := d.ID
					if d.Home {
						id = "local"
					}
					if m.Item(a.deviceName(&d)).Chosen() {
						tb.ask, tb.to, tb.toName = "move", id, a.deviceName(&d)
					}
				}
			})
			a.menuOpener(c, "b:reassign", a.L.T("onhand.bulk.reassign"), "", btnText, t.ControlSM, t.Surface, func(m *ui.Menu) {
				seen := map[string]bool{}
				for _, x := range all {
					h := x.Harness()
					if h == "" || seen[h] {
						continue
					}
					seen[h] = true
					if m.Item(harnessName(h)).Chosen() {
						tb.ask, tb.to, tb.toName = "reassign", h, harnessName(h)
					}
				}
			})
		}
		act("drop", len(rows)-done)
	}) {
		a.clearSel()
	}
}

func (a *App) clearSel() {
	a.oh.tbl.sel = map[string]bool{}
	a.oh.tbl.ask = ""
	a.oh.tbl.anchor = ""
}

// runBulk sends the gesture; the home runs each task through its own path.
func (a *App) runBulk(rows []*store.Task) {
	tb := &a.oh.tbl
	fr := protocol.TaskBulk{T: "task_bulk", Op: tb.ask}
	for _, x := range rows {
		fr.TaskIDs = append(fr.TaskIDs, x.ID)
	}
	switch tb.ask {
	case "move":
		fr.Device = tb.to
	case "reassign":
		fr.Harness = tb.to
	}
	a.send(fr)
	a.clearSel()
}

// bulkCame keeps a batch's answer for the next frame's toast.
func (a *App) bulkCame(f protocol.ServerFrame) {
	if f.Bulk == nil {
		return
	}
	r := *f.Bulk
	if f.T == "task_bulk_undone" {
		r.Op = "undone"
	}
	a.oh.tbl.done = append(a.oh.tbl.done, r)
}

// sayBulk says each answer once: what was done, with Undo for ten seconds.
func (a *App) sayBulk(c *ui.Context) {
	for _, r := range a.oh.tbl.done {
		r := r
		switch {
		case r.Message != "":
			c.AddToast(ui.Toast{ID: "bulk:" + r.BatchID, Title: r.Message, Timeout: UndoWindow})
		case r.Op == "undone":
			c.AddToast(ui.Toast{ID: "bulk-undo:" + r.BatchID, Title: a.L.T("onhand.bulk.undone", r.Undone), Timeout: UndoWindow})
		default:
			c.AddToast(ui.Toast{ID: "bulk:" + r.BatchID, Title: a.L.T("onhand.bulk.said."+r.Op, r.Done), Timeout: UndoWindow, Action: a.L.T("undo.action"), OnAction: func() {
				a.send(protocol.TaskBulkUndo{T: "task_bulk_undo", BatchID: r.BatchID})
			}})
		}
	}
	a.oh.tbl.done = a.oh.tbl.done[:0]
}

// ---------- the keys ----------

func (a *App) tablePick(id string) {
	tb := &a.oh.tbl
	if tb.sel == nil {
		tb.sel = map[string]bool{}
	}
	if tb.sel[id] {
		delete(tb.sel, id)
	} else {
		tb.sel[id] = true
	}
	tb.anchor = id
	tb.ask = ""
}

func (a *App) tableExtend(id string) {
	tb := &a.oh.tbl
	if tb.sel == nil {
		tb.sel = map[string]bool{}
	}
	from := tb.anchor
	if from == "" {
		from = a.oh.focus
	}
	i, j := -1, -1
	for n, x := range a.oh.order {
		if x == from {
			i = n
		}
		if x == id {
			j = n
		}
	}
	if i < 0 || j < 0 {
		a.tablePick(id)
		return
	}
	if i > j {
		i, j = j, i
	}
	for _, x := range a.oh.order[i : j+1] {
		tb.sel[x] = true
	}
	tb.ask = ""
}

// barAct: e, p, ⌘⌫ raise the bar's one ask (the focused row joins an empty
// selection); a key never acts unasked.
func (a *App) barAct(op string) {
	tb := &a.oh.tbl
	if len(tb.sel) == 0 {
		if a.oh.focus == "" {
			return
		}
		if tb.sel == nil {
			tb.sel = map[string]bool{}
		}
		tb.sel[a.oh.focus] = true
	}
	tb.ask = op
}

// tableKeys are the list's own keys, before On hand's (j/k, ⏎, /, Esc).
// They say whether they took the key.
func (a *App) tableKeys(c *ui.Context) bool {
	tb := &a.oh.tbl
	if tb.field.Valid() && tb.field.Focused() {
		return true // the name field has the keys (Esc closes it, tableEsc)
	}
	switch {
	case c.Shortcut(ui.Cmd, ui.KeyA):
		tb.sel = map[string]bool{}
		for _, id := range a.oh.order {
			tb.sel[id] = true
		}
		if len(a.oh.order) > 0 {
			tb.anchor = a.oh.order[0]
		}
	case c.Shortcut(ui.Cmd, ui.KeyBackspace):
		a.barAct("drop")
	case c.Shortcut(ui.Shift, ui.KeyJ), c.Shortcut(ui.Shift, ui.KeyDown):
		a.shiftMove(1)
	case c.Shortcut(ui.Shift, ui.KeyK), c.Shortcut(ui.Shift, ui.KeyUp):
		a.shiftMove(-1)
	case !tb.gAt.IsZero() && a.Now().Sub(tb.gAt) < 1200*time.Millisecond && (c.Shortcut(0, ui.KeyP) || c.Shortcut(0, ui.KeyS)):
		tb.gAt = time.Time{}
		if task := a.S.Task(a.oh.focus); task != nil {
			if c.Shortcut(0, ui.KeyP) {
				tb.filter.Project = lensKey(task)
			} else {
				tb.filter.State = truthState(task)
			}
		}
	case c.Shortcut(0, ui.KeyG):
		tb.gAt = a.Now()
	case c.Shortcut(0, ui.KeyX) && a.oh.focus != "":
		a.tablePick(a.oh.focus)
	case c.Shortcut(0, ui.KeyE):
		a.barAct("end")
	case c.Shortcut(0, ui.KeyP):
		a.barAct("pause")
	case c.Shortcut(0, ui.KeyM):
		a.barAct("move")
	case c.Shortcut(0, ui.KeyA):
		a.barAct("reassign")
	default:
		return false
	}
	return true
}

// tableEsc lets go one step: the ask, then the selection, then the filter.
func (a *App) tableEsc() bool {
	tb := &a.oh.tbl
	if !a.Local.BoardList() || a.oh.keep.open != "" {
		return false
	}
	switch {
	case tb.saving:
		tb.saving, tb.draft = false, ""
	case tb.ask != "":
		tb.ask = ""
	case len(tb.sel) > 0:
		a.clearSel()
	case !tb.filter.Empty():
		tb.filter = protocol.TaskFilter{}
	default:
		return false
	}
	return true
}

// shiftMove walks the keys' row and extends the selection with it.
func (a *App) shiftMove(by int) {
	tb := &a.oh.tbl
	if tb.anchor == "" {
		tb.anchor = a.oh.focus
	}
	a.moveFocus(by)
	if tb.anchor == "" {
		tb.anchor = a.oh.focus
	}
	a.tableExtend(a.oh.focus)
}

// boardStep: ⌘2 on the board (already 任务 / Tasks) goes on to 列表, ⌘1 in
// the list comes back to 概览; ⌘1 on Overview stays the app's (the
// conversation). So each key is one step, and ⌘1 / ⌘2 keep their meaning.
// It says whether it took the key.
func (a *App) boardStep(toList bool) bool {
	if a.Route != RouteOnHand || a.oh.keep.open != "" {
		return false
	}
	groups := a.lensGroups(a.S.Board())
	b := sourceBoard(lensBoard(a.S.Board(), a.currentLens(groups)), a.oh.source)
	if !a.listOffered(b) || a.Local.BoardList() == toList {
		return false
	}
	a.setBoardList(toList)
	return true
}
