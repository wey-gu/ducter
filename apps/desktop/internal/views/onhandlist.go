package views

// On hand as a workspace (D216): one list, the same rows as the phone and
// the web (apps/web/src/onhand.tsx). A row says what the task is on now in
// words (its latest step, what it waits for, its question, its result), and
// on a repo task its branch, +/−, and a draft PR or a merge. Find shows from
// ten tasks, By project from two projects; j/k walk the list and Enter
// opens; ⌘O opens the switcher.

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// findFrom is how many tasks it takes before Find shows; projectsFrom how
// many projects before By project is offered (the web's FIND_FROM, PROJECTS_FROM).
const (
	findFrom     = 10
	projectsFrom = 2
	// onHandMeasure is On hand's one reading column (D270).
	onHandMeasure = 760
	// rowH is every task row's height, so the list reads as an even rhythm.
	rowH = 58
)

type onHandState struct {
	focus string   // the row the keys are on
	find  string   // Find's words
	order []string // the rows as drawn, for the keys
	// The switcher (⌘O).
	sw      bool
	swQuery string
	swAt    int
	steps   map[int64][]Block // a latest step's blocks, by seq
	// D244: the room the list is drawn in now ("rail" beside an opened
	// task, else ""), what each row's status place showed last, and when
	// a row's handover to its done face began.
	room   string
	was    map[string]rowMark
	handed map[string]bool
	// D261: the strip's filter (0: none; 1–4: needs you, working,
	// waiting, done today), the lens drawn this frame, whether rows name
	// their project (all, with two groups or more), and whether the quiet
	// waits are unfolded.
	filter   int
	lens     string
	showProj bool
	quietOn  bool
	// D467: whether yesterday's results are unfolded (this session), and
	// whether a to-do source's whole sort is open behind its summary.
	earlierOn, srcAll bool
	// D467 round 2: what stands in the brief with its fix (never also a card).
	briefed map[string]bool
	// D287: the list's width this frame (the cards' room), and the new
	// results whose card has had its little moment.
	listW   float32
	cheered map[string]bool
	// D315: the computer most of the board's tasks run on; a card names
	// its computer only when it is another.
	usual string
	// D360: the group being renamed in place, and its draft name; the
	// selection's name for a new group (bulk 放进一个分组).
	groupRename, groupDraft string
}

// latestStep is the task's latest step or words: the newest one this Mac
// holds, else the card's.
func latestStep(task *store.Task) *protocol.LogEvent {
	var held *protocol.LogEvent
	for i := len(task.Events) - 1; i >= 0; i-- {
		e := &task.Events[i]
		if e.Kind != protocol.KindTaskEvent {
			continue
		}
		var b protocol.TaskEvent
		if e.Decode(&b) != nil {
			continue
		}
		if b.Role == "tool" || (b.Role == "assistant" && (strings.TrimSpace(b.Text) != "" || len(b.Thinking) > 0)) {
			held = e
			break
		}
	}
	var card *protocol.LogEvent
	if task.Card != nil {
		card = task.Card.Latest
	}
	if held != nil && (card == nil || held.Seq >= card.Seq) {
		return held
	}
	return card
}

// rowStory is a row's second line: its mark (a step's kind, or ""), the
// words, the code beside them, and a tone ("needs", "failed" or "").
type rowStory struct{ mark, words, code, tone string }

func (a *App) nowLine(task *store.Task) (rowStory, bool) {
	ev := latestStep(task)
	if ev == nil {
		return rowStory{}, false
	}
	return a.eventStory(task, ev)
}

// eventStory is one step or one thing said, in the row's words (D467: the
// peek's latest steps read the same way).
func (a *App) eventStory(task *store.Task, ev *protocol.LogEvent) (rowStory, bool) {
	if a.oh.steps == nil || len(a.oh.steps) > 2000 {
		a.oh.steps = map[int64][]Block{}
	}
	blocks, ok := a.oh.steps[ev.Seq]
	if !ok {
		blocks = blocksOf(task.Harness(), []protocol.LogEvent{*ev}, true)
		a.oh.steps[ev.Seq] = blocks
	}
	if len(blocks) == 0 {
		return rowStory{}, false
	}
	b := &blocks[len(blocks)-1]
	if b.K == "voice" {
		return rowStory{words: strings.SplitN(b.Text, "\n", 2)[0]}, true
	}
	if b.K != "steps" || len(b.Lines) == 0 {
		return rowStory{}, false
	}
	l := &b.Lines[len(b.Lines)-1]
	if l.K == "looks" {
		return rowStory{mark: "read", words: a.liveWords(blocks)}, true
	}
	w, code := a.rowWords(l.Row)
	mark := "thought"
	if l.Row.Step != nil {
		mark = l.Row.Step.Kind
	}
	if l.Row.Outcome == "error" {
		return rowStory{mark: "error", words: w, code: code, tone: "failed"}, true
	}
	return rowStory{mark: mark, words: w, code: code}, true
}

