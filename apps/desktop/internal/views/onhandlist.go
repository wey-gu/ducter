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
		// D261: a wait always says what it waits for. A waiter names it; else
		// the state's reason; else what the task last reported; else that it
		// stopped without saying (true, and worth a look).
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

// findMatches: every word typed is somewhere in it.
func (a *App) findMatches(task *store.Task, q string) bool {
	hay := a.haystack(task)
	for _, w := range strings.Fields(strings.ToLower(q)) {
		if !strings.Contains(hay, w) {
			return false
		}
	}
	return true
}

// ---------- the list ----------

// onHandList is the list by state: what needs you answered in place, then
// Working, Waiting and Done today, each one card of rows.
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
	needs := keep(b.Lanes[store.LaneNeedsYou])
	working := keep(b.Lanes[store.LaneWorking])
	waiting := keep(b.Lanes[store.LaneWaiting])
	done := keep(b.Lanes[store.LaneDone])
	rail := a.oh.room == "rail"
	f := a.oh.filter
	if rail {
		f = 0
	}
	show := func(i int) bool { return f == 0 || f == i }
	// D261: a wait nothing has changed on for a day folds away under the
	// fresh ones; a result you have seen folds under 今天做完, a new one
	// never. Find and the strip's filter unfold them.
	var fresh, quiet, newer, seen []*store.Task
	for _, x := range waiting {
		if !rail && a.quietWait(x) {
			quiet = append(quiet, x)
		} else {
			fresh = append(fresh, x)
		}
	}
	for _, x := range done {
		if !rail && a.rowMarkOf(x) != stNew {
			seen = append(seen, x)
		} else {
			newer = append(newer, x)
		}
	}
	quietOpen := a.oh.quietOn || f == 3 || q != ""
	doneOpen := a.Local.Folded(doneOpenKey) || f == 4 || q != ""
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
	add(show(1), needs)
	add(show(2), working)
	add(show(3), fresh)
	add(show(3) && quietOpen, quiet)
	add(show(4), newer)
	add(show(4) && doneOpen, seen)
	if q != "" && len(needs)+len(working)+len(waiting)+len(done) == 0 {
		ui.Text(c.Key("none"), a.L.T("onhand.find.none")).FontSize(t.MD).TextColor(t.InkMuted)
		return
	}
	if rail {
		// Beside an opened task (D244): every task is a row, and only tasks.
		for _, s := range []struct {
			key, name string
			ts        []*store.Task
		}{{"needs", "lane.needs_you", needs}, {"working", "lane.working", working}, {"waiting", "lane.waiting", waiting}, {"done", "lane.done", done}} {
			if len(s.ts) > 0 {
				a.listSection(c, s.key, a.L.T(s.name), len(s.ts), func() { a.taskRows(c, s.ts, false) })
			}
		}
		return
	}
	// Only in all, and Other: what belongs to no task.
	var pds []*store.DecisionState
	var loose, missed []*protocol.Waiter
	if q == "" && (a.oh.lens == "" || a.oh.lens == lensOther) {
		pds, loose, missed = a.partnerDecisions(), a.looseWaiters(), a.S.MissedToday(time.Now())
	}
	// What needs you comes first and takes no room when there is none (the
	// board's head says so in one calm sentence).
	if len(needs)+len(pds) > 0 && show(1) {
		a.listSection(c, "needs", a.L.T("lane.needs_you"), len(needs)+len(pds), func() {
			for _, d := range pds {
				a.partnerDecisionCard(c.Key("pd:"+d.DecisionID), d)
			}
			for _, task := range needs {
				if a.S.PendingDecision(task.ID) != nil {
					a.needsCard(c.Key(task.ID), task)
				} else {
					a.taskRows(c.Key("r:"+task.ID), []*store.Task{task}, false)
				}
			}
		})
	}
	if len(working) > 0 && show(2) {
		a.listSection(c, "working", a.L.T("lane.working"), len(working), func() { a.taskRows(c, working, false) })
	}
	if len(waiting)+len(loose) > 0 && show(3) {
		a.listSection(c, "waiting", a.L.T("lane.waiting"), len(waiting)+len(loose), func() {
			a.taskRows(c.Key("fresh"), fresh, false)
			for _, w := range loose {
				a.waiterRow(c.Key("w:"+w.WaiterID), w)
			}
			if len(quiet) > 0 {
				if f != 3 && q == "" && a.foldLine(c, "quiet", a.L.T("onhand.wait.quiet", len(quiet)), quietOpen) {
					a.oh.quietOn = !a.oh.quietOn
				}
				if quietOpen {
					a.taskRows(c.Key("quiet"), quiet, false)
				}
			}
		})
	}
	if len(done)+len(missed) > 0 && show(4) {
		a.listSection(c, "done", a.L.T("lane.done"), len(done)+len(missed), func() {
			a.taskRows(c.Key("new"), newer, false)
			if len(seen)+len(missed) == 0 {
				return
			}
			if f != 4 && q == "" && a.foldLine(c, "seen", a.L.T("onhand.done.seen", len(seen)+len(missed)), doneOpen) {
				a.Local.SetFolded(doneOpenKey, !doneOpen)
			}
			if doneOpen {
				for _, w := range missed {
					a.missedRow(c.Key("m:"+w.WaiterID), w)
				}
				a.taskRows(c.Key("seen"), seen, false)
			}
		})
	}
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

