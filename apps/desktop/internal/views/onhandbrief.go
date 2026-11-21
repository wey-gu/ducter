package views

// D467 (round 2): On hand as a partner that reports. At its head the
// partner's brief in its own voice: what came back since you looked, the one
// thing it needs with the real fix inline, and what comes back next; no
// count strip. Work in motion shows it: a working task's trail (its own
// steps placed on its elapsed time, the head breathing at now), a group's
// parts as a track, the waits on one light time axis to when they return.
// A result carries what it made (a PR to open). At a wide window the peek
// beside the list sits in on the focused task. The web draws the same
// (apps/web/src/onhand.tsx).

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const (
	// peekW is the peek beside the list, from peekFrom points wide.
	peekW    = 360
	peekFrom = 1280
	// briefMax is how many stopped or failed tasks the brief carries itself.
	briefMax = 2
	// axisSpan is how far ahead the waits' time axis reaches.
	axisSpan = 12 * time.Hour
)

// ---------- the brief ----------

// briefHalted is what stopped or didn't work out, in the walk's order: the
// first briefMax stand in the brief with their fix, never also as cards.
func (a *App) briefHalted(b store.Board) []*store.Task {
	sp := a.splitOf(b)
	inLine := map[string]bool{}
	for _, g := range a.boardGroups(b) {
		for id := range g.ids {
			inLine[id] = true
		}
	}
	var out []*store.Task
	for _, x := range concat(sp.stopped, sp.failed) {
		if !inLine[x.ID] {
			out = append(out, x)
		}
	}
	if len(out) > briefMax {
		out = out[:briefMax]
	}
	return out
}

// phoneTask: a task that worked on a phone (its card says so, or one of its
// steps was a phone tool).
func phoneTask(task *store.Task) bool {
	if task.Card != nil && (task.Card.Handset != nil || task.Card.Phoning != nil) {
		return true
	}
	isPhone := func(ev *protocol.LogEvent) bool {
		if ev == nil || ev.Kind != protocol.KindTaskEvent {
			return false
		}
		var b protocol.TaskEvent
		return ev.Decode(&b) == nil && b.Tool != nil && strings.HasPrefix(b.Tool.Name, "phone_")
	}
	if task.Card != nil && isPhone(task.Card.Latest) {
		return true
	}
	for i := len(task.Events) - 1; i >= 0 && i >= len(task.Events)-40; i-- {
		if isPhone(&task.Events[i]) {
			return true
		}
	}
	return false
}

// firstSentence is a report's first sentence, at most n runes.
func firstSentence(s string, n int) string {
	s = strings.TrimSpace(strings.SplitN(strings.TrimSpace(s), "\n", 2)[0])
	for _, stop := range []string{"。", "；", "! ", ". "} {
		if i := strings.Index(s, stop); i > 0 {
			s = s[:i]
		}
	}
	s = strings.TrimRight(s, "。.；; ")
	if r := []rune(s); len(r) > n {
		s = string(r[:n-1]) + "…"
	}
	return s
}