func (a *App) storyOf(task *store.Task) rowStory {
	att := task.Attention()
	rep := task.Report()
	switch att {
	case protocol.NeedsYou:
		q := ""
		if d := a.S.PendingDecision(task.ID); d != nil {
			q = a.questionOf(d)
		} else if rep != nil && len(rep.Questions) > 0 {
			q = rep.Questions[0].Text
		} else if rep != nil {
			q = rep.Summary
		}
		if q == "" {
			q = a.stateLabel(att)
		}
		return rowStory{words: q, tone: "needs"}
	case protocol.Blocked:
		// D382: a question put off: when it asks again, and what.
		if w, ok := a.laterRow(task); ok {
			return rowStory{words: w}
		}
		// D261: a wait always says what it waits for. A waiter names it; else
		// the state's reason; else what the task last reported; else that it
		// stopped without saying (true, and worth a look).
		// D297: whose limit it waits for, in the viewer's own words.
		if w := a.S.WaiterFor(task.ID); w != nil && w.Limit != nil {
			return rowStory{words: a.L.T("limit.line", harnessName(w.Limit.Harness))}
		}
		if w := a.S.WaiterFor(task.ID); w != nil && strings.TrimSpace(w.Reason) != "" {
			return rowStory{words: a.waitLine(w.Reason)}
		}
		if r := a.waitReason(task); r != "" {
			return rowStory{words: r}
		}
		if rep != nil && strings.TrimSpace(rep.Summary) != "" {
			return rowStory{words: strings.SplitN(strings.TrimSpace(rep.Summary), "\n", 2)[0]}
		}
		return rowStory{words: a.L.T("onhand.wait.unsaid")}
	case protocol.Working, protocol.Queued:
		if u := task.Card; u != nil && u.Until != nil && u.Until.State == "on" {
			return rowStory{words: a.untilLine(u.Until)}
		}
		if s, ok := a.nowLine(task); ok {
			return s
		}
		return rowStory{words: a.stateLabel(att)}
	}
	// D472: a task that couldn't start says why in its row too (cant.go).
	if k := task.Cant(); att == protocol.Failed && k != nil {
		return rowStory{words: a.cantClause(k), tone: "failed"}
	}
	s := rowStory{}
	if rep != nil {
		s.words = strings.SplitN(rep.Summary, "\n", 2)[0]
	}
	if s.words == "" {
		s.words = a.stateLabel(att)
	}
	if att == protocol.Failed {
		s.tone = "failed"
	}
	return s
}

// rowTime is how long it has been at it, or when it last changed.
func (a *App) rowTime(task *store.Task) string {
	att := task.Attention()
	if att == protocol.Working || att == protocol.Queued {
		start := ""
		if task.Card != nil {
			start = task.Card.OpenedAt
		}
		if start == "" {
			start = task.OpenedAt
		}
		at := store.ParseTime(start)
		if at.IsZero() {
			return ""
		}
		m := int(time.Since(at).Minutes())
		switch {
		case m < 1:
			return a.L.T("time.now")
		case m < 60:
			return a.L.T("time.min", m)
		}
		return a.L.T("time.hour", m/60)
	}
	if task.Card == nil {
		return ""
	}
	return a.agoLong(task.Card.UpdatedAt) // "2 天前", never "61 小时前"
}

// integrated says whether the user merged the task's branch or opened a
// draft PR from Ducter, and which.
func integrated(task *store.Task) string {
	if f := task.Acted; f != nil && f.OK && (f.Action == "merge" || f.Action == "open_pr") {
		return f.Action
	}
	if task.Card != nil && task.Card.Integrated != nil {
		return task.Card.Integrated.Act
	}
	return ""
}

// haystack is what Find and the switcher match against.
func (a *App) haystack(task *store.Task) string {
	p := task.Place()
	parts := []string{task.Title(), task.Project(), p.RepoPath, p.Branch, p.Path, harnessName(task.Harness()), a.storyOf(task).words}
	if p.Kind != "none" && p.Device != "" {
		parts = append(parts, a.computerName(p.Device))
	}
	return strings.ToLower(strings.Join(parts, " "))
}

