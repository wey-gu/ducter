package views

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// onHand is the overview: the counts band, then four lanes.
func (a *App) onHand(c *ui.Context) {
	t := a.T
	b := a.S.Board()
	a.placeBar(c, "onhand", RouteOnHand, func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("onhand.title"))
	}, func() {
		// 新建 / New task: the place's own action, a clay button in the bar
		// like every other (D262), never a FAB (D128).
		if a.newTaskButton(c) {
			a.OpenNewTask(nil)
		}
	})
	var find ui.Element
	empty := a.boardEmpty(b) && len(a.partnerDecisions()) == 0 && len(a.shownCalls()) == 0
	// D261: the project lens (a column, or a row of names when narrow), then
	// the board by state under its strip of counts.
	groups := a.lensGroups(b)
	lens := a.currentLens(groups)
	a.oh.lens, a.oh.showProj = lens, lensOn(groups) && lens == ""
	w := a.winW
	if w <= 0 {
		w = 1280
	}
	column := !empty && lensOn(groups) && w >= railFrom
	ui.Row(c.Key("onhand-body")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		if column {
			a.projectColumn(c, b, groups, lens)
		}
		ui.Scroll(c.Key("board")).Grow(1).MinWidth(0).Children(func() {
			ui.Column(c).Gap(t.S5).Padding(t.S5, t.S6, t.S6, t.S6).Children(func() {
				if empty {
					ui.Column(c.Key("empty")).Width(640).MaxWidthPercent(100).AlignSelf(ui.Center).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).AlignItems(ui.Center).Children(func() {
						a.avatar(c, theme.Idle, 120)
						ui.Text(c, a.L.T("onhand.empty", a.S.PersonaName)).FontSize(t.LG).TextColor(t.InkSoft).TextAlign(ui.Center)
					})
					ui.Column(c.Key("past")).Width(640).MaxWidthPercent(100).AlignSelf(ui.Center).Children(func() { a.pastEndLine(c) }) // D285
					return
				}
				lb := lensBoard(b, lens)
				// D287: the day beside the board on a wide window; the list's
				// width is the cards' room.
				day := w >= dayFrom
				avail := w - 2*t.S6
				if column {
					avail -= lensColW
				}
				if day {
					avail -= dayColW + t.S6
				}
				a.oh.listW = min(float32(onHandMeasure), avail)
				ui.Row(c.Key("board-row")).Gap(t.S6).Justify(ui.Center).AlignItems(ui.Start).Children(func() {
					ui.Column(c.Key("list")).Gap(t.S5).Width(a.oh.listW).Shrink(1).MinWidth(0).Children(func() {
						if !column && lensOn(groups) {
							a.lensTabs(c, groups, lens)
						}
						find = a.boardTop(c, lb, groups, lens)
						if a.oh.filter == 0 && !day {
							a.forecastBand(c, lb)
						}
						if loose(lens) && (a.oh.filter == 0 || a.oh.filter == 2) {
							a.callRows(c) // D193: the calls, live and today's
						}
						a.onHandList(c, lb)
						if a.oh.filter == 0 {
							switch lens {
							case "":
								a.routineShelf(c, false)
							case lensOther:
								a.routineShelf(c, true)
							default:
								if g := groupOf(groups, lens); g != nil {
									a.lensRoutines(c, g)
								}
							}
						}
					})
					if day {
						a.dayColumn(c, lb, lens)
					}
					a.pastEndLine(c) // D285: 做过的事 ›
				})
			})
		})
	})
	a.onHandKeys(c, find)
}

// lensRoutines is what starts later or repeats in a project's folder
// (D185), under its tasks, and Nothing here yet for a project added by
// hand with neither.
func (a *App) lensRoutines(c *ui.Context, g *lensGroup) {
	t := a.T
	if len(g.routines) == 0 && len(g.tasks) > 0 {
		return
	}
	a.listSection(c, "routines", a.L.T("lane.routines"), len(g.routines), func() {
		// D270: flat on the ground, as the task rows are.
		ui.Column(c.Key("rows")).Gap(t.S1 - 2).Children(func() {
			for i := range g.routines {
				a.projectRoutineRow(c.Key("rt:"+g.routines[i].RoutineID), &g.routines[i])
			}
			if len(g.routines) == 0 {
				ui.Row(c.Key("empty")).Height(56).Padding(0, t.S4+2).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.L.T("onhand.project.empty")).FontSize(t.SM).TextColor(t.InkMuted)
				})
			}
		})
	})
}

