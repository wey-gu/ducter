package views

// The opened task's page (D271): one virtual list (MyGo's ui.List) whose
// rows are the head, each turn and what comes after them, so only the
// turns near the view are built and drawn, and the list keeps the end in
// view only while the reader is at it: the first wheel-up always moves,
// and nothing inside the page scrolls on its own. The transcript is made
// once per change of the task's events, never per frame. At its end, a
// line says only what the state proves: what it is doing while a turn is
// under way; what it waits for, and when it looks again, while it rests on
// a wait; else nothing (the head says the state). A rail at the right edge
// (wide windows only) marks each turn, the ones in view in ink; hovering
// it lists what was said, a click goes there.

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// taskPage is the opened task's page state.
type taskPage struct {
	memos map[string]*taskMemo
	// colW is the task's own column, for the locator (wide only).
	colW float32
	// took is how long the turn being drawn worked, for its words' meta line.
	took string
	// answer is the seq of a finished turn's last words, its answer (D492):
	// their meta line and its Copy stay in view.
	answer int64
	// locOpen: the locator's list is open (the rail or the list is hovered,
	// or a click pinned it); loc, its card (D325).
	locOpen bool
	loc     locState
	// jump is a locator click on its way; flash, the turn it last reached (D284).
	jump  *jumpTo
	flash flash
	// headAt is where the head was drawn last frame, transforms and all.
	headAt ui.Rect
	// D320: landing is a far jump waiting for its turn to be built; views,
	// each opened task's rows on screen as index turns, for its window.
	landing *landing
	views   map[string]sessionView
}

// landing is a far locator jump waiting for its turn's page (D320).
type landing struct {
	task string
	seq  int64
}

// taskMemo is a task's transcript as of its events and its session index
// (D320): every turn of the index as a slot, each built from its own held
// events (cache keeps them until those change); rebuilt when the events,
// the index or whether it works change, and then only the turns whose
// events changed are built again.
type taskMemo struct {
	n           int
	first, last int64
	version     int
	ixN         int
	ixLast      int64
	ixTurns     int
	working     bool
	harness     string
	// ix is the index the page reads: the home's, grown by any held event
	// newer than it, else one made from what is held (until it arrives).
	ix     *protocol.SessionIndex
	slots  []slot
	cache  turnCache
	blocks []Block
	// turns are the built turns in order; rowTurns one per slot (a turn
	// not held is its index prompt), for the rows and the locator.
	turns    []Turn
	rowTurns []Turn
	inTurn   bool
}

// locatorMin is how wide the task's column must be for the locator.
const locatorMin = 760

// memoOf is the task's transcript, made again only when its events or its
// index changed.
func (a *App) memoOf(task *store.Task) *taskMemo {
	if a.tpage.memos == nil {
		a.tpage.memos = map[string]*taskMemo{}
	}
	m := a.tpage.memos[task.ID]
	n := len(task.Events)
	var first, last int64
	if n > 0 {
		first, last = task.Events[0].Seq, task.Events[n-1].Seq
	}
	var ixN, ixTurns int
	var ixLast int64
	if task.Index != nil {
		ixN, ixLast, ixTurns = task.Index.N, task.Index.Last, len(task.Index.Turns)
	}
	working, harness := isWorking(task), task.Harness()
	if m != nil && m.n == n && m.first == first && m.last == last && m.version == task.Version && m.ixN == ixN && m.ixLast == ixLast && m.ixTurns == ixTurns && m.working == working && m.harness == harness {
		return m
	}
	cache := turnCache{}
	if m != nil {
		cache = m.cache
	}
	m = &taskMemo{n: n, first: first, last: last, version: task.Version, ixN: ixN, ixLast: ixLast, ixTurns: ixTurns, working: working, harness: harness, cache: cache}
	// D271: its last stretch is live only while a turn is under way.
	m.inTurn = inTurn(task.Events)
	m.ix = pageIndex(task)
	m.slots = slotsOf(harness, m.ix, task.Events, working && m.inTurn, cache)
	// The rows and the locator read the index (what opened each turn), so
	// they never build a turn; a turn is built when its row is drawn.
	m.rowTurns = make([]Turn, len(m.slots))
	for i := range m.slots {
		m.rowTurns[i] = Turn{Seq: m.slots[i].It.Seq, Prompt: promptBlock(m.slots[i].It.P)}
	}
	// What the rest of the page reads (its foot, the end line, the working
	// line): the last few held turns; every held one until the home's index
	// came (a home before D320, whose page is at most what it holds).
	from := 0
	if task.Index != nil {
		for k, i := 0, len(m.slots)-1; i >= 0 && k < lastTurnsRead; i-- {
			if m.slots[i].Held > 0 {
				from, k = i, k+1
			}
		}
	}
	for i := from; i < len(m.slots); i++ {
		tu := m.slots[i].Turn()
		if tu == nil {
			continue
		}
		m.turns = append(m.turns, *tu)
		if tu.Prompt != nil {
			m.blocks = append(m.blocks, *tu.Prompt)
		}
		m.blocks = append(m.blocks, tu.Body...)
	}
	a.tpage.memos[task.ID] = m
	return m
}

// lastTurnsRead is how many of the newest held turns the page's foot, end
// line and working line read (D320).
const lastTurnsRead = 4

// pageIndex is the index the page lays out (D320): the home's, with any
// held event newer than it added (a reconnect before it was asked again),
// or, until it arrives, one made from what is held.
func pageIndex(task *store.Task) *protocol.SessionIndex {
	ix := task.Index
	if ix == nil {
		return indexOf(task.Events)
	}
	n := len(task.Events)
	if n == 0 || task.Events[n-1].Seq <= ix.Last {
		return ix
	}
	c := *ix
	c.Turns = append([]protocol.IndexTurn(nil), ix.Turns...)
	for i := lowerBound(task.Events, ix.Last+1); i < n; i++ {
		indexAdd(&c, &task.Events[i])
	}
	return &c
}