// brief is the partner at the head of the board and what it reports.
func (a *App) brief(c *ui.Context, b store.Board, lens string, n [4]int) {
	t := a.T
	sp := a.splitOf(b)
	halted := a.briefHalted(b)
	a.oh.briefed = map[string]bool{}
	for _, x := range halted {
		a.oh.briefed[x.ID] = true
	}
	var fresh []*store.Task
	for _, x := range sp.today {
		if a.rowMarkOf(x) == stNew {
			fresh = append(fresh, x)
		}
	}
	asks := len(sp.needs) + a.stoppedGroups(b)
	if loose(lens) {
		asks += len(a.partnerDecisions()) + len(a.otherAsks())
	}
	type line struct {
		key, label string
		body       func()
	}
	var lines []line
	text := func(key, s string) {
		uiText(c.Key(key), keepWords(autospace(s))).FontSize(t.MD).LineHeight(1.5).TextColor(t.Ink).Shrink(1).MinWidth(0)
	}
	if len(fresh) > 0 {
		lines = append(lines, line{"since", a.L.T("onhand.brief.since"), func() {
			var s string
			switch {
			case len(fresh) == 1:
				s = a.L.T("onhand.brief.done.one", shortTitle(fresh[0].Title()))
			case len(fresh) == 2:
				s = a.L.T("onhand.brief.done.two", shortTitle(fresh[0].Title()), shortTitle(fresh[1].Title()))
			default:
				s = a.L.T("onhand.brief.done.many", shortTitle(fresh[0].Title()), len(fresh)-1)
			}
			text("t", s)
			a.outcomeChip(c, "chip", fresh[0])
		}})
	}
	for _, x := range halted {
		x := x
		lines = append(lines, line{"h:" + x.ID, a.L.T("lane.needs_you"), func() {
			failed := x.Attention() == protocol.Failed
			phone := !failed && phoneTask(x)
			why := ""
			if r := x.Report(); r != nil {
				why = firstSentence(r.Summary, 60)
			}
			if why == "" {
				why = a.L.T("onhand.wait.unsaid")
			}
			title := shortTitle(x.Title())
			s := a.L.T("onhand.brief.stopped", title, why)
			switch {
			case failed:
				s = a.L.T("onhand.brief.failed", title, why)
			case phone:
				s = a.L.T("onhand.brief.stopped.phone", title)
			}
			ui.Column(c.Key("w")).Gap(t.S2).Shrink(1).MinWidth(0).Children(func() {
				tx := uiText(c.Key("t"), keepWords(autospace(s))).FontSize(t.MD).LineHeight(1.5).TextColor(t.Ink).Cursor(ui.CursorPointer).Role(ui.RoleLink).Tooltip(x.Title())
				if tx.Clicked() {
					a.OpenTask(x.ID)
				}
				ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Children(func() {
					switch {
					case failed:
						if a.button(c, a.L.T("away.retry"), btnSecondary, t.ControlSM, t.Bg) {
							a.Retry([]string{x.ID})
						}
						if a.button(c, a.L.T("away.why"), btnText, t.ControlSM, t.Bg) {
							a.OpenTask(x.ID)
						}
					default:
						go_, words := a.L.T("onhand.quiet.go"), a.L.T("onhand.quiet.go")
						if phone {
							go_, words = a.L.T("onhand.brief.phone.go"), a.L.T("onhand.brief.phone.words")
						}
						if a.button(c, go_, btnSecondary, t.ControlSM, t.Bg) {
							a.send(protocol.PastContinue{T: "past_continue", TaskID: x.ID, Words: words})
						}
						if a.button(c, a.L.T("onhand.quiet.drop"), btnText, t.ControlSM, t.Bg) {
							a.TaskAction(x.ID, "drop")
						}
					}
				})
			})
		}})
	}
	if asks > 0 {
		lines = append(lines, line{"asks", a.L.T("lane.needs_you"), func() {
			if asks == 1 {
				text("t", a.L.T("onhand.brief.asks.one"))
			} else {
				text("t", a.L.T("onhand.brief.asks", asks))
			}
		}})
	}
	if next, more := a.nextBack(b, lens); next.text != "" {
		lines = append(lines, line{"next", a.L.T("onhand.next"), func() {
			s := a.L.T("onhand.brief.back", next.text, a.pad(a.soon(next.at)))
			if more > 0 {
				s = a.L.T("onhand.brief.back.more", next.text, a.pad(a.soon(next.at)), more)
			}
			text("t", strings.ReplaceAll(s, "  ", " "))
		}})
	}
	ui.Row(c.Key("oh-brief")).Gap(t.S5).AlignItems(ui.Start).Padding(t.S2, 0, t.S3, 0).Children(func() {
		a.avatar(c, moodOf(n), 88)
		ui.Column(c.Key("brief-col")).Gap(t.S3).Grow(1).Shrink(1).MinWidth(0).Padding(t.S2, 0, 0, 0).Children(func() {
			uiText(c.Key("say"), keepWords(autospace(a.headLine(b, lens, n)))).Font(t.Display).FontSize(t.XL + 2).FontWeight(700).LineHeight(1.3).TextColor(t.Ink)
			if len(lines) == 0 {
				return
			}
			labelW := float32(64) // the labels' column: the longest label on one line
			if !a.L.Han() {
				labelW = 124
			}
			ui.Column(c.Key("lines")).Gap(t.S2 + 2).Children(func() {
				for _, l := range lines {
					ui.Row(c.Key(l.key)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						uiText(c.Key("label"), l.label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(labelW).Shrink(0).SingleLine().Padding(3, 0, 0, 0)
						ui.Row(c.Key("body")).Gap(t.S2).AlignItems(ui.Center).Wrap().Grow(1).Shrink(1).MinWidth(0).Children(l.body)
					})
				}
			})
		})
	})
}