// partnerDecisions are the open decisions of no task: the partner's own
// asks.
func (a *App) partnerDecisions() []*store.DecisionState {
	var out []*store.DecisionState
	for _, d := range a.S.OpenDecisions() {
		if d.TaskID == "" {
			out = append(out, d)
		}
	}
	return out
}

func (a *App) boardEmpty(b store.Board) bool {
	for _, l := range b.Lanes {
		if len(l) > 0 {
			return false
		}
	}
	return len(a.looseWaiters()) == 0 && len(a.S.MissedToday(time.Now())) == 0
}

// looseWaiters are the armed waiters of no task: compact rows on On hand.
func (a *App) looseWaiters() []*protocol.Waiter {
	var out []*protocol.Waiter
	for _, w := range a.S.ArmedWaiters() {
		if w.TaskID == "" || a.S.Task(w.TaskID) == nil {
			out = append(out, w)
		}
	}
	return out
}

// waitBack is when a waiter on a time comes back ("21:59 再看" / "back
// at 21:59"), its own muted element beside the reason (D291); "" else.
func (a *App) waitBack(task *store.Task) string {
	if w := a.S.WaiterFor(task.ID); w != nil && w.Check == nil && w.Event == nil {
		if at := store.ParseTime(w.At); !at.IsZero() {
			return a.L.T("waiter.at", a.when(at))
		}
	}
	return ""
}

// waitReason is what a waiting task waits for, in words: its waiter's
// reason, else the state's reason (internal ones, as "report: blocked",
// are not words for people). When it comes back is waitBack.
func (a *App) waitReason(task *store.Task) string {
	if w := a.S.WaiterFor(task.ID); w != nil {
		return w.Reason
	}
	r := task.Reason()
	// The task's machine dropped (runner: unreachableReason); glossary 连不上 / Can't reach.
	if d, ok := strings.CutPrefix(r, "device:unreachable:"); ok {
		return a.L.T("device.unreachable", d)
	}
	// D157: waiting for a computer that said it was going to sleep.
	if d, ok := strings.CutPrefix(r, "device:asleep:"); ok {
		return a.L.T("where.waiting", d)
	}
	if r == "browser:native_missing" { // D207
		return a.L.T("wait.native_missing")
	}
	if strings.HasPrefix(r, "report:") || strings.HasSuffix(r, "by user") {
		return ""
	}
	return r
}

// when is a time of day, with the weekday when it is not today.
func (a *App) when(at time.Time) string {
	return i18n.When(a.L.Lang, at, a.Now())
}

// day is a date in words: 今天, 周五, 12 月 9 日 (i18n.Day).
func (a *App) day(at time.Time) string {
	return i18n.Day(a.L.Lang, at, a.Now())
}

// tp is a.L.T with a time or name padded from the Chinese around it, and
// no stray space at either end or before full-width punctuation.
func (a *App) tp(key string, v string) string {
	s := strings.TrimSpace(a.L.T(key, a.pad(v)))
	for _, p := range []string{"，", "。", "；", "："} {
		s = strings.ReplaceAll(s, " "+p, p)
	}
	return s
}

// pad spaces a time or name that starts or ends in Latin letters or digits
// from the Chinese around it ("最多等到" + "12 月 1 日 9:00" + "，…").
func (a *App) pad(s string) string {
	if !a.L.Han() || s == "" {
		return s
	}
	if s[0] < 0x80 {
		s = " " + s
	}
	if s[len(s)-1] < 0x80 {
		s += " "
	}
	return s
}

