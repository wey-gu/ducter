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
				ui.Row(c.Key("calm")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					a.glyph(c, 20, drawCheck(t.Done.Ink))
					ui.Text(c, line).FontSize(t.LG).TextColor(t.InkSoft)
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
		if at := store.ParseTime(w.At); !at.IsZero() {
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
	ui.Row(c).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusMD).Border(1.5, t.Waiting.Dot.Mix(t.Surface, 0.4)).BorderStyle(ui.BorderDashed).AlignItems(ui.Start).
		Label(w.Reason).Children(func() {
		a.glyph(c, 18, drawClock(t.InkMuted))
		// Already under the Waiting lane's header: the reason alone, and
		// its time under it (a narrow lane has no room for both on a line).
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			ui.Text(c, w.Reason).FontSize(t.SM).FontWeight(700).TextColor(t.Waiting.Ink).MaxLines(3)
			if at := store.ParseTime(w.At); !at.IsZero() {
				ui.Text(c, a.when(at)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum")
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
	ui.Row(c.Key("forecast")).Gap(t.S5).Wrap().AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("onhand.forecast")).FontSize(t.SM).FontWeight(800).TextColor(t.Ink)
		for _, ch := range chips {
			ui.Text(c.Key(ch.key), ch.text).FontSize(t.SM).TextColor(ch.sc.Ink)
		}
	})
}

func (a *App) lane(c *ui.Context, lane store.Lane, tasks []*store.Task, grow, basis float32) {
	t := a.T
	names := [...]string{"lane.needs_you", "lane.working", "lane.waiting", "lane.done"}
	colors := [...]theme.StateColors{t.NeedsYou, t.Working, t.Waiting, t.Done}
	ui.Column(c.Key(lane)).Grow(grow).Basis(basis).MinWidth(0).MaxWidth(basis * 2.2).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T(names[lane])).FontSize(t.XL).FontWeight(800)
			n := len(tasks)
			switch lane {
			case store.LaneNeedsYou:
				n += len(a.partnerDecisions())
			case store.LaneWaiting:
				n += len(a.looseWaiters())
			}
			ui.Text(c, fmt.Sprint(n)).FontSize(t.XL).FontWeight(800).TextColor(colors[lane].Ink).FontFeatures("tnum")
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

func (a *App) metaLine(task *store.Task) string {
	s := a.bodyLine(task)
	if r := task.BodyReason(); r != "" {
		if s != "" {
			s += " · "
		}
		s += r
	}
	return s
}

// needsCard is a task's ask on On hand: the same tinted card as in the
// conversation (the task's title as plain small words, the question, its
// default and its countdown, Go / Hold / Reply… / Details), then where it
// runs in muted words. No colored band, no capsules (D73).
func (a *App) needsCard(c *ui.Context, task *store.Task) {
	t := a.T
	d := a.S.PendingDecision(task.ID)
	ui.Column(c).Padding(t.S4, t.S5).Gap(t.S3).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			title := task.Title()
			if p := task.Project(); p != "" {
				title = p + " · " + title
			}
			// The title is the way into the task.
			l := ui.Text(c, title+" ›").FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink).Grow(1).MinWidth(0).MaxLines(2).
				Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
			if l.Hovered() {
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
				ui.Text(c, opened).FontSize(t.XS).TextColor(t.NeedsYou.Ink).Shrink(0)
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
			ui.Text(c, q).FontSize(t.LG).LineHeight(1.5).FontWeight(500)
		}
		if rep != nil && rep.Summary != "" && rep.Summary != q {
			ui.Text(c, rep.Summary).FontSize(t.SM).LineHeight(1.6).TextColor(t.InkSoft).MaxLines(4).Tooltip(rep.Summary)
		}
		if d != nil {
			a.countdown(c, d)
			a.decisionButtons(c, d, decisionStyle{height: t.ControlMD, quietBg: t.Surface})
		}
		if meta := strings.Join(nonEmpty(a.metaLine(task), a.placeLine(task.Place())), " · "); meta != "" {
			ui.Text(c, meta).FontSize(t.XS).TextColor(t.InkMuted)
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
			ui.Box(c).Height(6).Radius(3).Background(t.Surface.Mix(t.NeedsYou.Surface, 0.5)).Children(func() {
				ui.Box(c).Height(6).Radius(3).Background(t.Accent).WidthPercent(min(max(frac, 0.02), 1) * 100)
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
		if rep := task.Report(); rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(3)
		} else if r := a.waitReason(task); r != "" {
			ui.Text(c, r).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		}
		meta := a.metaLine(task)
		if task.Card != nil && task.Card.UpdatedAt != "" {
			meta += " · " + a.L.T("onhand.reported", a.ago(task.Card.UpdatedAt))
		}
		ui.Text(c, meta).FontSize(t.XS).TextColor(t.InkMuted)
	})
}

func (a *App) waitingCard(c *ui.Context, task *store.Task) {
	t := a.T
	card := ui.Column(c).Padding(t.S4, t.S4).Gap(t.S2).Radius(t.RadiusLG).Background(t.SurfaceRaised).Border(2, t.Waiting.Dot.Mix(t.Surface, 0.4)).BorderStyle(ui.BorderDashed)
	a.cardLink(c, card, task)
	card.Children(func() {
		ui.Text(c, task.Title()).FontSize(t.MD).FontWeight(800)
		reason := a.waitReason(task)
		if reason == "" {
			reason = a.stateLabel(protocol.Blocked)
		} else {
			reason = a.L.T("onhand.waiting.for", reason)
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 18, drawClock(t.Waiting.Ink))
			ui.Text(c, reason).FontSize(t.SM).FontWeight(700).TextColor(t.Waiting.Ink).Grow(1).MinWidth(0)
		})
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
	ui.Column(c).Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.avatar(c, theme.NeedsYou, 32)
			ui.Text(c, a.S.PersonaName).FontSize(t.SM).FontWeight(800).TextColor(t.NeedsYou.Ink)
		})
		ui.Text(c, d.Question).FontSize(t.LG).LineHeight(1.5).FontWeight(500)
		a.countdown(c, d)
		a.decisionButtons(c, d, decisionStyle{height: 48, quietBg: t.Surface})
	})
}
