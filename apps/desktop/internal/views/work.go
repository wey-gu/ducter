package views

// Work over time on the desktop (D112–D115): what a wait waits for (a small
// clay thing in a bubble), the try strip of a keep-going loop, the routine
// shelf at the bottom of On hand and a routine's proposal card, and the
// waiting part of an opened task. Copy comes only from i18n.

import (
	"fmt"
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

// waitCadence is how often it looks, for How it checks only: "每 5 分钟看一次 · 上次 11:40".
func (a *App) waitCadence(w *protocol.Waiter) string {
	var parts []string
	switch {
	case w.Event != nil:
		parts = append(parts, a.L.T("wait.each_new"))
	case w.Check != nil:
		parts = append(parts, a.L.T("wait.every", max(1, int((w.EveryMs+30_000)/60_000))))
	}
	if at := store.ParseTime(w.LastLookAt); !at.IsZero() {
		parts = append(parts, a.tp("wait.last", (a.when(at))))
	}
	return strings.Join(parts, " · ")
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
	if a.L.Lang == "zh" && r != "" && (r[0] < 0x80) {
		r = " " + r
	}
	// "Waiting until the domain renewal email arrives": a capital that only starts the sentence goes.
	if a.L.Lang != "zh" && len(r) > 1 && r[0] >= 'A' && r[0] <= 'Z' && r[1] >= 'a' && r[1] <= 'z' {
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
	zh := a.L.Lang == i18n.ZH
	big := fmt.Sprint(at.Day())
	var sub string
	if r.Trigger.Every == "month" {
		if zh {
			big += " 号"
			sub = fmt.Sprintf("%d 月", int(at.Month()))
		} else {
			sub = at.Format("Jan")
		}
	} else if zh {
		sub = [...]string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}[at.Weekday()]
	} else {
		sub = at.Format("Mon")
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

// nextFew is a routine's next few runs in words: "11/16 · 11/23 · 11/30".
func nextFew(r *protocol.Routine) string {
	var ds []string
	for i, x := range r.Upcoming {
		if i == 4 {
			break
		}
		ds = append(ds, i18n.MD(store.ParseTime(x)))
	}
	return strings.Join(ds, " · ")
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
			ui.Text(c, words+" · "+a.L.T("until.n", n)).FontSize(t.SM).TextColor(t.InkSoft).AccessHidden(true)
		})
		return
	}
	line := a.L.T("until.met", len(u.Tries))
	if !met {
		latest := a.L.T("until.now")
		if k := len(u.Tries); k > 0 {
			latest = u.Tries[k-1].Summary
		}
		line = a.L.T("until.n", n) + " · " + latest
	}
	ui.Row(c.Key("goal")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		if !met {
			if face := theme.Face(theme.Working, 26*scale*2); face != nil {
				ui.Image(c, face).Size(26*scale, 26*scale).Shrink(0).AccessHidden(true)
			}
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
	if a.L.Lang == i18n.ZH {
		return a.L.T(key, total, done)
	}
	return a.L.T(key, done, total)
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

// waitRows are the opened task's Details for a wait: what, how (the check
// itself), how often, what it saw; Stop waiting and Look now.
func (a *App) waitRows(c *ui.Context, task *store.Task, row func(string, func()), value func(string)) {
	t := a.T
	if u := task.Card; u != nil && u.Until != nil {
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
	if w == nil || (w.Check == nil && w.Event == nil) {
		return
	}
	row(a.L.T("wait.how.title"), func() {
		if w.Check != nil {
			ui.Text(c, strings.Join(w.Check.Argv, " ")).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
			ui.Text(c, a.L.T("wait.met_when", describePredicate(w.Check.SucceedWhen))).FontSize(t.SM).TextColor(t.InkMuted)
		} else {
			value(a.L.T("wait.event", w.Event.Connection, w.Event.Trigger))
		}
		if w.Judge != "" {
			ui.Text(c, a.L.T("wait.judge", w.Judge)).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
	row(a.L.T("wait.often"), func() { value(a.waitCadence(w)) })
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

// waitPanel is an opened task's wait on the page: its deadline groove, then
// Stop waiting and Look now. How it checks is in Details.
func (a *App) waitPanel(c *ui.Context, task *store.Task) {
	t := a.T
	w := a.S.WaiterFor(task.ID)
	if w == nil || task.Attention() != protocol.Blocked || (w.Check == nil && w.Event == nil) {
		return
	}
	ui.Column(c.Key("wait")).Gap(t.S2).MaxWidth(readMeasure).Children(func() {
		a.groove(c, w, true)
		ui.Row(c.Key("waitbtns")).Gap(t.S2).Children(func() {
			if a.button(c, a.L.T("wait.cancel"), btnText, t.ControlSM, t.Bg) {
				a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "cancel"})
			}
			if a.button(c, a.L.T("wait.look"), btnSecondary, t.ControlSM, t.Bg) {
				a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "look"})
			}
		})
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

// pausedWhy is why a routine is paused, in words: "停着：连着 3 次你没看".
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
// and Pause / Resume.
func (a *App) routineShelf(c *ui.Context) {
	t := a.T
	list := a.routines()
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
			line := ""
			switch {
			case paused:
				line = a.pausedWhy(r)
			case r.Running != "":
				line = a.L.T("routine.running")
			case r.NextAt != "":
				line = a.tp("routine.next", (a.when(store.ParseTime(r.NextAt))))
			}
			if r.LastRun != nil && r.LastRun.At != "" {
				line = strings.Join(nonEmpty(line, a.tp("routine.last."+r.LastRun.State, (a.day(store.ParseTime(r.LastRun.At))))), " · ")
			}
			if line != "" {
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
			}
		})
		if paused {
			if a.button(c, a.L.T("routine.resume"), btnSecondary, t.ControlSM, t.Surface) {
				a.send(protocol.RoutineAction{T: "routine_action", RoutineID: r.RoutineID, Action: "resume"})
			}
		} else if a.button(c, a.L.T("routine.pause"), btnText, t.ControlSM, t.Surface) {
			a.send(protocol.RoutineAction{T: "routine_action", RoutineID: r.RoutineID, Action: "pause"})
		}
	})
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
					if few := nextFew(r); few != "" {
						ui.Text(c, few).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum")
					}
				})
			}
		})
		row(a.L.T("routine.does"), func() { text(firstLine(r.Brief)) })
		row(a.L.T("routine.reports"), func() { text(a.L.T("routine.reports." + r.Reports)) })
		row(a.L.T("routine.touch"), func() { text(a.L.T("routine.effect." + r.Effect)) })
		row(a.L.T("routine.budget"), func() { text(a.L.T("routine.cost")) })
		row(a.L.T("routine.review"), func() { text(a.tp("routine.review.v", (a.day(store.ParseTime(r.ReviewAt))))) })
	})
}