// tsOf is when the event with seq happened (the Log's events are in seq
// order); for one not held, the time its turn began when it opened it.
func (a *App) tsOf(task *store.Task, seq int64) string {
	evs := task.Events
	i := sort.Search(len(evs), func(i int) bool { return evs[i].Seq >= seq })
	if i < len(evs) && evs[i].Seq == seq {
		return evs[i].TS
	}
	if ix := task.Index; ix != nil {
		if k := turnAt(ix, seq); k >= 0 {
			switch seq {
			case ix.Turns[k].Seq:
				return ix.Turns[k].At
			case ix.Turns[k].End:
				return ix.Turns[k].EndAt
			}
		}
	}
	return ""
}

// opensAtEnd: the page opens at its latest (D210), and a reader at the end
// follows the newest: while it works, waits on the user or on its wait.
func opensAtEnd(att protocol.Attention) bool {
	return att == protocol.Working || att == protocol.Queued || att == protocol.NeedsYou || att == protocol.Blocked
}

// taskList is the task's page list state.
func (a *App) taskList(id string) *ui.ListState {
	ls := a.taskLists[id]
	if ls == nil {
		ls = &ui.ListState{}
		a.taskLists[id] = ls
	}
	return ls
}

// taskBody is the task's page under its header: its rows in one list,
// the locator and Jump to latest over it, its foot and its composer.
func (a *App) taskBody(c *ui.Context, task *store.Task) {
	t := a.T
	m := a.memoOf(task)
	ls := a.taskList(task.ID)
	att := task.Attention()
	ls.FollowEnd = opensAtEnd(att)
	if c.Preferences().ReduceMotion {
		ls.FollowAnimation = nil
	} else {
		ls.FollowAnimation = &ui.Smooth
	}
	// D320: a row per turn of the session index; a turn not held is a calm
	// blank of its index height until its page lands.
	turns := m.rowTurns
	n := len(turns) + 2
	ls.Key = func(i int) any {
		switch {
		case i == 0:
			return "head"
		case i <= len(turns):
			return turns[i-1].Seq
		}
		return "tail"
	}
	// D271: the last turn is live only while a turn is under way; resting on a wait, it folds.
	working := isWorking(task) && m.inTurn
	land := a.jumpRow(c, task, m, ls)
	ui.Column(c.Key("taskpane")).Grow(1).MinHeight(0).Children(func() {
		ui.List(c, ls, n, func(i int) {
			if i >= 1 && i <= len(turns) {
				switch s := &m.slots[i-1]; {
				case s.Turn() == nil && s.Held > 0:
					ui.Box(c).Height(0) // held, and says nothing (a task's first events before its brief)
					return
				case s.Turn() == nil:
					ui.Box(c.Key(fmt.Sprintf("ph:%d", s.It.Seq))).Height(float32(s.It.H * 16)).AccessHidden(true)
					return
				}
			}
			top, bottom := float32(0), float32(0)
			switch {
			case i == 0:
				top = t.S5
			case i == 1:
				top = t.S6
			default:
				top = t.S5
			}
			if i == n-1 {
				bottom = t.S6
			}
			// D457: compact, the turns close up.
			if a.compact() {
				top, bottom = min(top, t.S3), min(bottom, t.S4)
				if i == 0 {
					top = t.S4
				}
			}
			ui.Row(c).Justify(ui.Center).Padding(top, t.S5, bottom, t.S5).Children(func() {
				// D268: one centered reading measure for the whole task.
				ui.Column(c).Grow(1).MaxWidth(readMeasure).MinWidth(0).Children(func() {
					switch {
					case i == 0:
						a.taskHead(c, task, m)
					case i <= len(turns):
						tu := m.slots[i-1].Turn()
						last := i == len(turns)
						// Your words wait their turn while nothing came after them.
						queued := last && len(tu.Body) == 0
						col := ui.Column(c.Key(fmt.Sprintf("turn:%d", m.slots[i-1].It.Seq))).Gap(t.S3).MinWidth(0)
						if i == land {
							a.jumpLands(c, col, task, m.slots[i-1].It.Seq)
						}
						col.Children(func() {
							a.turnTint(c, task, m.slots[i-1].It.Seq)
							a.turn(c, task, tu, queued, working && last)
						})
					default:
						a.taskTail(c, task, m)
					}
				})
			})
		}).Grow(1)
		// D320: the window follows the rows on screen: pages ahead of the
		// scroll, far ones let go (D284's paging at the head without an index).
		if first, last := ls.Visible(); last >= first {
			a.windowAt(task, m, first, last)
		}
		a.locator(c, task, turns, ls)
		if opensAtEnd(att) && n > 2 && !ls.AtEnd() {
			a.jumpToLatest(c, ls)
		}
	})
	// D527: the foot and the composer are one column: toasts keep above it.
	foot := ui.Column(c.Key("task-foot")).Shrink(0)
	a.toastsAbove(foot)
	foot.Children(func() {
		a.taskFoot(c, task, m.blocks)
		a.taskComposer(c, task)
	})
}