// listSection is a section's name and count in muted ink, then its body.
func (a *App) listSection(c *ui.Context, key, name string, n int, body func()) {
	t := a.T
	ui.Column(c.Key("sec:" + key)).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MinHeight(32).Children(func() {
			ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
			if n > 0 {
				ui.Text(c, fmt.Sprint(n)).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).FontFeatures("tnum")
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

// taskRows is one clay card of rows, parted by a soft line.
func (a *App) taskRows(c *ui.Context, tasks []*store.Task, state bool) {
	if len(tasks) == 0 {
		return
	}
	t := a.T
	// Clipped: a hovered or focused row fills its band edge to edge and the
	// card's own corners round it, never a tile inside a rim.
	ui.Column(c.Key("rows:"+tasks[0].ID)).Radius(t.RadiusLG).Clip().Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
		Dividers(1, t.LineSoft).Children(func() {
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
	p := task.Place()
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
	padX := t.S4 + 2
	if rail {
		padX = t.S3 + 2
		focus = focus && !opened
	}
	row := ui.Row(c).Gap(t.S3).Padding(t.S3+1, padX-t.S1).Radius(t.RadiusLG - t.S1).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
	hover := row.Hovered()
	switch {
	case opened:
		row.Background(t.Sunken)
	case focus:
		row.Background(t.SurfaceRaised)
	case hover:
		row.Background(t.SurfaceRaised)
	}
	row.Children(func() {
		if focus {
			ui.Box(c.Key("kf")).Absolute().Left(t.S1).Top(t.S3).Bottom(t.S3).Width(4).Radius(t.Pill).Background(t.Accent).AccessHidden(true)
		}
		if opened {
			ui.Box(c.Key("open")).Absolute().Left(t.S1).Top(t.S3).Bottom(t.S3).Width(4).Radius(t.Pill).Background(t.Ink).AccessHidden(true)
		}
		if att == protocol.Blocked {
			if w := a.S.WaiterFor(task.ID); w != nil {
				a.waitBubble(c, waitGlyph(w.Check, w.Event), 32)
			}
		}
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(t.S1).Children(func() {
			ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				title := ui.Text(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(14).FontWeight(500).TextColor(t.Ink).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(longTitleTip(task.Title()))
				// Finished rows recede, unless they are a new result.
				if ((att == protocol.Done || att == protocol.DoneClaimed) && st != stNew) || (!rail && a.quietWait(task)) {
					title.TextColor(t.Ink.Alpha(0.7)).FontWeight(400) // D268: settled rows recede
				}
				if quiet {
					a.statusFace(c, task, st)
					return
				}
				if !rail && hover && a.rowActs(c, task, true) {
					return
				}
				if ch := taskChanges(task); ch != nil {
					ui.Row(c.Key("stat")).Gap(t.S1 + 2).Shrink(0).Children(func() {
						if ch.Adds > 0 {
							ui.Text(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
						}
						if ch.Dels > 0 {
							ui.Text(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
						}
					})
				}
				if act := integrated(task); act != "" && !rail {
					key := "onhand.pr.draft"
					if act == "merge" {
						key = "onhand.pr.merged"
					}
					ui.Text(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
				}
				if state {
					ink := t.InkMuted
					switch att {
					case protocol.NeedsYou:
						ink = t.NeedsYou.Ink
					case protocol.Failed:
						ink = t.Failed.Ink
					}
					ui.Text(c.Key("st"), a.stateLabel(att)).FontSize(t.XS).FontWeight(700).TextColor(ink).Shrink(0).SingleLine()
				}
				if face {
					a.statusFace(c, task, st)
				}
				ui.Text(c.Key("time"), a.rowTime(task)).FontSize(t.XXS + 0.5).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0).MinWidth(44).TextAlign(ui.End).SingleLine()
			})
			ui.Row(c.Key("l2")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ink := t.InkSoft
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
				ui.Text(c.Key("w"), keepWords(autospace(s.words))).FontSize(t.XS).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(s.words)
				if s.code != "" {
					ui.Text(c.Key("code"), s.code).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(3).MinWidth(0)
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
						ui.Text(c.Key("quiet"), a.tp("onhand.wait.since", since)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
					} else if next, frac := a.waitNext(w); next != "" {
						c.After(time.Minute)
						ui.Row(c.Key("next")).Gap(t.S1 + 1).AlignItems(ui.Center).Shrink(0).Children(func() {
							ui.Box(c).Size(12, 12).Shrink(0).Draw(drawRing(t.InkMuted.Alpha(0.5), t.Waiting.Ink, frac)).AccessHidden(true)
							ui.Text(c, next).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
						})
					}
				}
				ui.Spacer(c)
				// Where, quietly: its project when the board shows all of them,
				// and its computer when there are two or more. Who does it and
				// its branch are in the task.
				meta := []string{}
				if a.oh.showProj {
					meta = append(meta, a.lensName(lensOf(task)))
				}
				if a.manyComputers() && p.Kind != "none" && p.Device != "" {
					meta = append(meta, a.computerName(p.Device))
				}
				if len(meta) > 0 {
					ui.Text(c.Key("meta"), strings.Join(meta, " · ")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0).MaxWidth(200)
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
	if row.Clicked() {
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
		ui.Text(c.Key("busy"), a.L.T("result.acting."+task.Acting, p.BaseBranch)).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
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
	if a.oh.sw || a.nt.open {
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
		return 1
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

// OpenSwitcher opens 打开一件事 / Open a task (⌘O), or closes it.
func (a *App) OpenSwitcher() {
	if a.nt.open {
		return
	}
	a.oh.sw = !a.oh.sw
	a.oh.swQuery, a.oh.swAt = "", 0
}

func (a *App) switcher(c *ui.Context) {
	if !a.oh.sw {
		return
	}
	t := a.T
	w, _ := c.Size()
	if w <= 0 {
		w = 1040
	}
	list := a.switchList(strings.TrimSpace(a.oh.swQuery))
	at := min(a.oh.swAt, max(0, len(list)-1))
	pick := func(x *store.Task) {
		a.oh.sw = false
		if x == nil {
			q := strings.TrimSpace(a.oh.swQuery)
			if q == "" {
				return
			}
			a.OpenNewTask(nil)
			a.nt.words = q
			return
		}
		a.OpenTask(x.ID)
	}
	switch {
	case c.Shortcut(0, ui.KeyDown):
		a.oh.swAt = min(at+1, max(0, len(list)-1))
	case c.Shortcut(0, ui.KeyUp):
		a.oh.swAt = max(at-1, 0)
	case c.Shortcut(0, ui.KeyEnter):
		if len(list) > 0 {
			pick(list[at])
		} else {
			pick(nil)
		}
		return
	}
	ui.DialogBase(c, &a.oh.sw, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 640)).Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).
			Label(a.L.T("switch.label"))
		in := ui.TextInput(c.Key("sw-in"), &a.oh.swQuery).Placeholder(a.L.T("switch.placeholder")).Label(a.L.T("switch.placeholder")).
			FontSize(t.LG).Padding(t.S5-4, t.S5).Background(ui.Color{}).Border(0, ui.Color{})
		in.Focus()
		ui.Box(c.Key("rule")).Height(1).Background(t.LineSoft)
		ui.Column(c.Key("sw-list")).Padding(t.S2).MaxHeight(520).Children(func() {
			ui.Scroll(c).Children(func() {
				for n, x := range list {
					a.switcherRow(c.Key("sw:"+x.ID), x, n == at, func() { pick(x) })
				}
				if len(list) == 0 && strings.TrimSpace(a.oh.swQuery) != "" {
					q := strings.TrimSpace(a.oh.swQuery)
					r := ui.Row(c.Key("sw-new")).Padding(t.S3-2, t.S4).Radius(t.RadiusMD).Background(t.Sunken).Cursor(ui.CursorPointer)
					r.Children(func() {
						ui.Text(c, a.L.T("switch.new", q)).FontSize(t.MD).FontWeight(700)
					})
					if r.Clicked() {
						pick(nil)
					}
				}
			})
		})
	})
}

func (a *App) switcherRow(c *ui.Context, x *store.Task, on bool, pick func()) {
	t := a.T
	p := x.Place()
	where := strings.Join(nonEmpty(x.Project(), p.Branch), " · ")
	r := ui.Row(c).Gap(t.S3).Padding(t.S3-2, t.S4).Radius(t.RadiusMD).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(x.Title())
	if on || r.Hovered() {
		r.Background(t.Sunken)
	}
	r.Children(func() {
		ui.Text(c, keepWords(autospace(shortTitle(x.Title())))).FontSize(t.MD).FontWeight(700).SingleLine().Grow(1).Shrink(1).MinWidth(0)
		if where != "" {
			ui.Text(c.Key("m"), where).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(2).MinWidth(0)
		}
		att := x.Attention()
		ink := t.InkMuted
		switch att {
		case protocol.NeedsYou:
			ink = t.NeedsYou.Ink
		case protocol.Failed:
			ink = t.Failed.Ink
		}
		ui.Text(c.Key("st"), a.stateLabel(att)).FontSize(t.XS).FontWeight(700).TextColor(ink).Shrink(0)
	})
	if r.Clicked() {
		pick()
	}
}
