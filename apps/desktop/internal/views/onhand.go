package views

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// onHand is the overview: the counts band, then four lanes.
func (a *App) onHand(c *ui.Context) {
	t := a.T
	b := a.S.Board()
	a.chrome(c, "onhand", func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("onhand.title"))
		ui.Text(c, a.summary(b)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0).Margin(0, 0, 0, 4)
	}, nil)
	ui.Scroll(c).Grow(1).Children(func() {
		ui.Column(c).Gap(t.S5).Padding(t.S5, t.S6, t.S6, t.S6).Children(func() {
			if a.boardEmpty(b) && len(a.partnerDecisions()) == 0 {
				ui.Column(c.Key("empty")).Width(640).MaxWidthPercent(100).AlignSelf(ui.Center).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).AlignItems(ui.Center).Children(func() {
					a.avatar(c, theme.Idle, 120)
					ui.Text(c, a.L.T("onhand.empty", a.S.PersonaName)).FontSize(t.LG).TextColor(t.InkSoft).TextAlign(ui.Center)
				})
				return
			}
			a.forecastBand(c, b)
			needs := len(b.Lanes[store.LaneNeedsYou]) + len(a.partnerDecisions())
			if needs == 0 {
				// Nothing needs the user: one warm line, not an empty lane.
				line := a.L.T("onhand.calm")
				if n := len(b.Lanes[store.LaneWorking]); n > 0 {
					line = a.L.T("onhand.calm.working", a.S.PersonaName, n)
				}
				ui.Row(c.Key("calm")).Gap(t.S3).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Done.Surface).AlignItems(ui.Center).Children(func() {
					a.glyph(c, 22, drawCheck(t.Done.Ink))
					ui.Text(c, line).FontSize(t.MD).FontWeight(600).TextColor(t.Done.Ink)
				})
			}
			ui.Row(c).Gap(t.S5).Wrap().AlignItems(ui.Start).Children(func() {
				// Only lanes with something in them; empty ones collapse.
				if needs > 0 {
					a.lane(c, store.LaneNeedsYou, b.Lanes[store.LaneNeedsYou], 2, 400)
				}
				if len(b.Lanes[store.LaneWorking]) > 0 {
					a.lane(c, store.LaneWorking, b.Lanes[store.LaneWorking], 1, 240)
				}
				if len(b.Lanes[store.LaneWaiting]) > 0 || len(a.looseWaiters()) > 0 {
					a.lane(c, store.LaneWaiting, b.Lanes[store.LaneWaiting], 1, 220)
				}
				if len(b.Lanes[store.LaneDone]) > 0 {
					a.lane(c, store.LaneDone, b.Lanes[store.LaneDone], 1, 260)
				}
			})
			a.routineShelf(c)
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
	return len(a.looseWaiters()) == 0
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

// waitReason is what a waiting task waits for, in words: its waiter's
// reason, else the state's reason (internal ones, as "report: blocked",
// are not words for people).
func (a *App) waitReason(task *store.Task) string {
	if w := a.S.WaiterFor(task.ID); w != nil {
		r := w.Reason
		if at := store.ParseTime(w.At); !at.IsZero() && w.Check == nil && w.Event == nil {
			r += " · " + a.L.T("waiter.at", a.when(at))
		}
		return r
	}
	r := task.Reason()
	// The task's machine dropped (runner: unreachableReason); glossary 连不上 / Can't reach.
	if d, ok := strings.CutPrefix(r, "device:unreachable:"); ok {
		return a.L.T("device.unreachable", d)
	}
	if strings.HasPrefix(r, "report:") || strings.HasSuffix(r, "by user") {
		return ""
	}
	return r
}

// when is a time of day, with the weekday when it is not today.
func (a *App) when(at time.Time) string {
	at = at.Local()
	now := a.Now().Local()
	if at.YearDay() == now.YearDay() && at.Year() == now.Year() {
		return at.Format("15:04")
	}
	if at.Sub(now) < 36*time.Hour && at.YearDay() == now.Add(24*time.Hour).YearDay() {
		return a.L.T("time.tomorrow", at.Format("15:04"))
	}
	if at.Sub(now) < 7*24*time.Hour && at.After(now) {
		return a.L.T(fmt.Sprintf("weekday.%d", int(at.Weekday())), at.Format("15:04"))
	}
	return at.Format("01-02 15:04")
}

// waiterRow is a task-less waiter: one compact line in the Waiting lane.
func (a *App) waiterRow(c *ui.Context, w *protocol.Waiter) {
	t := a.T
	ui.Row(c).Gap(t.S3).Padding(t.S4, t.S4).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).AlignItems(ui.Start).
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
			ui.Text(c, title).FontSize(t.MD).FontWeight(800).MaxLines(3)
			if w.Check != nil || w.Event != nil {
				a.groove(c, w, false)
			}
			if line := a.waitCaption(w); line != "" {
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").MaxLines(2)
			}
		})
	})
}

