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
	// cardGap is the room between cards.
	cardGap = 12
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
		if a.stoppedWait(task) {
			continue // D467: it stands in 等你
		}
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
//
// D467: the line is true to the board: when all that needs you is what
// stopped or didn't work out, it says so, never 没有要你定的.
func (a *App) headLine(b store.Board, lens string, n [4]int) string {
	sp := a.splitOf(b)
	halted := len(sp.stopped) + len(sp.failed)
	switch {
	case n[0] > 0 && n[0] <= halted && halted == 1:
		return a.L.T("onhand.line.stopped.one")
	case n[0] > 0 && n[0] <= halted:
		return a.L.T("onhand.line.stopped", halted)
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
			uiText(c.Key("say"), keepWords(autospace(a.headLine(b, lens, n)))).Font(t.Display).FontSize(t.XL + 2).FontWeight(700).LineHeight(1.3).TextColor(t.Ink).
				MaxWidth(560)
			strip()
		})
	})
}

// ---------- the cards ----------

// taskCards is a run of tasks as cards, one under another at the list's
// full width (D467: one width, nothing half-empty).
func (a *App) taskCards(c *ui.Context, tasks []*store.Task) {
	if len(tasks) == 0 {
		return
	}
	w := a.oh.listW
	if w <= 0 {
		w = onHandMeasure
	}
	ui.Column(c.Key("cards:"+tasks[0].ID)).Gap(cardGap-4).Padding(2, 0, 6, 0).Children(func() {
		for _, task := range tasks {
			a.taskCard(c.Key(task.ID), task, w)
		}
	})
}

