package views

// On hand with the partner at its head (D287): the partner's own clay
// figure over the board, its pose saying how the whole stands (its flag
// when something needs you, reading while anything works, on its bench
// while everything waits, smiling when what is left came back done), and
// one sentence in its voice made only from what is there. Under it what is
// alive stands as small clay cards: who does it (the agent's coin, rocking
// while it works), the title, what it is on in two lines, and a truthful
// heartbeat at the foot. On a wide window the day stands beside the board:
// what comes back next, now, and what came back today with its outcome.
// The web draws the same (apps/web/src/onhand.tsx, board.tsx).

import (
	"fmt"
	"math"
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
	// foldFrom is from how many a fold folds: one or two quiet waits or
	// seen results stay in sight (a fold of one hides more than it saves).
	foldFrom = 3
	// cardGap is the room between cards; cardMin the narrowest a card
	// stands two to a row.
	cardGap = 12
	cardMin = 300
	// dayColW is the day beside the board, from dayFrom points wide.
	dayColW = 248
	dayFrom = 1280
)

// ---------- the head ----------

// moodOf is how the partner looks over the whole.
func moodOf(n [4]int) theme.Presence {
	switch {
	case n[0] > 0:
		return theme.NeedsYou
	case n[1] > 0:
		return theme.Working
	case n[2] > 0:
		return theme.Waiting
	case n[3] > 0:
		return theme.Done
	}
	return theme.Idle
}

// nextAt is when a wait comes back on its own: its next look, or its time.
func nextAt(w *protocol.Waiter) time.Time {
	if w == nil {
		return time.Time{}
	}
	if w.Check != nil || w.Event != nil {
		return store.ParseTime(w.NextLookAt)
	}
	return store.ParseTime(w.At)
}

// waitsAhead is when the soonest of the board's waits comes back, and how
// many of them have gone quiet.
func (a *App) waitsAhead(b store.Board, lens string) (first time.Time, quiet int) {
	now := a.Now()
	soonest := func(at time.Time) {
		if at.After(now) && (first.IsZero() || at.Before(first)) {
			first = at
		}
	}
	for _, task := range b.Lanes[store.LaneWaiting] {
		if a.quietWait(task) {
			quiet++
			continue
		}
		soonest(nextAt(a.S.WaiterFor(task.ID)))
	}
	if loose(lens) {
		for _, w := range a.looseWaiters() {
			soonest(nextAt(w))
		}
	}
	return
}

// headSay is the partner's one sentence over the board: whether anything
// needs you, then what works, what waits and when the first comes back,
// and what got done today. Never a model: the Log's counts and times.
func (a *App) headSay(b store.Board, lens string, n [4]int) string {
	p := i18n.Pick(a.L, sayMarks)
	first := a.L.T("onhand.say.none")
	switch {
	case n[0] == 1:
		first = a.L.T("onhand.say.needs.one")
	case n[0] > 1:
		first = a.L.T("onhand.say.needs", n[0])
	}
	var parts []string
	if n[1] > 0 {
		parts = append(parts, a.L.T("onhand.say.working", n[1]))
	}
	if n[2] > 0 {
		at, quiet := a.waitsAhead(b, lens)
		var more []string
		if !at.IsZero() {
			if n[2] == 1 {
				more = append(more, a.tp("onhand.wait.next", a.soon(at)))
			} else {
				more = append(more, a.tp("onhand.say.first", a.soon(at)))
			}
		}
		switch {
		case quiet > 0 && quiet >= n[2]:
			more = append(more, a.L.T("onhand.say.quiet.all"))
		case quiet > 0:
			more = append(more, a.L.T("onhand.say.quiet", quiet))
		}
		s := a.L.T("onhand.say.waiting", n[2])
		if len(more) > 0 {
			s += p.colon + strings.Join(more, p.comma)
		}
		parts = append(parts, s)
	}
	if n[3] > 0 {
		parts = append(parts, a.L.T("onhand.say.done", n[3]))
	}
	if len(parts) == 0 {
		return first
	}
	rest := strings.Join(parts, p.semi) + p.stop
	if a.L.Cased() {
		rest = strings.ToUpper(rest[:1]) + rest[1:]
	}
	return first + p.gap + rest
}