// forecastBand says when the user will be needed next: defaults taking
// effect and waits coming due. It is left out when there is nothing to say.
func (a *App) forecastBand(c *ui.Context, b store.Board) {
	t := a.T
	type chip struct {
		key, text string
		sc        theme.StateColors
	}
	var chips []chip
	for _, task := range b.Lanes[store.LaneNeedsYou] {
		d := a.S.PendingDecision(task.ID)
		if d == nil {
			continue
		}
		at := store.ParseTime(d.DefaultAt)
		if at.IsZero() || !d.Reversible || d.DefaultOption != "go" {
			continue
		}
		label := d.GoLabel
		if label == "" {
			label = a.L.T("decision.go")
		}
		chips = append(chips, chip{task.ID, a.when(at) + " " + a.L.T("decision.default.label", label) + " · " + task.Title(), t.NeedsYou})
	}
	for _, task := range b.Lanes[store.LaneWaiting] {
		if r := a.waitReason(task); r != "" {
			chips = append(chips, chip{task.ID, task.Title() + " · " + r, t.Waiting})
		}
	}
	for _, w := range a.looseWaiters() {
		if at := store.ParseTime(w.At); !at.IsZero() {
			chips = append(chips, chip{"w:" + w.WaiterID, a.when(at) + " · " + w.Reason, t.Waiting})
		}
	}
	if len(chips) == 0 {
		return
	}
	// Plain words, one per coming moment, in the state's ink: no capsules.
	ui.Row(c.Key("forecast")).Gap(t.S5).Wrap().Padding(t.S3, t.S4).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("onhand.forecast")).FontSize(t.SM).FontWeight(800).TextColor(t.InkMuted)
		for _, ch := range chips {
			ui.Text(c.Key(ch.key), ch.text).FontSize(t.SM).TextColor(ch.sc.Ink)
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
			a.doneList(c, tasks)
		}
	})
}

// whereWhy is where a task runs and why there, in one short muted line
// ("Codex · MacBook · 你的规则「后端用 Codex」"). The model, the repo, the
// branch and the rest of the reason are in the opened task's Details.
func (a *App) whereWhy(task *store.Task) string {
	where := ""
	if p := task.Place(); p.Kind != "" {
		where = a.device(p.Device)
	}
	return strings.Join(nonEmpty(harnessName(task.Harness()), where, firstClause(task.BodyReason())), " · ")
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
// tint like the ask in the conversation: the task's title as a small link
// (the way into the task), the question, its default and countdown,
// Reply… / Hold / Go, and where it runs and why in one muted line.
func (a *App) needsCard(c *ui.Context, task *store.Task) {
	t := a.T
	d := a.S.PendingDecision(task.ID)
	ui.Column(c).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			title := task.Title()
			if p := task.Project(); p != "" {
				title = p + " · " + title
			}
			l := ui.Text(c, title+" ›").FontSize(t.SM).FontWeight(800).TextColor(t.NeedsYou.Ink).Grow(1).MinWidth(0).SingleLine().
				Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
			if l.Hovered() || l.Pressed() {
				l.Underline()
			}
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
		rep := task.Report()
		q := ""
		if d != nil {
			q = d.Question
		} else if rep != nil && len(rep.Questions) > 0 {
			q = rep.Questions[0].Text
		}
		if q != "" {
			a.heading(c, autospace(q), t.XL).LineHeight(1.35)
		}
		if rep != nil && rep.Summary != "" && rep.Summary != q {
			ui.Text(c, rep.Summary).FontSize(t.SM).LineHeight(1.6).TextColor(t.InkSoft).MaxLines(4).Tooltip(rep.Summary)
		}
		if d != nil {
			a.countdown(c, d)
			a.decisionButtons(c, d, decisionStyle{height: 48, quietBg: t.NeedsYou.Surface})
		}
		if line := a.whereWhy(task); line != "" {
			ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Tooltip(line)
		}
	})
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