// taskCard is one task in On hand's one card shape (D467): its state mark
// (the same glyphs as a group's parts), the subject (what it is and where),
// the living line (what it is on now, what it waits for, why it stopped,
// what came of it), and at the right its heartbeat or its one action.
// The agent that does it is a detail: on hover and in the task.
func (a *App) taskCard(c *ui.Context, task *store.Task, w float32) {
	t := a.T
	att := task.Attention()
	s := a.storyOf(task)
	st := a.rowMarkOf(task)
	a.noteStatus(task.ID, st)
	fresh := st == stNew
	working := att == protocol.Working || att == protocol.Queued
	stopped := a.stoppedWait(task)
	failed := att == protocol.Failed
	quiet := att == protocol.Blocked && !stopped && a.quietWait(task)
	seen := (att == protocol.Done || att == protocol.DoneClaimed) && !fresh
	focus := a.oh.focus == task.ID
	padY, minH := float32(12), float32(64)
	if a.compact() {
		padY, minH = 8, 52 // D457
	}
	card := ui.Row(c).Width(w).Gap(14).Padding(padY, 16, padY, 14).MinHeight(minH).Radius(16).AlignItems(ui.Center).
		Background(t.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(task.Title()).Focusable()
	hover := card.Hovered()
	// What needs you stands on the needs-you ledge; everything else on the clay one.
	ledge := t.Line
	if stopped || failed {
		ledge = t.NeedsYou.Ledge
	}
	still := c.Preferences().ReduceMotion
	lift := card.AnimateTo("lift", map[bool]float32{true: 1, false: 0}[hover], ui.Animation{Duration: 120 * time.Millisecond, NonMotion: still})
	card.Shadow(0, 2+lift, 0, 0, ledge).Shadow(0, 6+4*lift, 14+6*lift, -10, t.Ink.Alpha(0.16+0.06*lift))
	if !still && lift > 0 {
		card.Translate(0, -lift)
	}
	if focus {
		card.Border(2, t.Accent.Alpha(0.75))
		card.AccessSelected(true)
	}
	// A new result's little moment, once (D287): it swells a little and
	// settles once its page has landed.
	if fresh && !still {
		if a.oh.cheered == nil {
			a.oh.cheered = map[string]bool{}
		}
		if !a.oh.cheered[task.ID] {
			a.oh.cheered[task.ID] = true
			card.Jump("cheer", 0)
		}
		if k := card.AnimateTo("cheer", 1, ui.Animation{Duration: a.T.Pop, Ease: ui.Linear, Delay: a.navLanding(c)}); k > 0 && k < 1 {
			sc := cheerScale(k)
			card.Scale(sc, sc).Cache()
		}
	}
	tip := longTitleTip(task.Title())
	for _, why := range a.whereWhy(task) {
		tip += "\n" + why // who does it and where: a detail, on hover
	}
	acted := false
	card.Children(func() {
		a.stateMark(c, task, stopped)
		ui.Column(c.Key("tx")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if task.Card != nil {
					a.partnerMark(c, "c-"+task.ID, task.Card.Persona) // D312
				}
				ink := t.Ink
				if seen {
					ink = t.InkSoft // what you have seen recedes, never greyed
				}
				uiText(c.Key("title"), keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD).FontWeight(600).TextColor(ink).
					SingleLine().Shrink(1).MinWidth(0).Tooltip(tip)
				if s := taskTodo(task); s != nil {
					a.todoChip(c, "card:"+task.ID, s.SourceItemRef) // D341
				}
				// Where, each its own element (D291): its project when the
				// board shows them all, its computer when it isn't the usual.
				for _, m := range a.whereMeta(task) {
					uiText(c.Key("meta:"+m), m).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0).MaxWidth(180)
				}
				ui.Spacer(c)
				if ch := taskChanges(task); ch != nil {
					ui.Row(c.Key("stat")).Gap(t.S1 + 2).Shrink(0).Children(func() {
						if ch.Adds > 0 {
							uiText(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
						}
						if ch.Dels > 0 {
							uiText(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
						}
					})
				}
				if act := integrated(task); act != "" {
					key := "onhand.pr.draft"
					if act == "merge" {
						key = "onhand.pr.merged"
					}
					uiText(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
				}
			})
			// The living line: what it is on now, in its own words.
			ink := t.InkSoft
			switch {
			case s.tone == "needs" || stopped:
				ink = t.NeedsYou.Ink
			case s.tone == "failed":
				ink = t.Failed.Ink
			case seen:
				ink = t.InkMuted
			}
			words := keepWords(autospace(s.words))
			if s.code != "" {
				words += "  " + s.code
			}
			if working {
				// D425: held for the dwell, a short entrance (a fade only under reduced motion).
				held, k := a.aliveHeld(c, "card:"+task.ID, words)
				box := ui.Box(c.Key("say:" + held)).Opacity(k)
				if !still {
					box.Translate(0, 3*(1-k))
				}
				box.Children(func() {
					uiText(c.Key("l2"), held).FontSize(t.SM).LineHeight(1.45).TextColor(ink).MaxLines(2).Tooltip(s.words)
				})
			} else {
				l2 := uiText(c.Key("l2"), words).FontSize(t.SM).LineHeight(1.45).TextColor(ink).Tooltip(s.words)
				if stopped || failed {
					l2.MaxLines(2) // why it stopped is what you need to read
				} else {
					l2.SingleLine()
				}
			}
			if u := task.Card; u != nil && u.Until != nil && u.Until.State == "on" {
				a.goal(c, u.Until, false)
			}
		})
		ui.Column(c.Key("end")).Gap(6).AlignItems(ui.End).Shrink(0).Children(func() {
			switch {
			case stopped:
				if task.Card != nil {
					uiText(c.Key("since"), a.tp("onhand.wait.since", a.agoLong(task.Card.UpdatedAt))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
				ui.Row(c.Key("acts")).Gap(t.S1).Children(func() {
					if a.button(c, a.L.T("onhand.quiet.go"), btnSecondary, t.ControlSM, t.Surface) {
						acted = true
						a.send(protocol.PastContinue{T: "past_continue", TaskID: task.ID, Words: a.L.T("onhand.quiet.go")})
					}
					if a.button(c, a.L.T("onhand.quiet.drop"), btnText, t.ControlSM, t.Surface) {
						acted = true
						a.TaskAction(task.ID, "drop")
					}
				})
			case failed:
				f := finishedOf(task)
				ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Children(func() {
					if a.button(c, a.L.T("away.retry"), btnSecondary, t.ControlSM, t.Surface) {
						acted = true
						a.Retry(f.failedIDs)
					}
					if hover {
						a.finishedActs(c, *f)
					}
				})
			case quiet:
				if task.Card != nil {
					uiText(c.Key("since"), a.tp("onhand.wait.since", a.agoLong(task.Card.UpdatedAt))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
				if w := a.S.WaiterFor(task.ID); w != nil && (w.Check != nil || w.Event != nil) {
					if a.button(c, a.L.T("onhand.quiet.look"), btnSecondary, t.ControlSM, t.Surface) {
						acted = true
						a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "look"})
					}
				}
			case hover && (finishedOf(task) != nil || att == protocol.Working):
				ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Children(func() {
					a.rowActs(c, task, true)
					if f := finishedOf(task); f != nil {
						a.finishedActs(c, *f)
					}
				})
			default:
				a.beat(c, task, att, false)
			}
		})
	})
	// D454: a right click on a finished card says the same as its ⋯.
	if f := finishedOf(task); f != nil {
		a.contextMenu(c, card, func(m *ui.Menu) { a.finishedItems(c, m, *f, true) })
	}
	clicked := card.Clicked() && !acted
	a.heroRow(card, task.ID, clicked || focus)
	a.stagger(c, card, a.nav.rows)
	a.nav.rows++
	if clicked {
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

// compactCards are the quiet waits and the results you have seen: the one
// card shape (D467), one under another.
func (a *App) compactCards(c *ui.Context, tasks []*store.Task, quiet bool) {
	a.taskCards(c, tasks)
}

// heartbeat is a card's live sign, always true: working says for how
// long with three soft bars rising and falling; a wait fills its ring
// toward when it comes back; a finished task says when it came back.
func (a *App) heartbeat(c *ui.Context, task *store.Task, att protocol.Attention) {
	a.beat(c, task, att, true)
}

// beat is the heartbeat; without its sign (D467: a card's state mark already
// draws the bars or the ring) it is the words alone.
func (a *App) beat(c *ui.Context, task *store.Task, att protocol.Attention, sign bool) {
	t := a.T
	switch att {
	case protocol.Working, protocol.Queued:
		ui.Row(c.Key("beat")).Gap(6).AlignItems(ui.Center).Shrink(0).Children(func() {
			if sign {
				ui.Box(c.Key("pulse")).Size(13, 12).Shrink(0).AccessHidden(true).Draw(drawPulse(t.Working.Dot, phaseOf(task.ID), a.aliveResting(c)))
			}
			if d := a.rowTime(task); d != "" {
				words := a.tp("onhand.card.working", d)
				if d == a.L.T("time.now") {
					words = a.L.T("onhand.card.started")
				}
				uiText(c, words).FontSize(t.XS).FontWeight(600).TextColor(t.Working.Ink).FontFeatures("tnum").SingleLine()
			}
		})
	case protocol.Blocked:
		w := a.S.WaiterFor(task.ID)
		if next, frac := a.waitNext(w); next != "" {
			c.After(time.Minute)
			ui.Row(c.Key("beat")).Gap(6).AlignItems(ui.Center).Shrink(0).Children(func() {
				if sign {
					ui.Box(c).Size(16, 16).Shrink(0).Draw(drawRing(t.Waiting.Ink.Alpha(0.5), t.Waiting.Ink, frac)).AccessHidden(true)
				}
				uiText(c, next).FontSize(t.XS).FontWeight(600).TextColor(t.Waiting.Ink).FontFeatures("tnum").SingleLine()
			})
			return
		}
		uiText(c.Key("beat"), a.rowTime(task)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	case protocol.Done, protocol.DoneClaimed, protocol.Failed:
		if task.Card == nil {
			return
		}
		if at := store.ParseTime(task.Card.UpdatedAt); !at.IsZero() {
			ink := t.Done.Ink
			if att == protocol.Failed {
				ink = t.Failed.Ink
			}
			uiText(c.Key("beat"), a.tp("onhand.card.done", a.soon(at))).FontSize(t.XS).FontWeight(600).TextColor(ink).FontFeatures("tnum").SingleLine()
		}
	}
}

// drawPulse is three soft bars rising and falling out of step (still
// under reduced motion).
func drawPulse(col ui.Color, phase float64, rest bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		still := p.Preferences().ReduceMotion || rest // D425: resting with the coin
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
	uiText(c.Key("sub:"+key), words).FontSize(t.XS).FontWeight(500).TextColor(t.InkMuted).Padding(t.S2+2, t.S3+2, 0, t.S3+2)
}

// cheerScale is a done card's size k of the way through its cheer: it
// swells to about 1.02 a third of the way in and settles back to its size
// at rest, which it starts from, so the cheer can wait for its page to land.
func cheerScale(k float32) float32 {
	return 1 + 0.035*float32(math.Sin(math.Pi*float64(k)))*(1-k)
}