// sayMarks are the head sentence's marks, per language (D292).
var sayMarks = map[string]struct{ colon, comma, semi, stop, gap string }{
	"zh": {"：", "，", "；", "。", ""},
	"en": {": ", ", ", "; ", ".", " "},
}

// headLine is On hand's own line under the partner (D315): one short
// sentence in its voice that says what the strip can't, whether anything
// needs you and, when nothing does, what comes next. The counts are the
// strip's; the full sentence (headSay) stays the menu bar's. While
// anything works the partner says it is on it; when all waits, when the
// first comes back.
func (a *App) headLine(b store.Board, lens string, n [4]int) string {
	switch {
	case n[0] == 1:
		return a.L.T("onhand.say.needs.one")
	case n[0] > 1:
		return a.L.T("onhand.say.needs", n[0])
	case n[1] > 0:
		return a.L.T("onhand.line.working")
	case n[2] > 0:
		at, quiet := a.waitsAhead(b, lens)
		switch {
		case !at.IsZero() && n[2]-quiet <= 1:
			return a.tp("onhand.line.one", a.soon(at))
		case !at.IsZero():
			return a.tp("onhand.line.first", a.soon(at))
		}
		return a.L.T("onhand.line.quiet")
	case n[3] > 0:
		return a.L.T("onhand.line.done")
	}
	return a.L.T("onhand.line.idle")
}

// boardHead is the partner, its line, and under the line the strip of
// what is there (D315: one block, the counts never said twice).
func (a *App) boardHead(c *ui.Context, b store.Board, lens string, n [4]int, strip func()) {
	t := a.T
	ui.Row(c.Key("oh-head")).Gap(t.S4).AlignItems(ui.Center).Children(func() {
		a.avatar(c, moodOf(n), 76)
		ui.Column(c.Key("say-col")).Gap(t.S2 + 2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Text(c.Key("say"), keepWords(autospace(a.headLine(b, lens, n)))).Font(t.Display).FontSize(t.XL + 2).FontWeight(700).LineHeight(1.3).TextColor(t.Ink).
				MaxWidth(560)
			strip()
		})
	})
}

// ---------- the cards ----------

// taskCards is a run of tasks as cards, two to a row where the list has
// the room.
func (a *App) taskCards(c *ui.Context, tasks []*store.Task) {
	if len(tasks) == 0 {
		return
	}
	w := a.oh.listW
	if w <= 0 {
		w = onHandMeasure
	}
	cw := w
	if w >= 2*cardMin+cardGap {
		cw = (w - cardGap) / 2
	}
	ui.Row(c.Key("cards:"+tasks[0].ID)).Wrap().Gap(cardGap).AlignItems(ui.Stretch).Padding(2, 0, 6, 0).Children(func() { // D315: a row's cards stand as tall as each other
		for _, task := range tasks {
			a.taskCard(c.Key(task.ID), task, cw)
		}
	})
}

