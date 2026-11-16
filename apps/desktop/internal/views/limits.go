package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D297: a task resting on its agent's usage limit. The same words and
// shapes as the web (apps/web/src/work.tsx LimitCard, onhand.tsx
// groupLimits); the templates carry their own spaces, so they are filled
// with a.L.T, never padded.

// limitGrace is the reset's grace minute (core/src/limits.ts RESET_GRACE_MS).
const limitGrace = time.Minute

// limitAt is when a limit wait comes back: the reset itself (its grace
// minute left out), or the next try.
func (a *App) limitAt(w *protocol.Waiter) time.Time {
	at := store.ParseTime(w.At)
	if at.IsZero() {
		return at
	}
	if w.Limit != nil && w.Limit.ResetKnown {
		return at.Add(-limitGrace)
	}
	return at
}

// limitState is a limit wait as its state: 额度 3:12 恢复 / Limit resets 3:12.
func (a *App) limitState(w *protocol.Waiter) string {
	at := a.limitAt(w)
	if w.Limit != nil && w.Limit.ResetKnown && at.After(a.Now()) {
		return a.L.T("limit.state", a.soon(at))
	}
	return a.L.T("limit.state.unknown")
}

// limitNext is the On hand row's next line for a limit wait, with how far
// along toward the reset (or the next try) it is.
func (a *App) limitNext(w *protocol.Waiter) (string, float32) {
	at, from := store.ParseTime(w.At), store.ParseTime(w.ArmedAt)
	f := float32(0)
	if !at.IsZero() && !from.IsZero() && at.After(from) {
		f = min(1, max(0, float32(a.Now().Sub(from))/float32(at.Sub(from))))
	}
	return a.limitState(w), f
}

// limitCard is an opened task resting on its agent's limit: the ring
// filling toward the reset, whose limit ran out and when it carries on,
// 现在换 {agent} 接着做 / Hand it to {agent} now when another signed-in
// agent can take it, 不等了 / Stop waiting, and under them the choice to
// hand off right away next time.
func (a *App) limitCard(c *ui.Context, w *protocol.Waiter) {
	t := a.T
	l := w.Limit
	still := c.Preferences().ReduceMotion
	const size = 56
	_, frac, left, ok := a.backOf(w)
	inside := ""
	if ok {
		inside = a.leftWords(left)
	}
	breath := float32(1)
	if !still {
		ph := float64(c.Now().UnixMilli()%t.Breathe.Milliseconds()) / float64(t.Breathe.Milliseconds())
		breath = 1 + 0.3*0.5*float32(1-math.Cos(2*math.Pi*ph))
		c.After(50 * time.Millisecond)
	} else {
		c.After(30 * time.Second)
	}
	at := a.limitAt(w)
	back := ""
	if !at.IsZero() {
		if l.ResetKnown {
			back = a.L.T("limit.back", a.soon(at))
		} else {
			back = a.L.T("limit.back.unknown", a.soon(at))
		}
	}
	ui.Column(c.Key("limit")).Gap(t.S3 + 2).MaxWidth(readMeasure).Children(func() {
		ui.Row(c.Key("limitmain")).Gap(t.S3 + 2).AlignItems(ui.Center).Children(func() {
			ui.Box(c.Key("ring")).Size(size, size).Shrink(0).Role(ui.RoleImage).Label(a.limitState(w)).Draw(a.drawLookRing(frac, breath, false, 0)).Children(func() {
				if inside != "" {
					ui.Column(c).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
						ui.Text(c, inside).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).FontFeatures("tnum").SingleLine().AccessHidden(true)
					})
				}
			})
			ui.Column(c.Key("words")).Gap(4).MinWidth(0).Children(func() {
				ui.Text(c, a.L.T("limit.head", harnessName(l.Harness))).FontSize(t.MD).FontWeight(600).TextColor(t.Ink)
				if back != "" {
					ui.Text(c, back).FontSize(t.SM).TextColor(t.InkSoft).FontFeatures("tnum")
				}
			})
		})
		ui.Row(c.Key("limitbtns")).Gap(t.S2).Children(func() {
			if l.HandTo != nil {
				if a.button(c, a.L.T("limit.handoff", harnessName(l.HandTo.Harness)), btnSecondary, t.ControlSM, t.Bg) {
					a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "handoff"})
				}
			}
			if a.button(c, a.L.T("limit.cancel"), btnText, t.ControlSM, t.Bg) {
				a.send(protocol.WaiterAction{T: "waiter_action", WaiterID: w.WaiterID, Action: "cancel"})
			}
		})
		if l.HandTo != nil || w.LimitAuto {
			on := w.LimitAuto
			// A quiet line with its switch at the right, not a settings row.
			ui.Row(c.Key("limitauto")).Gap(t.S3).AlignItems(ui.Center).Padding(0, 4).Children(func() {
				ui.Text(c, a.L.T("limit.auto")).FontSize(t.SM).TextColor(t.InkMuted).Shrink(1).MinWidth(0).AccessHidden(true)
				if a.switchControl(c, "limitauto", a.L.T("limit.auto"), &on) {
					a.send(protocol.SettingsSet{T: "settings_set", Patch: protocol.SettingsPatch{LimitHandoff: &on}})
				}
			})
		}
	})
}

