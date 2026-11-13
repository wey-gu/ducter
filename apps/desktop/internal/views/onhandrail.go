package views

// On hand beside the opened task (D244, the Mac's half of D216's rail):
// an opened task is On hand's rail | the task | the workbench where the
// window has room, and Lody's two-slot rule where it has room for two
// only: opening the workbench swaps the rail out. A rail row has one
// status place, the partner's own small face (needs you > working > new
// result); a task that finished while nobody looked keeps its done face
// until it is opened, and a row seen working turns to it once.

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The window widths (points) the panes come at (D244).
const (
	railFrom  = 1100 // the rail beside the task
	threeFrom = 1560 // the rail, the task and the workbench
	slideDur  = 260 * time.Millisecond
	faceSize  = 24 // a row's status place
	handover  = 560 * time.Millisecond
)

// railWidth is the rail at a window w wide: 22% of it, 300 to 340.
func railWidth(w float32) float32 {
	return float32(math.Round(float64(min(max(w*0.22, 300), 340))))
}

// panes says which of the rail and the workbench stand beside the task at
// a window w wide.
func panes(w float32, bench bool) (rail, benchOn bool) {
	switch {
	case bench && w >= threeFrom:
		return true, true
	case bench:
		return false, true // two slots: the workbench takes the rail's place
	}
	return w >= railFrom, false
}

// ---------- what a row's status place says ----------

type rowMark string

const (
	stNone    rowMark = ""
	stNeeds   rowMark = "needs"
	stWorking rowMark = "working"
	stNew     rowMark = "new"
)

func finishedAtt(att protocol.Attention) bool {
	return att == protocol.Done || att == protocol.DoneClaimed || att == protocol.Failed
}

// newResult: it finished after this Mac last had it open, and after this
// Mac began keeping track (a fresh install shows none).
func (a *App) newResult(task *store.Task) bool {
	if !finishedAtt(task.Attention()) || task.Card == nil || task.Card.UpdatedAt == "" {
		return false
	}
	if a.Route == RouteTask && a.TaskID == task.ID {
		return false
	}
	at := store.ParseTime(task.Card.UpdatedAt)
	if since := store.ParseTime(a.Local.SeenSince(a.Now())); !since.IsZero() && !at.After(since) {
		return false
	}
	if seen := store.ParseTime(a.Local.SeenAt(task.ID)); !seen.IsZero() && !at.After(seen) {
		return false
	}
	return true
}

// rowMarkOf is what a row's one status place shows.
func (a *App) rowMarkOf(task *store.Task) rowMark {
	switch task.Attention() {
	case protocol.NeedsYou:
		return stNeeds
	case protocol.Working, protocol.Queued:
		return stWorking
	}
	if a.newResult(task) {
		return stNew
	}
	return stNone
}

// markOpenSeen keeps the open task seen at its card's latest time.
func (a *App) markOpenSeen(task *store.Task) {
	if task == nil || task.Card == nil {
		return
	}
	a.Local.MarkSeen(task.ID, task.Card.UpdatedAt, func(id string) bool { return a.S.Task(id) != nil })
}

// statusPresence is the face a status shows.
func statusPresence(task *store.Task, st rowMark) theme.Presence {
	switch st {
	case stNeeds:
		return theme.NeedsYou
	case stWorking:
		return theme.Working
	case stNew:
		if task.Attention() == protocol.Failed {
			return theme.NeedsYou
		}
		return theme.Done
	}
	return theme.Idle
}

func (a *App) statusLabel(task *store.Task, st rowMark) string {
	if st == stNew {
		return a.L.T("onhand.new")
	}
	return a.stateLabel(task.Attention())
}

// noteStatus remembers what a row showed, and starts the handover when a
// row seen working turns into a new result.
func (a *App) noteStatus(id string, st rowMark) {
	if a.oh.was == nil {
		a.oh.was = map[string]rowMark{}
		a.oh.handed = map[string]bool{}
	}
	if a.oh.was[id] == stWorking && st == stNew {
		a.oh.handed[id] = true // fresh: the face starts from the reading one
	}
	a.oh.was[id] = st
}

