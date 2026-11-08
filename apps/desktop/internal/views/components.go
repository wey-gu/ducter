package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// ---------- the persona face ----------

// FaceState is what the face shows.
type FaceState int

const (
	FaceIdle FaceState = iota
	FaceWorking
	FaceNeedsYou
)

func (a *App) faceState() FaceState {
	b := a.S.Board()
	switch {
	case b.Counts.NeedsYou > 0:
		return FaceNeedsYou
	case b.Counts.Working > 0:
		return FaceWorking
	}
	return FaceIdle
}

// face draws Ducter: a rounded pebble with two eyes. It blinks while idle,
// looks aside while working, and raises its brows when something needs
// you (docs/design/ui.md, Persona face).
func (a *App) face(c *ui.Context, state FaceState, size float32, label string) ui.Element {
	t := a.T
	still := c.Preferences().ReduceMotion
	box := ui.Box(c).Size(size, size).Label(label).Role(ui.RoleImage)
	// Where the eyes look (-1 left … 1 right), eased.
	look := float32(0)
	if state == FaceWorking {
		look = 0.8
	}
	look = box.AnimateTo("look", look, ui.Smooth)
	lift := float32(0)
	if state == FaceNeedsYou {
		lift = 1
	}
	lift = box.AnimateTo("brows", lift, t.Bouncy)
	now := c.Now()
	blink := float32(1)
	if !still {
		// A blink of 160 ms every 4 s while idle; while working the eyes
		// drift slowly side to side.
		ms := now.UnixMilli() % 4000
		if state != FaceNeedsYou && ms < 160 {
			blink = 0.15 + 0.85*float32(math.Abs(float64(ms)-80)/80)
		}
		if state == FaceWorking {
			look += 0.25 * float32(math.Sin(float64(now.UnixMilli())/700))
			c.After(50 * time.Millisecond)
		} else if ms < 160 {
			c.After(16 * time.Millisecond)
		} else {
			c.After(time.Duration(4000-ms) * time.Millisecond)
		}
	}
	body, shade := t.Accent, t.NeedsYou.Strong
	box.Draw(func(p *ui.Painter, r ui.Rect) {
		s := r.W / 52
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		// The pebble: M8 26c0-12 8-20 19-20s19 7 19 18-8 22-20 22S8 38 8 26z
		var peb ui.Path
		peb.MoveTo(x(8), y(26))
		peb.CubeTo(x(8), y(14), x(16), y(6), x(27), y(6))
		peb.CubeTo(x(38), y(6), x(46), y(13), x(46), y(24))
		peb.CubeTo(x(46), y(35), x(38), y(46), x(26), y(46))
		peb.CubeTo(x(14), y(46), x(8), y(38), x(8), y(26))
		peb.Close()
		p.FillPath(&peb, body)
		// The shade along its bottom.
		var sh ui.Path
		sh.MoveTo(x(10), y(30))
		sh.CubeTo(x(12), y(40), x(19), y(45), x(27), y(45))
		sh.CubeTo(x(35), y(45), x(43), y(40), x(45), y(31))
		sh.CubeTo(x(42), y(39), x(35), y(43), x(27), y(43))
		sh.CubeTo(x(19), y(43), x(12), y(39), x(10), y(30))
		sh.Close()
		p.FillPath(&sh, shade)
		// Eyes: 5×9, rounded, shifted by look.
		eh := 9 * blink
		dx := look * 3
		for _, ex := range []float32{19, 30} {
			p.Fill(ui.Rect{X: x(ex + dx), Y: y(20 + (9-eh)/2 + lift), W: 5 * s, H: eh * s}, t.Ink, 2.5*s)
		}
		if lift > 0.02 {
			// Raised brows.
			for _, ex := range []float32{19, 30} {
				var b ui.Path
				b.MoveTo(x(ex+dx-1), y(17-2*lift))
				b.QuadTo(x(ex+dx+2.5), y(14.5-3*lift), x(ex+dx+6), y(17-2*lift))
				p.StrokePath(&b, 1.8*s*lift, t.Ink)
			}
		}
	})
	return box
}

// ---------- pebbles and chips ----------

// pebble is a task glyph: a small irregular pebble in its state color.
func (a *App) pebble(c *ui.Context, color ui.Color, w, h float32) ui.Element {
	r := a.T.PebbleRadius
	k := w / 12
	return ui.Box(c).Size(w, h).Radius(r[0]*k, r[1]*k, r[2]*k, r[3]*k).Background(color).Shrink(0)
}