// findMatches: every word typed is somewhere in it, or one slip away, or the
// title's initials (D456).
func (a *App) findMatches(task *store.Task, q string) bool {
	hay := a.haystack(task)
	for _, w := range strings.Fields(strings.ToLower(q)) {
		if !looseMatch(w, hay, task.Title()) {
			return false
		}
	}
	return true
}

// findExactly: every word typed is in it as typed (it ranks before a loose match).
func (a *App) findExactly(task *store.Task, q string) bool {
	hay := a.haystack(task)
	for _, w := range strings.Fields(strings.ToLower(q)) {
		if !strings.Contains(hay, w) {
			return false
		}
	}
	return true
}

// ---------- the list ----------

// onHandList is the list by attention (D467): what needs you (its asks
// answered in place, what stopped and what didn't work out, each with its
// one action), then what works, what waits, and what got done today, all in
// one card shape at one width.
func (a *App) onHandList(c *ui.Context, b store.Board) {
	t := a.T
	q := strings.TrimSpace(a.oh.find)
	keep := func(ts []*store.Task) []*store.Task {
		if q == "" {
			return ts
		}
		var out []*store.Task
		for _, x := range ts {
			if a.findMatches(x, q) {
				out = append(out, x)
			}
		}
		return out
	}
	rail := a.oh.room == "rail"
	// D360: a group stands as one card in its most urgent part's section
	// (not while finding, nor in the rail; with a filter, only in its own
	// section); its tasks leave their own. Counts stay per task.
	var bgs []boardGroup
	inGroup := map[string]bool{}
	if !rail && q == "" {
		for _, g := range a.boardGroups(b) {
			if a.oh.filter == 0 || a.oh.filter == g.lane+1 {
				bgs = append(bgs, g)
				for id := range g.ids {
					inGroup[id] = true
				}
			}
		}
	}
	groupsIn := func(lane int) {
		for _, g := range bgs {
			if g.lane == lane {
				a.groupCard(c, g)
			}
		}
	}
	nGroups := func(lane int) int {
		n := 0
		for _, g := range bgs {
			if g.lane == lane {
				n++
			}
		}
		return n
	}
	// A section's count is per task: grouped tasks count where they are.
	count := func(all, shown []*store.Task) int {
		if len(bgs) == 0 {
			return len(shown)
		}
		return len(all)
	}
	sp := a.splitOf(b)
	needs := withoutGroups(keep(sp.needs), inGroup)
	stopped := withoutGroups(keep(sp.stopped), inGroup)
	failed := withoutGroups(keep(sp.failed), inGroup)
	if !rail && q == "" {
		stopped, failed = notBriefed(stopped, a.oh.briefed), notBriefed(failed, a.oh.briefed)
	}
	working := withoutGroups(keep(sp.working), inGroup)
	waiting := withoutGroups(keep(sp.waiting), inGroup)
	today := withoutGroups(keep(sp.today), inGroup)
	earlier := withoutGroups(keep(sp.earlier), inGroup)
	if !rail && q == "" {
		// D467 round 3: what the brief tells (a result, the next wait) is no card either.
		waiting, today = notBriefed(waiting, a.oh.briefed), notBriefed(today, a.oh.briefed)
	}
	a.nav.rows = 0
	f := a.oh.filter
	if rail {
		f = 0
	}
	show := func(i int) bool { return f == 0 || f == i }
	if q != "" && len(needs)+len(stopped)+len(failed)+len(working)+len(waiting)+len(today)+len(earlier)+len(inGroup) == 0 {
		a.oh.order = a.oh.order[:0]
		uiText(c.Key("none"), a.L.T("onhand.find.none")).FontSize(t.MD).TextColor(t.InkMuted)
		a.pastFindLink(c, q) // D285
		return
	}
	if rail {
		// Beside an opened task (D244): every task is a row, and only tasks,
		// by the same sections.
		a.oh.order = a.oh.order[:0]
		for _, s := range []struct {
			key, name string
			ts        []*store.Task
		}{{"needs", "lane.needs_you", concat(needs, stopped, failed)}, {"working", "lane.working", working}, {"waiting", "lane.waiting", waiting}, {"done", "lane.done", concat(today, earlier)}} {
			for _, x := range s.ts {
				a.oh.order = append(a.oh.order, x.ID)
			}
			if len(s.ts) > 0 {
				a.listSection(c, s.key, a.L.T(s.name), len(s.ts), func() { a.taskRows(c, s.ts, false) })
			}
		}
		return
	}
	// D261: a wait nothing has changed on for a day folds away under the
	// fresh ones (it still looks on its own; one that doesn't has stopped
	// and stands in 等你); a result you have seen folds under 今天做完, a new
	// one never; yesterday's fold under them (D467). Find and the strip's
	// filter unfold them.
	var fresh, quiet, newer, seen []*store.Task
	for _, x := range waiting {
		if a.quietWait(x) {
			quiet = append(quiet, x)
		} else {
			fresh = append(fresh, x)
		}
	}
	// D297: tasks waiting on one account's limit share one reset: drawn
	// together under one line, after the other fresh waits.
	groups := a.groupLimits(fresh)
	grouped := map[string]bool{}
	for _, g := range groups {
		for _, x := range g.tasks {
			grouped[x.ID] = true
		}
	}
	rest := fresh[:0:0]
	for _, x := range fresh {
		if !grouped[x.ID] {
			rest = append(rest, x)
		}
	}
	fresh = rest
	var inGroups []*store.Task
	for _, g := range groups {
		inGroups = append(inGroups, g.tasks...)
	}
	for _, x := range today {
		if a.rowMarkOf(x) != stNew {
			seen = append(seen, x)
		} else {
			newer = append(newer, x)
		}
	}
	// D287: a fold earns its line from three; fewer stay in sight.
	quietFolds := len(quiet) >= foldFrom
	quietOpen := !quietFolds || a.oh.quietOn || f == 3 || q != ""
	seenFolds := len(seen) >= foldFrom
	doneOpen := !seenFolds || a.Local.Folded(doneOpenKey) || f == 4 || q != ""
	// D467: yesterday's results always fold: 今天做完 says today.
	earlierOpen := a.oh.earlierOn || q != ""
	a.oh.order = a.oh.order[:0]
	add := func(ok bool, ts ...[]*store.Task) {
		if !ok {
			return
		}
		for _, l := range ts {
			for _, x := range l {
				a.oh.order = append(a.oh.order, x.ID)
			}
		}
	}
	add(show(1), needs, stopped, failed)
	add(show(2), working)
	add(show(3), fresh, inGroups)
	add(show(3) && quietOpen, quiet)
	add(show(4), newer)
	add(show(4) && doneOpen, seen)
	add(show(4) && earlierOpen, earlier)
	// Only in all, and Other: what belongs to no task.
	var pds []*store.DecisionState
	var loose, missed []*protocol.Waiter
	var others []protocol.PartnerAsk // D312: another partner's own questions
	if q == "" && (a.oh.lens == "" || a.oh.lens == lensOther) {
		pds, loose, missed = a.partnerDecisions(), a.looseWaiters(), a.S.MissedToday(time.Now())
		others = a.otherAsks()
	}
	// What needs you comes first and takes no room when there is none (the
	// board's head says so in one calm sentence).
	if len(needs)+len(stopped)+len(failed)+len(pds)+len(others)+nGroups(0) > 0 && show(1) {
		n := count(sp.needs, needs) + count(sp.stopped, stopped) + count(sp.failed, failed) + len(pds) + len(others)
		a.listSection(c, "needs", a.L.T("lane.needs_you"), n, func() {
			groupsIn(0)
			for _, d := range pds {
				a.partnerDecisionCard(c.Key("pd:"+d.DecisionID), d)
			}
			for _, x := range others {
				a.otherAskRow(c, x)
			}
			var plain []*store.Task
			for _, task := range needs {
				if a.S.PendingDecision(task.ID) != nil {
					a.needsCard(c.Key(task.ID), task)
				} else {
					plain = append(plain, task)
				}
			}
			a.taskCards(c.Key("needs"), concat(plain, stopped, failed))
		})
	}
	if len(working)+nGroups(1) > 0 && show(2) {
		a.listSection(c, "working", a.L.T("lane.working"), count(sp.working, working), func() {
			groupsIn(1)
			a.taskCards(c, working)
		})
	}
	if len(waiting)+len(loose)+nGroups(2) > 0 && show(3) {
		a.listSection(c, "waiting", a.L.T("lane.waiting"), count(sp.waiting, waiting)+len(loose), func() {
			if f == 0 && len(a.waitsOnAxis(b, a.oh.lens, axisSpan)) >= 2 {
				a.waitAxis(c, b, a.oh.lens) // D467: the waits placed in time, from two
			}
			groupsIn(2)
			a.taskCards(c.Key("fresh"), fresh)
			for _, g := range groups {
				a.limitGroupHead(c, g)
				a.taskCards(c.Key("limit:"+g.harness), g.tasks)
			}
			for _, w := range loose {
				a.waiterRow(c.Key("w:"+w.WaiterID), w)
			}
			if len(quiet) > 0 {
				if !quietFolds && len(fresh)+len(inGroups)+len(loose) > 0 {
					a.subHead(c, "quiet", a.L.T("onhand.wait.quiet.head"))
				}
				if quietFolds && f != 3 && q == "" && a.foldLine(c, "quiet", a.L.T("onhand.wait.quiet", len(quiet)), quietOpen) {
					a.oh.quietOn = !a.oh.quietOn
				}
				if quietOpen {
					a.taskCards(c.Key("quiet"), quiet)
				}
			}
		})
	}
	if len(today)+len(missed)+nGroups(3) == 0 && len(earlier) > 0 && show(4) {
		// D467 round 3: nothing of today's left to draw: yesterday's fold alone.
		if q == "" && a.foldLine(c, "earlier", a.L.T("onhand.done.yesterday", len(earlier)), earlierOpen) {
			a.oh.earlierOn = !a.oh.earlierOn
		}
		if earlierOpen {
			a.taskCards(c.Key("earlier"), earlier)
		}
	} else if len(today)+len(earlier)+len(missed)+nGroups(3) > 0 && show(4) {
		a.listSection(c, "done", a.L.T("lane.done"), count(sp.today, today), func() {
			groupsIn(3)
			a.taskCards(c.Key("new"), newer)
			if len(seen)+len(missed) > 0 {
				seenFolds := seenFolds || len(seen)+len(missed) >= foldFrom
				if !seenFolds {
					doneOpen = true
					if len(newer) > 0 {
						a.subHead(c, "seen", a.L.T("onhand.done.seen.head"))
					}
				}
				if seenFolds && f != 4 && q == "" && a.foldLine(c, "seen", a.L.T("onhand.done.seen", len(seen)+len(missed)), doneOpen) {
					a.Local.SetFolded(doneOpenKey, !doneOpen)
				}
				if doneOpen {
					for _, w := range missed {
						a.missedRow(c.Key("m:"+w.WaiterID), w)
					}
					a.taskCards(c.Key("seen"), seen)
				}
			}
			if len(earlier) > 0 {
				if q == "" && a.foldLine(c, "earlier", a.L.T("onhand.done.yesterday", len(earlier)), earlierOpen) {
					a.oh.earlierOn = !a.oh.earlierOn
				}
				if earlierOpen {
					a.taskCards(c.Key("earlier"), earlier)
				}
			}
		})
	}
	// D357: the person's to-dos in their own apps: one calm summary (D467).
	if q == "" && f == 0 {
		a.todoGroup(c, a.oh.lens)
	}
}