// taskHead is the page's head (D74, D89 layout): the clay partner's state
// face beside one block that reads top to bottom (one quiet meta line, the
// headline or the outcome, a pending ask), then its wait's groove and a
// keep-going loop.
func (a *App) taskHead(c *ui.Context, task *store.Task, m *taskMemo) {
	t := a.T
	if a.compact() {
		a.taskHeadCompact(c, task, m)
		return
	}
	ui.Column(c.Key("headcol")).Gap(t.S6).MinWidth(0).Children(func() {
		// D290: the head is where the card you opened grows to (Hero).
		head := ui.Row(c.Key("head")).Gap(t.S5).AlignItems(ui.Start).Transition(a.heroTransition(task.ID))
		a.tpage.headAt = head.Bounds() // where it was drawn, for the switch's check (D343)
		head.Children(func() {
			ui.Box(c.Key("facebox")).Shrink(0).Children(func() {
				a.partnerFace(c, "task:"+task.ID, taskPresence(task), taskFaceW)
				// What it waits for, a thought bubble by its head (D112): up
				// on the face's top corner, clear of its eyes and of the
				// words, its tail toward the head.
				if w := a.S.WaiterFor(task.ID); w != nil && task.Attention() == protocol.Blocked && (w.Check != nil || w.Event != nil) {
					ui.Box(c.Key("bubble")).Absolute().Left(taskFaceW - waitBadgeW + 12).Top(-8).Children(func() {
						a.waitBadge(c, waitGlyph(w.Check, w.Event))
					})
				}
			})
			ui.Column(c).Grow(1).MinWidth(0).Gap(t.S4).Children(func() {
				ui.Column(c).Gap(t.S2).Children(func() {
					a.taskStanding(c, task)
					if finished(task) {
						a.outcome(c, task)
					} else {
						a.taskHeadline(c, task)
					}
				})
				// An answered ask is one line here; a pending one sits over
				// the composer, where the answer is typed (D152).
				if d := a.S.PendingDecision(task.ID); d != nil && (d.Resolved != nil || d.Pending != "") {
					a.decisionAnswered(c, d)
				}
				a.switchSheet(c, task) // 换谁来做 / Switch who does it (D89)
				// D238: the person's own phone it is using, and 停下 / Stop: a calm row here (D339).
				if !finished(task) {
					a.handsetTaskLine(c, task)
				}
			})
		})
		// D426: the things of a many-things message this task does, each with its mark.
		a.taskAsks(c, task.ID)
		a.watchCard(c, task, m)
		a.tryStrip(c, task)
		if len(m.blocks) == 0 && len(task.Sends) == 0 {
			uiText(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
}

// taskTail is what comes after the turns: what the user sent that the Log
// has yet to carry, the end line, then the task's changes, what it did
// outside, and how a keep-going loop checks.
func (a *App) taskTail(c *ui.Context, task *store.Task, m *taskMemo) {
	t := a.T
	ui.Column(c.Key("tailcol")).Gap(t.S6).MinWidth(0).Children(func() {
		ui.Column(c.Key("end")).Gap(t.S5).MinWidth(0).Children(func() {
			for _, sd := range task.Sends {
				if sd.Seq == 0 {
					a.sentBubble(c, sd.Text, sd, true)
				}
			}
			// D206: words with pictures still going up: shown, sent when they land.
			for _, w := range a.waitingTaskSends(task.ID) {
				ui.Column(c.Key("tw:" + w.clientID)).Gap(t.S1).AlignItems(ui.End).Children(func() {
					a.messageMedia(c, "tw"+w.clientID, nil, w.atts, true, "task:"+task.ID)
					if w.text != "" {
						a.sentBubble(c, w.text, nil, false)
					}
					if anyFailed(w.atts) {
						ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
							uiText(c, a.L.T("media.failed")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink)
							if a.button(c, a.L.T("media.retry"), btnText, t.ControlSM, t.Bg) {
								a.retryPictures(w.atts)
							}
						})
					}
				})
			}
			a.endLine(c, task, m)
		})
		// D530: where its files are lives in the header's place and in 看细节,
		// never as a raw path in the transcript.
		a.changes(c, task)
		a.outsideActs(c, task)
		a.waitFacts(c, task)
	})
}

// endLine is the transcript's last line (D271), from state, never a guess:
// a turn under way says what it does (the working line); a task resting on
// its wait says what it waits for and when it looks again, its details a
// click away; anything else, nothing.
func (a *App) endLine(c *ui.Context, task *store.Task, m *taskMemo) {
	if m.working && m.inTurn {
		a.workingLine(c, task, m.turns, m.blocks)
		return
	}
	if w := a.S.WaiterFor(task.ID); w != nil && task.Attention() != protocol.NeedsYou && !finished(task) {
		a.waitLine2(c, task, w)
	}
}

// waitWords is the end line's words for a wait: its reason, and apart
// (D291), when it looks again (a check, an event) or wakes (a time):
// "21:59 回来" / "Back at 21:59", or "".
func (a *App) waitWords(w *protocol.Waiter) (words, back string) {
	// D297: a wait on the agent's limit: whose, and apart when it carries on
	// (the reset, or the next try).
	if w.Limit != nil {
		words := a.L.T("limit.line", harnessName(w.Limit.Harness))
		if at := a.limitAt(w); !at.IsZero() {
			if w.Limit.ResetKnown {
				return words, a.L.T("limit.state", hhmm(at))
			}
			return words, a.L.T("end.wait", hhmm(at))
		}
		return words, ""
	}
	reason := strings.TrimSpace(w.Reason)
	next := store.ParseTime(w.At)
	if w.Check != nil || w.Event != nil {
		next = store.ParseTime(w.NextLookAt)
	}
	if !next.IsZero() {
		return a.waitLine(reason), a.L.T("end.wait", hhmm(next))
	}
	return a.L.T("end.wait.bare", reason), ""
}

func hhmm(t time.Time) string { return clock(t.UTC().Format(time.RFC3339)) }

// waitLine2 is the end line of a task resting on its wait: a still clock,
// what it waits for and when it looks next in 13 secondary ink, and, opened
// with a click, how it checks (the check, the judge, how often, its looks).
func (a *App) waitLine2(c *ui.Context, task *store.Task, w *protocol.Waiter) {
	t := a.T
	words, back := a.waitWords(w)
	words = autospace(words)
	key := "endwait:" + task.ID
	open := a.open[key]
	expandable := w.Check != nil || w.Event != nil
	ui.Column(c.Key("waitline")).MinWidth(0).Role(ui.RoleStatus).Children(func() {
		if a.stepLine(c, spoken(a.L, words, back), expandable, open, func(ui.Element) {
			a.glyph(c, 16, drawClock(t.InkMuted))
			uiText(c, words).FontSize(stepSize).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).Tooltip(words).AccessHidden(true)
			if back != "" {
				uiText(c, back).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(0).AccessHidden(true)
			}
		}) {
			a.open[key] = !open
		}
		if !open || !expandable {
			return
		}
		row := func(label string, body func()) {
			ui.Column(c.Key(label)).Gap(2).MinWidth(0).Children(func() {
				uiText(c, label).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
				body()
			})
		}
		value := func(s string) {
			uiText(c, s).FontSize(stepSize).LineHeight(leadingFor(s, 1.5)).TextColor(t.InkSoft).Selectable()
		}
		ui.Column(c.Key("waitdetail")).Gap(t.S3).Padding(t.S2, 0, t.S1, 22).MinWidth(0).Children(func() {
			// When it last looked is said under how often (waitCadence).
			a.waitRows(c, task, false, row, value)
		})
	})
}

// promptLine is a wake's or what Ducter told it, as a hairline's words
// (D271); its time is drawn apart (D291, promptAt).
func (a *App) promptLine(p *Block) string {
	if p.K == "wake" {
		if p.Limit {
			return a.L.T("wake.limit", p.Text)
		}
		if p.Timer {
			return a.L.T("wake.timer")
		}
		return a.L.T("wake.over")
	}
	switch p.Say {
	case "lent":
		return a.L.T("told.lent", p.Name)
	case "returned":
		if p.Name != "" {
			return a.L.T("told.returned.name", p.Name)
		}
		return a.L.T("told.returned")
	case "declined", "stopped", "reopened", "adopted": // adopted: D299, picked up from outside; its time is drawn apart
		return a.L.T("told." + p.Say)
	case "taken_back", "given_back", "loan_lost": // D280: the loan of the person's phone ended
		return a.L.T("told."+p.Say, phoneShort(p.Name))
	case "looked": // D437: another AI looked the result over first; the name is that AI
		return a.L.T("told.looked", p.Name)
	}
	return a.L.T("told.other", a.S.PersonaName)
}

// promptAt is when a turn's prompt came, as a clock ("21:59"), or "".
func (a *App) promptAt(task *store.Task, p *Block) string {
	return clock(a.tsOf(task, p.Seq))
}

// goWords is a relayed Go said as the person pressed it (D284): 你点了「好，Done」.
func (a *App) goWords(p *Block) string {
	label := ""
	if p.Label != nil {
		label = *p.Label
	}
	return a.L.T("turn.go", a.shortGo(label))
}

// goChip is the person's Go on a card, relayed to the task (D284): a quiet
// pill on their side of the page (13, secondary ink on the sunken clay)
// with its time, never their orange bubble; what was sent on hover.
func (a *App) goChip(c *ui.Context, task *store.Task, p *Block) {
	t := a.T
	words := a.goWords(p)
	ui.Row(c.Key("go")).Justify(ui.End).MinWidth(0).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Padding(4, 10).Radius(999).Background(t.SurfaceSunken).Label(words).Tooltip(p.Text).Children(func() {
			uiText(c, words).FontSize(stepSize).TextColor(t.InkSoft).SingleLine().AccessHidden(true)
			if at := clock(a.tsOf(task, p.Seq)); at != "" {
				uiText(c, at).FontSize(t.XXS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().AccessHidden(true)
			}
		})
	})
}