// taskChip is a task's chip inside the partner's words: it links to the
// task and lifts as the pointer comes over it.
func (a *App) taskChip(c *ui.Context, t *store.Task, detail string) {
	att := t.Attention()
	sc := a.T.State(string(att))
	label := t.Title()
	if detail == "" {
		detail = a.stateLabel(att)
	}
	if detail != "" {
		label += " · " + detail
	}
	chip := ui.Row(c.Key("chip:"+t.ID)).Gap(8).Height(36).Padding(0, 14, 0, 10).Radius(12).
		Background(sc.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(label).Shrink(0)
	a.lift(c, chip, 2)
	chip.Children(func() {
		a.pebble(c, sc.Dot, 10, 12)
		ui.Text(c, label).FontSize(a.T.SM).FontWeight(700).TextColor(sc.Ink).SingleLine()
	})
	if chip.Clicked() {
		a.OpenTask(t.ID)
	}
}

// lift raises an element a little while hovered: the chip → card motion.
func (a *App) lift(c *ui.Context, e ui.Element, by float32) {
	if c.Preferences().ReduceMotion {
		return
	}
	p := ui.Pose{}
	if e.Hovered() {
		p = ui.Pose{Y: -by}
	}
	e.AnimatePose(p, a.T.Snappy)
}

// stateChip is a small pill naming a state.
func (a *App) stateChip(c *ui.Context, att protocol.Attention) {
	sc := a.T.State(string(att))
	ui.Box(c).Padding(4, 10).Radius(a.T.Pill).Background(sc.Surface).Children(func() {
		ui.Text(c, a.stateLabel(att)).FontSize(a.T.XS).FontWeight(800).TextColor(sc.Ink)
	})
}

// pill is a sunken pill of metadata.
func (a *App) pill(c *ui.Context, text string) {
	if text == "" {
		return
	}
	ui.Box(c).Padding(5, 10).Radius(a.T.Pill).Background(a.T.SurfaceSunken).Children(func() {
		ui.Text(c, text).FontSize(a.T.XS).FontWeight(700).SingleLine()
	})
}

// ---------- buttons ----------

type btnKind int

const (
	btnPrimary btnKind = iota // dark press-down pebble button
	btnQuiet                  // light press-down button
	btnText                   // text button
	btnAccent                 // accent, as the composer's send
)

// button is a press-down Pebble button: it sits on a solid offset shadow
// and sinks into it while pressed. It reports a click.
func (a *App) button(c *ui.Context, label string, kind btnKind, height float32, onSurface ui.Color) bool {
	t := a.T
	var bg, fg ui.Color
	var press theme.Press
	switch kind {
	case btnPrimary:
		bg, fg, press = t.Ink, t.OnUserBubble, t.PressPrimary
	case btnQuiet:
		bg, fg, press = onSurface, t.Ink, t.PressQuiet
	case btnAccent:
		bg, fg, press = t.Accent, t.OnAccent, t.PressAccent
	default:
		bg, fg = ui.Transparent, t.NeedsYou.Ink
	}
	radius := t.RadiusSM
	if height >= 50 {
		radius = 18
	}
	padX := float32(22)
	if kind == btnText {
		padX = 10
	}
	b := ui.Row(c.Key("btn:"+label)).Height(height).Padding(0, padX).Radius(radius).Background(bg).
		Justify(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable().Shrink(0)
	a.press(c, b, press)
	size := t.MD
	if height >= 50 {
		size = 16
	}
	b.Children(func() {
		ui.Text(c, label).FontSize(size).FontWeight(700).TextColor(fg).SingleLine()
	})
	return b.Clicked()
}

// press gives an element the Pebble depth: a solid offset under it that it
// sinks into while pressed.
func (a *App) press(c *ui.Context, e ui.Element, press theme.Press) {
	if press.Offset == 0 {
		return
	}
	down := e.Pressed()
	off := press.Offset
	y := float32(0)
	if down {
		y = press.Offset - 1
		off = 1
	}
	if c.Preferences().ReduceMotion {
		e.Shadow(0, off, 0, 0, press.Color)
		return
	}
	y = e.AnimateTo("press", y, ui.Animation{Duration: 70 * time.Millisecond})
	e.Translate(0, y).Shadow(0, press.Offset-y, 0, 0, press.Color)
}

// iconButton is a square button that draws its icon.
func (a *App) iconButton(c *ui.Context, label string, size float32, bg ui.Color, press theme.Press, draw func(p *ui.Painter, r ui.Rect)) bool {
	b := ui.Box(c.Key("icon:"+label)).Size(size, size).Radius(size / 3).Background(bg).Label(label).
		Role(ui.RoleButton).Cursor(ui.CursorPointer).Shrink(0)
	a.press(c, b, press)
	b.Draw(draw)
	return b.Clicked()
}

func drawSend(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var arrow ui.Path
		arrow.MoveTo(cx, cy+7)
		arrow.LineTo(cx, cy-7)
		arrow.MoveTo(cx-6, cy-1)
		arrow.LineTo(cx, cy-7)
		arrow.LineTo(cx+6, cy-1)
		p.StrokePath(&arrow, 2.4, col)
	}
}

func drawCheck(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-5, cy)
		m.LineTo(cx-1.5, cy+3.5)
		m.LineTo(cx+5.5, cy-3.5)
		p.StrokePath(&m, 2.6, col)
	}
}

