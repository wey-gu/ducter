package views

import "github.com/egoist/mygo/ui"

// ---------- toasts (D527) ----------
//
// A toast is one sentence the app says after something the person did or
// that happened by itself (已更新到 0.1.38, 已拷贝, 搬走了 · 撤销): it needs no
// answer and goes by itself. Every toast in the app shows in this one slot,
// drawn by this one card; a view only says what (c.Toast, c.AddToast,
// a.toast), never where or how.
//
// Where: centred over the place's own content (the conversation beside the
// list of partners, On hand's board beside its projects, a Settings pane
// beside its rail, an opened task between On hand's rail and the
// workbench), never the whole window; its foot S3 above the top of what
// stands at the place's foot (the composer, with any notice or card over
// it), else S5 above the content's bottom edge. So it never covers the
// composer's words or buttons, nor a notice's.
//
// How it moves (D290): it comes up 6 and in over EnterDur (220 ms), and
// leaves down 6 and out over Nav.Leave (260 ms). Its time (4 s; 8 s with an
// action) stops while the pointer rests on it or the keyboard is in it;
// Escape closes it then. Reduce Motion: it only fades.

// toastPlace is where this frame's place said its toasts go.
type toastPlace struct {
	area  ui.Rect // the place's own content, in window points
	floor float32 // the top of what stands at its foot; 0 for none
}

// toastsOver says the place's own content is e: toasts centre over it.
func (a *App) toastsOver(e ui.Element) ui.Element {
	if r := e.Bounds(); r.W > 0 && r.H > 0 {
		a.toastAt.area = r
	}
	return e
}

// toastsAbove says e stands at the place's foot (the composer and what
// sits over it): toasts keep above it.
func (a *App) toastsAbove(e ui.Element) {
	if r := e.Bounds(); r.W > 0 && r.H > 0 && (a.toastAt.floor == 0 || r.Y < a.toastAt.floor) {
		a.toastAt.floor = r.Y
	}
}

// toastBox is where the slot puts its toasts in a window w×h: the column
// they centre in (x, width) and the line their foot stands on (y).
func (a *App) toastBox(w, h float32) (x, width, y float32) {
	t := a.T
	area := a.toastAt.area
	if area.W <= 0 || area.H <= 0 {
		area = ui.Rect{X: 0, Y: ChromeH, W: w, H: h - ChromeH}
	}
	y = area.Y + area.H - t.S5
	if f := a.toastAt.floor; f > area.Y && f <= area.Y+area.H {
		y = f - t.S3
	}
	return area.X, area.W, y
}

// toastSlot draws every toast showing, newest at the foot; called once,
// last in the view, after the place said where.
func (a *App) toastSlot(c *ui.Context) {
	if toastsAsBefore {
		return
	}
	t := a.T
	w, h := float32(a.winW), float32(a.winH)
	x, width, y := a.toastBox(w, h)
	ui.ToastViewportBase(c, func(vp ui.Element, toasts []ui.Toast) {
		vp.Padding(0, max(0, w-x-width)+t.S4, max(0, h-y), x+t.S4).AlignItems(ui.Center).Gap(t.S2)
		for _, ts := range toasts {
			a.toastCard(c, ts, min(width-2*t.S4, toastMeasure))
		}
	})
}

// toastsAsBefore leaves the toasts to MyGo's own look and place, as before
// D527: only the before shots set it (toast_shots_test.go).
var toastsAsBefore bool

// toastMeasure is a toast's widest: one sentence, never a paragraph.
const toastMeasure = 520

// toastCard is one toast: the ink card of the primary button's family on
// its ledge (inverse on both papers), the sentence at 13/700 in the
// paper's color, an action as a text button in the accent.
func (a *App) toastCard(c *ui.Context, ts ui.Toast, measure float32) {
	t := a.T
	p := ui.ToastBase(c, ts)
	card := p.Root.Row().AlignItems(ui.Center).Gap(t.S3).MinHeight(t.ControlMD).MaxWidth(measure).
		Padding(t.S2, t.S4).Radius(t.RadiusMD).Background(t.Ink).
		Shadow(0, t.PressPrimary.Offset, 0, 0, t.PressPrimary.Color).
		Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color)
	if ts.Action != "" {
		card.Padding(t.S1, t.S1, t.S1, t.S4)
	}
	rise := t.Nav.Rise
	card.Transition(ui.ElementTransition{
		Duration:     t.EnterDur,
		Enter:        &ui.Motion{Y: rise},
		Exit:         &ui.Motion{Y: rise},
		ExitDuration: t.Nav.Leave,
		Position:     true,
	})
	card.Children(func() {
		uiText(c, ts.Title).FontSize(t.SM).FontWeight(700).LineHeight(1.4).TextColor(t.Bg).MaxLines(2).Shrink(1).MinWidth(0)
		if ts.Action == "" {
			return
		}
		b := p.ActionButton().Height(t.ControlSM).Padding(0, t.S3).Radius(t.RadiusSM).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Shrink(0)
		ink := t.Accent
		if b.Hovered() || b.Pressed() || b.Focused() {
			b.Background(t.Bg.Alpha(0.12))
		}
		b.Children(func() {
			uiText(c, ts.Action).FontSize(t.SM).FontWeight(800).TextColor(ink).SingleLine()
		})
	})
}
