package views

// Work over time on the desktop (D112–D115): what a wait waits for (a small
// clay thing in a bubble), the try strip of a keep-going loop, the routine
// shelf at the bottom of On hand and a routine's proposal card, and the
// waiting part of an opened task. Copy comes only from i18n.

import (
	"fmt"
	"path"
	"strings"

	"github.com/egoist/mygo/ui"

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
		parts = append(parts, a.L.T("wait.last", a.when(at)))
	}
	return strings.Join(parts, " · ")
}

// waitCaption is what a wait's card says in words: its deadline, or when a timer is due.
func (a *App) waitCaption(w *protocol.Waiter) string {
	if at := store.ParseTime(w.Until); !at.IsZero() {
		return a.L.T("wait.until.cap", a.when(at))
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
		ui.Row(c.Key("tcap")).Justify(ui.SpaceBetween).Gap(t.S2).Children(func() {
			cap := func(s string) { ui.Text(c, s).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum") }
			cap(a.L.T("wait.started", a.when(from)))
			cap(a.L.T("wait.now", a.when(a.Now())))
			cap(a.L.T("wait.until.ask", a.when(to)))
		})
	}
}

// runStrip is every routine's one strip: a line, today an ink mark at its
// left, a clay bead per run with its date under it.
func (a *App) runStrip(c *ui.Context, r *protocol.Routine, n int) {
	t := a.T
	runs := r.Upcoming
	if len(runs) == 0 && r.NextAt != "" {
		runs = []string{r.NextAt}
	}
	if len(runs) > n {
		runs = runs[:n]
	}
	if len(runs) == 0 {
		return
	}
	var ds []string
	for _, x := range runs {
		ds = append(ds, a.when(store.ParseTime(x)))
	}
	row := ui.Row(c.Key("runs")).Gap(0).AlignItems(ui.Start).MaxWidth(380).Padding(0, t.S2, 0, 0).Role(ui.RoleImage).Label(strings.Join(ds, ", "))
	row.Draw(func(p *ui.Painter, rc ui.Rect) {
		p.Fill(ui.Rect{X: rc.X, Y: rc.Y + 7, W: rc.W, H: 4}, t.Sunken, 2)
		p.Fill(ui.Rect{X: rc.X, Y: rc.Y, W: 3, H: 18}, t.InkSoft, 1.5)
	})
	row.Children(func() {
		ui.Box(c).Width(14).Shrink(0)
		for i, x := range runs {
			at := store.ParseTime(x)
			ui.Column(c.Key(i)).Grow(1).Basis(0).AlignItems(ui.Center).Gap(t.S1).Children(func() {
				ui.Box(c).Size(18, 16).Radius(9).Background(t.Accent).Shadow(0, 2, 0, 0, t.NeedsYou.Strong)
				ui.Text(c, fmt.Sprintf("%d/%d", int(at.Local().Month()), at.Local().Day())).FontSize(11).TextColor(t.InkMuted).FontFeatures("tnum")
			})
		}
	})
}

// beadMark is a try's mark: ✓ it holds, → better, × not yet.
func beadMark(v string) string {
	switch v {
	case "met":
		return "✓"
	case "better":
		return "→"
	}
	return "×"
}

// beads is the try strip: one small pebble per try, the current one hollow.
func (a *App) beads(c *ui.Context, u *protocol.Until, size float32) {
	t := a.T
	ui.Row(c.Key("beads")).Gap(size * 0.3).AlignItems(ui.Center).Role(ui.RoleImage).
		Label(a.L.T("until.tries", len(u.Tries)+map[bool]int{true: 1}[u.State == "on"], u.MaxTries)).Children(func() {
		for _, x := range u.Tries {
			ink := t.InkMuted
			switch x.Verdict {
			case "met":
				ink = t.Done.Ink
			case "worse":
				ink = t.Failed.Ink
			}
			ui.Box(c.Key(x.N)).Size(size, size*0.82).Radius(size).Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).
				Justify(ui.Center).AlignItems(ui.Center).Children(func() {
				ui.Text(c, beadMark(x.Verdict)).FontSize(size * 0.5).FontWeight(800).TextColor(ink)
			})
		}
		if u.State == "on" {
			ui.Box(c.Key("cur")).Size(size, size*0.82).Radius(size).Border(2, t.Line2)
		}
	})
}

