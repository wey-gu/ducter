package views

// Work over time on the desktop (D112–D115): what a wait waits for (a small
// clay thing in a bubble), the try strip of a keep-going loop, the routine
// shelf at the bottom of On hand and a routine's proposal card, and the
// waiting part of an opened task. Copy comes only from i18n.

import (
	"fmt"
	"math"
	"path"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// waitGlyph is which clay thing a wait shows: a PR, a cloud (CI, anything
// online), an envelope, a clock, a file.
func waitGlyph(check *protocol.CheckSpec, event *protocol.EventSpec) string {
	if event != nil {
		if event.Service == "gmail" || strings.Contains(event.Trigger, "mail") || strings.Contains(event.Trigger, "message") {
			return "wait_mail"
		}
		return "wait_ci"
	}
	if check == nil || len(check.Argv) == 0 {
		return "wait_clock"
	}
	cmd := path.Base(check.Argv[0])
	if cmd == "gh" && len(check.Argv) > 2 && check.Argv[1] == "pr" && check.Argv[2] != "checks" {
		return "wait_pr"
	}
	switch cmd {
	case "test", "stat", "ls", "cat", "head", "tail", "wc", "grep":
		return "wait_file"
	}
	return "wait_ci"
}

// waitBubble is the bubble with what it waits for. Still: it never moves
// on its own (D77); only the character breathes.
func (a *App) waitBubble(c *ui.Context, glyph string, size float32) ui.Element {
	t := a.T
	return ui.Box(c.Key("bub:"+glyph)).Size(size, size*0.9).Radius(size).Background(t.SurfaceRaised).
		Shadow(0, 2, 0, 0, t.Line2).Justify(ui.Center).AlignItems(ui.Center).Shrink(0).AccessHidden(true).Children(func() {
		if bmp := theme.Clay(glyph); bmp != nil {
			ui.Image(c, bmp).Size(size*0.64, size*0.64)
		}
	})
}

// waitBadgeW is the opened task's thought bubble's width (waitBadge).
const waitBadgeW = 40

// waitBadge is what an opened task waits for, a thought bubble by its
// face's head (D112, D353): the cream bubble with its clay thing, a small
// round tail at its lower left toward the head, so it reads as the face's
// thought, never as a sticker on it. Still, like waitBubble.
func (a *App) waitBadge(c *ui.Context, glyph string) ui.Element {
	t := a.T
	const w, h, tail = waitBadgeW, 36, 9
	return ui.Box(c.Key("badge:"+glyph)).Size(w, h+tail/2).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		// The tail first, under the bubble's lower left.
		tx, ty := r.X-1, r.Y+h-tail+3
		p.Fill(ui.Rect{X: tx, Y: ty + 1, W: tail, H: tail}, t.Line2, tail/2)
		p.Fill(ui.Rect{X: tx, Y: ty, W: tail, H: tail}, t.SurfaceRaised, tail/2)
	}).Children(func() {
		ui.Box(c).Size(w, h).Radius(h).Background(t.SurfaceRaised).Shadow(0, 2, 0, 0, t.Line2).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
			if bmp := theme.Clay(glyph); bmp != nil {
				ui.Image(c, bmp).Size(26, 26)
			}
		})
	})
}

// waitCadence is how often it looks, for How it checks only ("每 5 分钟看一次"),
// and apart, when it last looked ("上次是 11:40"), or "" (D291).
func (a *App) waitCadence(w *protocol.Waiter) (often, last string) {
	switch {
	case w.Event != nil:
		often = a.L.T("wait.each_new")
	case w.Check != nil:
		often = a.L.T("wait.every", max(1, int((w.EveryMs+30_000)/60_000)))
	}
	if at := store.ParseTime(w.LastLookAt); !at.IsZero() {
		last = a.tp("wait.last", (a.when(at)))
	}
	return often, last
}

// waitCaption is what a wait's card says in words: its deadline, or when a timer is due.
func (a *App) waitCaption(w *protocol.Waiter) string {
	if at := store.ParseTime(w.Until); !at.IsZero() {
		return a.tp("wait.until.cap", (a.when(at)))
	}
	if at := store.ParseTime(w.At); !at.IsZero() && w.Check == nil && w.Event == nil {
		return a.L.T("waiter.at", a.when(at))
	}
	return ""
}

// waitLine names what it waits for as awaited: "等 PR #1592 通过".
func (a *App) waitLine(reason string) string {
	r := strings.TrimSpace(reason)
	if a.L.Han() && r != "" && (r[0] < 0x80) {
		r = " " + r
	}
	// "Waiting until the domain renewal email arrives": a capital that only starts the sentence goes.
	if a.L.Cased() && len(r) > 1 && r[0] >= 'A' && r[0] <= 'Z' && r[1] >= 'a' && r[1] <= 'z' {
		r = strings.ToLower(r[:1]) + r[1:]
	}
	return a.L.T("wait.line", r)
}

