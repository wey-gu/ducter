package views

// D427: what an Ongoing card says when a promise isn't kept on time (late,
// failing, back after a stop by mistake), its last run in one line, where it
// runs with which agent, and 多久跑一轮 / How often for a task in rounds.
// On time it says nothing (silence means fine).

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// ongoingRhythms are the rhythms a task in rounds can take, in minutes.
var ongoingRhythms = []int{15, 30, 45, 60, 120, 240}

// ongoingHealthLine is the health in words, each its own fact (D291).
func (a *App) ongoingHealthLine(h *protocol.OngoingHealth) []string {
	if h.State == "back" {
		return []string{a.L.T("og.h.back", a.ongoingAt(store.ParseTime(h.Since)))}
	}
	if h.State == "failing" {
		n := h.Fails
		if n == 0 {
			n = 3
		}
		return []string{a.L.T("og.h.failing", n)} // its why is the last round's line under it
	}
	why := h.Detail
	switch h.Why {
	case "asleep":
		if h.Detail != "" {
			why = a.L.T("og.h.asleep", h.Detail)
		} else {
			why = a.L.T("og.h.asleep.any")
		}
	case "quota":
		if at := store.ParseTime(h.ResetsAt); !at.IsZero() {
			why = a.L.T("og.h.quota", a.ongoingWhen(at))
		} else {
			why = a.L.T("og.h.quota.any")
		}
	case "signin":
		why = a.L.T("og.h.signin")
	case "stuck":
		why = a.L.T("og.h.stuck")
	case "lost":
		why = a.L.T("og.h.lost")
	}
	late := ""
	if h.LateMin > 0 && h.Why != "quota" {
		late = a.L.T("og.h.late", a.duration(time.Duration(h.LateMin)*time.Minute))
	}
	// D429: another computer awake to take it, its own fact beside the
	// button that moves it there.
	awake := ""
	if h.Fix == "move" && h.MoveTo != nil {
		awake = a.L.T("og.h.awake", h.MoveTo.Name)
	}
	return nonEmpty(late, why, awake)
}

// ongoingLastLine is the last run or round: when, and its one line.
func (a *App) ongoingLastLine(it *protocol.OngoingItem) []string {
	l := it.Last
	if l == nil || it.State == "running" {
		return nil
	}
	key := "og.last"
	if it.Kind == "routine" {
		key = "og.last.run"
	}
	line := l.Line
	if line == "" {
		line = a.L.T("og.run." + l.State)
	}
	return []string{a.L.T(key, a.ongoingAt(store.ParseTime(l.At))), line}
}

// drawHealth is the health line's small mark: a clock running behind, a
// warning, or an arrow come round again (back).
func drawHealth(state string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	if state == "late" {
		return drawClock(col)
	}
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		if state == "failing" {
			m.MoveTo(cx, cy-6)
			m.LineTo(cx+6.5, cy+5.5)
			m.LineTo(cx-6.5, cy+5.5)
			m.Close()
			p.StrokePath(&m, 1.8, col)
			var b ui.Path
			b.MoveTo(cx, cy-1.5)
			b.LineTo(cx, cy+1.6)
			p.StrokePath(&b, 1.8, col)
			var d ui.Path
			d.Circle(cx, cy+3.6, 0.9)
			p.FillPath(&d, col)
			return
		}
		// back: an arc nearly round, its arrowhead at the start.
		m.Circle(cx, cy, 5.8).Trim(0.1, 0.9)
		p.StrokePath(&m, 1.8, col)
		var h ui.Path
		h.MoveTo(cx-6.4, cy-5.6)
		h.LineTo(cx-4.4, cy-3.5)
		h.LineTo(cx-1.6, cy-4.6)
		p.StrokePath(&h, 1.8, col)
	}
}

// ongoingHealthRow draws the health line in its state's ink.
func (a *App) ongoingHealthRow(c *ui.Context, it *protocol.OngoingItem) {
	h := it.Health
	if h == nil || it.State == "paused" {
		return
	}
	t := a.T
	ink := t.Waiting.Ink
	switch h.State {
	case "failing":
		ink = t.Failed.Ink
	case "back":
		ink = t.InkSoft // D441: good news is said once, quietly
	}
	parts := a.ongoingHealthLine(h)
	ui.Row(c.Key("health")).Gap(t.S2).Wrap().AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Label(spoken(a.L, parts...)).Children(func() {
		a.glyph(c, 14, drawHealth(h.State, ink))
		for i, p := range parts {
			// D441: the state in its ink; what explains it in the soft ink.
			w, col := 600, ink
			if h.State == "back" || i > 0 {
				w, col = 500, t.InkSoft
			}
			uiText(c, p).FontSize(t.SM).FontWeight(w).TextColor(col).SingleLine().Shrink(1).MinWidth(0).Tooltip(p) // D429: the facts wrap; one too long for its line clips
		}
	})
}

// ongoingLastRow draws the last run's when and its one line.
func (a *App) ongoingLastRow(c *ui.Context, it *protocol.OngoingItem) {
	parts := a.ongoingLastLine(it)
	if len(parts) == 0 {
		return
	}
	t := a.T
	ui.Row(c.Key("last")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
		uiText(c, parts[0]).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(0).FontFeatures("tnum")
		uiText(c, parts[1]).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0).Tooltip(parts[1])
	})
}

// ongoingWhereFacts is where it runs and which agent, each its own fact.
func ongoingWhereFacts(w *protocol.OngoingWhere) []string {
	if w == nil {
		return nil
	}
	h := ""
	if w.Harness != "" {
		h = harnessName(w.Harness)
	}
	return nonEmpty(w.DeviceName, h)
}

// ongoingRhythmPick sends a new rhythm and shows it at once (the home's list follows).
func (a *App) ongoingRhythmPick(it *protocol.OngoingItem, minutes int) {
	a.send(protocol.OngoingAct{T: "ongoing_action", Kind: it.Kind, ID: it.ID, Action: "every", Minutes: minutes})
	it.EveryMs = int64(minutes) * 60_000
}