// waiterRow is a task-less waiter: one compact line in the Waiting lane.
func (a *App) waiterRow(c *ui.Context, w *protocol.Waiter) {
	t := a.T
	// D270: a row on the ground like the task rows, its wait's clay bubble
	// the one picture.
	ui.Row(c).Gap(t.S3).Padding(t.S2, t.S3+2).MinHeight(rowH).Radius(t.RadiusMD).AlignItems(ui.Center).
		Label(w.Reason).Children(func() {
		if w.Check != nil || w.Event != nil {
			a.waitBubble(c, waitGlyph(w.Check, w.Event), 40)
		} else {
			a.glyph(c, 18, drawClock(t.InkMuted))
		}
		// Already under the Waiting lane's header: the reason alone, and
		// how it looks (or its time) under it.
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			title := w.Reason
			if w.Check != nil || w.Event != nil {
				title = a.waitLine(w.Reason)
			}
			ui.Text(c, keepWords(autospace(title))).FontSize(14).FontWeight(500).TextColor(t.Ink).MaxLines(2)
			if w.Check != nil || w.Event != nil {
				a.groove(c, w, false)
			}
			if line := a.waitCaption(w); line != "" {
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").MaxLines(2)
			}
		})
	})
}

// missedRow is a wait that ended without its condition (D145): kept in
// the finished area for the day, with what happened in plain words and a
// quiet Keep waiting that arms it again as it was.
func (a *App) missedRow(c *ui.Context, w *protocol.Waiter) {
	t := a.T
	why := w.Unmet
	if why == "" {
		why = a.L.T("wait.missed.ranout")
	}
	ui.Row(c).Gap(t.S3).Padding(t.S2, t.S3+2).MinHeight(rowH).Radius(t.RadiusMD).AlignItems(ui.Center).
		Label(w.Reason).Children(func() {
		a.waitBubble(c, waitGlyph(w.Check, w.Event), 32)
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			ui.Text(c, keepWords(autospace(w.Reason))).FontSize(14).FontWeight(500).TextColor(t.Ink).MaxLines(2)
			ui.Text(c, a.L.T("wait.missed", why)).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
		})
		if a.button(c, a.L.T("wait.rearm"), btnText, t.ControlSM, t.Bg) {
			a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "rearm"})
		}
	})
}

// forecastBand says when the user will be needed next: defaults taking
// effect and waits coming due, as one quiet line of muted words, and only
// when more than one thing is coming (one is already its own card, D127).
func (a *App) forecastBand(c *ui.Context, b store.Board) {
	t := a.T
	type coming struct{ when, text string }
	var items []coming
	for _, task := range b.Lanes[store.LaneNeedsYou] {
		d := a.S.PendingDecision(task.ID)
		if d == nil {
			continue
		}
		at := store.ParseTime(d.DefaultAt)
		if at.IsZero() || !d.Reversible || d.DefaultOption != "go" {
			continue
		}
		items = append(items, coming{a.when(at), shortTitle(task.Title())})
	}
	for _, task := range b.Lanes[store.LaneWaiting] {
		if w := a.S.WaiterFor(task.ID); w != nil {
			if at := store.ParseTime(firstNonEmpty(w.Until, w.At)); !at.IsZero() {
				items = append(items, coming{a.when(at), shortTitle(task.Title())})
			}
		}
	}
	for _, w := range a.looseWaiters() {
		if at := store.ParseTime(w.At); !at.IsZero() {
			items = append(items, coming{a.when(at), w.Reason})
		}
	}
	if len(items) < 2 {
		return
	}
	// D291: each thing coming is its own element, its time in tabular
	// figures, spaced by a gap; never one dotted line.
	ui.Row(c.Key("forecast")).Gap(t.S4).AlignItems(ui.Center).Padding(0, t.S3+2).MinWidth(0).Clip().
		Tooltip(spoken(a.L, func() []string {
			out := []string{}
			for _, it := range items {
				out = append(out, it.when+" "+it.text)
			}
			return out
		}()...)).Children(func() {
		ui.Text(c, a.L.T("onhand.next")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).SingleLine().Shrink(0)
		// Each one reads as a phrase: its time, then what it is.
		for _, it := range items {
			ui.Text(c, it.when+" "+it.text).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(1).MinWidth(0)
		}
	})
}