// dividerTip is a hairline with a small label and, apart in muted tabular
// figures, its time (D291); its tip on hover.
func (a *App) dividerTip(c *ui.Context, label, at, tip string) {
	t := a.T
	ui.Row(c.Key("hair")).Gap(t.S2).MinHeight(24).AlignItems(ui.Center).Label(spoken(a.L, label, at)).Children(func() {
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
		tx := uiText(c, label).FontSize(t.XXS).TextColor(t.InkMuted).SingleLine().Shrink(0).AccessHidden(true)
		if tip != "" {
			tx.Tooltip(tip)
		}
		if at != "" {
			uiText(c, at).FontSize(t.XXS).TextColor(t.InkMuted.Alpha(0.8)).SingleLine().Shrink(0).FontFeatures("tnum").AccessHidden(true)
		}
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
	})
}

// voice is the agent's words (D271): the words, then one quiet line that
// says "保存了进度" when it saved them, and on hover its time, how long its
// turn worked and Copy. D492: a finished turn's last words (its answer)
// keep that line in view; Copy is the copy mark and its word, saying
// 已拷贝 in place; right-click has Copy too.
func (a *App) voice(c *ui.Context, task *store.Task, b *Block) {
	t := a.T
	col := ui.Column(c.Key("voice")).Gap(2).MinWidth(0)
	key := fmt.Sprintf("voice-copy:%s:%d", task.ID, b.Seq)
	done := a.justCopied(c, key)
	answer := a.tpage.answer == b.Seq
	shown := col.Hovered() || done || answer
	took := a.tpage.took
	a.replyMenu(c, col, nil, b.Text)
	col.Children(func() {
		markdown.View(c, mdSpace(b.Text), a.mdFor(b.Text))
		if b.Full > 0 {
			a.showAll(c, task, b.Seq, b.Full, false) // D320: cut at its most
		}
		if !b.Saved && !shown {
			return
		}
		meta := ui.Row(c.Key("meta")).Gap(t.S2).MinHeight(16).AlignItems(ui.Center).MinWidth(0)
		if !b.Saved && !answer {
			// Over the gap under the words, so nothing moves when it shows.
			meta.Absolute().Left(0).Bottom(-15)
		}
		meta.Children(func() {
			ink := t.InkMuted.Alpha(0.8)
			if b.Saved {
				uiText(c, a.L.T("task.saved")).FontSize(t.XXS).TextColor(ink).Shrink(0)
			}
			if !shown {
				return
			}
			// D291: its time and how long it worked, each its own small element.
			for i, s := range []string{clock(a.tsOf(task, b.Seq)), took} {
				if s != "" {
					uiText(c.Key(i), s).FontSize(t.XXS).TextColor(ink).FontFeatures("tnum").Shrink(0)
				}
			}
			a.copyLink(c, key, b.Text, done)
		})
	})
}