// stillFace is a clay face drawn still (a row's: rows never breathe).
func stillFace(c *ui.Context, key string, p theme.Presence, size float32) ui.Element {
	bmp := theme.Face(p, size*2)
	return ui.Box(c.Key(key)).Size(size, size).Shrink(0).AccessHidden(true).Draw(func(pt *ui.Painter, r ui.Rect) {
		if bmp != nil {
			pt.Image(bmp, fitIn(bmp, r), ui.Contain)
		}
	})
}

// statusFace is a row's status place: the partner's face for the state,
// and, once, the reading face giving way to the done face.
func (a *App) statusFace(c *ui.Context, task *store.Task, st rowMark) {
	label := a.statusLabel(task, st)
	box := ui.Box(c.Key("status")).Size(faceSize, faceSize).Shrink(0).Role(ui.RoleImage).Label(label).Tooltip(label)
	// The handover (about half a second, on the window's own clock): the
	// reading face sinks and fades, the done face pops up on a bouncy
	// curve. Less motion: a cross-fade only.
	still := c.Preferences().ReduceMotion
	k := float32(1)
	if fresh, ok := a.oh.handed[task.ID]; ok && st == stNew {
		if fresh {
			box.Jump("handover", 0)
			a.oh.handed[task.ID] = false
		}
		k = box.AnimateTo("handover", 1, ui.Animation{Duration: handover, Ease: ui.Linear, NonMotion: still})
		if k >= 1 {
			delete(a.oh.handed, task.ID)
		}
	}
	box.Children(func() {
		p := statusPresence(task, st)
		if k >= 1 {
			stillFace(c, "f:"+string(p), p, faceSize)
			return
		}
		out := stillFace(c, "f:out", theme.Working, faceSize).Absolute().Left(0).Top(0).Opacity(max(0, 1-k/0.4))
		in := stillFace(c, "f:"+string(p), p, faceSize).Absolute().Left(0).Top(0).Opacity(min(1, k/0.45))
		if !still {
			q := min(1, k/0.4)
			out.Translate(0, 5*q).Scale(1-0.2*q, 1-0.2*q)
			s := backOut(min(1, k/0.85))
			in.Scale(0.55+0.45*s, 0.55+0.45*s)
		}
	})
}

// backOut eases to 1 past it and back (a pop with one overshoot).
func backOut(x float32) float32 {
	const s = 2.2
	x--
	return x*x*((s+1)*x+s) + 1
}

// ---------- the rail ----------

// railOrder is the tasks in the rail's order (what ⌘⇧] walks), whether
// the rail is drawn or not.
func (a *App) railOrder() []string {
	b := a.S.Board()
	var out []string
	for _, l := range []store.Lane{store.LaneNeedsYou, store.LaneWorking, store.LaneWaiting, store.LaneDone} {
		for _, x := range b.Lanes[l] {
			out = append(out, x.ID)
		}
	}
	return out
}

// WalkTask opens the next (by 1) or the previous (by -1) task in the
// rail's order, from wherever the window is (⌘⇧] and ⌘⇧[).
func (a *App) WalkTask(by int) {
	o := a.railOrder()
	if len(o) == 0 {
		return
	}
	cur := a.TaskID
	if a.Route != RouteTask {
		cur = a.oh.focus
	}
	i := -1
	for n, id := range o {
		if id == cur {
			i = n
		}
	}
	switch {
	case i < 0 && by > 0:
		i = 0
	case i < 0:
		i = len(o) - 1
	default:
		i = max(0, min(len(o)-1, i+by))
	}
	a.oh.focus = o[i]
	if o[i] != a.TaskID || a.Route != RouteTask {
		a.OpenTask(o[i])
	}
}

