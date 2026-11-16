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
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

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
	// locOpen: the locator's list is open (the rail or the list is hovered).
	locOpen bool
}

// taskMemo is a task's transcript as of its events: rebuilt when they or
// whether it works change.
type taskMemo struct {
	n           int
	first, last int64
	working     bool
	harness     string
	blocks      []Block
	turns       []Turn
	inTurn      bool
}

// locatorMin is how wide the task's column must be for the locator.
const locatorMin = 760

// memoOf is the task's transcript, made again only when its events changed.
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
	working, harness := isWorking(task), task.Harness()
	if m != nil && m.n == n && m.first == first && m.last == last && m.working == working && m.harness == harness {
		return m
	}
	m = &taskMemo{n: n, first: first, last: last, working: working, harness: harness}
	// D271: its last stretch is live only while a turn is under way.
	m.inTurn = inTurn(task.Events)
	m.blocks = blocksOf(harness, task.Events, working && m.inTurn)
	m.turns = turnsOf(m.blocks)
	a.tpage.memos[task.ID] = m
	return m
}

// tsOf is when the event with seq happened (the Log's events are in seq order).
func (a *App) tsOf(task *store.Task, seq int64) string {
	evs := task.Events
	i := sort.Search(len(evs), func(i int) bool { return evs[i].Seq >= seq })
	if i < len(evs) && evs[i].Seq == seq {
		return evs[i].TS
	}
	for _, ev := range evs {
		if ev.Seq == seq {
			return ev.TS
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
	turns := m.turns
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
	ui.Column(c.Key("taskpane")).Grow(1).MinHeight(0).Children(func() {
		ui.List(c, ls, n, func(i int) {
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
			ui.Row(c).Justify(ui.Center).Padding(top, t.S5, bottom, t.S5).Children(func() {
				// D268: one centered reading measure for the whole task.
				ui.Column(c).Grow(1).MaxWidth(readMeasure).MinWidth(0).Children(func() {
					switch {
					case i == 0:
						a.taskHead(c, task, m)
					case i <= len(turns):
						tu := &turns[i-1]
						last := i == len(turns)
						// Your words wait their turn while nothing came after them.
						queued := last && len(tu.Body) == 0
						ui.Column(c.Key(fmt.Sprintf("turn:%d", tu.Seq))).Gap(t.S3).MinWidth(0).Children(func() {
							a.turn(c, task, tu, queued, working && last)
						})
					default:
						a.taskTail(c, task, m)
					}
				})
			})
		}).Grow(1)
		a.locator(c, task, turns, ls)
		if opensAtEnd(att) && n > 2 && !ls.AtEnd() {
			a.jumpToLatest(c, ls)
		}
	})
	a.taskFoot(c, task, m.blocks)
	a.taskComposer(c, task)
}

// taskHead is the page's head (D74, D89 layout): the clay partner's state
// face beside one block that reads top to bottom (one quiet meta line, the
// headline or the outcome, a pending ask), then its wait's groove and a
// keep-going loop.
func (a *App) taskHead(c *ui.Context, task *store.Task, m *taskMemo) {
	t := a.T
	ui.Column(c.Key("headcol")).Gap(t.S6).MinWidth(0).Children(func() {
		ui.Row(c.Key("head")).Gap(t.S5).AlignItems(ui.Start).Children(func() {
			ui.Box(c.Key("facebox")).Shrink(0).Children(func() {
				a.partnerFace(c, "task:"+task.ID, taskPresence(task), taskFaceW)
				// What it waits for, in a bubble by its head (D112).
				if w := a.S.WaiterFor(task.ID); w != nil && task.Attention() == protocol.Blocked && (w.Check != nil || w.Event != nil) {
					ui.Box(c.Key("bubble")).Absolute().Left(taskFaceW - 30).Top(-12).Children(func() {
						a.waitBubble(c, waitGlyph(w.Check, w.Event), 46)
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
			})
		})
		a.waitPanel(c, task)
		a.tryStrip(c, task)
		if len(m.blocks) == 0 && len(task.Sends) == 0 {
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
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
							ui.Text(c, a.L.T("media.failed")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink)
							if a.button(c, a.L.T("media.retry"), btnText, t.ControlSM, t.Bg) {
								a.retryPictures(w.atts)
							}
						})
					}
				})
			}
			a.endLine(c, task, m)
		})
		if workFolder(task.Place()) != "" {
			ui.Column(c.Key("work")).Gap(t.S2).Children(func() {
				a.workFolderLine(c, task) // D198: where its files are, over its changes
				a.changes(c, task)
			})
		} else {
			a.changes(c, task)
		}
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

// waitWords is the end line's words for a wait: its reason, and when it
// looks again (a check, an event) or wakes (a time).
func (a *App) waitWords(w *protocol.Waiter) string {
	reason := strings.TrimSpace(w.Reason)
	if w.Check != nil || w.Event != nil {
		if next := store.ParseTime(w.NextLookAt); !next.IsZero() {
			return a.L.T("end.wait", reason, hhmm(next))
		}
	} else if at := store.ParseTime(w.At); !at.IsZero() {
		return a.L.T("end.wait.timer", reason, hhmm(at))
	}
	return a.L.T("end.wait.bare", reason)
}

func hhmm(t time.Time) string { return clock(t.UTC().Format(time.RFC3339)) }

// waitLine2 is the end line of a task resting on its wait: a still clock,
// what it waits for and when it looks next in 13 secondary ink, and, opened
// with a click, how it checks (the check, the judge, how often, its looks).
func (a *App) waitLine2(c *ui.Context, task *store.Task, w *protocol.Waiter) {
	t := a.T
	words := autospace(a.waitWords(w))
	key := "endwait:" + task.ID
	open := a.open[key]
	expandable := w.Check != nil || w.Event != nil
	ui.Column(c.Key("waitline")).MinWidth(0).Role(ui.RoleStatus).Children(func() {
		if a.stepLine(c, words, expandable, open, func(ui.Element) {
			a.glyph(c, 16, drawClock(t.InkMuted))
			ui.Text(c, words).FontSize(stepSize).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).Tooltip(words).AccessHidden(true)
		}) {
			a.open[key] = !open
		}
		if !open || !expandable {
			return
		}
		row := func(label string, body func()) {
			ui.Column(c.Key(label)).Gap(2).MinWidth(0).Children(func() {
				ui.Text(c, label).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
				body()
			})
		}
		value := func(s string) {
			ui.Text(c, s).FontSize(stepSize).LineHeight(leadingFor(s, 1.5)).TextColor(t.InkSoft).Selectable()
		}
		ui.Column(c.Key("waitdetail")).Gap(t.S3).Padding(t.S2, 0, t.S1, 22).MinWidth(0).Children(func() {
			a.waitRows(c, task, false, row, value)
			if last := store.ParseTime(w.LastLookAt); !last.IsZero() {
				row(a.L.T("wait.last", ""), func() { value(hhmm(last)) })
			}
		})
	})
}