// copyLink is the quiet line's Copy (D492): the drawn copy mark and its
// word in the small type; the check and 已拷贝 in the done ink once it
// copied.
func (a *App) copyLink(c *ui.Context, key, text string, done bool) {
	t := a.T
	label, draw := a.L.T("reply.copy"), drawCopy
	if done {
		label, draw = a.L.T("reply.copied"), drawCheck
	}
	cp := ui.Row(c.Key("copy")).Gap(t.S1).AlignItems(ui.Center).Padding(2, t.S1).Margin(-2, 0, -2, -t.S1).Radius(t.RadiusXS).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label)
	ink := t.InkSoft
	if cp.Hovered() || cp.FocusVisible() {
		ink = t.Ink
	}
	if done {
		ink = t.Done.Ink
	}
	cp.Children(func() {
		ui.Box(c).Size(14, 14).Shrink(0).Draw(draw(ink))
		uiText(c, label).FontSize(t.XXS).FontWeight(600).TextColor(ink).SingleLine().Unselectable()
	})
	if cp.Clicked() {
		a.copyMessage(c, key, text)
	}
}

// savedLine (D349) is a checkpoint that was the agent's own note: only
// "保存了进度", and on hover its time, never the note.
func (a *App) savedLine(c *ui.Context, task *store.Task, b *Block) {
	t := a.T
	ink := t.InkMuted.Alpha(0.8)
	row := ui.Row(c.Key("saved")).Gap(t.S2).MinHeight(16).AlignItems(ui.Center).MinWidth(0)
	hover := row.Hovered()
	row.Children(func() {
		uiText(c, a.L.T("task.saved")).FontSize(t.XXS).TextColor(ink).Shrink(0)
		if at := clock(a.tsOf(task, b.Seq)); hover && at != "" {
			uiText(c.Key("at"), at).FontSize(t.XXS).TextColor(ink).FontFeatures("tnum").Shrink(0)
		}
	})
}

// jumpToLatest is the round button over the transcript's foot when the
// reader scrolled up from the end: back to the newest. Only the button
// takes the pointer: the page under it still scrolls.
func (a *App) jumpToLatest(c *ui.Context, ls *ui.ListState) {
	t := a.T
	label := a.L.T("jump.latest")
	b := ui.Box(c.Key("jumpbtn")).Absolute().Bottom(t.S3).LeftPercent(50).Margin(0, 0, 0, -t.ControlMD/2).Size(t.ControlMD, t.ControlMD).Radius(t.ControlMD/2).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label).Tooltip(label)
	b.Draw(drawDown(t.InkSoft))
	if b.Clicked() {
		ls.ScrollToEnd()
	}
}

// ---------- the locator (D271, D284) ----------

// said: a turn opened by what someone said (the brief, the person's own
// words, the partner's), the locator's lines; anything else (a wake, a
// note of Ducter's, a Go relayed) is a quiet item it collapses (D284).
func said(tu *Turn) bool {
	return tu.Prompt != nil && (tu.Prompt.K == "brief" || tu.Prompt.K == "you" || tu.Prompt.K == "partner")
}

// locatorLine is a turn's line in the locator: the first line of what was
// said, or the hairline's words for a wake; the brief carries its own quiet
// label (D291), returned apart.
func (a *App) locatorLine(tu *Turn) (line, tag string) {
	p := tu.Prompt
	if p == nil {
		return "", ""
	}
	switch p.K {
	case "wake", "told":
		return a.promptLine(p), ""
	case "go":
		return a.goWords(p), ""
	case "brief":
		return firstLine(p.Text), a.L.T("locator.brief")
	}
	return firstLine(p.Text), ""
}

// jumpTo is a locator click on its way (D284): it eases to the turn, and
// the turn's clay tint fades in place.
type jumpTo struct {
	task string
	seq  int64
	// from is the row the page showed first when the jump began; at, when.
	from int
	at   time.Time
}

// flashFor is how long a turn the locator went to keeps its tint (D284).
const flashFor = 1600 * time.Millisecond