// taskCard is one task as a small clay card.
func (a *App) taskCard(c *ui.Context, task *store.Task, w float32) {
	t := a.T
	att := task.Attention()
	s := a.storyOf(task)
	st := a.rowMarkOf(task)
	a.noteStatus(task.ID, st)
	fresh := st == stNew
	working := att == protocol.Working || att == protocol.Queued
	focus := a.oh.focus == task.ID
	card := ui.Column(c).Width(w).Gap(t.S2).Padding(14, 16, 12, 16).Radius(20).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
	hover := card.Hovered()
	bg, ledge := t.Surface, t.Line
	switch {
	case fresh && att == protocol.Failed:
		bg = t.Surface.Mix(t.Failed.Surface, 0.35)
	case fresh:
		bg, ledge = t.Surface.Mix(t.Done.Surface, 0.45), t.Line.Mix(t.Done.Dot, 0.35)
	case working:
		bg = t.Surface.Mix(t.Working.Surface, 0.3)
	}
	card.Background(bg)
	still := c.Preferences().ReduceMotion
	lift := card.AnimateTo("lift", map[bool]float32{true: 1, false: 0}[hover], ui.Animation{Duration: 120 * time.Millisecond, NonMotion: still})
	card.Shadow(0, 2+2*lift, 0, 0, ledge).Shadow(0, 8+6*lift, 18+8*lift, -12, t.Ink.Alpha(0.22+0.08*lift))
	if !still && lift > 0 {
		card.Translate(0, -2*lift)
	}
	if focus {
		card.Border(2, t.Accent.Alpha(0.75))
		card.AccessSelected(true)
	}
	// A new result's little moment, once: it pops, swelling a little and
	// settling, once the page it is on has landed (navLanding), from its
	// size at rest and back to it, so the card holds still and unscaled
	// while the page comes in.
	if fresh && !still {
		if a.oh.cheered == nil {
			a.oh.cheered = map[string]bool{}
		}
		if !a.oh.cheered[task.ID] {
			a.oh.cheered[task.ID] = true
			card.Jump("cheer", 0)
		}
		if k := card.AnimateTo("cheer", 1, ui.Animation{Duration: a.T.Pop, Ease: ui.Linear, Delay: a.navLanding(c)}); k > 0 && k < 1 {
			// Drawn once and scaled as a picture while it swells: its
			// shadows, scaled, are what a frame paints slowest on the CPU,
			// and at most 2% larger the picture shows the same.
			sc := cheerScale(k)
			card.Scale(sc, sc).Cache()
		}
	}
	card.Children(func() {
		ui.Row(c.Key("c1")).Gap(10).AlignItems(ui.Center).Children(func() {
			a.coinBox(c, task.ID, task.Harness(), 28, false, coinMotionOf(att))
			// D315: a long title takes a second line rather than losing its end.
			ui.Text(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD).FontWeight(600).LineHeight(1.35).TextColor(t.Ink).MaxLines(2).Grow(1).Shrink(1).MinWidth(0).Tooltip(longTitleTip(task.Title()))
			if fresh {
				a.statusFace(c, task, st)
			}
			if task.Card != nil {
				a.partnerMark(c, "c-"+task.ID, task.Card.Persona) // D312
			}
		})
		ink := t.InkSoft
		switch {
		case s.tone == "needs":
			ink = t.NeedsYou.Ink
		case s.tone == "failed":
			ink = t.Failed.Ink
		case fresh:
			ink = t.Ink
		}
		words := keepWords(autospace(s.words))
		if s.code != "" {
			words += "  " + s.code
		}
		ui.Text(c.Key("c2"), words).FontSize(t.SM).LineHeight(1.5).TextColor(ink).MaxLines(2).MinHeight(t.SM * 1.5 * 2).Tooltip(s.words)
		ui.Box(c.Key("c-room")).Grow(1)
		ui.Row(c.Key("c3")).Gap(10).AlignItems(ui.Center).MinHeight(20).Children(func() {
			a.heartbeat(c, task, att)
			if s := taskTodo(task); s != nil {
				a.todoChip(c, "card:"+task.ID, s.SourceItemRef) // D341
			}
			ui.Spacer(c)
			if hover && a.rowActs(c, task, true) {
				return
			}
			if ch := taskChanges(task); ch != nil {
				if ch.Adds > 0 {
					ui.Text(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
				}
				if ch.Dels > 0 {
					ui.Text(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
				}
			}
			if act := integrated(task); act != "" {
				key := "onhand.pr.draft"
				if act == "merge" {
					key = "onhand.pr.merged"
				}
				ui.Text(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
			}
			if meta := a.whereMeta(task); len(meta) > 0 {
				ui.Row(c.Key("meta")).Gap(t.S3).AlignItems(ui.Center).Shrink(1).MinWidth(0).MaxWidth(w / 2).Children(func() { // D291: each its own element
					for _, m := range meta {
						ui.Text(c, m).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
					}
				})
			}
		})
		if u := task.Card; u != nil && u.Until != nil && u.Until.State == "on" {
			a.goal(c, u.Until, false)
		}
	})
	if card.Clicked() {
		a.oh.focus = task.ID
		a.OpenTask(task.ID)
	}
}

// whereMeta is where a card says its task is, each its own element
// (D291): its project when the board shows them all, never 其他 / Other,
// which says nothing; its computer only when it isn't the one most of the
// board runs on (D315: the usual needs no saying on every card).
func (a *App) whereMeta(task *store.Task) []string {
	var meta []string
	if a.oh.showProj && lensOf(task) != lensOther {
		meta = append(meta, lensOf(task))
	}
	p := task.Place()
	if a.manyComputers() && p.Kind != "none" && p.Device != "" && p.Device != a.oh.usual {
		meta = append(meta, a.computerName(p.Device))
	}
	return meta
}

// usualComputer is the computer most of the board's placed tasks run on.
func usualComputer(b store.Board) string {
	n := map[string]int{}
	best, most := "", 0
	for _, l := range b.Lanes {
		for _, x := range l {
			if p := x.Place(); p.Kind != "none" && p.Device != "" {
				n[p.Device]++
				if n[p.Device] > most {
					best, most = p.Device, n[p.Device]
				}
			}
		}
	}
	return best
}

// compactCards are the quiet waits and the results you have seen (D315):
// the cards' own language, one line lower, never greyed (a grey card read
// as failed, research/95). A quiet wait offers its calm next step at once.
func (a *App) compactCards(c *ui.Context, tasks []*store.Task, quiet bool) {
	if len(tasks) == 0 {
		return
	}
	ui.Column(c.Key("compact:"+tasks[0].ID)).Gap(8).Padding(2, 0, 6, 0).Children(func() {
		for _, task := range tasks {
			a.compactCard(c.Key(task.ID), task, quiet)
		}
	})
}

// compactCard is one task as a low card: who does it, the title, what it
// waits for or what came of it, and on the right its next step or time.
func (a *App) compactCard(c *ui.Context, task *store.Task, quiet bool) {
	t := a.T
	att := task.Attention()
	s := a.storyOf(task)
	focus := a.oh.focus == task.ID
	card := ui.Row(c).Gap(12).Padding(10, 14, 10, 14).MinHeight(rowH).Radius(16).AlignItems(ui.Center).Background(t.Surface).
		Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
	hover := card.Hovered()
	still := c.Preferences().ReduceMotion
	lift := card.AnimateTo("lift", map[bool]float32{true: 1, false: 0}[hover], ui.Animation{Duration: 120 * time.Millisecond, NonMotion: still})
	card.Shadow(0, 2+lift, 0, 0, t.Line).Shadow(0, 6+4*lift, 14+6*lift, -10, t.Ink.Alpha(0.16+0.06*lift))
	if !still && lift > 0 {
		card.Translate(0, -lift)
	}
	if focus {
		card.Border(2, t.Accent.Alpha(0.75))
		card.AccessSelected(true)
	}
	acted := false
	card.Children(func() {
		a.coinBox(c, task.ID, task.Harness(), 22, false, coinMotionOf(att))
		ui.Column(c.Key("tx")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if task.Card != nil {
					a.partnerMark(c, task.ID, task.Card.Persona) // D312
				}
				ui.Text(c, keepWords(autospace(shortTitle(task.Title())))).FontSize(14).FontWeight(600).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(longTitleTip(task.Title()))
				if s := taskTodo(task); s != nil {
					a.todoChip(c, "compact:"+task.ID, s.SourceItemRef) // D341
				}
			})
			ui.Row(c.Key("l2")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ink := t.InkSoft
				if s.tone == "failed" {
					ink = t.Failed.Ink
				}
				ui.Text(c.Key("w"), keepWords(autospace(s.words))).FontSize(t.XS).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(s.words)
				if quiet && task.Card != nil {
					ui.Text(c.Key("since"), a.tp("onhand.wait.since", a.agoLong(task.Card.UpdatedAt))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
				}
				for _, m := range a.whereMeta(task) {
					ui.Text(c.Key("meta:"+m), m).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0).MaxWidth(160)
				}
			})
		})
		if quiet {
			ui.Row(c.Key("acts")).Gap(t.S1).Shrink(0).Children(func() {
				w := a.S.WaiterFor(task.ID)
				if w != nil && (w.Check != nil || w.Event != nil) {
					if a.button(c, a.L.T("onhand.quiet.look"), btnSecondary, t.ControlSM, t.Surface) {
						acted = true
						a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "look"})
					}
				} else if a.button(c, a.L.T("onhand.quiet.go"), btnSecondary, t.ControlSM, t.Surface) {
					acted = true
					a.send(protocol.PastContinue{T: "past_continue", TaskID: task.ID, Words: a.L.T("onhand.quiet.go")})
				}
				if a.button(c, a.L.T("onhand.quiet.drop"), btnText, t.ControlSM, t.Surface) {
					acted = true
					a.TaskAction(task.ID, "drop")
				}
			})
			return
		}
		if hover && a.rowActs(c, task, true) {
			return
		}
		ui.Text(c.Key("time"), a.rowTime(task)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0).SingleLine()
	})
	clicked := card.Clicked() && !acted
	a.heroRow(card, task.ID, clicked || focus)
	a.stagger(c, card, a.nav.rows)
	a.nav.rows++
	if clicked {
		a.oh.focus = task.ID
		a.OpenTask(task.ID)
	}
}