// promptLine is a wake's or what Ducter told it, as a hairline's words with
// its time (D271).
func (a *App) promptLine(task *store.Task, p *Block) string {
	at := clock(a.tsOf(task, p.Seq))
	if p.K == "wake" {
		if p.Timer {
			return a.L.T("wake.timer", at)
		}
		return a.L.T("wake.over", at)
	}
	switch p.Say {
	case "lent":
		return a.L.T("told.lent", p.Name, at)
	case "returned":
		if p.Name != "" {
			return a.L.T("told.returned.name", p.Name, at)
		}
		return a.L.T("told.returned", at)
	case "declined", "stopped", "reopened":
		return a.L.T("told."+p.Say, at)
	case "taken_back", "given_back", "loan_lost": // D280: the loan of the person's phone ended
		return a.L.T("told."+p.Say, phoneShort(p.Name), at)
	}
	return a.L.T("told.other", a.S.PersonaName, at)
}

// dividerTip is a hairline with a small label, its tip on hover.
func (a *App) dividerTip(c *ui.Context, label, tip string) {
	t := a.T
	ui.Row(c.Key("hair")).Gap(t.S2).MinHeight(24).AlignItems(ui.Center).Label(label).Children(func() {
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
		tx := ui.Text(c, label).FontSize(t.XXS).TextColor(t.InkMuted).SingleLine().Shrink(0).FontFeatures("tnum").AccessHidden(true)
		if tip != "" {
			tx.Tooltip(tip)
		}
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
	})
}