// jumpRow moves a jump on its way (D284) and says the row to glide the
// last stretch to (-1 for none). The list shows rows, not pixels, so a far
// turn is reached row by row on an ease-in-out curve over 260–520 ms (as a
// fast, settling scroll), and the near one glides; under reduced motion
// the page is there at once. The turn's tint starts as it arrives.
func (a *App) jumpRow(c *ui.Context, task *store.Task, m *taskMemo, ls *ui.ListState) int {
	turns := m.rowTurns
	// D320: a far jump waits for its turn to be built, then flashes there.
	if w := a.tpage.landing; w != nil && w.task == task.ID {
		row := -1
		for i := range turns {
			if turns[i].Seq == w.seq {
				row = i + 1
			}
		}
		switch {
		case row < 0:
			a.tpage.landing = nil
		case m.slots[row-1].Held > 0:
			a.tpage.landing = nil
			ls.ScrollTo(row, ui.Start)
			a.tpage.flash = flash{task: task.ID, seq: w.seq, at: c.Now()}
		default:
			ls.ScrollTo(row, ui.Start)
		}
	}
	j := a.tpage.jump
	if j == nil || j.task != task.ID {
		return -1
	}
	row := -1
	for i := range turns {
		if turns[i].Seq == j.seq {
			row = i + 1
		}
	}
	if row < 0 {
		a.tpage.jump = nil
		return -1
	}
	arrive := func() {
		a.tpage.jump = nil
		a.tpage.flash = flash{task: task.ID, seq: j.seq, at: c.Now()}
	}
	first, last := ls.Visible()
	// D320: a turn not held: there at once, on a calm blank of its height,
	// the window asked around it; it flashes when it is built. A held one
	// glides (D284).
	if m.slots[row-1].Held == 0 {
		a.tpage.jump = nil
		ls.ScrollTo(row, ui.Start)
		a.tpage.landing = &landing{task: task.ID, seq: j.seq}
		a.setView(task.ID, sessionView{First: row - 1, Last: row - 1})
		return -1
	}
	if c.Preferences().ReduceMotion {
		ls.ScrollTo(row, ui.Start)
		arrive()
		return -1
	}
	if j.at.IsZero() {
		j.from, j.at = first, c.Now()
		if row >= first-1 && row <= last+1 {
			// Near: one glide, pixel by pixel.
			arrive()
			return row
		}
	}
	span := row - j.from
	d := time.Duration(min(520, 260+8*abs(span))) * time.Millisecond
	k := float64(c.Now().Sub(j.at)) / float64(d)
	if k >= 1 {
		ls.ScrollTo(row, ui.Start)
		arrive()
		return -1
	}
	e := 4 * k * k * k
	if k >= 0.5 {
		e = 1 - math.Pow(-2*k+2, 3)/2
	}
	ls.ScrollTo(j.from+int(math.Round(float64(span)*e)), ui.Start)
	c.After(16 * time.Millisecond)
	return -1
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// jumpLands is a near jump arriving at its turn's column: it glides there.
func (a *App) jumpLands(c *ui.Context, col ui.Element, task *store.Task, seq int64) {
	col.ScrollIntoView(ui.ScrollIntoViewOptions{Block: ui.ScrollStart, Animation: &ui.Smooth})
}

// flash is the turn the locator last went to, and when.
type flash struct {
	task string
	seq  int64
	at   time.Time
}

// turnTint is the soft clay a turn the locator went to wears as it fades
// (D284): it rises fast, then eases out over flashFor.
func (a *App) turnTint(c *ui.Context, task *store.Task, seq int64) {
	f := a.tpage.flash
	if f.task != task.ID || f.seq != seq {
		return
	}
	k := float64(c.Now().Sub(f.at)) / float64(flashFor)
	if k >= 1 || k < 0 {
		return
	}
	in := math.Min(1, k/0.12)
	out := 1 - (k-0.12)/0.88
	if k < 0.12 {
		out = 1
	}
	alpha := float32(0.16 * in * out * out)
	t := a.T
	ui.Box(c.Key("tint")).Absolute().Left(-14).Right(-14).Top(-10).Bottom(-10).Radius(t.RadiusMD).Background(t.Accent.Alpha(alpha)).AccessHidden(true)
	c.After(16 * time.Millisecond)
}

// locator is the rail at the transcript's right edge (wide windows): one
// small bar per turn (a said turn's longer, a quiet one's a short tick),
// a soft clay thumb behind the ones in view that glides as the page
// moves; hovered, a clay card rises out of the rail listing what was said,
// newest at the bottom, the ones in view marked; a click glides there.
func (a *App) locator(c *ui.Context, task *store.Task, turns []Turn, ls *ui.ListState) {
	t := a.T
	if len(turns) < 3 || a.tpage.colW < locatorMin {
		a.tpage.locOpen = false
		return
	}
	first, last := ls.Visible()
	inView := func(i int) bool { return i+1 >= first && i+1 <= last }
	const tickGap, railW = 8, 14
	h := min(max(float32(len(turns))*tickGap, 64), 360)
	open := a.tpage.locOpen
	name := a.L.T("locator.name")
	rail := ui.Box(c.Key("locrail")).Absolute().Right(18).TopPercent(50).Margin(-h/2, 0, 0, 0).Size(railW, h).
		Role(ui.RoleNavigation).Focusable().Label(name).Cursor(ui.CursorPointer)
	n := len(turns)
	yOf := func(i int) float32 {
		if n <= 1 {
			return 2
		}
		return 2 + (h-4)*float32(i)/float32(n-1)
	}
	// The thumb's ends glide (Smooth) as the rows in view change.
	lo, hi := max(first-1, 0), min(max(last-1, first-1), n-1)
	top := rail.AnimateTo("thumbTop", yOf(lo), ui.Smooth)
	bot := rail.AnimateTo("thumbBot", yOf(hi), ui.Smooth)
	quiet := make([]bool, n)
	for i := range turns {
		quiet[i] = !said(&turns[i])
	}
	// D315: where you are reads as one light, calm thing: a soft clay
	// lens over the ticks in view (a hairline of accent at its edge), the
	// ticks in it only warmed, never darkened or widened, so a dense run of
	// turns never stacks into dark bars.
	thumb, edge, warm := t.Accent.Alpha(0.10), t.Accent.Alpha(0.28), t.Accent.Mix(t.Faint, 0.35)
	rail.Draw(func(p *ui.Painter, r ui.Rect) {
		if last >= first {
			hgt := max(bot-top+10, 12)
			mid := (top + bot) / 2
			box := ui.Rect{X: r.X, Y: r.Y + mid - hgt/2, W: r.W, H: hgt}
			p.Fill(box, thumb, r.W/2)
			p.Stroke(box, edge, r.W/2, 1)
		}
		for i := 0; i < n; i++ {
			y := r.Y + yOf(i)
			col, w := t.Faint.Alpha(0.6), float32(8)
			if quiet[i] {
				col, w = t.Faint.Alpha(0.4), 4
			}
			if inView(i) {
				col = warm
				if quiet[i] {
					col = warm.Alpha(0.6)
				}
			}
			p.Fill(ui.Rect{X: r.X + (r.W-w)/2, Y: y - 0.75, W: w, H: 1.5}, col, 0.75)
		}
	})
	// D325: pointing at the rail chooses the landmark nearest the turn
	// under the pointer; a click pins the card open (and gives it the keys).
	_, py, overRail := rail.PointerPosition()
	lp := &a.tpage.loc
	railTurn := func() int {
		if n <= 1 {
			return 0
		}
		return max(0, min(n-1, int(math.Round(float64((py-2)/(h-4))*float64(n-1)))))
	}
	if rail.Clicked() {
		if lp.pinned {
			a.closeLocator()
			lp.hush, open = true, false
		} else {
			lp.pinned, lp.focus, lp.hush = true, true, false
			open = true
			lp.point(a.locatorLandmarks(task), railTurn(), true)
		}
	}
	if overRail && !lp.pinned && !lp.hush && (py != lp.railY || !open) {
		lp.railY = py
		lp.point(a.locatorLandmarks(task), railTurn(), true)
	}
	// Closed by a key or a click, it stays closed until the pointer leaves it.
	if lp.hush && !overRail {
		lp.hush = false
	}
	// Tabbing to the rail opens the card on what is in view.
	focusIn := rail.Focused() && !lp.railFocus
	lp.railFocus = rail.Focused()
	hovered := overRail && !lp.hush
	if focusIn && !open && !lp.pinned {
		hovered, lp.pinned, lp.focus = true, true, true
		lp.point(a.locatorLandmarks(task), max(first-1, 0), true)
	}
	if open || hovered {
		lms := a.locatorLandmarks(task)
		hereLo, hereHi := 0, 0
		if last >= first {
			hereLo, hereHi = landmarksIn(lms, max(first-1, 0), max(last-1, 0))
		}
		if lp.sel < 0 || lp.sel >= len(lms) {
			lp.point(lms, max(first-1, 0), true)
		}
		ui.Overlay(c, func() {
			// D284: the card rises out of the rail (its bottom right), scale and fade, and goes back into it.
			enter := &ui.Motion{Opacity: 0, Scale: 0.94, X: 6}
			tr := ui.ElementTransition{Duration: 180 * time.Millisecond, Enter: enter, Exit: enter, ExitDuration: 120 * time.Millisecond}
			if c.Preferences().ReduceMotion {
				tr = ui.ElementTransition{Duration: 120 * time.Millisecond, Enter: &ui.Motion{Opacity: 0, Scale: 1}, Exit: &ui.Motion{Opacity: 0, Scale: 1}}
			}
			const rowH = 28
			listH := min(float32(len(lms))*rowH, 420)
			pop := ui.Column(c.Key("locpop")).AttachTo(rail, ui.AnchorBottomLeft, ui.AnchorBottomRight).Width(320).
				Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LineSoft).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
				Padding(t.S2).Role(ui.RoleList).Label(name).TransformOrigin(1, 1).Transition(tr).Focusable().FocusRing(false)
			if lp.focus {
				lp.focus = false
				pop.Focus()
			}
			hovered = hovered || pop.Hovered()
			// The keys, while it has them: ↑↓ (and the page keys, Home, End)
			// move the choice, Return goes there, Esc closes.
			move := func(to int) {
				lp.sel, lp.want, lp.center = max(0, min(len(lms)-1, to)), true, false
				lp.pinned = true
			}
			page := int(listH/rowH) - 1
			// The card has the keys, or the rail it came from (a click focuses it).
			key := func(k ui.Key) bool { return pop.Shortcut(0, k) || rail.Shortcut(0, k) }
			switch {
			case key(ui.KeyUp):
				move(lp.sel - 1)
			case key(ui.KeyDown):
				move(lp.sel + 1)
			case key(ui.KeyPageUp):
				move(lp.sel - page)
			case key(ui.KeyPageDown):
				move(lp.sel + page)
			case key(ui.KeyHome):
				move(0)
			case key(ui.KeyEnd):
				move(len(lms) - 1)
			case key(ui.KeyEnter) && lp.sel >= 0 && lp.sel < len(lms):
				a.tpage.jump = &jumpTo{task: task.ID, seq: lms[lp.sel].Seq}
				a.closeLocator()
				lp.hush, hovered = true, false
			case key(ui.KeyEscape):
				a.closeLocator()
				lp.hush, hovered = true, false
			}
			if pop.PressedOutside() && lp.pinned && !overRail {
				a.closeLocator()
				hovered = false
			}
			// The pointer moving over a row chooses it (keys still move from there).
			_, my, overPop := pop.PointerPosition()
			pointerMoved := overPop && my != lp.popY
			if overPop {
				lp.popY = my
			}
			ls := &lp.list
			ls.Key = func(i int) any {
				if i < len(lms) {
					return fmt.Sprintf("%d:%s:%d", lms[i].Seq, lms[i].K, lms[i].From)
				}
				return i
			}
			if lp.want && lp.sel >= 0 {
				lp.want = false
				if lp.center {
					ls.ScrollTo(lp.sel, ui.Center)
				} else {
					ls.ScrollIntoView(lp.sel)
				}
			}
			now := a.Now()
			pop.Children(func() {
				ui.List(c, ls, len(lms), func(i int) {
					lm := &lms[i]
					w := a.landmarkWords(lm, now)
					line := autospace(w.line)
					here := i >= hereLo && i < hereHi
					row := ui.Row(c.Key("lm")).Gap(t.S2).Height(rowH).Padding(0, t.S2).Radius(t.RadiusXS).AlignItems(ui.Center).MinWidth(0).
						Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, w.tag, line, w.at))
					if pointerMoved && row.Hovered() && lp.sel != i {
						lp.sel = i
					}
					if i == lp.sel {
						row.Background(t.SurfaceSunken)
					}
					row.Children(func() {
						mark, ink, size := t.Faint.Alpha(0.6), t.InkSoft, float32(stepSize)
						if w.quiet {
							mark, ink, size = t.Faint.Alpha(0.4), t.InkMuted, t.XS
						}
						if here {
							mark, ink = t.Ink.Alpha(0.75), t.Ink
						}
						switch {
						case lm.K == "report":
							// D325: a report is a small ring.
							ui.Box(c.Key("ring")).Size(7, 7).Radius(3.5).Border(1.5, mark).Shrink(0)
						case w.quiet:
							ui.Box(c).Size(7, 1).Background(mark).Shrink(0)
						default:
							ui.Box(c).Size(3, 12).Radius(1.5).Background(mark).Shrink(0)
						}
						// D291: the brief's quiet label, the words, and apart its time.
						if w.tag != "" {
							ui.Box(c.Key("tag")).Padding(1, 6).Radius(999).Background(t.SurfaceSunken).Shrink(0).Children(func() {
								uiText(c, w.tag).FontSize(t.XXS).FontWeight(600).TextColor(t.InkMuted).SingleLine().AccessHidden(true)
							})
						}
						tx := uiText(c, line).FontSize(size).TextColor(ink).SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
						if here && !w.quiet && lm.K != "report" {
							tx.FontWeight(600)
						}
						if w.at != "" {
							ui.Box(c).Grow(1)
							uiText(c, w.at).FontSize(t.XXS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(0).AccessHidden(true)
						}
					})
					if row.Clicked() {
						a.tpage.jump = &jumpTo{task: task.ID, seq: lm.Seq}
						a.closeLocator()
						lp.hush, hovered = true, false
					}
				}).Height(listH).Width(320 - 2*t.S2)
			})
		})
	}
	// Leaving it closes it after a moment, unless a click pinned it.
	switch {
	case hovered || lp.pinned:
		lp.left = time.Time{}
		a.tpage.locOpen = hovered || lp.pinned
	case a.tpage.locOpen && lp.left.IsZero():
		lp.left = c.Now()
		c.After(locLinger)
	case a.tpage.locOpen && c.Now().Sub(lp.left) < locLinger:
		c.After(locLinger - c.Now().Sub(lp.left))
	default:
		a.closeLocator()
	}
}