func drawClock(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.Circle(cx, cy, 6.5)
		p.StrokePath(&m, 2, col)
		var h ui.Path
		h.MoveTo(cx, cy-3.5)
		h.LineTo(cx, cy)
		h.LineTo(cx+2.5, cy+1.8)
		p.StrokePath(&h, 2, col)
	}
}

func drawDot(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		p.Fill(ui.Rect{X: r.X + r.W/2 - 4, Y: r.Y + r.H/2 - 4, W: 8, H: 8}, col, 4)
	}
}

// ---------- decisions ----------

// decisionStyle sizes a decision's controls by where it shows.
type decisionStyle struct {
	height   float32  // of the buttons
	quietBg  ui.Color // the light button, on the decision's surface
	question float32  // font size; 0 hides the question
}

// decisionButtons builds Go / Hold / Reply… and the reply field, or how
// the decision was resolved.
func (a *App) decisionButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	if d.Resolved != nil || d.Pending != "" {
		opt, text := d.Pending, ""
		by := ""
		if d.Resolved != nil {
			opt, text, by = d.Resolved.Option, d.Resolved.Text, d.Resolved.By
		}
		msg := a.L.T("decision.resolved." + opt)
		if opt == "reply" {
			msg = a.L.T("decision.resolved.reply", text)
		}
		if by == "default" {
			msg = a.L.T("decision.resolved.default")
		}
		ui.Row(c).Gap(8).Children(func() {
			ui.Box(c).Size(22, 22).Radius(8).Background(t.Done.Surface).Draw(drawCheck(t.Done.Ink))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	goText := a.L.T("decision.go")
	if d.GoLabel != "" {
		goText = a.L.T("decision.go.label", d.GoLabel)
	}
	ui.Row(c.Key("decide:" + d.DecisionID)).Gap(10).Wrap().AlignItems(ui.Center).Children(func() {
		if a.button(c, goText, btnPrimary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "go", "")
		}
		if a.button(c, a.L.T("decision.hold"), btnQuiet, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.button(c, a.L.T("decision.reply"), btnText, st.height, st.quietBg) {
			a.replyOpen[d.DecisionID] = !a.replyOpen[d.DecisionID]
		}
	})
	if a.replyOpen[d.DecisionID] {
		draft := a.replyDraft[d.DecisionID]
		ui.Row(c.Key("reply:"+d.DecisionID)).Gap(8).Padding(4, 4, 4, 14).Radius(16).Background(t.Surface).Children(func() {
			ui.TextArea(c, &draft).Lines(1, 4).Placeholder(a.L.T("decision.reply.placeholder")).AutoFocus().
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(8, 0).Grow(1).FontSize(t.MD).
				OnTextKey(func(k ui.TextKey) bool {
					if k.Key == ui.KeyEnter && k.Mods == 0 {
						if txt := k.Text(); txt != "" {
							a.Decide(d.DecisionID, "reply", txt)
							a.replyDraft[d.DecisionID] = ""
						}
						k.SetText("")
						return true
					}
					return false
				})
			if a.iconButton(c, a.L.T("composer.send"), 40, t.Ink, t.PressPrimary, drawSend(t.OnUserBubble)) && draft != "" {
				a.Decide(d.DecisionID, "reply", draft)
				draft = ""
			}
		})
		a.replyDraft[d.DecisionID] = draft
	}
}

// defaultLine says what happens if the user doesn't answer.
func (a *App) defaultLine(c *ui.Context, d *store.DecisionState) string {
	if !d.Reversible {
		return a.L.T("decision.no_default") // never claim it can be undone
	}
	if d.DefaultOption != "go" {
		return a.L.T("decision.default.hold")
	}
	left, ok := a.defaultIn(d)
	if !ok {
		return a.L.T("decision.default.hold")
	}
	if left <= 0 {
		return a.L.T("decision.default.due")
	}
	// Tick each second under a minute, else each minute.
	if left < time.Minute {
		c.After(time.Second)
	} else {
		c.After(left % time.Minute)
	}
	label := d.GoLabel
	if label == "" {
		label = a.L.T("decision.go")
	}
	if a.L.Lang == i18n.ZH && label != "" && label[0] < 0x80 {
		label = " " + label // a Latin word in Chinese text gets its space
	}
	return a.L.T("decision.default.go", a.duration(left+time.Second*59/60), label)
}
