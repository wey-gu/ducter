package views

import (
	"fmt"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// DoneGlow is how long the character shows "done" after a result.
const DoneGlow = 6 * time.Second

// presence is what the partner is up to, for its character: needs you
// when a decision is open, working while a task works or a turn is owed,
// done briefly after a result, idle otherwise.
func (a *App) presence(c *ui.Context) theme.Presence {
	b := a.S.Board()
	switch {
	case len(a.S.OpenDecisions()) > 0:
		return theme.NeedsYou
	case len(b.Lanes[store.LaneWorking]) > 0 || a.thinking():
		return theme.Working
	case len(b.Lanes[store.LaneWaiting]) > 0 || a.watching():
		// Nothing moving, something it waits for (D112): on its bench, looking out.
		return theme.Waiting
	}
	if left := a.doneAt.Add(DoneGlow).Sub(a.Now()); !a.doneAt.IsZero() && left > 0 {
		c.After(left)
		return theme.Done
	}
	return theme.Idle
}

var presenceLabel = map[theme.Presence]string{
	theme.Idle: "face.idle", theme.Working: "face.working", theme.NeedsYou: "face.needs_you",
	theme.Done: "face.done", theme.Napping: "face.napping", theme.Waiting: "face.waiting",
}

// watching: a wait for a condition (a check or an event) is armed.
func (a *App) watching() bool {
	for _, w := range a.S.ArmedWaiters() {
		if w.Check != nil || w.Event != nil {
			return true
		}
	}
	return false
}

// avatar is the clay character in a presence, cross-fading between
// presences (at once under reduced motion). No bouncing: it is company,
// not a mascot.
func (a *App) avatar(c *ui.Context, p theme.Presence, size float32) {
	label := a.L.T(presenceLabel[p], a.S.PersonaName)
	if theme.Art(p, size*2) == nil {
		fs := map[theme.Presence]FaceState{theme.Working: FaceWorking, theme.NeedsYou: FaceNeedsYou}[p]
		a.face(c, fs, size, label)
		return
	}
	still := c.Preferences().ReduceMotion
	box := ui.Box(c.Key("avatar")).Size(size, size).Role(ui.RoleImage).Label(label).Shrink(0)
	box.Children(func() {
		for _, q := range theme.Presences {
			bmp := theme.Art(q, size*2)
			if bmp == nil {
				continue
			}
			target := float32(0)
			if q == p {
				target = 1
			}
			op := target
			if !still {
				op = box.AnimateTo("op:"+string(q), target, ui.Animation{Duration: 360 * time.Millisecond})
			}
			if op < 0.01 {
				continue
			}
			// It breathes, and blinks while idle (D77).
			var lids *[2]theme.Lid
			if q == theme.Idle {
				lids = &squareLids
			}
			phase := phaseOf(fmt.Sprint("avatar", size))
			ui.Box(c.Key(q)).Size(size, size).Absolute().Top(0).Left(0).Opacity(op).Draw(func(p *ui.Painter, r ui.Rect) {
				clayArt(p, r, bmp, idleBreathe, phase, lids)
			})
		}
	})
}

// noteResults marks when a task last came back done, for the done glow.
func (a *App) noteResults(f protocol.ServerFrame) {
	for _, ev := range f.Events {
		if ev.Kind != protocol.KindTaskState || ev.Seq <= a.S.HeadSeq {
			continue // replays of the past don't glow
		}
		var st protocol.TaskState
		if ev.Decode(&st) == nil && st.Attention == protocol.Done {
			a.doneAt = a.Now()
			a.noteFirstResult(st)
		}
	}
}

// squareLids are the idle face's eyelids on the square art (theme.Art),
// mapped through where the cut-out idle art sits in it.
var squareLids = func() [2]theme.Lid {
	sq := theme.IdleSquareContent
	var out [2]theme.Lid
	for i, l := range theme.FaceLids {
		l.X, l.Y = sq.X+l.X*sq.W, sq.Y+l.Y*sq.H
		l.W, l.H = l.W*sq.W, l.H*sq.H
		out[i] = l
	}
	return out
}()