// countdown is the default's bar: how much of the wait has passed.
func (a *App) countdown(c *ui.Context, d *store.DecisionState) {
	t := a.T
	left, ok := a.defaultIn(d)
	label := a.L.T("decision.default.hold")
	if !d.Reversible {
		label = a.L.T("decision.no_default")
	}
	frac := float32(0)
	right := ""
	if ok && d.DefaultOption == "go" {
		g := d.GoLabel
		if g == "" {
			g = a.L.T("decision.go")
		}
		label = a.L.T("decision.default.label", g)
		total := store.ParseTime(d.DefaultAt).Sub(a.decisionTime(d))
		if total > 0 {
			frac = 1 - float32(left)/float32(total)
		}
		right = a.duration(max(left, 0))
		c.After(min(max(left%time.Minute, time.Second), time.Minute))
	}
	ui.Column(c).Gap(t.S2).Children(func() {
		ui.Row(c).Children(func() {
			ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink).Grow(1)
			if right != "" {
				ui.Text(c, right).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
			}
		})
		if ok {
			ui.Box(c).Height(8).Radius(4).Background(t.NeedsYou.Dot.Alpha(0.22)).Children(func() {
				ui.Box(c).Height(8).Radius(4).Background(t.Accent).WidthPercent(min(max(frac, 0.02), 1) * 100)
			})
		}
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
	card.Children(func() {
		ui.Text(c, task.Title()).FontSize(t.MD).FontWeight(800)
		if u := task.Card; u != nil && u.Until != nil && u.Until.State == "on" {
			// A keep-going loop (D113): its tries, then where it stands.
			a.beads(c, u.Until, 22)
			ui.Text(c, a.untilLine(u.Until)).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(3)
		} else if rep := task.Report(); rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(3)
		} else if r := a.waitReason(task); r != "" {
			ui.Text(c, r).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		}
		meta := []string{a.whereWhy(task)}
		if task.Card != nil && task.Card.FromRoutine != nil {
			meta = append([]string{a.L.T("routine.from", task.Card.FromRoutine.Name)}, meta...)
		}
		if task.Card != nil && task.Card.UpdatedAt != "" {
			meta = append(meta, a.L.T("onhand.reported", a.ago(task.Card.UpdatedAt)))
		}
		if line := strings.Join(nonEmpty(meta...), " · "); line != "" {
			ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
		}
	})
}

func (a *App) waitingCard(c *ui.Context, task *store.Task) {
	t := a.T
	card := ui.Column(c).Padding(t.S4, t.S4).Gap(t.S2).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	a.cardLink(c, card, task)
	card.Children(func() {
		ui.Text(c, task.Title()).FontSize(t.MD).FontWeight(800)
		reason := a.waitReason(task)
		if reason == "" {
			reason = a.stateLabel(protocol.Blocked)
		} else {
			reason = a.L.T("onhand.waiting.for", reason)
		}
		w := a.S.WaiterFor(task.ID)
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if w != nil && (w.Check != nil || w.Event != nil) {
				a.waitBubble(c, waitGlyph(w.Check, w.Event), 36)
			} else {
				a.glyph(c, 18, drawClock(t.InkMuted))
			}
			ui.Text(c, reason).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Grow(1).MinWidth(0)
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
					ui.Text(c, task.Title()).FontSize(t.MD).FontWeight(700).Grow(1).MinWidth(0).MaxLines(2)
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
	ui.Column(c).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.avatar(c, theme.NeedsYou, 32)
			ui.Text(c, a.S.PersonaName).FontSize(t.SM).FontWeight(800).TextColor(t.NeedsYou.Ink)
		})
		a.heading(c, autospace(d.Question), t.XL).LineHeight(1.35)
		if d.RoutineID != "" {
			a.routineFacts(c, d.RoutineID, t.NeedsYou.Ink)
		}
		a.countdown(c, d)
		a.decisionButtons(c, d, decisionStyle{height: 48, quietBg: t.NeedsYou.Surface})
	})
}