// notBriefed leaves out what the brief already carries.
func notBriefed(ts []*store.Task, in map[string]bool) []*store.Task {
	if len(in) == 0 {
		return ts
	}
	var out []*store.Task
	for _, x := range ts {
		if !in[x.ID] {
			out = append(out, x)
		}
	}
	return out
}

// concat joins runs of tasks in order.
func concat(runs ...[]*store.Task) []*store.Task {
	var out []*store.Task
	for _, r := range runs {
		out = append(out, r...)
	}
	return out
}

// doneOpenKey is how this Mac remembers that 今天做完's seen results are
// unfolded (kept with the folded groups; folded is the default).
const doneOpenKey = "~done-open"

// foldLine is a quiet line that folds what is under it away: its words and
// a chevron (down when open).
func (a *App) foldLine(c *ui.Context, key, words string, open bool) bool {
	t := a.T
	chev := 1
	if open {
		chev = 2
	}
	var hit bool
	ui.Row(c.Key("fold:"+key)).Padding(0, t.S2).Children(func() {
		hit = a.quietButton(c, "fold:"+key, words, "", false, chev)
	})
	return hit
}

// listSection is a section's name and count, small and quiet (D270), then
// its body.
func (a *App) listSection(c *ui.Context, key, name string, n int, body func()) {
	t := a.T
	padX := t.S3 + 2
	if a.oh.room == "rail" {
		padX = t.S3
	}
	ui.Column(c.Key("sec:" + key)).Gap(t.S1).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Baseline).MinHeight(28).Padding(0, padX).Children(func() {
			if a.oh.room == "rail" {
				uiText(c, name).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
				if n > 0 {
					uiText(c, fmt.Sprint(n)).FontSize(t.XS).FontWeight(500).TextColor(t.Faint).FontFeatures("tnum")
				}
			} else {
				// D467: on the board a section's name is a quiet label under
				// the brief, never a count (the brief and the cards say it).
				uiText(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).LetterSpacing(0.5).Role(ui.RoleHeading)
			}
			if key == "needs" && a.oh.room != "rail" {
				ui.Spacer(c)
				if open := a.defaultable(); len(open) >= 2 && a.button(c, a.L.T("decision.goall", len(open)), btnText, t.ControlSM, t.Bg) {
					a.GoOnAllDefaults()
				}
			}
		})
		body()
	})
}