// heartbeat is a card's live sign, always true: working says for how
// long with three soft bars rising and falling; a wait fills its ring
// toward when it comes back; a finished task says when it came back.
func (a *App) heartbeat(c *ui.Context, task *store.Task, att protocol.Attention) {
	t := a.T
	switch att {
	case protocol.Working, protocol.Queued:
		ui.Row(c.Key("beat")).Gap(6).AlignItems(ui.Center).Shrink(0).Children(func() {
			ui.Box(c.Key("pulse")).Size(13, 12).Shrink(0).AccessHidden(true).Draw(drawPulse(t.Working.Dot, phaseOf(task.ID)))
			if d := a.rowTime(task); d != "" {
				words := a.tp("onhand.card.working", d)
				if d == a.L.T("time.now") {
					words = a.L.T("onhand.card.started")
				}
				ui.Text(c, words).FontSize(t.XS).FontWeight(600).TextColor(t.Working.Ink).FontFeatures("tnum").SingleLine()
			}
		})
	case protocol.Blocked:
		w := a.S.WaiterFor(task.ID)
		if next, frac := a.waitNext(w); next != "" {
			c.After(time.Minute)
			ui.Row(c.Key("beat")).Gap(6).AlignItems(ui.Center).Shrink(0).Children(func() {
				ui.Box(c).Size(16, 16).Shrink(0).Draw(drawRing(t.Waiting.Ink.Alpha(0.5), t.Waiting.Ink, frac)).AccessHidden(true)
				ui.Text(c, next).FontSize(t.XS).FontWeight(600).TextColor(t.Waiting.Ink).FontFeatures("tnum").SingleLine()
			})
			return
		}
		ui.Text(c.Key("beat"), a.rowTime(task)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	case protocol.Done, protocol.DoneClaimed, protocol.Failed:
		if task.Card == nil {
			return
		}
		if at := store.ParseTime(task.Card.UpdatedAt); !at.IsZero() {
			ink := t.Done.Ink
			if att == protocol.Failed {
				ink = t.Failed.Ink
			}
			ui.Text(c.Key("beat"), a.tp("onhand.card.done", a.soon(at))).FontSize(t.XS).FontWeight(600).TextColor(ink).FontFeatures("tnum").SingleLine()
		}
	}
}

// drawPulse is three soft bars rising and falling out of step (still
// under reduced motion).
func drawPulse(col ui.Color, phase float64) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		still := p.Preferences().ReduceMotion
		for i := range 3 {
			h := float32(0.7)
			if !still {
				f := cycle(p.Now(), 1600*time.Millisecond, phase+float64(i)*0.34)
				h = 0.35 + 0.65*float32(0.5-0.5*math.Cos(2*math.Pi*f))
			}
			x := r.X + float32(i)*5 + 1.5
			var d ui.Path
			d.MoveTo(x, r.Y+r.H).LineTo(x, r.Y+r.H-r.H*h).Cap(ui.RoundCap)
			p.StrokePath(&d, 3, col)
		}
		if !still {
			idleFrame(p)
		}
	}
}

