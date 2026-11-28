package views

import (
	"fmt"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D653 (research/244 rules 1 and 8): one living card per subject under
// the message that started the work: its title in words, the state in one
// line, the newest real progress. It is revised in place and never a message
// of its own; the web draws the same (apps/web/src/subjects.tsx).

// subjectStateWord is the card's state as its one word, top-level (the state
// is a fact of its own, never joined to the line with a separator).
func (a *App) subjectStateWord(state string) string {
	switch state {
	case protocol.SubjectWaiting:
		return a.L.T("subject.waiting")
	case protocol.SubjectDone:
		return a.L.T("subject.done")
	case protocol.SubjectFailed:
		return a.L.T("subject.failed")
	default:
		return a.L.T("subject.working")
	}
}

// subjectCards draws the cards of the work this message started, under its
// words. A row opens the task that keeps the card.
func (a *App) subjectCards(c *ui.Context, e *store.Entry) {
	if len(e.Cards) == 0 {
		return
	}
	t := a.T
	ui.Row(c.Key(fmt.Sprint("subjects:", e.FirstSeq))).Padding(4, 0, 0, 0).Children(func() {
		ui.Spacer(c)
		ui.Column(c.Key("stack")).Gap(4).MaxWidth(t.BubbleMeasure).MaxWidthPercent(76).Children(func() {
			for _, card := range e.Cards {
				card := card
				ui.Column(c.Key("card:"+card.Key)).Padding(4, 4, 4, 4).Radius(16).Background(t.Surface).Border(1, t.Line).Children(func() {
					a.subjectCardRow(c, card)
				})
			}
		})
	})
}

func (a *App) subjectCardRow(c *ui.Context, card protocol.SubjectCard) {
	t := a.T
	word := a.subjectStateWord(card.State)
	ink := t.InkMuted
	switch card.State {
	case protocol.SubjectWaiting:
		ink = t.NeedsYou.Ink
	case protocol.SubjectDone:
		ink = t.Done.Ink
	case protocol.SubjectFailed:
		ink = t.Failed.Ink
	}
	row := ui.Row(c.Key("row")).Gap(8).AlignItems(ui.Start).MinHeight(34).Padding(6, 10, 6, 6).Radius(12)
	if card.TaskID != "" {
		if row.Hovered() {
			row.Background(t.SurfaceSunken).Cursor(ui.CursorPointer)
		}
		if row.Clicked() {
			a.OpenTask(card.TaskID)
		}
	}
	row.Label(card.Title + ": " + word)
	row.Children(func() {
		k := subjectMark(card.State)
		if k == "working" {
			ui.Box(c.Key("pulse")).Size(20, 20).Radius(10).Background(t.Working.Surface).Shrink(0).AccessHidden(true).Draw(drawPulse(t.Working.Dot, phaseOf("subject"+card.Key), a.aliveResting(c)))
		} else {
			fill := map[string]ui.Color{"done": t.Done.Dot, "needs": t.NeedsYou.Dot, "failed": t.Failed.Dot}[k]
			ui.Box(c.Key("mark")).Size(20, 20).Shrink(0).AccessHidden(true).Draw(drawGroupMark(k, fill, t.Surface))
		}
		ui.Column(c.Key("words")).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Row(c.Key("head")).Gap(8).AlignItems(ui.Center).Children(func() {
				uiText(c.Key("title"), autospace(card.Title)).FontSize(t.SM).FontWeight(600).LineHeight(1.5).TextColor(t.Ink).Wrap().Grow(1).Shrink(1).MinWidth(0)
				uiText(c.Key("state"), word).FontSize(t.XS).LineHeight(1.4).TextColor(ink).SingleLine().Shrink(0)
			})
			if card.Line != "" {
				uiText(c.Key("line"), autospace(card.Line)).FontSize(t.XS).LineHeight(1.4).TextColor(t.InkMuted).Wrap()
			}
			if card.Progress != "" && card.Progress != card.Line {
				uiText(c.Key("progress"), autospace(card.Progress)).FontSize(t.XS).LineHeight(1.4).TextColor(t.InkMuted).Wrap()
			}
		})
	})
}

// subjectMark is a card's state as drawGroupMark's kind (the same marks the
// lines under a message use).
func subjectMark(state string) string {
	switch state {
	case protocol.SubjectDone:
		return "done"
	case protocol.SubjectWaiting:
		return "needs"
	case protocol.SubjectFailed:
		return "failed"
	}
	return "working"
}
