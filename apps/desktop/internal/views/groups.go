package views

// D360: 分组 / Groups on On hand: several tasks that are one piece of work,
// as one card in its most urgent part's section: the name, beads and "3 件
// 里做完 1 件", the parts in order (a part waiting its turn says 排着), how
// they run, and a stopped line's three ways on. A part that needs the person
// shows its question inside the card. The web draws the same
// (apps/web/src/onhand.tsx GroupCard, groups-view.ts).

import (
	"fmt"
	"math"

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
	laneOf := func(id string) int {
		for i, l := range b.Lanes {
			for _, x := range l {
				if x.ID == id {
					return i
				}
			}
		}
		return -1
	}
	var out []boardGroup
	for _, g := range a.S.OnHand.Groups {
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
	card := ui.Column(c.Key("group:"+g.ID)).Gap(t.S2).Padding(14, 16, 12, 16).Radius(20).Background(t.Surface).
		Shadow(0, 2, 0, 0, ledge).Shadow(0, 8, 18, -12, t.Ink.Alpha(0.22)).Role(ui.RoleGroup).Label(g.Name)
	a.contextMenu(c, card, func(m *ui.Menu) {
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
	})
	card.Children(func() {
		ui.Row(c.Key("head")).Gap(10).AlignItems(ui.Center).MinHeight(28).Children(func() {
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
				uiText(c, g.Name).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
			}
			ui.Spacer(c)
			ui.Row(c.Key("beads")).Gap(4).AlignItems(ui.Center).AccessHidden(true).Children(func() {
				for _, r := range bg.rows {
					col := t.Line
					switch groupMark(r) {
					case "done":
						col = t.Done.Dot
					case "working":
						col = t.Working.Dot
					case "needs":
						col = t.NeedsYou.Dot
					case "failed", "dropped":
						col = t.Failed.Dot
					}
					b := ui.Box(c).Size(8, 8).Radius(4).Shrink(0)
					if k := groupMark(r); k == "held" || k == "waiting" {
						b.Border(1.5, t.InkSoft)
					} else {
						b.Background(col)
					}
				}
			})
			if len(bg.rows) > 0 {
				uiText(c, a.L.T("group.done", bg.done, len(bg.rows))).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
			}
		})
		var held []groupRow
		for _, r := range bg.rows {
			if r.taskID == "" {
				held = append(held, r)
			}
		}
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
			ui.Column(c.Key("part:" + key)).Gap(t.S1).Children(func() {
				row := ui.Row(c.Key("row")).Gap(10).AlignItems(ui.Center).MinHeight(32)
				row.Children(func() {
					uiText(c, fmt.Sprint(r.part)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").Width(16).Label(a.L.T("group.part", r.part))
					fill := map[string]ui.Color{"done": t.Done.Dot, "working": t.Working.Dot, "needs": t.NeedsYou.Dot, "failed": t.Failed.Dot, "dropped": t.Failed.Dot, "held": t.InkSoft, "waiting": t.Waiting.Ink}[k]
					if k == "working" {
						ui.Box(c.Key("pulse")).Size(20, 20).Radius(10).Background(t.Working.Surface).Shrink(0).AccessHidden(true).Draw(drawPulse(t.Working.Dot, phaseOf(key), a.aliveResting(c)))
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
					title := uiText(c, keepWords(autospace(shortTitle(r.title)))).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(r.title)
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
						if i := heldIndex(held, r.key); i > 0 && row.Hovered() && a.button(c, a.L.T("group.up"), btnText, t.ControlSM, t.Surface) {
							to := i - 1
							send(protocol.TaskGroupFrame{Op: "move", Member: r.key, To: &to})
						}
					case k == "needs":
						uiText(c, a.L.T("lane.needs_you")).FontSize(t.XS).FontWeight(600).TextColor(t.NeedsYou.Ink).SingleLine()
					case k == "failed" || k == "dropped":
						uiText(c, a.L.T(map[bool]string{true: "state.failed", false: "state.dropped"}[k == "failed"])).FontSize(t.XS).FontWeight(600).TextColor(t.Failed.Ink).SingleLine()
					case task != nil:
						a.heartbeat(c, task, task.Attention())
					}
				})
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
				key := "group.stopped." + s.why
				arg := s.next
				if s.nWaits > 1 {
					key, arg = key+".many", s.nWaits
				}
				uiText(c, a.L.T(key, s.part, arg)).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink).Wrap()
				ui.Row(c.Key("acts")).Gap(6).Wrap().Children(func() {
					if a.button(c, a.L.T("group.retry", s.part), btnSecondary, t.ControlSM, t.NeedsYou.Surface) {
						a.send(protocol.PastContinue{T: "past_continue", TaskID: s.taskID, Words: a.L.T("group.retry", s.part)})
					}
					if a.button(c, a.L.T("group.go", s.next), btnSecondary, t.ControlSM, t.NeedsYou.Surface) {
						send(protocol.TaskGroupFrame{Op: "next"})
					}
					drop := a.L.T("group.drop", s.next)
					if s.nWaits > 1 {
						drop = a.L.T("group.drop.many")
					}
					if a.button(c, drop, btnText, t.ControlSM, t.NeedsYou.Surface) {
						send(protocol.TaskGroupFrame{Op: "drop_rest"})
					}
				})
			})
		} else if len(held) > 0 && g.Hand == nil {
			ui.Row(c.Key("foot")).Gap(8).AlignItems(ui.Center).Padding(4, 0, 0, 26).Children(func() {
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