func (a *App) lane(c *ui.Context, lane store.Lane, tasks []*store.Task, grow, basis float32) {
	t := a.T
	names := [...]string{"lane.needs_you", "lane.working", "lane.waiting", "lane.done"}
	ui.Column(c.Key(lane)).Grow(grow).Basis(basis).MinWidth(0).MaxWidth(basis * 2.2).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.heading(c, a.L.T(names[lane]), t.XL)
			n := len(tasks)
			switch lane {
			case store.LaneNeedsYou:
				n += len(a.partnerDecisions())
			case store.LaneWaiting:
				n += len(a.looseWaiters())
			case store.LaneDone:
				n += len(a.S.MissedToday(time.Now()))
			}
			// The count in muted ink: the lane's name says which lane it is, not a color.
			a.heading(c, fmt.Sprint(n), t.XL).TextColor(t.InkMuted).FontFeatures("tnum")
			if lane == store.LaneNeedsYou {
				ui.Spacer(c)
				// 都按默认 / Go on all defaults: only worth it with two or more.
				if open := a.defaultable(); len(open) >= 2 && a.button(c, a.L.T("decision.goall", len(open)), btnText, t.ControlSM, t.Bg) {
					a.GoOnAllDefaults()
				}
			}
		})
		waiters := []*protocol.Waiter(nil)
		if lane == store.LaneWaiting {
			waiters = a.looseWaiters()
		}
		if lane == store.LaneDone {
			waiters = a.S.MissedToday(time.Now())
		}
		if len(tasks) == 0 && len(waiters) == 0 && lane != store.LaneNeedsYou {
			ui.Box(c).Padding(t.S4, t.S4).Radius(t.RadiusLG).Border(2, t.LineSoft).BorderStyle(ui.BorderDashed).Children(func() {
				ui.Text(c, a.L.T("lane.empty")).FontSize(t.SM).TextColor(t.InkMuted)
			})
			return
		}
		switch lane {
		case store.LaneNeedsYou:
			for _, d := range a.partnerDecisions() {
				a.partnerDecisionCard(c.Key("pd:"+d.DecisionID), d)
			}
			for _, task := range tasks {
				a.needsCard(c.Key(task.ID), task)
			}
		case store.LaneWorking:
			for _, task := range tasks {
				a.workingCard(c.Key(task.ID), task)
			}
		case store.LaneWaiting:
			for _, task := range tasks {
				a.waitingCard(c.Key(task.ID), task)
			}
			for _, w := range waiters {
				a.waiterRow(c.Key("w:"+w.WaiterID), w)
			}
		case store.LaneDone:
			for _, w := range waiters {
				a.missedRow(c.Key("m:"+w.WaiterID), w)
			}
			if len(tasks) > 0 {
				a.doneList(c, tasks)
			}
		}
	})
}

// whereWhy is where a task runs and why there, as separate short facts
// (Codex, MacBook, 你的规则「后端用 Codex」), each its own muted element
// (D291). The model, the repo, the branch and the rest of the reason are
// in the opened task's Details.
func (a *App) whereWhy(task *store.Task) []string {
	where := ""
	if p := task.Place(); a.manyComputers() {
		// D157: with two or more computers every row names its computer.
		where = a.computerName(p.Device)
	} else if p.Kind != "" {
		where = a.device(p.Device)
	}
	return nonEmpty(harnessName(task.Harness()), where, firstClause(task.BodyReason()))
}

// firstClause is a reason's first clause: up to its first comma or full
// stop outside quotes.
func firstClause(s string) string {
	depth := 0
	for i, r := range s {
		switch r {
		case '「', '“', '(', '（':
			depth++
		case '」', '”', ')', '）':
			depth--
		case '"':
			if depth > 0 {
				depth--
			} else {
				depth++
			}
		case '，', '。', '；':
			if depth <= 0 {
				return strings.TrimSpace(s[:i])
			}
		case ',', ';', '.':
			if depth <= 0 && (i+1 == len(s) || s[i+1] == ' ') {
				return strings.TrimSpace(s[:i])
			}
		}
	}
	return strings.TrimSpace(s)
}