// slide is a column whose width moves to w (0: gone) on Pebble's ease;
// under less motion it snaps. Its content is built while it shows.
func (a *App) slide(c *ui.Context, key string, w float32, body func(w float32)) {
	box := ui.Column(c.Key(key)).Shrink(0).MinHeight(0).ClipX()
	cur := box.AnimateTo("w", w, ui.Animation{Duration: slideDur, Ease: ui.EaseInOut})
	box.Width(cur)
	if a.slid == nil {
		a.slid = map[string]float32{}
	}
	if w > 0 {
		a.slid[key] = w // closing, the content keeps its width and is cut
	}
	if cur < 1 {
		return
	}
	full := a.slid[key]
	box.Children(func() {
		ui.Row(c.Key("in")).Width(full).Shrink(0).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() { body(full) })
	})
}

// benchW is the workbench's width at a window w wide: as dragged (520 by
// default), leaving the task at least 560.
func (a *App) benchW(w float32) float32 {
	bw := a.Local.BenchWidth()
	if bw <= 0 {
		bw = benchWidth
	}
	return max(benchMin, min(bw, benchMax, w-560))
}

// benchOpenable says whether the open workbench stands beside this task:
// it has pages, or it had while it was open (then it shows the launcher,
// never a blank and never closing on its own).
func (a *App) benchOpenable(task *store.Task) bool {
	return len(a.benchTabs(task)) > 0 || a.bench.had == task.ID
}

// onHandRail is On hand beside the opened task: the same rows, narrower,
// on the deeper ground; what needs you is a row here (its answer is in
// the task beside it).
func (a *App) onHandRail(c *ui.Context, w float32) {
	t := a.T
	b := a.S.Board()
	ui.Column(c.Key("rail-in")).Width(w).Grow(1).MinHeight(0).Background(t.BgDeep).Label(a.L.T("nav.onhand")).Children(func() {
		ui.Scroll(c.Key("rail-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Gap(t.S4).Padding(t.S4, t.S3, t.S6, t.S3).Children(func() {
				prev := a.oh.room
				a.oh.room = "rail"
				a.onHandList(c, b)
				a.oh.room = prev
			})
		})
	})
}

// foldMark is a folded group's one mark: the face of its most urgent
// task, and the counts in words for the hover and a screen reader.
func (a *App) foldMark(tasks []*store.Task) (st rowMark, of *store.Task, words string) {
	var needs, working, fresh int
	rank := map[rowMark]int{stNeeds: 3, stWorking: 2, stNew: 1}
	for _, x := range tasks {
		s := a.rowMarkOf(x)
		switch s {
		case stNeeds:
			needs++
		case stWorking:
			working++
		case stNew:
			fresh++
		}
		if rank[s] > rank[st] {
			st, of = s, x
		}
	}
	var parts []string
	if needs > 0 {
		parts = append(parts, a.L.T("onhand.fold.needs", needs))
	}
	if working > 0 {
		parts = append(parts, a.L.T("onhand.fold.working", working))
	}
	switch {
	case fresh == 1:
		parts = append(parts, a.L.T("onhand.fold.new.one"))
	case fresh > 1:
		parts = append(parts, a.L.T("onhand.fold.new", fresh))
	}
	return st, of, strings.Join(parts, " · ")
}

// railKeys: ⌘⇧] and ⌘⇧[ walk the tasks from anywhere, the composer
// included; j and k too when no field has the keys.
func (a *App) railKeys(c *ui.Context) {
	if a.oh.sw || a.nt.open {
		return
	}
	switch {
	case c.Shortcut(ui.Cmd|ui.Shift, ui.KeyBracketRight):
		a.WalkTask(1)
	case c.Shortcut(ui.Cmd|ui.Shift, ui.KeyBracketLeft):
		a.WalkTask(-1)
	case a.Route == RouteTask && c.Shortcut(0, ui.KeyJ):
		a.WalkTask(1)
	case a.Route == RouteTask && c.Shortcut(0, ui.KeyK):
		a.WalkTask(-1)
	}
}

var _ = fmt.Sprint