// untilLine is a keep-going loop in a line: "第 3 次 · 最多 20 · 上一次：…".
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
	line := a.L.T("until.try", len(u.Tries)+1, u.MaxTries)
	if n := len(u.Tries); n > 0 {
		line += " · " + a.L.T("until.last", u.Tries[n-1].Summary)
	}
	return line
}

// tryStrip is an opened task's keep-going loop: each try with its own words.
func (a *App) tryStrip(c *ui.Context, task *store.Task) {
	t := a.T
	if task.Card == nil || task.Card.Until == nil {
		return
	}
	u := task.Card.Until
	ui.Column(c.Key("until")).Gap(t.S3).Children(func() {
		a.heading(c, a.L.T("until.title", u.Condition), t.LG)
		ui.Row(c).Gap(t.S4).Wrap().AlignItems(ui.Start).Children(func() {
			cell := func(key, mark, label, words string, ink ui.Color, hollow bool) {
				ui.Column(c.Key(key)).Gap(t.S1).AlignItems(ui.Center).Width(96).Children(func() {
					b := ui.Box(c).Size(34, 28).Radius(34).Justify(ui.Center).AlignItems(ui.Center)
					if hollow {
						b.Border(2, t.Line2)
					} else {
						b.Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).Children(func() {
							ui.Text(c, mark).FontSize(14).FontWeight(800).TextColor(ink)
						})
					}
					ui.Text(c, label).FontSize(t.SM).FontWeight(800)
					ui.Text(c, words).FontSize(t.XS).TextColor(t.InkMuted).TextAlign(ui.Center).MaxLines(3)
				})
			}
			for _, x := range u.Tries {
				ink := t.InkMuted
				if x.Verdict == "met" {
					ink = t.Done.Ink
				} else if x.Verdict == "worse" {
					ink = t.Failed.Ink
				}
				cell(fmt.Sprint(x.N), beadMark(x.Verdict), a.L.T("until.n", x.N), x.Summary, ink, false)
			}
			if u.State == "on" {
				cell("cur", "", a.L.T("until.n", len(u.Tries)+1), a.L.T("until.now"), t.InkMuted, true)
			}
		})
		ui.Text(c, a.L.T("until.rule", u.MaxTries)).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkMuted).MaxWidth(readMeasure)
		if u.State == "on" && a.button(c, a.L.T("until.stop"), btnText, t.ControlSM, t.Bg) {
			a.send(protocol.UntilAction{T: "until_action", TaskID: task.ID, Action: "stop"})
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
			if bmp := theme.Clay("wait_clock"); bmp != nil {
				ui.Image(c, bmp).Size(34, 34).Shrink(0).AccessHidden(true)
			}
		} else {
			a.waitBubble(c, waitGlyph(r.Trigger.Check, r.Trigger.Event), 40)
		}
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			name := ui.Text(c, r.Name).FontSize(t.MD).FontWeight(800).MaxLines(2)
			if paused {
				name.TextColor(t.InkMuted)
			}
			ui.Text(c, r.TriggerWords).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2)
			if !paused && r.Trigger.Kind == "time" {
				a.runStrip(c, r, 3)
			}
			line := ""
			switch {
			case paused:
				reason := r.PauseReason
				if reason == "" {
					reason = "asked"
				}
				line = a.L.T("routine.paused." + reason)
			case r.Running != "":
				line = a.L.T("routine.running")
			case r.NextAt != "":
				line = a.L.T("routine.next", a.when(store.ParseTime(r.NextAt)))
			}
			if r.LastRun != nil && r.LastRun.At != "" {
				line = strings.Join(nonEmpty(line, a.L.T("routine.last."+r.LastRun.State, a.when(store.ParseTime(r.LastRun.At)))), " · ")
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
				a.runStrip(c, r, 5)
			}
		})
		row(a.L.T("routine.does"), func() { text(firstLine(r.Brief)) })
		row(a.L.T("routine.reports"), func() { text(a.L.T("routine.reports." + r.Reports)) })
		row(a.L.T("routine.touch"), func() { text(a.L.T("routine.effect." + r.Effect)) })
		row(a.L.T("routine.budget"), func() { text(a.L.T("routine.cost")) })
		row(a.L.T("routine.review"), func() { text(a.L.T("routine.review.v", a.when(store.ParseTime(r.ReviewAt)))) })
	})
}