// needsCard is a task's ask on On hand, one clay card in the needs-you
// tint, read at one glance (D127): who and what (the agent's coin and the
// task's short title, the way into the task), one plain question, its
// default as a small clock ring and a caption, then Reply… / Hold / Go.
// Where it runs and why are in the opened task, on the coin's hover.
func (a *App) needsCard(c *ui.Context, task *store.Task) {
	t := a.T
	d := a.S.PendingDecision(task.ID)
	ui.Column(c).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
		a.askerRow(c, task)
		rep := task.Report()
		q := ""
		if d != nil {
			q = a.questionOf(d)
		} else if rep != nil && len(rep.Questions) > 0 {
			q = rep.Questions[0].Text
		}
		if q != "" {
			a.heading(c, autospace(q), t.LG).LineHeight(1.4).MaxLines(4).Tooltip(q)
		}
		if d != nil {
			a.defaultRow(c, d)
			a.decisionButtons(c, d, decisionStyle{height: 40, quietBg: t.NeedsYou.Surface})
		}
	})
}

// askerRow is what the ask is about: the task's short title as a link
// (its hover says the whole title, who and where), and how long ago. No
// coin: at this size it reads as an emoji (D213).
func (a *App) askerRow(c *ui.Context, task *store.Task) {
	t := a.T
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		title := shortTitle(task.Title())
		tip := task.Title()
		for _, why := range a.whereWhy(task) {
			tip += "\n" + why
		}
		l := ui.Row(c.Key("asker")).Gap(2).AlignItems(ui.Center).Grow(1).MinWidth(0).Cursor(ui.CursorPointer).
			Role(ui.RoleLink).Label(task.Title()).Focusable().Tooltip(tip)
		hover := l.Hovered() || l.Pressed()
		l.Children(func() {
			col := t.InkSoft
			if hover {
				col = t.Ink
			}
			tx := ui.Text(c, title).FontSize(t.SM).FontWeight(700).TextColor(col).MinWidth(0).Shrink(1).SingleLine().AccessHidden(true)
			if hover {
				tx.Underline()
			}
			a.glyph(c, 12, drawChevron(col, false))
		})
		if l.Clicked() {
			a.OpenTask(task.ID)
		}
		if at := store.ParseTime(task.OpenedAt); !at.IsZero() {
			opened := a.L.T("time.opened.now")
			if d := a.Now().Sub(at); d >= time.Minute {
				opened = a.L.T("time.opened", a.duration(d))
			}
			ui.Text(c, opened).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
		}
	})
}

// shortTitle is a task's title as a card says it: what it is, without the
// parenthetical details ("准备 App Store Connect（截图、描述、隐私）" →
// "准备 App Store Connect"). The full title is on hover and in the task.
func shortTitle(title string) string {
	s := strings.TrimSpace(title)
	for _, pair := range [][2]string{{"（", "）"}, {"(", ")"}, {"【", "】"}, {"[", "]"}} {
		for {
			i := strings.Index(s, pair[0])
			if i < 0 {
				break
			}
			j := strings.Index(s[i:], pair[1])
			if j < 0 {
				break
			}
			cut := strings.TrimSpace(s[:i] + " " + s[i+j+len(pair[1]):])
			if cut == "" {
				break
			}
			s = cut
		}
	}
	s = strings.Join(strings.Fields(s), " ")
	s = strings.TrimRight(s, " ,，:：-—")
	if s == "" {
		return strings.TrimSpace(title)
	}
	return s
}

