package views

import (
	"fmt"
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
				var defaults []*store.DecisionState
				for _, task := range b.Lanes[store.LaneNeedsYou] {
					if d := a.S.PendingDecision(task.ID); d != nil && d.Pending == "" {
						defaults = append(defaults, d)
					}
				}
				if len(defaults) > 0 && a.button(c, a.L.T("decision.goall", len(defaults)), btnPrimary, 48, t.Surface) {
					for _, d := range defaults {
						a.Decide(d.DecisionID, d.DefaultOption, "")
					}
				}
			})
			a.countsBand(c, b)
			ui.Row(c).Gap(20).Wrap().AlignItems(ui.Start).Children(func() {
				a.lane(c, store.LaneNeedsYou, b.Lanes[store.LaneNeedsYou], 2, 400)
				a.lane(c, store.LaneWorking, b.Lanes[store.LaneWorking], 1, 220)
				a.lane(c, store.LaneWaiting, b.Lanes[store.LaneWaiting], 1, 200)
				a.lane(c, store.LaneDone, b.Lanes[store.LaneDone], 1, 200)
			})
		})
	})
}

func (a *App) backButton(c *ui.Context) {
	t := a.T
	btn := ui.Row(c.Key("back")).Gap(10).Height(48).Padding(0, 16, 0, 10).Radius(16).Background(t.Surface).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("nav.back")).Shrink(0)
	a.press(c, btn, t.PressCard)
	btn.Children(func() {
		a.face(c, a.faceState(), 30, a.S.PersonaName)
		ui.Text(c, a.L.T("nav.back")).FontSize(14).FontWeight(700)
	})
	if btn.Clicked() {
		a.Route = RouteConversation
	}
}

func (a *App) countsBand(c *ui.Context, b store.Board) {
	t := a.T
	ui.Row(c).Gap(28).Wrap().Padding(22, 26).Radius(t.RadiusXL).Background(t.Surface).
		Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color).AlignItems(ui.End).Children(func() {
		count := func(n int, label string, sc theme.StateColors) {
			ui.Column(c.Key(label)).Gap(2).Children(func() {
				ui.Text(c, fmt.Sprint(n)).FontSize(56).FontWeight(800).LineHeight(1).TextColor(sc.Strong).FontFeatures("tnum")
				ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(sc.Ink)
			})
		}
		ui.Row(c).Gap(22).AlignItems(ui.End).Children(func() {
			count(b.Counts.NeedsYou, a.L.T("count.needs_you"), t.NeedsYou)
			count(b.Counts.Working, a.L.T("count.working"), t.Working)
			count(b.Counts.Waiting, a.L.T("count.waiting"), t.Waiting)
			count(b.Counts.DoneToday, a.L.T("count.done_today"), t.Done)
		})
		// The forecast: when each pending default takes effect.
		ui.Column(c).Grow(1).Basis(320).Gap(10).Children(func() {
			ui.Text(c, a.L.T("onhand.forecast")).FontSize(t.MD).FontWeight(800)
			ui.Row(c).Gap(8).Wrap().Children(func() {
				any := false
				for _, task := range b.Lanes[store.LaneNeedsYou] {
					d := a.S.PendingDecision(task.ID)
					if d == nil {
						continue
					}
					at := store.ParseTime(d.DefaultAt)
					text := task.Title()
					if !at.IsZero() && d.Reversible {
						label := d.GoLabel
						if label == "" {
							label = a.L.T("decision.go")
						}
						text = at.Local().Format("15:04") + " " + a.L.T("decision.default.label", label) + " · " + task.Title()
					}
					any = true
					a.forecastChip(c.Key(task.ID), text, t.NeedsYou)
				}
				for _, task := range b.Lanes[store.LaneWaiting] {
					if r := task.Reason(); r != "" {
						any = true
						a.forecastChip(c.Key(task.ID), task.Title()+" · "+r, t.Waiting)
					}
				}
				if !any {
					ui.Text(c, a.L.T("lane.empty")).FontSize(t.SM).TextColor(t.InkMuted)
				}
			})
		})
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
	ui.Column(c.Key(lane)).Grow(grow).Basis(basis).MinWidth(0).Gap(14).Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			a.pebble(c, colors[lane].Dot, 14, 16)
			ui.Text(c, a.L.T(names[lane])).FontSize(20).FontWeight(800)
			if lane == store.LaneNeedsYou {
				ui.Text(c, a.L.T("lane.needs_you.hint")).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		if len(tasks) == 0 {
			ui.Box(c).Padding(16, 18).Radius(22).Border(2, t.LineSoft).BorderStyle(ui.BorderDashed).Children(func() {
				ui.Text(c, a.L.T("lane.empty")).FontSize(t.SM).TextColor(t.InkMuted)
			})
			return
		}
		switch lane {
		case store.LaneNeedsYou:
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
				ui.Text(c, a.L.T("time.opened", a.duration(a.Now().Sub(at)))).Font(t.Mono).FontSize(t.XS).FontWeight(700).TextColor(t.OnAccent)
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
				ui.Text(c, rep.Summary).FontSize(14).LineHeight(1.6).TextColor(t.InkSoft)
			}
			if d != nil {
				a.countdown(c, d)
				a.decisionButtons(c, d, decisionStyle{height: 52, quietBg: t.Bg})
			}
			ui.Row(c).Gap(8).Wrap().Padding(10, 0, 0, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).BorderStyle(ui.BorderDashed).AlignItems(ui.Center).Children(func() {
				a.pill(c, a.metaLine(task))
				a.pill(c, a.placeLine(task.Place()))
				ui.Spacer(c)
				l := ui.Text(c.Key("open"), a.L.T("onhand.open")).FontSize(t.SM).FontWeight(700).Cursor(ui.CursorPointer).Role(ui.RoleLink)
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
		} else if r := task.Reason(); r != "" {
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
		if r := task.Reason(); r != "" {
			ui.Text(c, a.L.T("onhand.waiting.for", r)).FontSize(t.SM).FontWeight(700).TextColor(t.Waiting.Ink)
		}
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
			row := ui.Row(c.Key(task.ID)).Gap(10).Padding(12, 0).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title())
			row.Children(func() {
				ui.Text(c, task.Title()).FontSize(14).FontWeight(700).Grow(1).MinWidth(0).SingleLine()
				switch task.Attention() {
				case protocol.DoneClaimed:
					ui.Box(c).Padding(3, 8).Radius(t.Pill).Background(t.Waiting.Surface).Children(func() {
						ui.Text(c, a.L.T("onhand.checking")).FontSize(11).FontWeight(700).TextColor(t.Waiting.Ink)
					})
				case protocol.Failed:
					ui.Box(c).Padding(3, 8).Radius(t.Pill).Background(t.Failed.Surface).Children(func() {
						ui.Text(c, a.stateLabel(protocol.Failed)).FontSize(11).FontWeight(700).TextColor(t.Failed.Ink)
					})
				default:
					if rep := task.Report(); rep != nil && len(rep.Evidence) > 0 {
						ui.Text(c, a.L.T("living.evidence")).FontSize(t.XS).FontWeight(700).Underline()
					}
				}
			})
			if row.Clicked() {
				a.OpenTask(task.ID)
			}
		}
	})
}
