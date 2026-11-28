package views

// D573 (design/ui.md "Platform conventions"): what every Mac user's hands
// already know, kept. ⌘W closes the top layer that is a window of its own
// to the eye (a sheet, the file viewer, the picture viewer, Settings), and
// the window when none is up; ⌘[ and ⌘] (and a two-finger swipe, a mouse's
// side buttons) go back and forward through the places seen; ⌘+, ⌘− and ⌘0
// zoom the window's content and the zoom is kept on this Mac; Edit › Find
// (⌘F, ⌘G, ⇧⌘G) finds where the layer in front can, else opens Find
// anything. The menu bar (main.go) holds the keys; these are what they do.

import (
	"math"

	"github.com/egoist/mygo/ui"
)

// convState is D573's state: the dialogs built in the last frame (the last
// built is the one on top), the one ⌘W asked to close, and the history of
// places seen.
type convState struct {
	layersNow int // the dialogs built in the frame so far, open or closing
	topNow    int // 1 + the index of the last one still open, 0 for none
	closeAsk  int // 1 + the index of the dialog ⌘W closes, 0 for none
	nav       convNav
}

// navAt is a place seen: the zoom level and the task opened.
type navAt struct {
	route Route
	task  string
}

// convNav is the history of places: back, forward and the one shown.
type convNav struct {
	started   bool
	cur       navAt
	back, fwd []navAt
	moving    bool
}

// navCap is how many places back the history keeps.
const navCap = 50

// dialogBase is ui.DialogBase that ⌘W can close: every sheet and viewer is
// built through it (TestDialogsCloseWithCmdW), so the layer on top is known.
func (a *App) dialogBase(c *ui.Context, open *bool, fn func(back, panel ui.Element)) ui.Element {
	i := a.conv.layersNow
	a.conv.layersNow++
	if a.conv.closeAsk == i+1 {
		a.conv.closeAsk = 0
		*open = false // as Escape does: the caller closes what it holds
	}
	el := ui.DialogBase(c, open, fn)
	if *open {
		a.conv.topNow = i + 1
	}
	return el
}

// convFrame starts a frame: the dialogs counted, the place noted in the
// history, the zoom applied, and the keys that work wherever the window is.
func (a *App) convFrame(c *ui.Context) {
	if a.conv.closeAsk > a.conv.layersNow {
		a.conv.closeAsk = 0
	}
	a.conv.layersNow, a.conv.topNow = 0, 0
	a.navNote()
	if z := a.Zoom(); z != 1 {
		c.SetZoom(z)
	} else if c.Zoom() != 1 {
		c.SetZoom(1)
	}
}

// LayerUp reports whether a sheet or a viewer is over the window (as the
// last frame built it: these run between frames).
func (a *App) LayerUp() bool { return a.conv.topNow > 0 }

// CloseWindowAsked is ⌘W in the main window. It closes the layer on top, or
// Settings (a window of its own in every Mac app, so ⌘W takes it back to
// where the person was); it reports true when nothing was up and the
// window itself should close (hide: Ducter keeps working).
func (a *App) CloseWindowAsked() (closeWindow bool) {
	if a.conv.topNow > 0 {
		a.conv.closeAsk = a.conv.topNow
		return false
	}
	if a.closePops() {
		return false
	}
	switch a.Route {
	case RouteSettings, RoutePartner, RouteDevices:
		if !a.Back() {
			a.Route = RouteConversation
		}
		return false
	}
	return true
}

// navNote keeps the history: a place different from the last one seen goes
// on the back list (and forward is forgotten), unless Back or Forward moved.
func (a *App) navNote() {
	n := &a.conv.nav
	at := navAt{route: a.Route}
	if a.Route == RouteTask {
		at.task = a.TaskID
	}
	if !n.started {
		n.started, n.cur = true, at
		return
	}
	if at == n.cur {
		n.moving = false
		return
	}
	if !n.moving {
		n.back = append(n.back, n.cur)
		if len(n.back) > navCap {
			n.back = n.back[len(n.back)-navCap:]
		}
		n.fwd = nil
	}
	n.moving = false
	n.cur = at
}

// CanBack and CanForward report whether ⌘[ and ⌘] have somewhere to go.
func (a *App) CanBack() bool    { a.navNote(); return len(a.conv.nav.back) > 0 }
func (a *App) CanForward() bool { a.navNote(); return len(a.conv.nav.fwd) > 0 }

// Back goes to the place seen before (⌘[, a swipe right, a mouse's back
// button); false when there is none.
func (a *App) Back() bool {
	a.navNote()
	n := &a.conv.nav
	for len(n.back) > 0 {
		to := n.back[len(n.back)-1]
		n.back = n.back[:len(n.back)-1]
		if !a.navCan(to) {
			continue // a task since gone
		}
		n.fwd = append(n.fwd, n.cur)
		a.navGo(to)
		return true
	}
	return false
}

