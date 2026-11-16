package views

import (
	"time"

	"github.com/egoist/mygo/ui"
)

// D290: the window's way between zoom levels and places (research/96;
// design/ui.md, Motion). The page is the only thing that moves: going a
// level deeper (the conversation → On hand → a task) the new page comes in
// from the trailing side while the one left recedes and fades, and the
// card you opened grows into the task's head; coming back is the reverse,
// the head going back into its card's place; one place to another (the
// places control) slides a little toward where its mark sits while the
// knob slides to it; one task to the next (the rail, ⌘⇧]) cross-fades the
// task alone, the rail and the bar staying put. The bar never travels with
// its page: it holds still while the words in it cross-fade, as a native
// toolbar does. Under reduced motion every page fades in place (MyGo's
// transitions do that themselves) and nothing else moves.

// navDir is the kind of move that brought the page shown.
type navDir int

const (
	navNone   navDir = iota
	navDeeper        // a level down
	navBack          // a level up
	navAcross        // a place beside the one left (sign says which side)
	navTask          // one task to another, the page staying
)

// navState remembers the page shown, to tell the next move's kind.
type navState struct {
	route Route
	task  string
	set   bool
	dir   navDir
	sign  float32 // navAcross: +1 toward the trailing side, -1 the leading
	// seq counts the moves; at is when the last began.
	seq int
	at  time.Time
	// left is the task the last move left, whose card the way back to On
	// hand grows into (its Match).
	left string
	// rows counts the list's rows as this frame builds them (stagger).
	rows int
}

// navDepth is a route's zoom level: the conversation, then a place (On
// hand, Devices, Settings), then a task.
func navDepth(r Route) int {
	switch r {
	case RouteConversation:
		return 0
	case RouteTask:
		return 2
	}
	return 1
}

// navOrder is a place's slot in the places control (devices · on hand ·
// settings), so a move between places goes the way its knob goes.
func navOrder(r Route) float32 {
	switch r {
	case RouteDevices:
		return 0
	case RouteOnHand:
		return 1
	case RoutePartner, RouteSettings:
		return 2
	}
	return 1
}

// navStep notes the route of this frame and returns the move that brought
// it (the same until the next move).
func (a *App) navStep(c *ui.Context) navDir {
	n := &a.nav
	r, task := a.Route, ""
	if r == RouteTask {
		task = a.TaskID
	}
	if !n.set {
		n.route, n.task, n.set = r, task, true
		return navNone
	}
	if r == n.route && task == n.task {
		return n.dir
	}
	from := n.route
	if from == RouteTask {
		n.left = n.task
	}
	switch d0, d1 := navDepth(from), navDepth(r); {
	case r == RouteTask && from == RouteTask:
		n.dir = navTask
	case d1 > d0:
		n.dir = navDeeper
	case d1 < d0:
		n.dir = navBack
	default:
		n.dir, n.sign = navAcross, 1
		if navOrder(r) < navOrder(from) {
			n.sign = -1
		}
		if (r == RoutePartner) != (from == RoutePartner) && navOrder(r) == navOrder(from) {
			n.dir = navAcross // Settings ↔ its partner tab: a quiet cross-fade
			n.sign = 0
		}
	}
	n.route, n.task = r, task
	n.seq++
	n.at = c.Now()
	return n.dir
}

// navEnter is where the page comes in from for the move, and navExit where
// the page left goes. Opacity 0 (the zero) fades them; under reduced motion
// MyGo keeps only the fade.
func (a *App) navMotions(d navDir) (enter, exit ui.Motion) {
	m := a.T.Nav
	switch d {
	case navDeeper:
		return ui.Motion{X: m.Depth}, ui.Motion{X: -m.Recede}
	case navBack:
		return ui.Motion{X: -m.Recede}, ui.Motion{X: m.Depth * 0.6}
	case navAcross:
		s := a.nav.sign
		return ui.Motion{X: m.Shift * s}, ui.Motion{X: -m.Shift * 0.5 * s}
	}
	return ui.Motion{}, ui.Motion{}
}

// navAnim is the spring a move's page comes in on.
func (a *App) navAnim(d navDir) ui.Animation {
	if d == navDeeper || d == navBack {
		return a.T.Nav.Push
	}
	return a.T.Nav.Across
}

// pageTransition is the page's own. Its opacity comes in on a quick curve
// (EnterDur, ease-out: a spring from rest starts slowly, and a page half
// there reads as a wash); its way in is a pose on the move's spring
// (pagePose), so the bar can hold still against it. The page left stays
// opaque under it as it recedes, gone once the new one covers it: two
// pages are never washed together.
func (a *App) pageTransition(d navDir) ui.ElementTransition {
	_, exit := a.navMotions(d)
	exit.Opacity = 1
	return ui.ElementTransition{
		Duration:     a.T.EnterDur,
		Ease:         ui.EaseOut,
		ExitDuration: a.T.Nav.Leave,
		ExitEase:     ui.EaseOut,
		Colors:       true,
		Enter:        &ui.Motion{},
		Exit:         &exit,
	}
}