// groove is a wait's deadline: a sunken clay groove from when it started
// to its deadline, the little Ducter on its bench sitting at now. Drawn
// still; it moves only as time does.
func (a *App) groove(c *ui.Context, w *protocol.Waiter, big bool) {
	t := a.T
	from, to := store.ParseTime(w.ArmedAt), store.ParseTime(w.Until)
	if from.IsZero() || to.IsZero() || !to.After(from) {
		return
	}
	f := float32(a.Now().Sub(from)) / float32(to.Sub(from))
	f = min(1, max(0, f))
	// Ducter moves only as time does: look again after about a three-hundredth of the wait.
	c.After(max(time.Second, to.Sub(from)/300))
	h, gh, who := float32(30), float32(8), float32(26)
	if big {
		h, gh, who = 40, 10, 36
	}
	face := theme.Face(theme.Waiting, who*2)
	ui.Box(c.Key("groove")).Height(h).Grow(1).MinWidth(80).Role(ui.RoleImage).Label(a.waitCaption(w)).Draw(func(p *ui.Painter, r ui.Rect) {
		y := r.Y + h - gh - 4
		w0 := r.W - 10
		p.Fill(ui.Rect{X: r.X, Y: y, W: w0, H: gh}, t.Sunken, gh/2)
		p.Fill(ui.Rect{X: r.X, Y: y, W: w0 * f, H: gh}, t.Waiting.Surface, gh/2)
		end := gh + 8
		p.Fill(ui.Rect{X: r.X + w0 - end/2, Y: y + gh/2 - end/2 + 2, W: end, H: end}, t.Line2, end/2)
		p.Fill(ui.Rect{X: r.X + w0 - end/2, Y: y + gh/2 - end/2, W: end, H: end}, t.Surface, end/2)
		if face != nil {
			x := r.X + w0*f - who/2
			p.Image(face, ui.Rect{X: max(r.X-4, x), Y: y + gh - who, W: who, H: who}, ui.Contain)
		}
	})
	if big {
		// Captions by time: "now" under Ducter. Near the start it takes the start's place
		// (the head says when it started); near the deadline it gives way.
		cap := func(s string) ui.Element {
			return ui.Text(c, s).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
		}
		nowText := a.tp("wait.now", (i18n.Clock(a.Now())))
		start := a.tp("wait.started", (i18n.Clock(from)))
		if f < 0.22 {
			start = nowText
		}
		if f >= 0.22 && f <= 0.62 {
			ui.Row(c.Key("tnow")).Children(func() {
				ui.Box(c).Grow(f).Basis(0)
				cap(nowText).TextColor(t.InkSoft)
				ui.Box(c).Grow(1 - f).Basis(0)
			})
		}
		ui.Row(c.Key("tcap")).Justify(ui.SpaceBetween).Gap(t.S2).Children(func() {
			cap(start)
			cap(a.tp("wait.until.ask", (a.when(to))))
		})
	}
}

// calendarBadge is a routine's next run on a clay tear-off desk calendar
// (D115): the date big, its weekday (or the month for a monthly one) under
// it, a few pages behind to say it comes again.
func (a *App) calendarBadge(c *ui.Context, r *protocol.Routine, size float32) {
	t := a.T
	next := r.NextAt
	if next == "" && len(r.Upcoming) > 0 {
		next = r.Upcoming[0]
	}
	at := store.ParseTime(next)
	bmp := theme.Clay("routine_calendar")
	if at.IsZero() || bmp == nil {
		return
	}
	at = at.Local()
	big := fmt.Sprint(at.Day())
	var sub string
	if r.Trigger.Every == "month" || r.Trigger.Every == "once" {
		big = a.L.T("routine.cal.day", at.Day())
		sub = i18n.Month(a.L.Lang, at.Month())
	} else {
		sub = i18n.Weekday(a.L.Lang, at.Weekday())
	}
	w, h := size, size*1.13
	ui.Box(c.Key("cal")).Size(w, h).Shrink(0).Role(ui.RoleImage).Label(a.when(at)).Children(func() {
		ui.Image(c, bmp).Size(w, h).AccessHidden(true)
		// The page's face, under the binding, a little left of center (the pages behind).
		ui.Column(c.Key("face")).Absolute().Left(w * 0.06).Top(h * 0.31).Width(w * 0.74).AlignItems(ui.Center).Gap(0).Children(func() {
			ui.Text(c, big).FontSize(size * 0.31).LineHeight(1.05).FontWeight(800).TextColor(t.Ink).FontFeatures("tnum").AccessHidden(true)
			ui.Text(c, sub).FontSize(max(9, size*0.17)).LineHeight(1.1).TextColor(t.InkMuted).AccessHidden(true)
		})
	})
}

// nextFew is a routine's next few runs, each date its own fact (D291):
// 11/16, 11/23, 11/30 drawn apart by a.facts.
func nextFew(r *protocol.Routine) []string {
	var ds []string
	for i, x := range r.Upcoming {
		if i == 4 {
			break
		}
		ds = append(ds, i18n.MD(store.ParseTime(x)))
	}
	return ds
}