// nonEmpty keeps the strings that say something.
func nonEmpty(s ...string) []string {
	var out []string
	for _, v := range s {
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}

// defaultRow is what happens if the user doesn't answer (D127): for a
// default that goes ahead, a small clock ring of the time left and one
// caption ("28 分钟后按默认：等你登录后继续"); else the words alone.
func (a *App) defaultRow(c *ui.Context, d *store.DecisionState) {
	t := a.T
	if d.Where != nil {
		a.whereAskLines(c, d.Where)
		return
	}
	left, ok := a.defaultIn(d)
	if !ok || d.DefaultOption != "go" {
		a.mark(c.Key("default"), drawClock, a.defaultLine(c, d), t.NeedsYou.Ink)
		return
	}
	g := strings.TrimRight(strings.TrimSpace(d.GoLabel), ".。")
	if d.Closing != nil {
		g = a.L.T("move.closing.go")
	}
	if g == "" {
		g = a.L.T("decision.go")
	}
	// "In 6 min: wait for you…": a capital that only starts its own sentence goes.
	if a.L.Cased() && len(g) > 1 && g[0] >= 'A' && g[0] <= 'Z' && g[1] >= 'a' && g[1] <= 'z' {
		g = strings.ToLower(g[:1]) + g[1:]
	}
	frac := float32(1)
	if total := store.ParseTime(d.DefaultAt).Sub(a.decisionTime(d)); total > 0 {
		frac = float32(left) / float32(total)
	}
	c.After(min(max(left%time.Minute, time.Second), time.Minute))
	words := a.L.T("decision.default.due")
	if left > 0 {
		words = a.L.T("decision.default.in", a.duration(left), g)
	}
	ui.Row(c.Key("default")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
		ui.Box(c).Size(16, 16).Shrink(0).Draw(drawRing(t.NeedsYou.Ink.Alpha(0.45), t.Accent, frac)).AccessHidden(true)
		ui.Text(c, words).FontSize(t.SM).TextColor(t.NeedsYou.Ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(words)
	})
}

// decisionTime is when a decision was asked: its event's time.
func (a *App) decisionTime(d *store.DecisionState) time.Time {
	if at := store.ParseTime(d.AskedAt); !at.IsZero() {
		return at
	}
	if task := a.S.Task(d.TaskID); task != nil {
		for _, ev := range task.Events {
			if ev.Seq == d.Seq {
				return store.ParseTime(ev.TS)
			}
		}
	}
	for _, e := range a.S.Channel {
		if e.Event.Seq == d.Seq {
			return store.ParseTime(e.Event.TS)
		}
	}
	return a.Now().Add(-time.Minute)
}

func (a *App) cardLink(c *ui.Context, card ui.Element, task *store.Task) {
	card.Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title())
	a.lift(c, card, 3)
	if card.Clicked() {
		a.OpenTask(task.ID)
	}
}

func (a *App) workingCard(c *ui.Context, task *store.Task) {
	t := a.T
	card := ui.Column(c).Padding(t.S4, t.S4).Gap(t.S3).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	a.cardLink(c, card, task)
	// Its wait just came true (D115): it springs in from the Waiting lane (at once, fading
	// only, when the Mac asks for less motion), its bubble popping as it lands.
	arrived := a.arrived(c, task.ID)
	if arrived {
		entered := ui.Local(card, "arrived", func() bool { return false })
		p := ui.Pose{}
		if !*entered {
			p, *entered = ui.Pose{X: 360, Scale: 0.98, Fade: 0.6}, true
			c.Invalidate()
		}
		card.AnimatePose(p, t.Bouncy)
	}
	card.Children(func() {
		if arrived {
			pop := ui.Box(c.Key("pop")).Absolute().Left(-10).Top(-10).Size(40, 36).Radius(40).Background(t.SurfaceRaised).PassThrough().AccessHidden(true)
			grown := ui.Local(pop, "grown", func() bool { return false })
			p := ui.Pose{}
			if !*grown {
				*grown = true
				c.Invalidate()
			} else {
				p = ui.Pose{Scale: 1.4, Fade: 1}
			}
			pop.AnimatePose(p, ui.Animation{Duration: 320 * time.Millisecond})
		}
		ui.Text(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD).FontWeight(800).Balance()
		if u := task.Card; u != nil && u.Until != nil && u.Until.State == "on" {
			// A keep-going loop (D113): its tries, then where it stands.
			a.goal(c, u.Until, false)
			if line := a.untilLine(u.Until); line != "" {
				ui.Text(c, line).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(3)
			}
		} else if rep := task.Report(); rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(3)
		} else if r := a.waitReason(task); r != "" {
			ui.Text(c, r).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		}
		meta := a.whereWhy(task)
		if task.Card != nil && task.Card.FromRoutine != nil {
			meta = append([]string{a.L.T("routine.from", task.Card.FromRoutine.Name)}, meta...)
		}
		if task.Card != nil && task.Card.UpdatedAt != "" {
			meta = append(meta, a.L.T("onhand.reported", a.ago(task.Card.UpdatedAt)))
		}
		a.facts(c, t.XS, t.InkMuted, meta...)
	})
}