// Forward goes back to where Back came from (⌘]).
func (a *App) Forward() bool {
	a.navNote()
	n := &a.conv.nav
	for len(n.fwd) > 0 {
		to := n.fwd[len(n.fwd)-1]
		n.fwd = n.fwd[:len(n.fwd)-1]
		if !a.navCan(to) {
			continue
		}
		n.back = append(n.back, n.cur)
		a.navGo(to)
		return true
	}
	return false
}

func (a *App) navCan(to navAt) bool {
	return to.route != RouteTask || (a.S != nil && a.S.Task(to.task) != nil)
}

func (a *App) navGo(to navAt) {
	n := &a.conv.nav
	n.moving = true
	switch to.route {
	case RouteTask:
		a.OpenTask(to.task)
	case RoutePast:
		a.OpenPast("")
	case RouteDid:
		a.OpenDid()
	case RouteApps:
		a.OpenApps()
	case RouteSettings:
		a.OpenSettings()
	case RoutePartner:
		a.OpenPartner()
	case RouteDevices:
		a.OpenDevices()
	default:
		a.Route = to.route
	}
	n.cur = to
	if a.Route == to.route {
		n.moving = false
	}
}

// navKeys: ⌘[ and ⌘] outside Ducter.app's menu bar (tests, a window
// without it), and KeyBack and KeyForward: a two-finger swipe between
// pages and a mouse's side buttons.
func (a *App) navKeys(c *ui.Context) bool {
	switch {
	case c.Shortcut(ui.Cmd, ui.KeyBracketLeft), c.Shortcut(0, ui.KeyBack):
		a.Back()
	case c.Shortcut(ui.Cmd, ui.KeyBracketRight), c.Shortcut(0, ui.KeyForward):
		a.Forward()
	default:
		return false
	}
	return true
}

// zoomSteps are the window zoom's steps (View › Zoom In, ⌘+), as Safari's
// around 100%.
var zoomSteps = []float32{0.75, 0.85, 1, 1.1, 1.25, 1.5, 1.75, 2}

// Zoom is the window content's zoom on this Mac, 1 for actual size.
func (a *App) Zoom() float32 {
	if a.Local == nil {
		return 1
	}
	z := a.Local.Zoom()
	if z < zoomSteps[0] || z > zoomSteps[len(zoomSteps)-1] {
		return 1
	}
	return z
}

// ZoomBy steps the zoom in (1), out (-1), or back to actual size (0).
func (a *App) ZoomBy(dir int) {
	cur, next := a.Zoom(), float32(1)
	switch {
	case dir > 0:
		next = zoomSteps[len(zoomSteps)-1]
		for _, s := range zoomSteps {
			if s > cur+0.001 {
				next = s
				break
			}
		}
	case dir < 0:
		next = zoomSteps[0]
		for i := len(zoomSteps) - 1; i >= 0; i-- {
			if zoomSteps[i] < cur-0.001 {
				next = zoomSteps[i]
				break
			}
		}
	}
	if a.Local != nil {
		a.Local.SetZoom(float32(math.Round(float64(next)*100) / 100))
	}
}

// FindAsked is Edit › Find (⌘F): the file viewer's find while it shows a
// text that can be found in, the hand-over sheet's words, else Find
// anything (D391). The menu bar takes ⌘F before any view sees it, so this
// is the one way in.
func (a *App) FindAsked() {
	if fv := a.fileView; fv != nil && fv.open {
		if fileFindable(fv) {
			a.openFind(fv)
		}
		return
	}
	if a.ho.open {
		a.ho.focusFind, a.ho.step = true, 0
		return
	}
	// D663: in Settings, ⌘F is 找设置 / Find a setting.
	if (a.Route == RouteSettings || a.Route == RoutePartner) && a.conv.topNow == 0 {
		if a.Route == RoutePartner {
			a.openTab(TabPartner)
		}
		a.sf.focus = true
		return
	}
	if a.conv.topNow > 0 && !a.oh.sw {
		return // another sheet is up: nothing there to find in
	}
	if !a.oh.sw {
		a.OpenSwitcher()
	}
}

// ToggleKeys shows or hides 键盘 / Keyboard (⌘/, Help › Keyboard Shortcuts).
func (a *App) ToggleKeys() { a.keysOpen = !a.keysOpen }

// FindStepAsked is Find Next (⌘G, 1) and Find Previous (⇧⌘G, -1): the file
// viewer's find while it is open.
func (a *App) FindStepAsked(d int) {
	if fv := a.fileView; fv != nil && fv.open && fv.finding {
		a.findStep(fv, d)
	}
}