// nextBack is the soonest wait that comes back on its own, and how many
// more come after it.
func (a *App) nextBack(b store.Board, lens string) (dayItem, int) {
	items := a.waitsOnAxis(b, lens, 0)
	if len(items) == 0 {
		return dayItem{}, 0
	}
	return items[0], len(items) - 1
}

// dayItem is one wait placed in time.
type dayItem struct {
	at   time.Time
	text string
	id   string
}

// waitsOnAxis are the waits that come back on their own, soonest first,
// within span (0: any time ahead).
func (a *App) waitsOnAxis(b store.Board, lens string, span time.Duration) []dayItem {
	now := a.Now()
	var out []dayItem
	add := func(at time.Time, text, id string) {
		if at.After(now) && (span == 0 || at.Sub(now) <= span) {
			out = append(out, dayItem{at: at, text: text, id: id})
		}
	}
	for _, x := range b.Lanes[store.LaneWaiting] {
		if !a.stoppedWait(x) {
			add(nextAt(a.S.WaiterFor(x.ID)), shortTitle(x.Title()), x.ID)
		}
	}
	if loose(lens) {
		for _, w := range a.looseWaiters() {
			add(nextAt(w), w.Reason, "")
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].at.Before(out[j].at) })
	return out
}

// ---------- outcomes ----------

var prNumber = regexp.MustCompile(`(?i)(?:PR\s*)?#(\d+)`)

// outcomeOf is what a finished task made that can be opened: a PR (its
// number and link), from its report's evidence, its merge or draft PR, or
// a PR named in its result.
func outcomeOf(task *store.Task) (label, url string) {
	if r := task.Report(); r != nil {
		for _, e := range r.Evidence {
			if i := strings.Index(e.Ref, "/pull/"); i > 0 {
				n := strings.TrimRight(e.Ref[i+6:], "/")
				if j := strings.IndexAny(n, "/#?"); j > 0 {
					n = n[:j]
				}
				return "#" + n, e.Ref
			}
		}
	}
	if task.Card != nil && task.Card.Integrated != nil && strings.Contains(task.Card.Integrated.Ref, "/pull/") {
		ref := task.Card.Integrated.Ref
		return "#" + ref[strings.LastIndex(ref, "/")+1:], ref
	}
	if r := task.Report(); r != nil && task.Place().Kind == "repo" && strings.Contains(r.Summary, "PR") {
		if m := prNumber.FindStringSubmatch(r.Summary); m != nil {
			return "#" + m[1], ""
		}
	}
	return "", ""
}

// outcomeChip is a result's PR as a small object to open (D467), quiet.
func (a *App) outcomeChip(c *ui.Context, key string, task *store.Task) bool {
	t := a.T
	label, url := outcomeOf(task)
	if label == "" {
		return false
	}
	chip := ui.Row(c.Key(key)).Gap(5).Height(22).Padding(0, t.S2).Radius(11).AlignItems(ui.Center).Background(t.SurfaceSunken).
		Shrink(0).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label("PR " + label).Focusable().Tooltip(url)
	if chip.Hovered() {
		chip.Background(t.Sunken)
	}
	chip.Children(func() {
		if src := theme.Brand("github"); src != nil {
			ui.Image(c.Key("mark"), src).Size(12, 12).AccessHidden(true)
		}
		uiText(c.Key("n"), label).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).FontFeatures("tnum")
	})
	if chip.Clicked() {
		if url != "" {
			c.OpenURL(url)
		} else {
			a.OpenTask(task.ID)
		}
	}
	return true
}

// ---------- motion ----------

// trailStep is one step a task took, at its time.
type trailStep struct {
	at  time.Time
	bad bool
}

