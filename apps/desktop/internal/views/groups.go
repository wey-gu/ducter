package views

// D360: 分组 / Groups on On hand: several tasks that are one piece of work,
// as one card in its most urgent part's section: the name, beads and the
// conversation's count (好了 1 个，还有 2 个, D430), the parts in order (a part
// waiting its turn says 排着), how they run, and a stopped line's three ways
// on. D430: no counter noun; a part is named by its own words (partWords). A part that needs the person
// shows its question inside the card. The web draws the same
// (apps/web/src/onhand.tsx GroupCard, groups-view.ts).

import (
	"fmt"
	"math"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// groupRow is one part as the card draws it.
type groupRow struct {
	part   int
	taskID string // a task, or empty for a part held in line
	key    string
	title  string
	device string
	att    protocol.Attention
}

// boardGroup is a group that stands on the board.
type boardGroup struct {
	g       protocol.TaskGroup
	lane    int
	rows    []groupRow
	ids     map[string]bool
	done    int
	stopped *groupStop
}

type groupStop struct {
	why                string
	part, next, nWaits int
	taskID             string
}

// groupMark is a part's literal state.
func groupMark(r groupRow) string {
	if r.taskID == "" {
		return "held"
	}
	switch r.att {
	case protocol.Done, protocol.DoneClaimed, protocol.Superseded:
		return "done"
	case protocol.NeedsYou:
		return "needs"
	case protocol.Blocked:
		return "waiting"
	case protocol.Failed:
		return "failed"
	case protocol.Dropped:
		return "dropped"
	}
	return "working"
}

// boardGroups places each group of two or more parts with a task on the
// board in its most urgent part's lane (a stopped line: needs you).
func (a *App) boardGroups(b store.Board) []boardGroup {
	if a.S.OnHand == nil {
		return nil
	}
	// D517: a part that waits for the person (it asks, stopped, didn't work
	// out, or its PR can merge) puts the card in 等你, where the head counts
	// it; by the store's lanes alone a stopped part stood under 在等.
	laneOf := func(id string) int {
		for i, l := range b.Lanes {
			for _, x := range l {
				if x.ID == id {
					if a.waitsForYou(x) {
						return int(store.LaneNeedsYou)
					}
					return i
				}
			}
		}
		return -1
	}
	var out []boardGroup
	for _, g := range a.S.OnHand.Groups {
		if a.S.AwayNow[g.ID] { // D454: removed here, before the home's next On hand says so
			continue
		}
		// D385: a hand-over's group stands with one part (its plan, or as one task).
		if len(g.Members) < 2 && (g.Hand == nil || len(g.Members) == 0) {
			continue
		}
		bg := boardGroup{g: g, lane: 9, ids: map[string]bool{}}
		part := 0
		for _, m := range g.Members {
			// D385: plan first's own task is no part: once it has planned, its card says what it read.
			plan := g.Hand != nil && g.Hand.Plan != nil && m.TaskID != "" && m.TaskID == g.Hand.Plan.TaskID
			if plan {
				// Its task leaves its own section and sets where the card stands, never a part.
				if l := laneOf(m.TaskID); l >= 0 {
					bg.ids[m.TaskID] = true
					bg.lane = min(bg.lane, l)
				}
				continue
			}
			part++
			// D471: a part whose task is off the board (removed, gone) is no row: a lone number said nothing.
			if m.TaskID != "" && laneOf(m.TaskID) < 0 {
				continue
			}
			r := groupRow{part: part, taskID: m.TaskID, key: m.Key, title: m.Title, device: m.Device}
			if m.TaskID != "" {
				if t := a.S.Task(m.TaskID); t != nil {
					r.att, r.title = t.Attention(), t.Title()
				}
				if l := laneOf(m.TaskID); l >= 0 {
					bg.ids[m.TaskID] = true
					bg.lane = min(bg.lane, l)
				}
			}
			if groupMark(r) == "done" {
				bg.done++
			}
			bg.rows = append(bg.rows, r)
		}
		if g.Hand == nil && len(bg.rows) < 2 {
			continue // D471: one part left is that task's own row, never a group of one
		}
		if hv := g.Hand; hv != nil {
			// D385: what waits for the person (the plan, the review) stands in Needs you.
			if (hv.Plan != nil && (hv.Plan.State == "ready" || hv.Plan.State == "held")) || hv.Review == "ready" {
				bg.lane = 0
			} else if len(bg.ids) == 0 {
				if hv.Review == "sent" {
					continue
				}
				bg.lane = 1
			}
		} else if len(bg.ids) == 0 {
			continue
		}
		if s := g.Stopped; s != nil {
			at := -1
			for i, r := range bg.rows {
				if r.taskID == s.TaskID {
					at = i
				}
			}
			var after []groupRow
			if at >= 0 {
				for _, r := range bg.rows[at+1:] {
					if r.taskID == "" {
						after = append(after, r)
					}
				}
			}
			if len(after) > 0 {
				bg.stopped = &groupStop{why: s.Why, part: at + 1, next: after[0].part, nWaits: len(after), taskID: s.TaskID}
				bg.lane = 0
			}
		}
		out = append(out, bg)
	}
	return out
}

// groupCount is the card's count in the conversation's words (asks.count):
// only while something is done and something is left; a part that didn't
// work out counts in neither (D430).
func groupCount(rows []groupRow) (done, left int, ok bool) {
	for _, r := range rows {
		switch groupMark(r) {
		case "done":
			done++
		case "failed", "dropped":
		default:
			left++
		}
	}
	return done, left, done > 0 && left > 0
}

// linesOfPart is the lines one part does (a task's, or a member held in
// line by its key), from the newest message that has them (D430).
func (a *App) linesOfPart(taskID, held string) []protocol.AskLine {
	for i := len(a.S.Channel) - 1; i >= 0; i-- {
		as := a.S.Channel[i].Asks
		if as == nil || len(as.Lines) < 2 {
			continue
		}
		var mine []protocol.AskLine
		for _, l := range as.Lines {
			if (taskID != "" && l.TaskID == taskID) || (taskID == "" && held != "" && l.Held == held) {
				mine = append(mine, l)
			}
		}
		if len(mine) > 0 {
			return mine
		}
	}
	return nil
}

// partWords names a part: the person's own words when it does one line of
// their message, else its title (D430).
func (a *App) partWords(r groupRow) string {
	if ls := a.linesOfPart(r.taskID, r.key); len(ls) == 1 {
		return ls[0].Words
	}
	return shortTitle(r.title)
}

// stoppedGroups counts the lines that wait for the person's word (they
// count as needing you, D360).
func (a *App) stoppedGroups(b store.Board) int {
	n := 0
	for _, g := range a.boardGroups(b) {
		if g.stopped != nil {
			n++
		}
	}
	return n
}

// withoutGroups takes the tasks a group card shows out of their own section.
func withoutGroups(ts []*store.Task, in map[string]bool) []*store.Task {
	if len(in) == 0 {
		return ts
	}
	out := ts[:0:0]
	for _, x := range ts {
		if !in[x.ID] {
			out = append(out, x)
		}
	}
	return out
}

// drawGroupMark draws a part's mark: a filled disc with a tick, a cross
// or a bar; a hollow ring (dashed while it waits its turn).
func drawGroupMark(kind string, fill, on ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		switch kind {
		case "held", "waiting":
			var m ui.Path
			if kind == "held" {
				pt := func(a float64) (float32, float32) {
					return cx + 6*float32(math.Cos(a)), cy + 6*float32(math.Sin(a))
				}
				for i := 0; i < 8; i++ {
					a0 := float64(i) * math.Pi / 4
					m.MoveTo(pt(a0))
					m.LineTo(pt(a0 + 0.42))
				}
			} else {
				m.Circle(cx, cy, 6)
			}
			p.StrokePath(&m, 1.8, fill)
			return
		}
		p.FillPath(oval(cx, cy, 8.5, 8.5), fill)
		var m ui.Path
		switch kind {
		case "done":
			m.MoveTo(cx-3.8, cy+0.3)
			m.LineTo(cx-1, cy+3)
			m.LineTo(cx+4, cy-2.6)
		case "failed", "dropped":
			m.MoveTo(cx-3, cy-3)
			m.LineTo(cx+3, cy+3)
			m.MoveTo(cx+3, cy-3)
			m.LineTo(cx-3, cy+3)
		case "needs":
			m.MoveTo(cx, cy-4)
			m.LineTo(cx, cy+1)
			m.MoveTo(cx, cy+3.6)
			m.LineTo(cx, cy+3.8)
		}
		p.StrokePath(&m, 2.1, on)
	}
}