// goal is a keep-going loop's goal as everyone reads it (D115): when it can
// be counted (checks that must pass, or items a judge counted), a row of clay
// lights lit as they pass ("6 盏灯里亮了 4 盏", "16 处里好了 12 处"); when
// nothing can be counted, no picture of progress: Ducter at work and the
// latest try in one line ("第 2 次 · 还在改").
func (a *App) goal(c *ui.Context, u *protocol.Until, big bool) {
	t := a.T
	met := u.State == "met"
	n := len(u.Tries)
	if u.State == "on" {
		n++
	}
	var last *protocol.Progress
	for i := len(u.Tries) - 1; i >= 0; i-- {
		if u.Tries[i].Progress != nil {
			last = u.Tries[i].Progress
			break
		}
	}
	scale := float32(1)
	if big {
		scale = 1.6
	}
	if last != nil && last.Total > 0 {
		done := last.Done
		if met {
			done = last.Total
		}
		// More than twelve: ten lights, each a tenth.
		slots, lit := last.Total, done
		if last.Total > 12 {
			slots, lit = 10, int(float32(done)/float32(last.Total)*10+0.5)
		}
		words := a.countWords(done, last.Total, last.Unit)
		ui.Column(c.Key("goal")).Gap(t.S1).Role(ui.RoleImage).Label(words).Children(func() {
			ui.Row(c).Gap(4 * scale).AlignItems(ui.End).Children(func() {
				for i := 0; i < slots; i++ {
					name := "goal_light_off"
					if i < lit {
						name = "goal_light_on"
					}
					if bmp := theme.Clay(name); bmp != nil {
						ui.Image(c.Key(i), bmp).Size(20*scale, 24*scale).AccessHidden(true)
					}
				}
			})
			ui.Column(c).AccessHidden(true).Children(func() {
				a.facts(c, t.SM, t.InkSoft, words, a.L.T("until.n", n))
			})
		})
		return
	}
	// D291: which try, and what the latest one says, each its own element.
	try, line := "", a.L.T("until.met", len(u.Tries))
	if !met {
		try, line = a.L.T("until.n", n), a.L.T("until.now")
		if k := len(u.Tries); k > 0 {
			line = u.Tries[k-1].Summary
		}
	}
	ui.Row(c.Key("goal")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		if !met {
			if face := theme.Face(theme.Working, 26*scale*2); face != nil {
				ui.Image(c, face).Size(26*scale, 26*scale).Shrink(0).AccessHidden(true)
			}
		}
		if try != "" {
			ui.Text(c, try).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").Shrink(0)
		}
		ui.Text(c, autospace(line)).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Shrink(1).MinWidth(0)
	})
}

// countWords is "6 盏灯里亮了 4 盏" / "4 of 6 lights on", or for items a
// judge counted "16 处里好了 12 处" / "12 of 16 done".
func (a *App) countWords(done, total int, unit string) string {
	key := "until.lights"
	if unit == "items" {
		key = "until.items"
	}
	return a.L.T(key, done, total) // each table orders them (%[2]d)
}

// untilLine is a keep-going loop's line under its goal: only how it ended
// (while it runs, the goal says it).
func (a *App) untilLine(u *protocol.Until) string {
	switch u.State {
	case "met":
		return a.L.T("until.met", len(u.Tries))
	case "stopped":
		stop := u.Stop
		if stop == "" {
			stop = "max"
		}
		return a.L.T("until.stop."+stop, len(u.Tries))
	}
	return ""
}