// pagePose moves a page in from where the move says, once, as it is first
// built: paint only. The bar's holdBar is the same pose turned back, so the
// two cancel and the bar stays where it is.
func (a *App) pagePose(c *ui.Context, e ui.Element, sign float32) {
	if c.Preferences().ReduceMotion {
		return
	}
	d := a.nav.dir
	enter, _ := a.navMotions(d)
	seen := ui.Local(e, "posed", func() int { return -1 })
	p := ui.Pose{}
	if *seen != a.nav.seq {
		if *seen == -1 && enter.X != 0 && c.Now().Sub(a.nav.at) < 50*time.Millisecond {
			p = ui.Pose{X: enter.X * sign}
			c.Invalidate()
		}
		*seen = a.nav.seq
	}
	e.AnimatePose(p, a.navAnim(d))
}

// holdBar keeps the bar still while its page comes in (pagePose turned
// back): only the words in it cross-fade, as a native toolbar's do.
func (a *App) holdBar(c *ui.Context, bar ui.Element) { a.pagePose(c, bar, -1) }

// heroMatch is the identity an opened task shares between its card (On
// hand's row, the rail's) and its head on the task's page.
type heroMatch struct{ id string }

// heroTransition flies the task's card into its head and back (Hero).
func (a *App) heroTransition(id string) ui.ElementTransition {
	an := a.T.Nav.Hero
	return ui.ElementTransition{Animation: &an, Match: heroMatch{id}, Fly: true, Shadows: true}
}

// heroRow gives a task's row the hero's identity while it is the card the
// task would grow from (under the pointer, or the focused one, so the frame
// before the click already holds it) or goes back into (the task just
// left, as On hand comes back). Never while that task is open beside it:
// one element holds a Match at a time.
func (a *App) heroRow(row ui.Element, id string, focused bool) {
	if a.Route == RouteTask && a.TaskID == id {
		return
	}
	if focused || row.Hovered() || (a.Route == RouteOnHand && a.nav.dir == navBack && a.nav.left == id) {
		row.Transition(a.heroTransition(id))
	}
}

// stagger brings a list's row in on the list's first paint: up from Rise
// and faded, each a Stagger after the one above, for the first
// StaggerRows rows; the rows after them come with the last. A row built
// before stays as it is. Paint only (a pose).
func (a *App) stagger(c *ui.Context, e ui.Element, i int) {
	if c.Preferences().ReduceMotion {
		return
	}
	m := a.T.Nav
	shown := ui.Local(e, "staggered", func() bool { return false })
	p := ui.Pose{}
	if !*shown {
		*shown = true
		// Only while the page is coming in: a row arriving later (a new
		// task) has its own way in.
		if c.Now().Sub(a.nav.at) > 400*time.Millisecond && a.nav.seq > 0 {
			return
		}
		p = ui.Pose{Y: m.Rise, Fade: 1}
		c.Invalidate()
	}
	an := a.T.Snappy
	an.Delay = time.Duration(min(i, m.StaggerRows)) * m.Stagger
	e.AnimatePose(p, an)
}

// lookAround is the partner's small reaction as you come back to the
// conversation: its face tilts as if glancing at where you were, then
// settles on a springy clay wobble.
func (a *App) lookAround(c *ui.Context, face ui.Element) {
	if c.Preferences().ReduceMotion {
		return
	}
	seen := ui.Local(face, "looked", func() int { return -1 })
	p := ui.Pose{}
	if *seen != a.nav.seq {
		if a.nav.dir == navBack && c.Now().Sub(a.nav.at) < 50*time.Millisecond {
			p = ui.Pose{Rotate: -a.T.Nav.LookTilt, X: -2}
			c.Invalidate()
		}
		*seen = a.nav.seq
	}
	face.TransformOrigin(0.5, 1).AnimatePose(p, a.T.Nav.Look)
}

// placeKnob is the places control's knob's identity: it slides from the
// place left to the place shown.
type placeKnob struct{}

// taskSwitch is the task's column's own: one task to the next rises a
// little into place (Rise, on Across's spring) as the one left fades
// quickly; nothing else animates.
func (a *App) taskSwitch() ui.ElementTransition {
	an := a.T.Nav.Across
	return ui.ElementTransition{
		Animation:    &an,
		ExitDuration: a.T.Nav.Leave,
		ExitEase:     ui.EaseOut,
		Colors:       true,
		Enter:        &ui.Motion{Y: a.T.Nav.Rise * 1.5},
		Exit:         &ui.Motion{},
	}
}