// groupCard is one group as one card.
func (a *App) groupCard(c *ui.Context, bg boardGroup) {
	t := a.T
	g := bg.g
	ledge := t.Line
	if bg.stopped != nil {
		ledge = t.NeedsYou.Ledge
	}
	send := func(f protocol.TaskGroupFrame) {
		f.T, f.GroupID = "task_group", g.ID
		a.send(f)
	}
	// D467: the board's one card shape: radius 16, the clay ledge, its state mark at the head.
	card := ui.Column(c.Key("group:"+g.ID)).Gap(t.S2).Padding(12, 16, 12, 14).Radius(16).Background(t.Surface).
		Shadow(0, 2, 0, 0, ledge).Shadow(0, 6, 14, -10, t.Ink.Alpha(0.16)).Role(ui.RoleGroup).Label(g.Name)
	// D454: a group none of whose parts is at work can leave On hand.
	fin := finishedGroup(bg)
	a.contextMenu(c, card, func(m *ui.Menu) {
		if fin != nil {
			a.finishedItems(c, m, *fin, false)
		}
		if m.Item(a.L.T("group.rename")).Chosen() {
			a.oh.groupRename, a.oh.groupDraft = g.ID, g.Name
		}
		order := "side_by_side"
		label := a.L.T("group.toSide")
		if g.Order == "side_by_side" {
			order, label = "one_by_one", a.L.T("group.toLine")
		}
		if m.Item(label).Chosen() {
			send(protocol.TaskGroupFrame{Op: "order", Order: order})
		}
		if m.Item(a.L.T("group.ungroup")).Chosen() {
			send(protocol.TaskGroupFrame{Op: "dissolve"})
		}
		if fin != nil && m.Item(a.L.T("away.remove")).Chosen() {
			a.PutAway(c, *fin)
		}
	})
	hover := card.Hovered() || card.FocusWithin()
	card.Children(func() {
		ui.Row(c.Key("head")).Gap(14).AlignItems(ui.Center).MinHeight(32).Children(func() {
			if a.oh.groupRename == g.ID {
				save := func() {
					if a.oh.groupDraft != "" && a.oh.groupDraft != g.Name {
						send(protocol.TaskGroupFrame{Op: "rename", Name: a.oh.groupDraft})
					}
					a.oh.groupRename = ""
				}
				ui.TextInput(c.Key("rename"), &a.oh.groupDraft).Label(a.L.T("group.rename")).Placeholder(a.L.T("group.rename.keys")).
					FontSize(t.MD).Padding(t.S1, t.S2).Radius(t.RadiusSM).Background(t.Sunken).Border(1, t.Line).Grow(1).OnSubmit(save)
				if c.Shortcut(0, ui.KeyEscape) {
					a.oh.groupRename = ""
				}
			} else {
				uiText(c, g.Name).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
			}
			ui.Spacer(c)
			// D467 round 3: the parts' track under the head is the group's one sign of progress.
			if done, left, ok := groupCount(bg.rows); ok {
				uiText(c, a.L.T("asks.count", done, left)).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
			}
			if fin != nil {
				// D524: the × in its kept room, faded in; the head never moves.
				a.revealSlot(c, "away-at", hover, func() { a.awayX(c, "away", *fin) })
			}
		})
		var held []groupRow
		for _, r := range bg.rows {
			if r.taskID == "" {
				held = append(held, r)
			}
		}
		a.groupTrack(c, bg) // D467: the parts as one track
		if g.Hand != nil {
			a.handGroupFacts(c, &g, len(held)) // D385: where it stands, the plan, review together
		}
		for _, r := range bg.rows {
			r := r
			key := r.taskID
			if key == "" {
				key = r.key
			}
			k := groupMark(r)
			ui.Column(c.Key("part:"+key)).Gap(t.S1).Padding(0, 0, 0, 40).Children(func() {
				row := ui.Row(c.Key("row")).Gap(10).AlignItems(ui.Center).MinHeight(32)
				row.Children(func() {
					uiText(c, fmt.Sprint(r.part)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").Width(16).AccessHidden(true)
					fill := map[string]ui.Color{"done": t.Done.Dot, "working": t.Working.Dot, "needs": t.NeedsYou.Dot, "failed": t.Failed.Dot, "dropped": t.Failed.Dot, "held": t.InkSoft, "waiting": t.Waiting.Ink}[k]
					if k == "working" {
						// D498: the board's mark at work: a pebble that beats with each step.
						var beat time.Time
						if pt := a.S.Task(r.taskID); pt != nil {
							beat = a.beatOf(pt)
						}
						ui.Box(c.Key("mark")).Size(20, 20).Shrink(0).AccessHidden(true).Draw(drawPebble(fill, beat, false))
					} else {
						ui.Box(c.Key("mark")).Size(20, 20).Shrink(0).AccessHidden(true).Draw(drawGroupMark(k, fill, t.Surface))
					}
					task := a.S.Task(r.taskID)
					ink := t.Ink
					if k == "held" {
						ink = t.InkMuted
					} else if k == "done" {
						ink = t.InkSoft
					}
					title := uiText(c, keepWords(autospace(a.partWords(r)))).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(r.title)
					if task != nil {
						title.Cursor(ui.CursorPointer).Role(ui.RoleLink)
						if title.Clicked() {
							a.OpenTask(task.ID)
						}
					}
					switch {
					case k == "held":
						words := a.L.T("group.held")
						if r.device != "" {
							words = a.L.T("group.held.on", a.computerName(r.device))
						}
						uiText(c, words).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
						if i := heldIndex(held, r.key); i > 0 {
							// D524: 往前 in its kept room, faded in on the part's hover.
							a.revealSlot(c, "up", row.Hovered() || row.FocusWithin(), func() {
								if a.button(c, a.L.T("group.up"), btnText, t.ControlSM, t.Surface) {
									to := i - 1
									send(protocol.TaskGroupFrame{Op: "move", Member: r.key, To: &to})
								}
							})
						}
					case k == "needs":
						uiText(c, a.L.T("lane.needs_you")).FontSize(t.XS).FontWeight(600).TextColor(t.NeedsYou.Ink).SingleLine()
					case k == "failed" || k == "dropped":
						uiText(c, a.L.T(map[bool]string{true: "state.failed", false: "state.dropped"}[k == "failed"])).FontSize(t.XS).FontWeight(600).TextColor(t.Failed.Ink).SingleLine()
					case task != nil:
						a.beat(c, task, task.Attention(), false) // D467: its mark draws the sign
					}
				})
				// D467: a part at work says what it is on now, as a task's card does.
				if task := a.S.Task(r.taskID); k == "working" && task != nil {
					s := a.storyOf(task)
					words := keepWords(autospace(s.words))
					if s.code != "" {
						words += "  " + s.code
					}
					held, op := a.aliveHeld(c, "part:"+key, words)
					uiText(c.Key("now:"+held), held).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft).MaxLines(2).
						Opacity(op).Padding(0, 0, 0, 52).Tooltip(s.words)
				}
				// What needs you never folds: its question inside the card.
				if k == "needs" {
					if d := a.S.PendingDecision(r.taskID); d != nil {
						ui.Column(c.Key("ask")).Padding(0, 0, 0, 46).Children(func() {
							a.decisionCard(c, d, r.taskID)
						})
					}
				}
			})
		}
		if s := bg.stopped; s != nil {
			ui.Column(c.Key("stop")).Gap(t.S2).Padding(10, 12).Radius(14).Background(t.NeedsYou.Surface).Children(func() {
				ended := autospace(a.partWords(bg.rows[s.part-1]))
				words := a.L.T("group.stopped."+s.why+".many", ended)
				if s.nWaits <= 1 {
					words = a.L.T("group.stopped."+s.why, ended, autospace(a.partWords(bg.rows[s.next-1])))
				}
				uiText(c, words).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink).Wrap()
				ui.Row(c.Key("acts")).Gap(6).Wrap().Children(func() {
					if a.button(c, a.L.T("group.retry"), btnSecondary, t.ControlSM, t.NeedsYou.Surface) {
						a.send(protocol.PastContinue{T: "past_continue", TaskID: s.taskID, Words: a.L.T("group.retry")})
					}
					if a.button(c, a.L.T("group.go"), btnSecondary, t.ControlSM, t.NeedsYou.Surface) {
						send(protocol.TaskGroupFrame{Op: "next"})
					}
					if a.button(c, a.L.T("group.drop"), btnText, t.ControlSM, t.NeedsYou.Surface) {
						send(protocol.TaskGroupFrame{Op: "drop_rest"})
					}
				})
			})
		} else if len(held) > 0 && g.Hand == nil {
			ui.Row(c.Key("foot")).Gap(8).AlignItems(ui.Center).Padding(4, 0, 0, 46).Children(func() {
				words := a.L.T("group.line")
				if g.Order == "side_by_side" {
					words = a.L.T("group.side")
				}
				uiText(c, words).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			})
		}
	})
}

func heldIndex(held []groupRow, key string) int {
	for i, r := range held {
		if r.key == key {
			return i
		}
	}
	return -1
}

// groupStateMark is a group's mark at its head (D467), the one a task's card
// has: by the section it stands in.
func (a *App) groupStateMark(c *ui.Context, bg boardGroup) {
	t := a.T
	size := float32(32)
	if a.compact() {
		size = 28
	}
	box := ui.Box(c.Key("gmark")).Size(size, size).Radius(size / 2).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).AccessHidden(true)
	switch bg.lane {
	case 0:
		box.Background(t.NeedsYou.Surface).Draw(drawGroupMark("needs", t.NeedsYou.Dot, t.Surface))
	case 1:
		box.Background(t.Working.Surface).Children(func() {
			ui.Box(c.Key("peb")).Size(12, 12).Draw(drawPebble(t.Working.Dot, time.Time{}, a.aliveResting(c)))
		})
	case 2:
		box.Background(t.SurfaceSunken).Draw(drawGroupMark("waiting", t.Waiting.Ink, t.Surface))
	default:
		box.Background(t.SurfaceSunken).Draw(drawGroupMark("done", t.InkMuted.Alpha(0.45), t.Surface))
	}
}