// tryStrip is an opened task's keep-going loop: the goal first, then each
// try in a quiet line.
func (a *App) tryStrip(c *ui.Context, task *store.Task) {
	t := a.T
	if task.Card == nil || task.Card.Until == nil {
		return
	}
	u := task.Card.Until
	ui.Column(c.Key("until")).Gap(t.S3).Children(func() {
		a.heading(c, a.L.T("until.title", u.Condition), t.LG)
		a.goal(c, u, true)
		ui.Column(c.Key("tries")).Gap(2).Children(func() {
			for _, x := range u.Tries {
				words := x.Summary
				if x.Progress != nil {
					words = a.countWords(x.Progress.Done, x.Progress.Total, x.Progress.Unit)
				}
				ui.Text(c.Key(x.N), a.L.T("until.n", x.N)+"  "+words).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		ui.Text(c, a.L.T("until.rule", u.MaxTries)).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkMuted).MaxWidth(readMeasure)
		if u.State == "on" {
			ui.Row(c.Key("stop")).Children(func() {
				if a.button(c, a.L.T("until.stop"), btnText, t.ControlSM, t.Bg) {
					a.send(protocol.UntilAction{T: "until_action", TaskID: task.ID, Action: "stop"})
				}
			})
		}
	})
}

// waitRows are the opened task's Details for a keep-going loop (until) or
// for its wait: how (the check itself), how often, what it saw. D271: a
// wait's are opened under the transcript's end line, an until's under the
// page.
func (a *App) waitRows(c *ui.Context, task *store.Task, until bool, row func(string, func()), value func(string)) {
	t := a.T
	if u := task.Card; until && u != nil && u.Until != nil {
		row(a.L.T("wait.how.title"), func() {
			if u.Until.Check != nil {
				ui.Text(c, strings.Join(u.Until.Check.Argv, " ")).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
			} else {
				value(a.L.T("until.judge.report"))
			}
			ui.Text(c, a.L.T("until.stops.v", u.Until.MaxTries)).FontSize(t.SM).TextColor(t.InkMuted)
		})
	}
	w := a.S.WaiterFor(task.ID)
	if until || w == nil || (w.Check == nil && w.Event == nil) {
		return
	}
	row(a.L.T("wait.how.title"), func() {
		if w.Check != nil {
			ui.Text(c, strings.Join(w.Check.Argv, " ")).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
			// A long predicate (a regex over a clock) says nothing to a person: the
			// reason above says what it waits for; only a short one is shown.
			if d := describePredicate(w.Check.SucceedWhen); len([]rune(d)) <= 60 {
				ui.Text(c, a.L.T("wait.met_when", d)).FontSize(t.SM).TextColor(t.InkMuted)
			}
		} else {
			value(a.L.T("wait.event", w.Event.Connection, w.Event.Trigger))
		}
		if w.Judge != "" {
			ui.Text(c, a.L.T("wait.judge", w.Judge)).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
	row(a.L.T("wait.often"), func() {
		often, last := a.waitCadence(w)
		value(often)
		if last != "" {
			ui.Text(c, last).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
		}
	})
	var looks []protocol.WaiterLook
	for _, ev := range task.Events {
		if ev.Kind != protocol.KindWaiterLook {
			continue
		}
		var l protocol.WaiterLook
		if ev.Decode(&l) == nil {
			looks = append(looks, l)
		}
	}
	if len(looks) > 0 {
		row(a.L.T("wait.looks"), func() {
			value(a.L.T("wait.looks.v", max(w.Looks, len(looks)), len(looks)))
			for i, l := range looks[max(0, len(looks)-6):] {
				ui.Text(c.Key(i), l.Summary).FontSize(t.SM).TextColor(t.InkMuted).Selectable()
			}
		})
	}
}

// backOf is when a wait comes back on its own (D279), from the waiter's
// own times, never a model: its next look (a check, a polled event) or the
// time it wakes, how far along the stretch since its last look (or since
// it was armed) it is, and how long is left. Zero when it only comes back
// when something happens.
func (a *App) backOf(w *protocol.Waiter) (at time.Time, frac float32, left time.Duration, ok bool) {
	if w == nil {
		return
	}
	watches := w.Check != nil || w.Event != nil
	next := store.ParseTime(w.At)
	from := store.ParseTime(w.ArmedAt)
	if watches {
		next = store.ParseTime(w.NextLookAt)
		from = store.ParseTime(firstNonEmpty(w.LastLookAt, w.ArmedAt))
	}
	now := a.Now()
	if next.IsZero() || !next.After(now) {
		return
	}
	if !from.IsZero() && next.After(from) {
		frac = min(1, max(0, float32(now.Sub(from))/float32(next.Sub(from))))
	}
	return next, frac, next.Sub(now), true
}

// backWords is a wait's state in words (D279): "21:59 回来" / "Back at
// 21:59", "有动静就回来" / "Back when it happens"; "" when it doesn't come
// back on its own.
func (a *App) backWords(w *protocol.Waiter) string {
	if w == nil {
		return ""
	}
	if w.Limit != nil {
		return a.limitState(w)
	}
	if at, _, _, ok := a.backOf(w); ok {
		return a.tp("watch.back", a.soon(at))
	}
	if w.Event != nil {
		return a.L.T("watch.back.when")
	}
	return ""
}

// leftWords is how long until it comes back, short: "45 分" / "45 min".
func (a *App) leftWords(d time.Duration) string {
	m := int(math.Ceil(d.Minutes()))
	switch {
	case m < 60:
		return a.L.T("watch.left.min", max(1, m))
	case m < 48*60:
		return a.L.T("watch.left.hour", int(math.Round(float64(m)/60)))
	}
	return a.L.T("watch.left.day", int(math.Round(float64(m)/1440)))
}

// wakesOf is how many times a task's own wait came true (each wake in its
// transcript) and when the latest did: a loop's rounds, for the tally.
func (a *App) wakesOf(task *store.Task, blocks []Block) (int, time.Time) {
	// D320: the whole session's, from its index, not only what is held.
	if ix := task.Index; ix != nil {
		return ix.Wakes, store.ParseTime(ix.LastWakeAt)
	}
	n, last := 0, time.Time{}
	for i := range blocks {
		if blocks[i].K == "wake" {
			n++
			last = store.ParseTime(a.tsOf(task, blocks[i].Seq))
		}
	}
	return n, last
}

// drawLookRing is the watch card's clock (D279): a sunken clay groove bent
// into a circle on a clay disc; the stretch since the last look fills it
// clockwise in the wait's clay, a bead at its edge (scaled by breath). Met,
// it closes in the done clay with a drawn tick.
func (a *App) drawLookRing(frac, breath float32, met bool, tick float32) func(p *ui.Painter, r ui.Rect) {
	t := a.T
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		rad := min(r.W, r.H)/2 - 6
		var disc ui.Path
		disc.Circle(cx, cy+1, rad+4)
		p.FillPath(&disc, t.Line2)
		var top ui.Path
		top.Circle(cx, cy, rad+4)
		p.FillPath(&top, t.Surface)
		var track ui.Path
		track.Circle(cx, cy, rad)
		p.StrokePath(&track, 8, t.InkMuted.Alpha(0.16)) // a groove that holds in both themes
		col := t.Waiting.Dot
		f := frac
		if met {
			col, f = t.Done.Dot, 1
		}
		if f > 0 {
			var arc ui.Path
			n := max(2, int(math.Ceil(float64(64*f))))
			for i := 0; i <= n; i++ {
				ang := -math.Pi/2 + 2*math.Pi*float64(f)*float64(i)/float64(n)
				x, y := cx+rad*float32(math.Cos(ang)), cy+rad*float32(math.Sin(ang))
				if i == 0 {
					arc.MoveTo(x, y)
				} else {
					arc.LineTo(x, y)
				}
			}
			p.StrokePath(&arc, 8, col)
			if f < 0.999 {
				// Round ends.
				p.Fill(ui.Rect{X: cx - 4, Y: cy - rad - 4, W: 8, H: 8}, col, 4)
			}
		}
		if met {
			if tick > 0 {
				s := rad / 22
				pts := [][2]float32{{-9, 1}, {-3, 7}, {9, -6}}
				var tk ui.Path
				tk.MoveTo(cx+pts[0][0]*s, cy+pts[0][1]*s)
				// The first stroke, then the long one, drawn as it comes.
				l1 := float32(0.35)
				if tick < l1 {
					q := tick / l1
					tk.LineTo(cx+(pts[0][0]+(pts[1][0]-pts[0][0])*q)*s, cy+(pts[0][1]+(pts[1][1]-pts[0][1])*q)*s)
				} else {
					q := (tick - l1) / (1 - l1)
					tk.LineTo(cx+pts[1][0]*s, cy+pts[1][1]*s)
					tk.LineTo(cx+(pts[1][0]+(pts[2][0]-pts[1][0])*q)*s, cy+(pts[1][1]+(pts[2][1]-pts[1][1])*q)*s)
				}
				p.StrokePath(&tk, 3.5, t.Done.Ink)
			}
			return
		}
		ang := -math.Pi/2 + 2*math.Pi*float64(frac)
		bx, by := cx+rad*float32(math.Cos(ang)), cy+rad*float32(math.Sin(ang))
		br := 4 * breath
		p.Fill(ui.Rect{X: bx - br - 1.25, Y: by - br - 1.25 + 1, W: 2*br + 2.5, H: 2*br + 2.5}, t.Line2, br+1.25)
		p.Fill(ui.Rect{X: bx - br - 1.25, Y: by - br - 1.25, W: 2*br + 2.5, H: 2*br + 2.5}, col, br+1.25)
		p.Fill(ui.Rect{X: bx - br + 1.25, Y: by - br + 1.25, W: 2*br - 2.5, H: 2*br - 2.5}, t.Surface, br-1.25)
	}
}

// watchCard is an opened task resting on a wait of its own (D279): the
// ring filling toward the next look, when that is in words (one number,
// D353), how often it looks, every look so far as a pebble with the count,
// the last look and what it found (each its own fact, D291), then
// 现在就去看一次 / Check now and 不用再去看了 / Stop checking. It sits under
// the title, on its left edge. A deadline keeps its groove. When the wait
// comes true it shows the moment, then the task carries on. How it checks
// is under the end line.
func (a *App) watchCard(c *ui.Context, task *store.Task, m *taskMemo) {
	t := a.T
	still := c.Preferences().ReduceMotion
	const size = 56
	indent := float32(taskFaceW) + t.S5 // the title's left edge (taskHead)
	w := a.S.WaiterFor(task.ID)
	if w == nil {
		at, ok := a.S.Arrived[task.ID]
		since := c.Now().Sub(at)
		if !ok || since >= 2600*time.Millisecond {
			return
		}
		c.After(min(16*time.Millisecond, 2600*time.Millisecond-since))
		pop, tick := float32(1), float32(1)
		if !still {
			q := min(1, float32(since)/float32(t.Pop))
			// One overshoot on the way to full size, the tick drawn as it lands.
			pop = 0.86 + 0.14*float32(1-math.Pow(float64(1-q), 3)*math.Cos(float64(q)*math.Pi*1.6))
			tick = q
		}
		label := a.L.T("watch.met")
		ui.Row(c.Key("watch")).Gap(t.S4).AlignItems(ui.Center).MaxWidth(readMeasure+indent).Padding(0, 0, 0, indent).Role(ui.RoleStatus).Children(func() {
			ui.Box(c.Key("ring")).Size(size, size).Shrink(0).Role(ui.RoleImage).Label(label).Draw(func(p *ui.Painter, r ui.Rect) {
				d := r.W * pop
				a.drawLookRing(1, 1, true, tick)(p, ui.Rect{X: r.X + (r.W-d)/2, Y: r.Y + (r.H-d)/2, W: d, H: d})
			})
			ui.Text(c, label).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).AccessHidden(true)
		})
		return
	}
	if task.Attention() != protocol.Blocked {
		return
	}
	if w.Limit != nil {
		ui.Column(c.Key("watchlimit")).Padding(0, 0, 0, indent).MinWidth(0).Children(func() {
			a.limitCard(c, w)
		})
		return
	}
	watches := w.Check != nil || w.Event != nil
	_, frac, left, ok := a.backOf(w)
	breath := float32(1)
	if !still {
		ph := float64(c.Now().UnixMilli()%t.Breathe.Milliseconds()) / float64(t.Breathe.Milliseconds())
		breath = 1 + 0.3*0.5*float32(1-math.Cos(2*math.Pi*ph))
		c.After(50 * time.Millisecond)
	} else {
		c.After(30 * time.Second) // the ring moves only as time does
	}
	wakes, woke := a.wakesOf(task, m.blocks)
	looks := wakes + w.Looks
	lastLook := store.ParseTime(w.LastLookAt)
	last := woke
	if lastLook.After(last) {
		last = lastLook
	}
	// D291: the count, the last look, and what it found: each its own fact.
	var tally []string
	if looks == 1 {
		tally = append(tally, a.L.T("watch.tally.one"))
	} else if looks > 1 {
		tally = append(tally, a.L.T("watch.tally", looks))
	}
	if !last.IsZero() {
		tally = append(tally, a.tp("watch.last", hhmm(last)))
		if !lastLook.IsZero() && !lastLook.Before(woke) {
			tally = append(tally, a.L.T("watch.nothing"))
		}
	}
	// How it comes back.
	rhythm := a.L.T("watch.timer")
	if w.Check != nil {
		every := w.EveryMs
		if every <= 0 {
			every = 5 * 60_000
		}
		rhythm = a.L.T("wait.every", max(1, int(math.Round(float64(every)/60_000))))
	} else if w.Event != nil {
		rhythm = a.L.T("wait.each_new")
	}
	// D353: one number. A watch says when it looks next in words, the ring
	// only shows it filling; how often is said apart, quieter. A timer keeps
	// how long is left inside its ring.
	head, inside := rhythm, ""
	if ok && watches {
		head = a.nextWords(left)
	} else if ok {
		inside = a.leftWords(left)
	}
	ui.Column(c.Key("watch")).Gap(t.S4).MaxWidth(readMeasure+indent).Padding(0, 0, 0, indent).Children(func() {
		ui.Row(c.Key("watchmain")).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			ui.Box(c.Key("ring")).Size(size, size).Shrink(0).Role(ui.RoleImage).Label(a.backWords(w)).Draw(a.drawLookRing(frac, breath, false, 0)).Children(func() {
				if inside != "" {
					ui.Column(c).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
						ui.Text(c, inside).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).FontFeatures("tnum").SingleLine().AccessHidden(true)
					})
				}
			})
			ui.Column(c.Key("words")).Gap(t.S1 + 2).MinWidth(0).Shrink(1).Children(func() {
				ui.Row(c.Key("next")).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
					ui.Text(c, head).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).FontFeatures("tnum")
					if head != rhythm {
						ui.Text(c.Key("often"), rhythm).FontSize(t.SM).TextColor(t.InkSoft).FontFeatures("tnum")
					}
				})
				if len(tally) > 0 {
					ui.Row(c.Key("tally")).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
						if looks > 0 {
							a.pebbles(c, wakes, w.Looks)
						}
						for i, s := range tally {
							ui.Text(c.Key(i), s).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
						}
					})
				}
			})
		})
		if w.Until != "" {
			a.groove(c, w, true)
		}
		if watches {
			ui.Row(c.Key("waitbtns")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if a.button(c, a.L.T("wait.look"), btnSecondary, t.ControlSM, t.Bg) {
					a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "look"})
				}
				if a.button(c, a.L.T("wait.cancel"), btnText, t.ControlSM, t.Bg) {
					a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "cancel"})
				}
			})
		}
	})
}