// subHead is a quiet caption over the few quiet waits or seen results
// kept in sight.
func (a *App) subHead(c *ui.Context, key, words string) {
	t := a.T
	ui.Text(c.Key("sub:"+key), words).FontSize(t.XS).FontWeight(500).TextColor(t.InkMuted).Padding(t.S2+2, t.S3+2, 0, t.S3+2)
}

// ---------- the day beside the board ----------

type dayItem struct {
	at        time.Time
	text, sub string
	id        string
}

// dayOf is what comes back next on its own and what came back today,
// within the lens, from the Log's times and words.
func (a *App) dayOf(b store.Board, lens string) (next, back []dayItem) {
	now := a.Now()
	add := func(at time.Time, text, id string) {
		if at.After(now) {
			next = append(next, dayItem{at: at, text: text, id: id})
		}
	}
	for _, task := range b.Lanes[store.LaneNeedsYou] {
		if d := a.S.PendingDecision(task.ID); d != nil && d.Reversible && d.DefaultOption == "go" {
			add(store.ParseTime(d.DefaultAt), shortTitle(task.Title()), task.ID)
		}
	}
	for _, task := range b.Lanes[store.LaneWaiting] {
		if !a.quietWait(task) {
			add(nextAt(a.S.WaiterFor(task.ID)), shortTitle(task.Title()), task.ID)
		}
	}
	if loose(lens) {
		for _, w := range a.looseWaiters() {
			add(nextAt(w), w.Reason, "")
		}
	}
	for _, task := range b.Lanes[store.LaneDone] {
		it := dayItem{text: shortTitle(task.Title()), id: task.ID}
		if task.Card != nil {
			it.at = store.ParseTime(task.Card.UpdatedAt)
		}
		if r := task.Report(); r != nil {
			it.sub = strings.SplitN(strings.TrimSpace(r.Summary), "\n", 2)[0]
		}
		back = append(back, it)
	}
	sort.SliceStable(next, func(i, j int) bool { return next[i].at.Before(next[j].at) })
	sort.SliceStable(back, func(i, j int) bool { return back[i].at.After(back[j].at) })
	if len(next) > 5 {
		next = next[:5]
	}
	if len(back) > 6 {
		back = back[:6]
	}
	return
}