// voice is the agent's words (D271): the words, then one quiet line that
// says "保存了进度" when it saved them, and on hover its time, how long its
// turn worked and Copy.
func (a *App) voice(c *ui.Context, task *store.Task, b *Block) {
	t := a.T
	col := ui.Column(c.Key("voice")).Gap(2).MinWidth(0)
	hover := col.Hovered()
	took := a.tpage.took
	col.Children(func() {
		markdown.View(c, autospace(b.Text), a.mdFor(b.Text))
		if !b.Saved && !hover {
			return
		}
		meta := ui.Row(c.Key("meta")).Gap(t.S2).MinHeight(16).AlignItems(ui.Center).MinWidth(0)
		if !b.Saved {
			// Over the gap under the words, so nothing moves when it shows.
			meta.Absolute().Left(0).Bottom(-15)
		}
		meta.Children(func() {
			ink := t.InkMuted.Alpha(0.8)
			if b.Saved {
				ui.Text(c, a.L.T("task.saved")).FontSize(t.XXS).TextColor(ink).Shrink(0)
			}
			if !hover {
				return
			}
			var parts []string
			if at := clock(a.tsOf(task, b.Seq)); at != "" {
				parts = append(parts, at)
			}
			if took != "" {
				parts = append(parts, took)
			}
			if b.Saved && len(parts) > 0 {
				ui.Text(c, "·").FontSize(t.XXS).TextColor(ink).Shrink(0)
			}
			if len(parts) > 0 {
				ui.Text(c, strings.Join(parts, " · ")).FontSize(t.XXS).TextColor(ink).FontFeatures("tnum").Shrink(0)
			}
			label := a.L.T("reply.copy")
			cp := ui.Text(c.Key("copy"), label).FontSize(t.XXS).FontWeight(600).TextColor(t.InkSoft).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label)
			if cp.Hovered() {
				cp.TextColor(t.Ink)
			}
			if cp.Clicked() {
				c.WriteClipboard(copyText(b.Text))
			}
		})
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

// ---------- the locator (D271) ----------

// locatorLine is a turn's line in the locator: the first line of what was
// said, or the hairline's words for a wake.
func (a *App) locatorLine(task *store.Task, tu *Turn) string {
	p := tu.Prompt
	if p == nil {
		return ""
	}
	switch p.K {
	case "wake", "told":
		return a.promptLine(task, p)
	case "you":
		if p.Go != nil {
			return a.shortGo(*p.Go)
		}
	case "brief":
		return a.L.T("locator.brief") + " · " + firstLine(p.Text)
	}
	return firstLine(p.Text)
}

// locatorEntry is one line of the locator's list: a turn, or a run of
// consecutive wakes said once ("等到了 24 次 · 1:51–19:06"), so a long loop
// doesn't bury what was said to it (D271).
type locatorEntry struct {
	from, to int
	line     string
}

func (a *App) locatorEntries(task *store.Task, turns []Turn) []locatorEntry {
	var out []locatorEntry
	for i := 0; i < len(turns); i++ {
		p := turns[i].Prompt
		j := i
		if p != nil && p.K == "wake" {
			for j+1 < len(turns) && turns[j+1].Prompt != nil && turns[j+1].Prompt.K == "wake" {
				j++
			}
		}
		if j > i {
			first := clock(a.tsOf(task, turns[i].Prompt.Seq))
			last := clock(a.tsOf(task, turns[j].Prompt.Seq))
			out = append(out, locatorEntry{i, j, a.L.T("locator.wakes", j-i+1, first, last)})
		} else {
			out = append(out, locatorEntry{i, i, a.locatorLine(task, &turns[i])})
		}
		i = j
	}
	return out
}

// locator is the rail at the transcript's right edge (wide windows): one
// small bar per turn, the ones in view in ink, the rest faint; hovered, a
// clay card lists what was said, newest at the bottom, the ones in view
// marked; a click goes to that turn.
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
	rail.Draw(func(p *ui.Painter, r ui.Rect) {
		for i := 0; i < n; i++ {
			y := r.Y + 2
			if n > 1 {
				y += (r.H - 4) * float32(i) / float32(n-1)
			}
			col, w := t.Faint.Alpha(0.7), float32(8)
			if inView(i) {
				col, w = t.Ink.Alpha(0.75), 10
			}
			p.Fill(ui.Rect{X: r.X + r.W - w, Y: y - 1, W: w, H: 2.5}, col, 1.25)
		}
	})
	hovered := rail.Hovered() || rail.Focused()
	if open || hovered {
		ui.Overlay(c, func() {
			pop := ui.Column(c.Key("locpop")).AttachTo(rail, ui.AnchorBottomLeft, ui.AnchorBottomRight).Width(300).
				Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LineSoft).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
				Padding(t.S2).Role(ui.RoleList).Label(name)
			hovered = hovered || pop.Hovered()
			pop.Children(func() {
				ui.Scroll(c.Key("locscroll")).MaxHeight(420).Children(func() {
					ui.Column(c).Gap(1).Children(func() {
						for _, e := range a.locatorEntries(task, turns) {
							line := autospace(e.line)
							here := false
							for k := e.from; k <= e.to; k++ {
								here = here || inView(k)
							}
							i := e.to
							row := ui.Row(c.Key(turns[e.from].Seq)).Gap(t.S2).MinHeight(26).Padding(0, t.S2).Radius(t.RadiusXS).AlignItems(ui.Center).MinWidth(0).
								Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(line)
							if row.Hovered() {
								row.Background(t.SurfaceSunken)
							}
							row.Children(func() {
								mark := t.Faint.Alpha(0.6)
								ink := t.InkSoft
								if here {
									mark, ink = t.Ink.Alpha(0.75), t.Ink
								}
								ui.Box(c).Size(3, 12).Radius(1.5).Background(mark).Shrink(0)
								tx := ui.Text(c, line).FontSize(stepSize).TextColor(ink).SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
								if here {
									tx.FontWeight(600)
								}
							})
							if row.Clicked() {
								ls.ScrollTo(i+1, ui.Start)
								hovered = false
							}
						}
					})
				})
			})
		})
	}
	a.tpage.locOpen = hovered
}