// nextWords is when a watch looks next, in a few words (D353): "20 分钟后再看"
// / "Next look in 20 min".
func (a *App) nextWords(d time.Duration) string {
	m := int(math.Ceil(d.Minutes()))
	switch {
	case m < 60:
		return a.L.T("watch.next.min", max(1, m))
	case m < 48*60:
		return a.L.T("watch.next.hour", int(math.Round(float64(m)/60)))
	}
	return a.L.T("watch.next.day", int(math.Round(float64(m)/1440)))
}

// pebbles is every look so far (D279), the newest at the right: the ones
// that came true filled in the wait's clay, the ones that found nothing
// yet hollow; at most 12, the count is in the words beside them.
func (a *App) pebbles(c *ui.Context, came, empty int) {
	t := a.T
	all := make([]bool, 0, came+empty)
	for i := 0; i < came; i++ {
		all = append(all, true)
	}
	for i := 0; i < empty; i++ {
		all = append(all, false)
	}
	if len(all) > 12 {
		all = all[len(all)-12:]
	}
	const d, gap = 7, 3
	ui.Box(c.Key("pebbles")).Size(float32(len(all))*(d+gap)-gap, d).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		for i, x := range all {
			b := ui.Rect{X: r.X + float32(i)*(d+gap), Y: r.Y, W: d, H: d}
			if x {
				p.Fill(b, t.Waiting.Strong.Alpha(0.35), d/2)
				p.Fill(ui.Rect{X: b.X, Y: b.Y, W: d, H: d - 1}, t.Waiting.Dot, d/2)
				continue
			}
			var o ui.Path
			o.Circle(b.X+d/2, b.Y+d/2, d/2-0.75)
			p.StrokePath(&o, 1.5, t.InkMuted.Alpha(0.5))
		}
	})
}