// locLinger is how long the locator's card stays after the pointer leaves it (D325).
const locLinger = 260 * time.Millisecond

// locState is the locator's card (D325): pinned by a click, the landmark
// chosen, where the pointer last was on the rail and the card, a scroll
// to the choice asked for, and the card's list.
type locState struct {
	pinned, focus bool
	// hush: closed by a key or a click while pointed at; open again only
	// once the pointer has left.
	hush         bool
	railFocus    bool
	sel          int
	want, center bool
	railY, popY  float32
	left         time.Time
	list         ui.ListState
	// lms are the landmarks of the memo they were made for.
	memo *taskMemo
	lms  []Landmark
}

// point chooses the landmark nearest turn i, to be shown in the card's middle.
func (l *locState) point(lms []Landmark, i int, center bool) {
	l.sel, l.want, l.center = landmarkNear(lms, i), true, center
}

// closeLocator closes the card and lets go of what it chose.
func (a *App) closeLocator() {
	l := &a.tpage.loc
	a.tpage.locOpen = false
	l.pinned, l.focus, l.want, l.sel, l.left = false, false, false, -1, time.Time{}
	// The focus going back to the rail as the card closes doesn't open it again.
	l.railFocus = true
}

// locatorEsc closes the locator's card on Esc, before Esc goes up a level.
func (a *App) locatorEsc() bool {
	if a.Route != RouteTask || !a.tpage.locOpen {
		return false
	}
	a.closeLocator()
	a.tpage.loc.hush = true
	return true
}

