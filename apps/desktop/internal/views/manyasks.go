package views

import (
	"fmt"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D426: several things in one message, line by line under the person's own
// words: each thing in their words with its mark (the tick, working bars,
// flag and cross On hand's groups draw), one quiet note of what came of it,
// and from four lines a count. The lines change in place and never post. A
// row opens the task that does it; who does it (the agent) is never in the
// conversation, only on hover, quietly at the row's end (D426 (3)). The
// web draws the same (apps/web/src/asks.tsx).

// askMarkKind is a line's state as drawGroupMark's kind.
func askMarkKind(state string) string {
	switch state {
	case protocol.AskDone:
		return "done"
	case protocol.AskNeedsYou:
		return "needs"
	case protocol.AskFailed:
		return "failed"
	}
	return "working"
}

// askNote is what a row says under its words: the task's note, else the
// state when it needs saying.
func (a *App) askNote(l protocol.AskLine) string {
	if l.Note != "" {
		return l.Note
	}
	switch l.State {
	case protocol.AskNeedsYou:
		return a.L.T("asks.needs")
	case protocol.AskFailed:
		return a.L.T("asks.failed")
	}
	return ""
}

// askLines draws the lines under one of the person's messages (two or more;
// one thing asked looks as it always did).
func (a *App) askLines(c *ui.Context, e *store.Entry) {
	if e.Asks == nil || len(e.Asks.Lines) < 2 {
		return
	}
	t := a.T
	lines := e.Asks.Lines
	ui.Row(c.Key(fmt.Sprint("asks:", e.FirstSeq))).Padding(4, 0, 0, 0).Children(func() {
		ui.Spacer(c)
		ui.Column(c.Key("card")).Gap(1).Padding(4, 4, 4, 4).Radius(16).Background(t.Surface).Border(1, t.Line).
			MaxWidth(t.BubbleMeasure).MaxWidthPercent(76).Children(func() {
			for i, l := range lines {
				l := l
				rt := &replyTo{seq: e.FirstSeq, from: "you", quote: l.Words, line: true, ask: i}
				a.manyAskRow(c, fmt.Sprint("ask:", i), l, rt)
			}
			if done, left, ok := protocol.AsksCount(lines); ok {
				uiText(c, a.L.T("asks.count", done, left)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Padding(2, 10, 4, 34)
			}
		})
	})
}

// manyAskRow is one line: its mark, the person's words, the note under them.
// Under the message (rt set), a click opens its task, a hover shows who does
// it and the reply pebble in the gutter left of the card, and a right click
// says 回复这一条 / Reply to this one (D430).
func (a *App) manyAskRow(c *ui.Context, key string, l protocol.AskLine, rt *replyTo) {
	t := a.T
	link := rt != nil
	task := a.S.Task(l.TaskID)
	if l.TaskID == "" {
		task = nil
	}
	row := ui.Row(c.Key(key)).Gap(8).AlignItems(ui.Start).MinHeight(32).Padding(6, 10, 6, 6).Radius(12)
	pointed := link && (row.Hovered() || a.rp.held == rt.key())
	hov := pointed && task != nil
	if hov {
		row.Background(t.SurfaceSunken).Cursor(ui.CursorPointer)
	}
	who := ""
	if task != nil {
		who = harnessName(task.Harness())
	}
	// A click on the pebble replies; anywhere else on the row opens its task.
	if link && task != nil && row.Clicked() && a.rp.held != rt.key() {
		a.OpenTask(task.ID)
	}
	note := a.askNote(l)
	row.Label(l.Words + map[bool]string{true: ": " + note, false: ""}[note != ""])
	if link {
		a.replyMenu(c, row, rt, l.Words)
	}
	row.Children(func() {
		if link {
			// D256's pebble, the person's side: in the gutter left of the
			// card, on this line's bottom; the bridge keeps the hover while
			// the pointer crosses the card's inset.
			out := float32(4) + a.pebbleGap()
			reach := out + pebbleSize + 112
			ui.Row(c.Key("bridge")).Absolute().Left(-reach-6).Bottom(1).Width(reach).Height(pebbleSize).Padding(0, out, 0, 0).
				Justify(ui.End).AlignItems(ui.Center).AccessHidden(!pointed).Children(func() {
				if pointed {
					a.replyButton(c, rt, -1)
				}
			})
		}
		k := askMarkKind(l.State)
		if k == "working" {
			ui.Box(c.Key("pulse")).Size(20, 20).Radius(10).Background(t.Working.Surface).Shrink(0).AccessHidden(true).Draw(drawPulse(t.Working.Dot, phaseOf(key+l.TaskID), a.aliveResting(c)))
		} else {
			fill := map[string]ui.Color{"done": t.Done.Dot, "needs": t.NeedsYou.Dot, "failed": t.Failed.Dot}[k]
			ui.Box(c.Key("mark")).Size(20, 20).Shrink(0).AccessHidden(true).Draw(drawGroupMark(k, fill, t.Surface))
		}
		ink := t.Ink
		if l.State == protocol.AskDone {
			ink = t.InkSoft
		}
		ui.Column(c.Key("words")).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c, autospace(l.Words)).FontSize(t.SM).FontWeight(600).LineHeight(1.5).TextColor(ink).Wrap()
			if note != "" {
				n := uiText(c, autospace(note)).FontSize(t.XS).LineHeight(1.4).TextColor(t.InkMuted).Wrap()
				if l.State == protocol.AskNeedsYou {
					n.FontWeight(600).TextColor(t.NeedsYou.Ink)
				}
			}
		})
		if hov && who != "" {
			uiText(c, who).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0).AlignSelf(ui.Center)
		}
	})
}

// taskAsks draws, in the opened task, the things of a many-things message
// it does (the agent is already in the task's own meta).
func (a *App) taskAsks(c *ui.Context, taskID string) {
	for i := len(a.S.Channel) - 1; i >= 0; i-- {
		as := a.S.Channel[i].Asks
		if as == nil || len(as.Lines) < 2 {
			continue
		}
		var mine []protocol.AskLine
		for _, l := range as.Lines {
			if l.TaskID == taskID {
				mine = append(mine, l)
			}
		}
		if len(mine) == 0 {
			continue
		}
		t := a.T
		ui.Column(c.Key("task-asks")).Gap(1).Padding(4, 4, 4, 4).Radius(16).Background(t.Surface).Border(1, t.Line).Children(func() {
			for j, l := range mine {
				a.manyAskRow(c, fmt.Sprint("task-ask:", j), l, nil)
			}
		})
		return
	}
}