func (a *App) waitingCard(c *ui.Context, task *store.Task) {
	t := a.T
	card := ui.Column(c).Padding(t.S4, t.S4).Gap(t.S2).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	a.cardLink(c, card, task)
	card.Children(func() {
		ui.Text(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD).FontWeight(800).Balance()
		// What it waits for, said alone: the clock or the wait's bubble
		// already says it is waiting (D291); when it comes back is its own
		// muted time.
		reason := a.waitReason(task)
		if reason == "" {
			reason = a.stateLabel(protocol.Blocked)
		}
		back := a.waitBack(task)
		w := a.S.WaiterFor(task.ID)
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if w != nil && (w.Check != nil || w.Event != nil) {
				a.waitBubble(c, waitGlyph(w.Check, w.Event), 36)
			} else {
				a.glyph(c, 18, drawClock(t.InkMuted))
			}
			ui.Text(c, reason).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Grow(1).MinWidth(0)
			if back != "" {
				ui.Text(c, back).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(0)
			}
		})
		if w != nil && (w.Check != nil || w.Event != nil) {
			a.groove(c, w, false)
			if line := a.waitCaption(w); line != "" {
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").MaxLines(2)
			}
		}
		if rep := task.Report(); rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
		}
	})
}

func (a *App) doneList(c *ui.Context, tasks []*store.Task) {
	t := a.T
	ui.Column(c).Padding(t.S2, t.S4).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
		Dividers(1, t.LineSoft).Children(func() {
		for _, task := range tasks {
			row := ui.Column(c.Key(task.ID)).Gap(t.S2).Padding(t.S3, 0).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title())
			row.Children(func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Start).Children(func() {
					ui.Text(c, keepWords(autospace(task.Title()))).FontSize(t.MD).FontWeight(700).Grow(1).MinWidth(0).MaxLines(2).Balance()
					if task.Attention() == protocol.Failed {
						// The exception, in words in its ink; no capsule.
						ui.Text(c, a.stateLabel(protocol.Failed)).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink).Shrink(0)
					}
				})
				// The result itself: its first line, and its first machine check.
				rep := task.Report()
				if rep == nil {
					return
				}
				if line := summaryLine(rep.Summary); line != "" {
					ui.Text(c, line).FontSize(t.XS).LineHeight(1.45).TextColor(t.InkSoft).MaxLines(2).Tooltip(rep.Summary)
				}
				if ev, ok := headlineEvidence(rep.Evidence); ok && task.Attention() != protocol.Failed {
					a.mark(c.Key("ev"), drawCheck, ev.Label, t.InkMuted)
				}
			})
			if row.Clicked() {
				a.OpenTask(task.ID)
			}
		}
	})
}

// partnerDecisionCard is the partner's own ask, of no task: the question,
// its default, and Go / Hold / Reply.
func (a *App) partnerDecisionCard(c *ui.Context, d *store.DecisionState) {
	t := a.T
	if d.Call != nil {
		ui.Column(c).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).
			Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() { a.callBody(c, d) })
		return
	}
	ui.Column(c).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
		if d.Asker != nil {
			// X1 (D170): the agent's coin and who it is stand where a task's title would.
			a.peerAskerRow(c, d.Asker)
		} else {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				a.avatar(c, theme.NeedsYou, 28)
				ui.Text(c, a.S.PersonaName).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
			})
		}
		a.heading(c, autospace(a.questionOf(d)), t.LG).LineHeight(1.4).MaxLines(4)
		if d.RoutineID != "" {
			a.routineFacts(c, d.RoutineID, t.NeedsYou.Ink)
		}
		a.defaultRow(c, d)
		a.decisionButtons(c, d, decisionStyle{height: 40, quietBg: t.NeedsYou.Surface})
	})
}