// locatorLandmarks are the task's landmarks, made once per memo (from its
// session index alone: a session of any length).
func (a *App) locatorLandmarks(task *store.Task) []Landmark {
	m := a.memoOf(task)
	l := &a.tpage.loc
	if l.memo != m {
		turns := make([]protocol.IndexTurn, len(m.slots))
		for i := range m.slots {
			turns[i] = m.slots[i].It
		}
		l.memo, l.lms = m, landmarksOf(turns)
	}
	return l.lms
}

// landmarkWords is one row of the locator's list in words: its line, the
// brief's quiet label, its time (or range, in order, with its day when not
// today), and whether it is quiet.
type landmarkWords struct {
	line, tag, at string
	quiet         bool
}

func (a *App) landmarkWords(lm *Landmark, now time.Time) landmarkWords {
	w := landmarkWords{at: i18n.Span(a.L.Lang, lm.At, lm.EndAt, now)}
	switch lm.K {
	case "brief":
		w.line, w.tag = lm.Text, a.L.T("locator.brief")
	case "you", "partner":
		w.line = lm.Text
		if w.line == "" {
			w.line = a.L.T("locator.media")
		}
	case "report":
		w.line = lm.Text
		if w.line == "" {
			w.line = a.L.T("locator.report")
		}
	case "quiet":
		w.quiet = true
		switch {
		case lm.N > 0 && lm.Wakes:
			w.line = a.L.T("locator.wakes", lm.N)
		case lm.N > 0:
			w.line = a.L.T("locator.quiet", lm.N)
		default:
			tu := Turn{Seq: lm.Seq, Prompt: promptBlock(lm.P)}
			w.line, _ = a.locatorLine(&tu)
		}
	default:
		w.quiet = true
		w.line = a.L.T("locator." + lm.K)
	}
	return w
}

// taskHeadCompact is the head in the compact density (D457): the face at
// 40 on one line with the title (what it is doing, or its outcome),
// the state and who does it under the title; the rest as in taskHead.
func (a *App) taskHeadCompact(c *ui.Context, task *store.Task, m *taskMemo) {
	t := a.T
	const face = 40
	ui.Column(c.Key("headcol")).Gap(t.S4).MinWidth(0).Children(func() {
		head := ui.Row(c.Key("head")).Gap(t.S3).AlignItems(ui.Start).Transition(a.heroTransition(task.ID))
		a.tpage.headAt = head.Bounds()
		head.Children(func() {
			ui.Box(c.Key("facebox")).Shrink(0).Children(func() {
				a.partnerFace(c, "task:"+task.ID, taskPresence(task), face)
			})
			ui.Column(c).Grow(1).MinWidth(0).Gap(t.S2).Children(func() {
				ui.Row(c.Key("titleline")).MinHeight(face).AlignItems(ui.Center).MinWidth(0).Children(func() {
					ui.Column(c).Grow(1).MinWidth(0).Children(func() {
						if finished(task) {
							a.outcome(c, task)
						} else {
							a.taskHeadline(c, task)
						}
					})
				})
				a.taskStanding(c, task)
				if d := a.S.PendingDecision(task.ID); d != nil && (d.Resolved != nil || d.Pending != "") {
					a.decisionAnswered(c, d)
				}
				a.switchSheet(c, task)
				if !finished(task) {
					a.handsetTaskLine(c, task)
				}
			})
		})
		a.taskAsks(c, task.ID)
		a.watchCard(c, task, m)
		a.tryStrip(c, task)
		if len(m.blocks) == 0 && len(task.Sends) == 0 {
			uiText(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
}