// describePredicate is what counts as met, in a short line (checks.ts).
func describePredicate(p protocol.Predicate) string {
	want := ""
	switch {
	case p.Equals != nil:
		want = fmt.Sprintf("= %v", p.Equals)
	case len(p.OneOf) > 0:
		want = fmt.Sprintf("in %v", p.OneOf)
	case p.Contains != "":
		want = fmt.Sprintf("contains %q", p.Contains)
	case p.Matches != "":
		want = "matches /" + p.Matches + "/"
	}
	var parts []string
	if p.Path != "" {
		q := ""
		if strings.Contains(p.Path, "[]") {
			q = "every "
			if p.Any {
				q = "any "
			}
		}
		parts = append(parts, strings.TrimSpace(q+p.Path+" "+want))
	} else if want != "" {
		parts = append(parts, "output "+want)
	}
	if p.ExitCode != nil {
		parts = append(parts, fmt.Sprintf("exit %d", *p.ExitCode))
	} else if p.Path == "" && want == "" {
		parts = append(parts, "exit 0")
	}
	return strings.Join(parts, ", ")
}

// pausedWhy is why a routine is paused, in words: "已暂停：连着 3 次你没看".
func (a *App) pausedWhy(r *protocol.Routine) string {
	switch {
	case r.PauseReason != "" && r.PauseReason != "asked":
		return a.L.T("routine.paused." + r.PauseReason)
	case r.PausedBy == "user":
		return a.L.T("routine.paused.by_you")
	}
	return a.L.T("routine.paused.by_partner", a.S.PersonaName)
}

