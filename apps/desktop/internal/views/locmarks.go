package views

// D524: the locator's marks. One small drawn mark per landmark, the same on
// the rail and in its card, so the rail reads at a glance and the card's row
// is the mark under the pointer:
//
//	the person's words      a dot in the person's orange (their bubble's)
//	the partner's words     a dot in the partner's own clay
//	a task handed over      a rounded square, in whose hand it came from
//	a result                a ring: done green, failed red, progress ink
//	an ask that waits       a ring round a dot, in the needs-you orange
//	                        while it waits, muted once answered
//	anything quiet          a small faint dot (a wake, a note, a compaction)
//
// Shape says what it is, tone says whose; every colour is a token.

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

type markShape int

const (
	markFaint markShape = iota
	markDot
	markSquare
	markRing
	markAsk
)

// locMark is one landmark's mark: its shape, its tone, and how much it
// matters when two meet on a crowded rail (the higher is drawn).
type locMark struct {
	shape markShape
	tone  ui.Color
	rank  int
}

// partnerTone is the task's partner's clay as a mark.
func (a *App) partnerTone(task *store.Task) ui.Color {
	id := ""
	if task.Card != nil {
		id = task.Card.Persona
	}
	if id == "" && len(task.Events) > 0 {
		id = task.Events[0].Persona
	}
	look := "sand"
	if p := a.partnerByID(id); p != nil && p.Look != "" {
		look = p.Look
	}
	return theme.LookTone(a.T.ClayMark, look)
}

// markOf is a landmark's mark; waiting says an ask still waits for the person.
func (a *App) markOf(lm *Landmark, partner ui.Color, waiting bool) locMark {
	t := a.T
	switch lm.K {
	case "you":
		return locMark{markDot, t.UserBubble, 5}
	case "partner":
		return locMark{markDot, partner, 4}
	case "brief":
		if lm.By == "you" {
			return locMark{markSquare, t.UserBubble, 5}
		}
		return locMark{markSquare, partner, 5}
	case "report":
		switch lm.S {
		case "ask":
			if waiting {
				return locMark{markAsk, t.NeedsYou.Strong, 7}
			}
			return locMark{markAsk, t.InkMuted, 3}
		case "done":
			return locMark{markRing, t.Done.Strong, 3}
		case "failed":
			return locMark{markRing, t.Failed.Dot, 6}
		}
		return locMark{markRing, t.InkMuted, 2}
	}
	return locMark{markFaint, t.Faint, 0}
}

// drawMark draws m centred on (x, y), at alpha k (0–1).
func drawMark(p *ui.Painter, m locMark, x, y, k float32) {
	c := m.tone.Alpha(float32(m.tone.A) / 255 * k)
	switch m.shape {
	case markDot:
		p.Fill(ui.Rect{X: x - 2.5, Y: y - 2.5, W: 5, H: 5}, c, 2.5)
	case markSquare:
		p.Fill(ui.Rect{X: x - 2.75, Y: y - 2.75, W: 5.5, H: 5.5}, c, 1.5)
	case markRing:
		p.Stroke(ui.Rect{X: x - 3, Y: y - 3, W: 6, H: 6}, c, 3, 1.5)
	case markAsk:
		p.Stroke(ui.Rect{X: x - 3.75, Y: y - 3.75, W: 7.5, H: 7.5}, c, 3.75, 1.25)
		p.Fill(ui.Rect{X: x - 1.5, Y: y - 1.5, W: 3, H: 3}, c, 1.5)
	default:
		p.Fill(ui.Rect{X: x - 1.25, Y: y - 1.25, W: 2.5, H: 2.5}, c, 1.25)
	}
}

// lastAsk is the newest landmark that is an ask, if the task still waits on
// the person (else -1): only it is drawn as waiting.
func lastAsk(lms []Landmark, task *store.Task) int {
	if task.Attention() != "needs_you" {
		return -1
	}
	for i := len(lms) - 1; i >= 0; i-- {
		if lms[i].K == "report" {
			if lms[i].S == "ask" {
				return i
			}
			return -1
		}
	}
	return -1
}