// trailOf is the steps this Mac holds for a task, oldest first (at most 400).
func trailOf(task *store.Task) []trailStep {
	var out []trailStep
	from := max(0, len(task.Events)-400)
	for i := from; i < len(task.Events); i++ {
		e := &task.Events[i]
		if e.Kind != protocol.KindTaskEvent {
			continue
		}
		var b protocol.TaskEvent
		if e.Decode(&b) != nil {
			continue
		}
		if b.Role != "tool" && !(b.Role == "assistant" && strings.TrimSpace(b.Text) != "") {
			continue
		}
		s := trailStep{at: store.ParseTime(e.TS)}
		if b.Tool != nil && b.Tool.OK != nil && !*b.Tool.OK {
			s.bad = true
		}
		out = append(out, s)
	}
	if len(out) == 0 && task.Card != nil && task.Card.Latest != nil {
		out = append(out, trailStep{at: store.ParseTime(task.Card.Latest.TS)})
	}
	return out
}

// trail is a working task's steps on its elapsed time, the head at now
// breathing (still under reduced motion), and beside it how many steps and
// when the last one was, each its own element.
func (a *App) trail(c *ui.Context, key string, task *store.Task) {
	t := a.T
	a.ensureHistory(task.ID) // its steps from before this Mac connected
	steps := trailOf(task)
	start := time.Time{}
	if task.Card != nil {
		start = store.ParseTime(task.Card.OpenedAt)
	}
	if start.IsZero() {
		start = store.ParseTime(task.OpenedAt)
	}
	now := a.Now()
	if start.IsZero() || !now.After(start) {
		return
	}
	n := 0
	for _, s := range steps {
		if !s.at.Before(start) {
			n++
		}
	}
	dot, bad, line := t.Working.Dot, t.Failed.Dot, t.Line
	rest := a.aliveResting(c)
	c.After(time.Minute)
	ui.Row(c.Key(key)).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Children(func() {
		ui.Box(c.Key("track")).Height(10).Grow(1).Shrink(1).MinWidth(60).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			span := float32(now.Sub(start))
			cy := r.Y + r.H/2
			var base ui.Path
			base.MoveTo(r.X, cy).LineTo(r.X+r.W-5, cy).Cap(ui.RoundCap)
			p.StrokePath(&base, 2, line)
			for _, s := range steps {
				if s.at.Before(start) {
					continue
				}
				f := float32(s.at.Sub(start)) / span
				x := r.X + min(1, max(0, f))*(r.W-10)
				col := dot.Alpha(0.55)
				if s.bad {
					col = bad
				}
				var m ui.Path
				m.MoveTo(x, cy-4).LineTo(x, cy+4).Cap(ui.RoundCap)
				p.StrokePath(&m, 2, col)
			}
			k := float32(1)
			if !p.Preferences().ReduceMotion && !rest {
				k = 0.45 + 0.55*float32(0.5-0.5*math.Cos(2*math.Pi*cycle(p.Now(), 1600*time.Millisecond, 0)))
				idleFrame(p)
			}
			p.FillPath(oval(r.X+r.W-5, cy, 4.5, 4.5), dot.Alpha(k))
		})
		if n > 0 {
			uiText(c.Key("n"), a.L.T("onhand.progress.steps", n)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(0)
		}
		if len(steps) > 0 {
			last := steps[len(steps)-1].at
			ago := a.L.T("time.now")
			if d := now.Sub(last); d >= time.Minute {
				ago = a.agoLong(last.UTC().Format(time.RFC3339))
			}
			uiText(c.Key("last"), a.tp("onhand.progress.last", ago)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(0)
		}
	})
}

// groupTrack is a group's parts as one track (D467): done, at work
// (breathing), needing you, didn't work, in line.
func (a *App) groupTrack(c *ui.Context, bg boardGroup) {
	t := a.T
	if len(bg.rows) < 2 {
		return
	}
	rest := a.aliveResting(c)
	ui.Row(c.Key("track")).Gap(3).Height(6).Padding(0, 0, 0, 46).AccessHidden(true).Children(func() {
		for i, r := range bg.rows {
			k := groupMark(r)
			col := t.Line
			switch k {
			case "done":
				col = t.Done.Dot
			case "working":
				col = t.Working.Dot
			case "needs":
				col = t.NeedsYou.Dot
			case "failed", "dropped":
				col = t.Failed.Dot
			}
			seg := ui.Box(c.Key(fmt.Sprint("s", i))).Grow(1).Basis(0).Height(6).Radius(3)
			if k == "working" {
				seg.Draw(func(p *ui.Painter, rc ui.Rect) {
					a := float32(1)
					if !p.Preferences().ReduceMotion && !rest {
						a = 0.5 + 0.5*float32(0.5-0.5*math.Cos(2*math.Pi*cycle(p.Now(), 1600*time.Millisecond, 0.3)))
						idleFrame(p)
					}
					var d ui.Path
					d.MoveTo(rc.X+3, rc.Y+rc.H/2).LineTo(rc.X+rc.W-3, rc.Y+rc.H/2).Cap(ui.RoundCap)
					p.StrokePath(&d, rc.H, col.Alpha(a))
				})
			} else {
				seg.Background(col)
			}
		}
	})
}