// arrived is how long ago a task's wait came true, if within the moment
// its card pops and glides into Working (D115).
func (a *App) arrived(c *ui.Context, taskID string) bool {
	at, ok := a.S.Arrived[taskID]
	if !ok {
		return false
	}
	left := 1600*time.Millisecond - time.Since(at)
	if left <= 0 {
		return false
	}
	c.After(left)
	return true
}

// routines are the routines on the shelf: on or paused.
func (a *App) routines() []protocol.Routine {
	if a.S.OnHand == nil {
		return nil
	}
	var out []protocol.Routine
	for _, r := range a.S.OnHand.Routines {
		if r.State == "active" || r.State == "paused" {
			out = append(out, r)
		}
	}
	return out
}

// routine is one routine by id (proposed ones included), or nil.
func (a *App) routine(id string) *protocol.Routine {
	if a.S.OnHand == nil || id == "" {
		return nil
	}
	for i := range a.S.OnHand.Routines {
		if a.S.OnHand.Routines[i].RoutineID == id {
			return &a.S.OnHand.Routines[i]
		}
	}
	return nil
}

// routineShelf is the calm shelf at the bottom of On hand (D115): one card
// per routine with its trigger in words, the next firing, the latest run,
// and Pause / Resume. placeless: only the ones of no folder (By project
// shows the others in their project's group, D185).
func (a *App) routineShelf(c *ui.Context, placeless bool) {
	t := a.T
	var list []protocol.Routine
	for _, r := range a.routines() {
		if !placeless || routineProject(r) == "" {
			list = append(list, r)
		}
	}
	if len(list) == 0 {
		return
	}
	ui.Column(c.Key("routines")).Gap(t.S3).Padding(t.S4, 0, 0, 0).Children(func() {
		// A quiet dashed rule above the shelf: routines stand apart from the lanes.
		ui.Box(c.Key("rule")).Height(0).Border(1, t.Line2).BorderStyle(ui.BorderDashed)
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.heading(c, a.L.T("lane.routines"), t.XL)
			a.heading(c, fmt.Sprint(len(list)), t.XL).TextColor(t.InkMuted).FontFeatures("tnum")
		})
		ui.Row(c).Gap(t.S3).Wrap().AlignItems(ui.Start).Children(func() {
			for i := range list {
				a.routineCard(c.Key(list[i].RoutineID), &list[i])
			}
		})
	})
}

