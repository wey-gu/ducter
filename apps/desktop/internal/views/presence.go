package views

import (
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
	}
	if left := a.doneAt.Add(DoneGlow).Sub(a.Now()); !a.doneAt.IsZero() && left > 0 {
		c.After(left)
		return theme.Done
	}
	return theme.Idle
}

var presenceLabel = map[theme.Presence]string{
	theme.Idle: "face.idle", theme.Working: "face.working", theme.NeedsYou: "face.needs_you",
	theme.Done: "face.done", theme.Napping: "face.napping",
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
			ui.Image(c.Key(q), bmp).Size(size, size).Absolute().Top(0).Left(0).Opacity(op)
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
		}
	}
}
