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
	ui.Scroll(c).Grow(1).Children(func() {
		ui.Column(c).Gap(20).Padding(20, 32, 32, 32).Children(func() {
			ui.Row(c).Gap(16).Wrap().AlignItems(ui.Center).Children(func() {
				a.backButton(c)
				ui.Text(c, a.L.T("onhand.title")).FontSize(t.Title).FontWeight(800).LetterSpacing(-0.5).Grow(1)
				// 都按默认 / Go on all defaults: only worth a button with two or more.
				if open := a.defaultable(); len(open) >= 2 && a.button(c, a.L.T("decision.goall", len(open)), btnPrimary, 48, t.Surface) {
					a.GoOnAllDefaults()
				}
			})
			if a.boardEmpty(b) && len(a.partnerDecisions()) == 0 {
				ui.Column(c.Key("empty")).Padding(28, 28).Gap(14).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).AlignItems(ui.Center).Children(func() {
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
				ui.Row(c.Key("calm")).Gap(12).Padding(16, 20).Radius(t.RadiusLG).Background(t.Done.Surface).AlignItems(ui.Center).Children(func() {
					ui.Box(c).Size(26, 26).Radius(9).Background(t.Surface).Draw(drawCheck(t.Done.Ink)).Shrink(0)
					ui.Text(c, line).FontSize(t.MD).FontWeight(600).TextColor(t.Done.Ink)
				})
			}
			ui.Row(c).Gap(20).Wrap().AlignItems(ui.Start).Children(func() {
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
	ui.Row(c).Gap(10).Padding(10, 14).Radius(16).Border(1.5, t.Waiting.Dot.Mix(t.Surface, 0.4)).BorderStyle(ui.BorderDashed).AlignItems(ui.Center).
		Label(w.Reason).Children(func() {
		ui.Box(c).Size(24, 24).Radius(8).Background(t.Waiting.Surface).Draw(drawClock(t.Waiting.Ink)).Shrink(0)
		ui.Text(c, a.L.T("onhand.waiting.for", w.Reason)).FontSize(t.SM).FontWeight(700).TextColor(t.Waiting.Ink).Grow(1).MinWidth(0).MaxLines(3)
		if at := store.ParseTime(w.At); !at.IsZero() {
			ui.Text(c, a.when(at)).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
		}
	})
}

func (a *App) backButton(c *ui.Context) {
	t := a.T
	btn := ui.Row(c.Key("back")).Gap(10).Height(48).Padding(0, 16, 0, 10).Radius(16).Background(t.Surface).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("nav.back")).Shrink(0)
	a.press(c, btn, t.PressCard)
	btn.Children(func() {
		a.avatar(c, a.presence(c), 34)
		ui.Text(c, a.L.T("nav.back")).FontSize(14).FontWeight(700)
	})
	if btn.Clicked() {
		a.Route = RouteConversation
	}
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
	ui.Row(c.Key("forecast")).Gap(12).Wrap().Padding(14, 18).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("onhand.forecast")).FontSize(t.SM).FontWeight(800).TextColor(t.InkMuted)
		for _, ch := range chips {
			a.forecastChip(c.Key(ch.key), ch.text, ch.sc)
		}
	})
}

func (a *App) forecastChip(c *ui.Context, text string, sc theme.StateColors) {
	ui.Row(c).Gap(6).Padding(4, 10, 4, 8).Radius(8).Background(sc.Surface).AlignItems(ui.Center).Children(func() {
		a.pebble(c, sc.Dot, 10, 12)
		ui.Text(c, text).FontSize(a.T.XS).FontWeight(700).TextColor(sc.Ink).SingleLine()
	})
}

func (a *App) lane(c *ui.Context, lane store.Lane, tasks []*store.Task, grow, basis float32) {
	t := a.T
	names := [...]string{"lane.needs_you", "lane.working", "lane.waiting", "lane.done"}
	colors := [...]theme.StateColors{t.NeedsYou, t.Working, t.Waiting, t.Done}
	ui.Column(c.Key(lane)).Grow(grow).Basis(basis).MinWidth(0).MaxWidth(basis * 2.2).Gap(14).Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			a.pebble(c, colors[lane].Dot, 14, 16)
			ui.Text(c, a.L.T(names[lane])).FontSize(20).FontWeight(800)
			n := len(tasks)
			switch lane {
			case store.LaneNeedsYou:
				n += len(a.partnerDecisions())
			case store.LaneWaiting:
				n += len(a.looseWaiters())
			}
			ui.Text(c, fmt.Sprint(n)).FontSize(20).FontWeight(800).TextColor(colors[lane].Strong).FontFeatures("tnum")
		})
		waiters := []*protocol.Waiter(nil)
		if lane == store.LaneWaiting {
			waiters = a.looseWaiters()
		}
		if len(tasks) == 0 && len(waiters) == 0 && lane != store.LaneNeedsYou {
			ui.Box(c).Padding(16, 18).Radius(22).Border(2, t.LineSoft).BorderStyle(ui.BorderDashed).Children(func() {
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

func (a *App) needsCard(c *ui.Context, task *store.Task) {
	t := a.T
	d := a.S.PendingDecision(task.ID)
	card := ui.Column(c).Radius(t.RadiusXL).Background(t.Surface).Shadow(0, 5, 0, 0, hexShade(t)).Clip()
	a.lift(c, card, 3)
	card.Children(func() {
		ui.Row(c).Gap(10).Padding(14, 22).Background(t.Accent).AlignItems(ui.Center).Children(func() {
			title := task.Title()
			if p := task.Project(); p != "" {
				title = p + " · " + title
			}
			ui.Text(c, title).FontSize(16).FontWeight(800).TextColor(t.OnAccent).Grow(1).SingleLine()
			if at := store.ParseTime(task.OpenedAt); !at.IsZero() {
				ui.Text(c, a.L.T("time.opened", a.duration(a.Now().Sub(at)))).FontSize(t.XS).FontWeight(700).TextColor(t.OnAccent).Shrink(0)
			}
		})
		ui.Column(c).Padding(20, 22, 22, 22).Gap(14).Children(func() {
			rep := task.Report()
			q := ""
			if d != nil {
				q = d.Question
			} else if rep != nil && len(rep.Questions) > 0 {
				q = rep.Questions[0].Text
			}
			if q != "" {
				ui.Text(c, q).FontSize(19).LineHeight(1.55).FontWeight(500)
			}
			if rep != nil && rep.Summary != "" && rep.Summary != q {
				ui.Text(c, rep.Summary).FontSize(14).LineHeight(1.6).TextColor(t.InkSoft).MaxLines(4).Tooltip(rep.Summary)
			}
			if d != nil {
				a.countdown(c, d)
				a.decisionButtons(c, d, decisionStyle{height: 52, quietBg: t.Bg})
			}
			ui.Row(c).Gap(12).Padding(12, 0, 0, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).BorderStyle(ui.BorderDashed).AlignItems(ui.Center).Children(func() {
				ui.Row(c).Gap(8).Wrap().Grow(1).MinWidth(0).Children(func() {
					a.pill(c, a.metaLine(task))
					a.pill(c, a.placeLine(task.Place()))
				})
				l := ui.Text(c.Key("open"), a.L.T("onhand.open")).FontSize(t.SM).FontWeight(800).Cursor(ui.CursorPointer).Role(ui.RoleLink).Shrink(0).Padding(6, 4)
				if l.Hovered() {
					l.TextColor(t.NeedsYou.Ink)
				}
				if l.Clicked() {
					a.OpenTask(task.ID)
				}
			})
		})
	})
}

func hexShade(t *theme.Tokens) ui.Color { return t.NeedsYou.Surface.Mix(t.NeedsYou.Strong, 0.25) }

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
	ui.Column(c).Gap(6).Children(func() {
		ui.Row(c).Children(func() {
			ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink).Grow(1)
			if right != "" {
				ui.Text(c, right).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
			}
		})
		if ok {
			ui.Box(c).Height(8).Radius(4).Background(t.NeedsYou.Surface).Children(func() {
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
	card := ui.Column(c).Padding(16, 18).Gap(10).Radius(22).Background(t.Surface).Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color)
	a.cardLink(c, card, task)
	card.Children(func() {
		ui.Text(c, task.Title()).FontSize(16).FontWeight(800)
		if rep := task.Report(); rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(3)
		} else if r := a.waitReason(task); r != "" {
			ui.Text(c, r).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		}
		a.workingBar(c)
		meta := a.metaLine(task)
		if task.Card != nil && task.Card.UpdatedAt != "" {
			meta += " · " + a.L.T("onhand.reported", a.ago(task.Card.UpdatedAt))
		}
		ui.Text(c, meta).FontSize(t.XS).TextColor(t.InkMuted)
	})
}

// workingBar is an indeterminate bar: a short pill gliding along.
func (a *App) workingBar(c *ui.Context) {
	t := a.T
	still := c.Preferences().ReduceMotion
	bar := ui.Box(c).Height(6).Radius(3).Background(t.Working.Surface).Clip()
	now := c.Now()
	bar.Draw(func(p *ui.Painter, r ui.Rect) {
		w := r.W * 0.3
		x := r.X + (r.W-w)*0.5
		if !still {
			ph := float64(now.UnixMilli()%2400) / 2400
			x = r.X - w + float32(ph)*(r.W+w)
		}
		p.Fill(ui.Rect{X: x, Y: r.Y, W: w, H: r.H}, t.Working.Dot, 3)
	})
	if !still {
		c.After(33 * time.Millisecond)
	}
}

func (a *App) waitingCard(c *ui.Context, task *store.Task) {
	t := a.T
	card := ui.Column(c).Padding(16, 18).Gap(8).Radius(22).Background(t.SurfaceRaised).Border(2, t.Waiting.Dot.Mix(t.Surface, 0.4)).BorderStyle(ui.BorderDashed)
	a.cardLink(c, card, task)
	card.Children(func() {
		ui.Text(c, task.Title()).FontSize(16).FontWeight(800)
		reason := a.waitReason(task)
		if reason == "" {
			reason = a.stateLabel(protocol.Blocked)
		} else {
			reason = a.L.T("onhand.waiting.for", reason)
		}
		ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Size(22, 22).Radius(7).Background(t.Waiting.Surface).Draw(drawClock(t.Waiting.Ink)).Shrink(0)
			ui.Text(c, reason).FontSize(t.SM).FontWeight(700).TextColor(t.Waiting.Ink).Grow(1).MinWidth(0)
		})
		if rep := task.Report(); rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
		}
	})
}

func (a *App) doneList(c *ui.Context, tasks []*store.Task) {
	t := a.T
	ui.Column(c).Padding(6, 18).Radius(22).Background(t.Surface).Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color).
		Dividers(1, t.LineSoft).Children(func() {
		for _, task := range tasks {
			row := ui.Column(c.Key(task.ID)).Gap(6).Padding(12, 0).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title())
			row.Children(func() {
				ui.Row(c).Gap(8).AlignItems(ui.Start).Children(func() {
					ui.Text(c, task.Title()).FontSize(14).FontWeight(700).Grow(1).MinWidth(0).MaxLines(2)
					switch task.Attention() {
					case protocol.DoneClaimed:
						ui.Box(c).Padding(3, 8).Radius(t.Pill).Background(t.Waiting.Surface).Shrink(0).Children(func() {
							ui.Text(c, a.L.T("onhand.checking")).FontSize(11).FontWeight(700).TextColor(t.Waiting.Ink)
						})
					case protocol.Failed:
						ui.Box(c).Padding(3, 8).Radius(t.Pill).Background(t.Failed.Surface).Shrink(0).Children(func() {
							ui.Text(c, a.stateLabel(protocol.Failed)).FontSize(11).FontWeight(700).TextColor(t.Failed.Ink)
						})
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
				if ev, ok := headlineEvidence(rep.Evidence); ok {
					ui.Row(c).Children(func() { a.evidenceChip(c.Key("ev"), task, ev) })
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
	ui.Column(c).Padding(20, 22).Gap(12).Radius(t.RadiusXL).Background(t.NeedsYou.Surface).Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			a.avatar(c, theme.NeedsYou, 32)
			ui.Text(c, a.S.PersonaName).FontSize(t.SM).FontWeight(800).TextColor(t.NeedsYou.Ink)
		})
		ui.Text(c, d.Question).FontSize(18).LineHeight(1.5).FontWeight(500)
		a.countdown(c, d)
		a.decisionButtons(c, d, decisionStyle{height: 48, quietBg: t.Surface})
	})
}