func (a *App) routineCard(c *ui.Context, r *protocol.Routine) {
	t := a.T
	paused := r.State == "paused"
	ui.Row(c).Gap(t.S3).Padding(t.S4, t.S4).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
		AlignItems(ui.Center).Grow(1).Basis(320).MaxWidth(520).Label(r.Name).Children(func() {
		if r.Trigger.Kind == "time" {
			a.calendarBadge(c, r, 46)
		} else {
			a.waitBubble(c, waitGlyph(r.Trigger.Check, r.Trigger.Event), 40)
		}
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			name := ui.Text(c, keepWords(autospace(r.Name))).FontSize(t.MD).FontWeight(800).MaxLines(2).Balance()
			if paused {
				name.TextColor(t.InkMuted)
			}
			// A condition routine's name already says its condition.
			if r.Trigger.Kind == "time" && !strings.Contains(r.Name, r.TriggerWords) {
				ui.Text(c, r.TriggerWords).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
			}
			// D291: where it stands, when it runs next, how the last one went: each its own fact.
			var lines []string
			once := r.Trigger.Every == "once"
			switch {
			case paused:
				lines = append(lines, a.pausedWhy(r))
			case r.Running != "":
				lines = append(lines, a.L.T("routine.running"))
			case r.Backoff != nil:
				// D245: kept from running by an account error; it tries again by itself.
				lines = append(lines, a.L.T("routine.cant."+r.Backoff.Trouble), a.tp("routine.retry", a.when(store.ParseTime(r.Backoff.NextTryAt))))
			case once:
				lines = append(lines, a.L.T("routine.once.starts"))
			case r.LastRun != nil && r.LastRun.State == "failed" && r.LastRun.RetryAt != "":
				lines = append(lines, a.tp("routine.retry", a.when(store.ParseTime(r.LastRun.RetryAt))))
			case r.NextAt != "":
				lines = append(lines, a.tp("routine.next", (a.when(store.ParseTime(r.NextAt)))))
			}
			if r.LastRun != nil && r.LastRun.At != "" {
				lines = append(lines, a.tp("routine.last."+r.LastRun.State, (a.day(store.ParseTime(r.LastRun.At)))))
				if m := r.LastRun.LateMin; m >= 90 {
					lines = append(lines, a.L.T("routine.late.h", (m+30)/60))
				} else if m > 0 {
					lines = append(lines, a.L.T("routine.late.m", m))
				}
			}
			a.facts(c, t.XS, t.InkMuted, lines...)
		})
		if r.Trigger.Every == "once" && !paused {
			// One start at a time (D185): nothing to pause; it can be called off.
			if a.button(c, a.L.T("routine.cancel"), btnText, t.ControlSM, t.Surface) {
				a.send(protocol.RoutineAction{T: "routine_action", RoutineID: r.RoutineID, Action: "end"})
			}
		} else if paused {
			if a.button(c, a.L.T("routine.resume"), btnSecondary, t.ControlSM, t.Surface) {
				a.send(protocol.RoutineAction{T: "routine_action", RoutineID: r.RoutineID, Action: "resume"})
			}
		} else if a.button(c, a.L.T("routine.pause"), btnText, t.ControlSM, t.Surface) {
			a.send(protocol.RoutineAction{T: "routine_action", RoutineID: r.RoutineID, Action: "pause"})
		}
	})
}

// routineCostKey says what a routine costs, honestly (D245): a watch or a
// check looks without the AI, so only a run spends.
func routineCostKey(r *protocol.Routine) string {
	if r.Trigger.Kind != "condition" || r.Trigger.Judge != "" {
		return "routine.cost"
	}
	if r.Trigger.Watch != nil {
		return "routine.cost.change"
	}
	return "routine.cost.when"
}

// routineFacts is a routine's proposal card body (D29): the trigger in
// words with its next five firings or what the condition sees now, what
// it does, how it reports, what it may touch, budget, review date.
func (a *App) routineFacts(c *ui.Context, id string, ink ui.Color) {
	t := a.T
	r := a.routine(id)
	if r == nil {
		return
	}
	ui.Column(c.Key("facts:" + id)).Gap(t.S2).Children(func() {
		row := func(label string, body func()) {
			ui.Row(c.Key(label)).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
				ui.Text(c, label).FontSize(t.SM).TextColor(ink).Width(76).Shrink(0)
				ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(body)
			})
		}
		text := func(s string) { ui.Text(c, s).FontSize(t.MD).LineHeight(1.45).TextColor(t.InkSoft) }
		row(a.L.T("routine.when"), func() {
			text(r.TriggerWords)
			if r.Trigger.Kind == "time" {
				ui.Row(c.Key("cal")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					a.calendarBadge(c, r, 58)
					a.facts(c, t.XS, t.InkMuted, nextFew(r)...)
				})
			}
		})
		row(a.L.T("routine.does"), func() { text(firstLine(r.Brief)) })
		row(a.L.T("routine.reports"), func() { text(a.L.T("routine.reports." + r.Reports)) })
		row(a.L.T("routine.touch"), func() { text(a.L.T("routine.effect." + r.Effect)) })
		row(a.L.T("routine.budget"), func() { text(a.L.T(routineCostKey(r))) })
		row(a.L.T("routine.review"), func() { text(a.tp("routine.review.v", (a.day(store.ParseTime(r.ReviewAt))))) })
	})
}

// longTitleTip is a row title's tooltip: only a title the row may cut short
// has one (a tooltip over a title it repeats covers the line under it).
func longTitleTip(title string) string {
	if len([]rune(title)) <= 28 {
		return ""
	}
	return title
}