// taskRows is a run of rows lying flat on the ground (D270): no card
// around them; the selected one rises as the knob.
func (a *App) taskRows(c *ui.Context, tasks []*store.Task, state bool) {
	if len(tasks) == 0 {
		return
	}
	t := a.T
	ui.Column(c.Key("rows:" + tasks[0].ID)).Gap(t.S1 - 2).Children(func() {
		for _, task := range tasks {
			a.taskRow(c.Key(task.ID), task, state)
		}
	})
}

// taskRow is one task in two lines: the title, what changed, a draft PR or
// a merge, and the time; then what it is on, its branch, and who. Hover
// offers the one next step.
func (a *App) taskRow(c *ui.Context, task *store.Task, state bool) {
	t := a.T
	att := task.Attention()
	s := a.storyOf(task)
	focus := a.oh.focus == task.ID
	// D244: one status place; beside an opened task an active row says
	// only its title and its face.
	rail := a.oh.room == "rail"
	st := a.rowMarkOf(task)
	a.noteStatus(task.ID, st)
	face := st == stNew || (rail && st != stNone)
	quiet := rail && st != stNone
	opened := rail && a.Route == RouteTask && a.TaskID == task.ID
	padX := t.S3 + 2
	if rail {
		padX = t.S3
		focus = focus && !opened
	}
	// D270: selection is the knob (the card's white on its clay ledge), the
	// same as the place shown in the bar; hover a faint tint. No bar at an
	// edge for selection or for state.
	h, padY := float32(rowH), t.S2
	if rail && a.compact() {
		h, padY = 44, t.S1+1 // D457: compact, the rail's rows close up
	}
	row := ui.Row(c).Gap(t.S3).Padding(padY, padX).MinHeight(h).Radius(t.RadiusMD).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
	hover := row.Hovered()
	switch {
	case opened, focus:
		a.knob(row)
		row.AccessSelected(true)
	case hover:
		row.Background(t.Ink.Alpha(0.04))
	}
	row.Children(func() {
		if att == protocol.Blocked && !rail { // D315: beside a task the row says only its title and its face, never a second sign
			if w := a.S.WaiterFor(task.ID); w != nil {
				a.waitBubble(c, waitGlyph(w.Check, w.Event), 32)
			}
		}
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(3).Children(func() {
			ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if task.Card != nil {
					a.partnerMark(c, task.ID, task.Card.Persona) // D312
				}
				title := uiText(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(14).FontWeight(500).TextColor(t.Ink).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(longTitleTip(task.Title()))
				// Finished rows recede, unless they are a new result.
				if ((att == protocol.Done || att == protocol.DoneClaimed) && st != stNew) || (!rail && a.quietWait(task)) {
					title.TextColor(t.Ink.Alpha(0.7)).FontWeight(400) // D268: settled rows recede
				}
				if quiet {
					a.statusFace(c, task, st)
					return
				}
				if !rail && hover {
					// D454: a finished row offers × and ⋯ beside its one next step.
					drew := a.rowActs(c, task, true)
					if f := finishedOf(task); f != nil {
						a.finishedActs(c, *f)
						drew = true
					}
					if drew {
						return
					}
				}
				if ch := taskChanges(task); ch != nil {
					ui.Row(c.Key("stat")).Gap(t.S1 + 2).Shrink(0).Children(func() {
						if ch.Adds > 0 {
							uiText(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
						}
						if ch.Dels > 0 {
							uiText(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
						}
					})
				}
				if act := integrated(task); act != "" && !rail {
					key := "onhand.pr.draft"
					if act == "merge" {
						key = "onhand.pr.merged"
					}
					uiText(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
				}
				if state {
					ink := t.InkMuted
					switch att {
					case protocol.NeedsYou:
						ink = t.NeedsYou.Ink
					case protocol.Failed:
						ink = t.Failed.Ink
					}
					uiText(c.Key("st"), a.stateLabel(att)).FontSize(t.XS).FontWeight(700).TextColor(ink).Shrink(0).SingleLine()
				}
				if face {
					a.statusFace(c, task, st)
				}
				if rail || !a.quietWait(task) {
					uiText(c.Key("time"), a.rowTime(task)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0).MinWidth(44).TextAlign(ui.End).SingleLine()
				}
			})
			ui.Row(c.Key("l2")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ink := t.InkMuted
				switch s.tone {
				case "needs":
					ink = t.NeedsYou.Ink
				case "failed":
					ink = t.Failed.Ink
				}
				if s.mark != "" {
					mk := t.InkMuted
					if s.tone == "failed" {
						mk = t.Failed.Ink
					}
					draw := stepGlyph(s.mark)
					if s.mark == "error" {
						draw = drawCross
					}
					a.glyph(c, 14, draw(mk))
				}
				uiText(c.Key("w"), keepWords(autospace(s.words))).FontSize(t.XS).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(s.words)
				if s.code != "" {
					uiText(c.Key("code"), s.code).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(3).MinWidth(0)
				}
				if rail {
					return // the rail is narrow: where and who are in the task beside it
				}
				// D261: when a wait looks again, with a small ring of the
				// interval gone by; a wait that has been quiet for a day says so.
				if att == protocol.Blocked {
					w := a.S.WaiterFor(task.ID)
					if a.quietWait(task) {
						since := a.agoLong(task.Card.UpdatedAt)
						uiText(c.Key("quiet"), a.tp("onhand.wait.since", since)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
					} else if next, frac := a.waitNext(w); next != "" {
						c.After(time.Minute)
						ui.Row(c.Key("next")).Gap(t.S1 + 1).AlignItems(ui.Center).Shrink(0).Children(func() {
							ui.Box(c).Size(12, 12).Shrink(0).Draw(drawRing(t.InkMuted.Alpha(0.5), t.Waiting.Ink, frac)).AccessHidden(true)
							uiText(c, next).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
						})
					}
				}
				ui.Spacer(c)
				// Where, quietly: its project when the board shows all of them,
				// and its computer when there are two or more. Who does it and
				// its branch are in the task.
				for _, m := range a.whereMeta(task) {
					uiText(c.Key("meta:"+m), m).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0).MaxWidth(200)
				}
			})
			if u := task.Card; !rail && u != nil && u.Until != nil && u.Until.State == "on" {
				a.goal(c, u.Until, false)
			}
			if att == protocol.Blocked && !rail {
				if w := a.S.WaiterFor(task.ID); w != nil && (w.Check != nil || w.Event != nil) {
					a.groove(c, w, false)
				}
			}
		})
	})
	// D454: a right click on a finished row says the same as its ⋯.
	if f := finishedOf(task); f != nil && !rail {
		a.contextMenu(c, row, func(m *ui.Menu) { a.finishedItems(c, m, *f, true) })
	}
	// D290: the card you open grows into the task's head, and the task
	// you come back from goes back into its card; the list's rows come in
	// one after another on its first paint.
	clicked := row.Clicked()
	a.heroRow(row, task.ID, clicked || focus)
	if !rail {
		a.stagger(c, row, a.nav.rows)
		a.nav.rows++
	}
	if clicked {
		a.oh.focus = task.ID
		a.OpenTask(task.ID)
	}
}

// rowActs draws a row's one next step on hover and says whether it drew
// any: Merge or a draft PR for finished work with a branch, Pause for work
// under way.
func (a *App) rowActs(c *ui.Context, task *store.Task, hover bool) bool {
	t := a.T
	att := task.Attention()
	p := task.Place()
	if task.Acting != "" {
		uiText(c.Key("busy"), a.L.TFamily("result.acting."+task.Acting, p.BaseBranch)).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
		return true
	}
	finished := att == protocol.Done || att == protocol.DoneClaimed || att == protocol.Failed
	if finished && task.CanIntegrate() && integrated(task) == "" && p.Kind == "repo" {
		base := p.BaseBranch
		if base == "" {
			base = "main"
		}
		ui.Row(c.Key("acts")).Gap(t.S1).Shrink(0).Children(func() {
			if a.button(c, a.L.T("result.merge", base), btnText, t.ControlSM, t.SurfaceRaised) {
				task.Acting = "merge"
				a.TaskAction(task.ID, "merge")
			}
			if a.button(c, a.L.T("result.pr"), btnText, t.ControlSM, t.SurfaceRaised) {
				task.Acting = "open_pr"
				a.TaskAction(task.ID, "open_pr")
			}
		})
		return true
	}
	if att == protocol.Working {
		ui.Row(c.Key("acts")).Shrink(0).Children(func() {
			if a.button(c, a.L.T("task.action.pause"), btnText, t.ControlSM, t.SurfaceRaised) {
				a.TaskAction(task.ID, "interrupt")
			}
		})
		return true
	}
	return false
}

// findField is Find: it narrows the list as you type; Esc lets go.
func (a *App) findField(c *ui.Context) ui.Element {
	t := a.T
	var in ui.Element
	ui.Row(c.Key("find")).Grow(1).Shrink(1).MinWidth(200).Height(40).Gap(t.S2).Padding(0, t.S3+2).AlignItems(ui.Center).
		Radius(t.RadiusSM).Background(t.Sunken).Children(func() {
		a.glyph(c, 16, drawLens(t.InkMuted))
		in = ui.TextInput(c.Key("find-in"), &a.oh.find).Placeholder(a.L.T("onhand.find.placeholder")).Label(a.L.T("onhand.find.placeholder")).
			FontSize(t.MD).Grow(1).Background(ui.Color{}).Border(0, ui.Color{})
	})
	return in
}

// onHandKeys: j/k (or the arrows) walk the list, Enter opens, / finds,
// Esc lets go of Find first.
func (a *App) onHandKeys(c *ui.Context, find ui.Element) {
	if a.oh.sw || a.nt.open || a.addf.open {
		return
	}
	typing := find.Valid() && find.Focused()
	switch {
	case typing && c.Shortcut(0, ui.KeyEscape):
		a.oh.find = ""
	case typing:
		return
	case c.Shortcut(0, ui.KeySlash) && find.Valid():
		find.Focus()
	case a.oh.filter != 0 && c.Shortcut(0, ui.KeyEscape):
		a.oh.filter = 0 // D261: Esc lets go of the strip's filter first
	case c.Shortcut(0, ui.KeyJ), c.Shortcut(0, ui.KeyDown):
		a.moveFocus(1)
	case c.Shortcut(0, ui.KeyK), c.Shortcut(0, ui.KeyUp):
		a.moveFocus(-1)
	case a.oh.focus != "" && (c.Shortcut(0, ui.KeyEnter) || c.Shortcut(0, ui.KeyO)):
		a.OpenTask(a.oh.focus)
	}
}

func (a *App) moveFocus(by int) {
	o := a.oh.order
	if len(o) == 0 {
		return
	}
	i := -1
	for n, id := range o {
		if id == a.oh.focus {
			i = n
		}
	}
	switch {
	case i < 0 && by > 0:
		i = 0
	case i < 0:
		i = len(o) - 1
	default:
		i = max(0, min(len(o)-1, i+by))
	}
	a.oh.focus = o[i]
}

// ---------- the switcher (⌘O) ----------

// switchList is every task with a title that matches, what needs you
// first, then the newest; a title match before a match elsewhere.
func (a *App) switchList(q string) []*store.Task {
	low := strings.ToLower(q)
	var out []*store.Task
	for _, x := range a.S.Tasks {
		if x.Title() == "" || x.Attention() == protocol.Superseded || !a.findMatches(x, q) {
			continue
		}
		out = append(out, x)
	}
	rank := func(x *store.Task) int {
		switch x.Attention() {
		case protocol.NeedsYou:
			return 0
		case protocol.Working, protocol.Queued:
			return 1
		case protocol.Blocked:
			return 2
		}
		return 3
	}
	named := func(x *store.Task) int {
		if low != "" && strings.Contains(strings.ToLower(x.Title()), low) {
			return 0
		}
		if low == "" || a.findExactly(x, q) {
			return 1
		}
		return 2 // D456: a slip or the initials, after the words as typed
	}
	at := func(x *store.Task) string {
		if x.Card != nil {
			return x.Card.UpdatedAt
		}
		return x.OpenedAt
	}
	sort.SliceStable(out, func(i, j int) bool {
		if named(out[i]) != named(out[j]) {
			return named(out[i]) < named(out[j])
		}
		if rank(out[i]) != rank(out[j]) {
			return rank(out[i]) < rank(out[j])
		}
		return at(out[i]) > at(out[j])
	})
	if len(out) > 40 {
		out = out[:40]
	}
	return out
}

// OpenSwitcher opens 打开任务 / Open a task (⌘O), or closes it.
func (a *App) OpenSwitcher() {
	if a.nt.open {
		return
	}
	a.oh.sw = !a.oh.sw
	a.oh.swQuery, a.oh.swAt, a.pal.at = "", 0, 0
}

// switcher is 找任何东西 / Find anything while it is open (D391, palette.go).
func (a *App) switcher(c *ui.Context) {
	if !a.oh.sw {
		return
	}
	a.palette(c)
}