// dayColumn is the day beside the board: a thin line of time, what comes
// back next above now and what came back today below it.
func (a *App) dayColumn(c *ui.Context, b store.Board, lens string) {
	t := a.T
	next, back := a.dayOf(b, lens)
	if len(next) == 0 && len(back) == 0 {
		return
	}
	head := func(key, words string) {
		ui.Text(c.Key("h:"+key), words).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Padding(t.S2, 0, 2, 22)
	}
	list := func(key string, items []dayItem, isNext bool) {
		line := t.Line
		ui.Column(c.Key("l:" + key)).Gap(2).Draw(func(p *ui.Painter, r ui.Rect) {
			var d ui.Path
			d.MoveTo(r.X+6, r.Y).LineTo(r.X+6, r.Y+r.H)
			p.StrokePath(&d, 2, line)
		}).Children(func() {
			for i, it := range items {
				a.dayRow(c.Key(fmt.Sprint(key, i)), it, isNext)
			}
		})
	}
	ui.Column(c.Key("day-col")).Width(dayColW).Shrink(0).Gap(6).Label(a.L.T("onhand.day.label")).Children(func() {
		if len(next) > 0 {
			head("next", a.L.T("onhand.next"))
			list("next", next, true)
		}
		ui.Row(c.Key("now")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, 0, t.S1, 0).Children(func() {
			acc := t.Accent
			ui.Box(c.Key("bead")).Size(12, 12).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
				var d ui.Path
				d.Circle(r.X+r.W/2, r.Y+r.H/2, 6)
				p.FillPath(&d, acc)
			})
			ui.Text(c, i18n.Clock(a.Now())).FontSize(t.XS).FontWeight(600).TextColor(acc).FontFeatures("tnum")
			ui.Text(c, a.L.T("onhand.day.now")).FontSize(t.XS).FontWeight(600).TextColor(acc)
		})
		head("back", a.L.T("onhand.day.back"))
		if len(back) == 0 {
			ui.Text(c.Key("none"), a.L.T("onhand.day.none")).FontSize(t.XS).TextColor(t.InkMuted).Padding(0, 0, 0, 22)
			return
		}
		list("back", back, false)
	})
}