// waitAxis is the waits on one light line of time, from now to the last of
// them back within axisSpan (the day beside the board, D287, now inside 在等).
func (a *App) waitAxis(c *ui.Context, b store.Board, lens string) {
	t := a.T
	items := a.waitsOnAxis(b, lens, axisSpan)
	if len(items) == 0 {
		return
	}
	w := a.oh.listW
	if w <= 0 {
		w = onHandMeasure
	}
	now := a.Now()
	end := items[len(items)-1].at
	span := float32(end.Sub(now))
	left, right := float32(78), float32(44)
	room := w - left - right
	c.After(time.Minute)
	line, acc, ink, bg := t.Line, t.Accent, t.Waiting.Ink, t.Bg
	ui.Box(c.Key("axis")).Width(w).Height(44).Label(a.L.T("onhand.next")).Children(func() {
		ui.Box(c.Key("rule")).Absolute().Left(0).Top(0).Width(w).Height(44).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			cy := r.Y + 14
			var d ui.Path
			d.MoveTo(r.X+left-10, cy).LineTo(r.X+left+room, cy)
			p.StrokePath(&d, 1.5, line)
			p.FillPath(oval(r.X+left-10, cy, 5, 5), acc)
			for _, it := range items {
				f := float32(1)
				if span > 0 {
					f = float32(it.at.Sub(now)) / span
				}
				x := r.X + left + f*room
				p.FillPath(oval(x, cy, 5, 5), bg)
				var o ui.Path
				o.Circle(x, cy, 4.5)
				p.StrokePath(&o, 2, ink)
			}
		})
		uiText(c.Key("now"), i18n.Clock(now)+" "+a.L.T("onhand.day.now")).FontSize(t.XS).FontWeight(600).TextColor(acc).FontFeatures("tnum").
			Absolute().Left(0).Top(6).SingleLine().Width(left - 18)
		for i, it := range items {
			f := float32(1)
			if span > 0 {
				f = float32(it.at.Sub(now)) / span
			}
			x := left + f*room
			lab := uiText(c.Key(fmt.Sprint("at", i)), i18n.Clock(it.at)).FontSize(t.XS).FontWeight(600).TextColor(ink).FontFeatures("tnum").
				Absolute().Left(x - 20).Top(24).Width(40).TextAlign(ui.Center).SingleLine().Tooltip(it.text)
			if it.id != "" {
				id := it.id
				lab.Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(spoken(a.L, i18n.Clock(it.at), it.text))
				if lab.Clicked() {
					a.OpenTask(id)
				}
			}
		}
	})
}

// waitCardWords is a waiting card's line that doesn't say its title again: when
// what it waits for is already the title's words, the report's first line,
// else its waiter's look, else nothing.
func (a *App) waitCardWords(task *store.Task, words string) string {
	core := strings.TrimSpace(words)
	for _, p := range []string{"等 ", "等", "Waiting until ", "Waiting for ", "until "} {
		core = strings.TrimPrefix(core, p)
	}
	if core == "" || !strings.Contains(strings.ToLower(task.Title()), strings.ToLower(core)) {
		return words
	}
	if r := task.Report(); r != nil {
		if l := strings.TrimSpace(strings.SplitN(strings.TrimSpace(r.Summary), "\n", 2)[0]); l != "" {
			return l
		}
	}
	if w := a.S.WaiterFor(task.ID); w != nil {
		return a.waitCaption(w)
	}
	return ""
}

// ---------- the peek ----------