// limitGroup is waiting tasks on one agent's limit, two or more (D297).
type limitGroup struct {
	harness string
	tasks   []*store.Task
	w       *protocol.Waiter
}

// groupLimits is the waiting tasks that share one account's limit, two or
// more to a group, a known reset over a next try; in the order first met.
func (a *App) groupLimits(tasks []*store.Task) []limitGroup {
	var order []string
	by := map[string]*limitGroup{}
	for _, x := range tasks {
		w := a.S.WaiterFor(x.ID)
		if w == nil || w.Limit == nil {
			continue
		}
		g := by[w.Limit.Harness]
		if g == nil {
			g = &limitGroup{harness: w.Limit.Harness, w: w}
			by[w.Limit.Harness] = g
			order = append(order, w.Limit.Harness)
		}
		g.tasks = append(g.tasks, x)
		if w.Limit.ResetKnown && !g.w.Limit.ResetKnown {
			g.w = w
		}
	}
	var out []limitGroup
	for _, h := range order {
		if len(by[h].tasks) >= 2 {
			out = append(out, *by[h])
		}
	}
	return out
}

// limitGroupHead is the one line over a group: the small ring toward the
// reset, whose limit and when, and how many carry on then.
func (a *App) limitGroupHead(c *ui.Context, g limitGroup) {
	t := a.T
	name := harnessName(g.harness)
	words := a.L.T("limit.group.unknown", name)
	if at := a.limitAt(g.w); g.w.Limit.ResetKnown && at.After(a.Now()) {
		words = a.L.T("limit.group", name, a.soon(at))
	}
	_, f := a.limitNext(g.w)
	ui.Row(c.Key("limithead:"+g.harness)).Gap(6).AlignItems(ui.Center).Padding(6, 14).Children(func() {
		ui.Box(c.Key("ring")).Size(12, 12).Shrink(0).AccessHidden(true).Draw(drawRing(t.InkMuted.Alpha(0.5), t.Waiting.Ink, f))
		ui.Text(c, words).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").SingleLine()
		ui.Box(c).Grow(1)
		ui.Text(c, a.L.T("limit.group.n", len(g.tasks))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	})
}

// limitNote is the transcript's line where the agent's limit ran out: whose,
// and when it resets when the agent said.
func (a *App) limitNote(b *Block) string {
	if at := store.ParseTime(b.At); !at.IsZero() {
		return a.L.T("note.limit", b.Name, a.soon(at))
	}
	return a.L.T("note.limit.unknown", b.Name)
}