// dayRow is one moment of the day: its bead, its time, its title, and a
// result's first line.
func (a *App) dayRow(c *ui.Context, it dayItem, isNext bool) {
	t := a.T
	r := ui.Row(c).Gap(t.S2).AlignItems(ui.Start).Padding(t.S1+2, t.S2, t.S1+2, 1).Radius(t.RadiusSM)
	if it.id != "" {
		r.Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(it.text)
		if r.Hovered() {
			r.Background(t.Ink.Alpha(0.04))
		}
	}
	bg, waitInk, doneDot := t.Bg, t.Waiting.Ink, t.Done.Dot
	r.Children(func() {
		ui.Box(c.Key("bead")).Size(10, 10).Shrink(0).Margin(4, 0, 0, 0).AccessHidden(true).Draw(func(p *ui.Painter, rc ui.Rect) {
			var d ui.Path
			d.Circle(rc.X+rc.W/2, rc.Y+rc.H/2, 5)
			if isNext {
				p.FillPath(&d, bg)
				var o ui.Path
				o.Circle(rc.X+rc.W/2, rc.Y+rc.H/2, 4)
				p.StrokePath(&o, 2, waitInk)
				return
			}
			p.FillPath(&d, doneDot)
		})
		ui.Column(c.Key("tx")).Gap(1).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ink := t.InkMuted
			if isNext {
				ink = t.Waiting.Ink
			}
			ui.Text(c, i18n.Clock(it.at)).FontSize(t.XS).FontWeight(600).TextColor(ink).FontFeatures("tnum")
			ui.Text(c.Key("t"), keepWords(autospace(it.text))).FontSize(t.SM).FontWeight(500).TextColor(t.Ink).SingleLine().MinWidth(0)
			if it.sub != "" {
				ui.Text(c.Key("s"), keepWords(autospace(it.sub))).FontSize(t.XS).LineHeight(1.45).TextColor(t.InkMuted).MaxLines(2)
			}
		})
	})
	if it.id != "" && r.Clicked() {
		a.OpenTask(it.id)
	}
}

// cheerScale is a done card's size k of the way through its cheer: it
// swells to about 1.02 a third of the way in and settles back to its size
// at rest, which it starts from, so the cheer can wait for its page to land.
func cheerScale(k float32) float32 {
	return 1 + 0.035*float32(math.Sin(math.Pi*float64(k)))*(1-k)
}