// peekTask is the task the peek sits in on: the keys' focus, else the first
// in the walk.
func (a *App) peekTask() *store.Task {
	if a.oh.focus != "" {
		if x := a.S.Task(a.oh.focus); x != nil {
			return x
		}
	}
	// Unfocused, it sits in on the work under way first: that is what moves.
	for _, x := range a.S.Board().Lanes[store.LaneWorking] {
		if a.oh.lens == "" || lensOf(x) == a.oh.lens {
			return x
		}
	}
	for _, id := range a.oh.order {
		if x := a.S.Task(id); x != nil {
			return x
		}
	}
	return nil
}

// peek is the conductor's sit-in beside the list (D467): what the focused
// task is doing right now, its last few steps, and the way into it.
func (a *App) peek(c *ui.Context) {
	t := a.T
	task := a.peekTask()
	if task == nil {
		return
	}
	a.ensureHistory(task.ID)
	att := task.Attention()
	s := a.storyOf(task)
	card := ui.Column(c.Key("peek")).Width(peekW).Shrink(0).Gap(t.S3).Padding(16, 18, 16, 18).Radius(16).Background(t.Surface).
		Role(ui.RoleGroup).Label(task.Title())
	card.Shadow(0, 2, 0, 0, t.Line).Shadow(0, 6, 14, -10, t.Ink.Alpha(0.16))
	card.Children(func() {
		ui.Row(c.Key("head")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.stateMark(c, task, a.stoppedWait(task))
			ui.Column(c.Key("tx")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				uiText(c.Key("title"), keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD + 1).FontWeight(700).TextColor(t.Ink).MaxLines(2).Tooltip(task.Title())
				ui.Row(c.Key("meta")).Gap(t.S2).Wrap().Children(func() {
					a.beat(c, task, att, false)
					for _, m := range a.whereMeta(task) {
						uiText(c.Key("m:"+m), m).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
					}
				})
			})
		})
		ink := t.InkSoft
		if s.tone == "failed" {
			ink = t.Failed.Ink
		}
		now := keepWords(autospace(s.words))
		if s.code != "" {
			now += "  " + s.code
		}
		uiText(c.Key("now"), now).FontSize(t.SM).LineHeight(1.5).TextColor(ink).MaxLines(4).Tooltip(s.words)
		if att == protocol.Working || att == protocol.Queued {
			a.trail(c, "trail", task)
		}
		if finishedAtt(att) {
			a.outcomeChip(c, "chip", task)
		}
		// The last few steps, newest last, in the task's own words.
		var evs []*protocol.LogEvent
		for i := len(task.Events) - 1; i >= 0 && len(evs) < 6; i-- {
			e := &task.Events[i]
			if e.Kind != protocol.KindTaskEvent {
				continue
			}
			var b protocol.TaskEvent
			if e.Decode(&b) != nil || (b.Role != "tool" && !(b.Role == "assistant" && strings.TrimSpace(b.Text) != "")) {
				continue
			}
			evs = append(evs, e)
		}
		if len(evs) > 0 {
			uiText(c.Key("steps-h"), a.L.T("onhand.peek.steps")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, 0, 0, 0)
			ui.Column(c.Key("steps")).Gap(6).Children(func() {
				for i := len(evs) - 1; i >= 0; i-- {
					e := evs[i]
					st, ok := a.eventStory(task, e)
					if !ok {
						continue
					}
					ui.Row(c.Key(fmt.Sprint("e", e.Seq))).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
						mk := t.InkMuted
						if st.tone == "failed" {
							mk = t.Failed.Ink
						}
						draw := stepGlyph(st.mark)
						if st.mark == "error" {
							draw = drawCross
						}
						if st.mark == "" {
							draw = stepGlyph("thought")
						}
						a.glyph(c, 14, draw(mk))
						col := t.InkSoft
						if i == 0 {
							col = t.Ink
						}
						uiText(c.Key("w"), keepWords(autospace(st.words))).FontSize(t.XS).TextColor(col).SingleLine().Shrink(1).MinWidth(0).Tooltip(st.words)
						if st.code != "" {
							uiText(c.Key("code"), st.code).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(3).MinWidth(0)
						}
					})
				}
			})
		}
		ui.Row(c.Key("foot")).Padding(t.S2, 0, 0, 0).Children(func() {
			if a.button(c, a.L.T("onhand.peek.open"), btnSecondary, t.ControlSM, t.Surface) {
				a.OpenTask(task.ID)
			}
		})
	})
}
