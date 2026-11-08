package views

import (
	"math"
	"strings"
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
	case b.Counts.NeedsYou > 0 || len(a.partnerDecisions()) > 0:
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
// task and lifts as the pointer comes over it. It says the title once,
// then where the task stands: the job's status line when it adds
// something, else the state.
func (a *App) taskChip(c *ui.Context, t *store.Task, detail string) {
	att := t.Attention()
	sc := a.T.State(string(att))
	label := t.Title()
	if h := t.Browsing(); h != "" {
		detail = a.L.T("browser.looking", h)
	} else if t.Place().Kind == "browser" && !finished(t) {
		a.ensureHistory(t.ID) // browser status lines come with the task's stream
	}
	if sameWords(detail, label) {
		detail = "" // a status line that only repeats the title says nothing
	}
	if detail == "" {
		detail = a.stateLabel(att)
	}
	if detail != "" {
		label += " · " + detail
	}
	chip := a.chipBox(c.Key("chip:"+t.ID), a.T.ChipLG, sc.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(label).
		Focusable().MinWidth(0)
	a.lift(c, chip, 2)
	chip.Children(func() {
		a.pebble(c, sc.Dot, 10, 12)
		ui.Text(c, label).FontSize(a.T.SM).FontWeight(700).TextColor(sc.Ink).SingleLine().Shrink(1).MinWidth(0)
	})
	if chip.Clicked() {
		a.OpenTask(t.ID)
	}
}

// sameWords reports whether a status line only repeats the title
// (ignoring case, spaces and an ending's punctuation).
func sameWords(detail, title string) bool {
	norm := func(s string) string {
		return strings.ToLower(strings.TrimRight(strings.Join(strings.Fields(s), " "), ".。…"))
	}
	d := norm(detail)
	return d != "" && d == norm(title)
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

// ---------- chips ----------

// The one chip family: a flat rounded rectangle (RadiusXS) in a state's
// or the paper's tint, ChipSM (a state tag), Chip (evidence, metadata,
// the forecast) or ChipLG (a task in the conversation) tall, with
// SM/XS bold text. Chips never press down: only buttons do.

// chipBox is a chip's row, h tall, on bg; the caller adds what is in it.
func (a *App) chipBox(c *ui.Context, h float32, bg ui.Color) ui.Element {
	t := a.T
	pad := t.S3 - 2 // 10: a pebble or a check sits close to the edge
	if h <= t.ChipSM {
		pad = t.S2
	}
	return ui.Row(c).Gap(t.S2-2).Height(h).Padding(0, pad).Radius(t.RadiusXS).Background(bg).AlignItems(ui.Center).Shrink(0)
}

// tag is the small chip naming a state or a fact: one word or two.
func (a *App) tag(c *ui.Context, text string, sc theme.StateColors) {
	a.chipBox(c, a.T.ChipSM, sc.Surface).Children(func() {
		ui.Text(c, text).FontSize(a.T.XS).FontWeight(700).TextColor(sc.Ink).SingleLine()
	})
}

// stateChip is a small tag naming a state.
func (a *App) stateChip(c *ui.Context, att protocol.Attention) {
	a.tag(c, a.stateLabel(att), a.T.State(string(att)))
}

// pill is a sunken chip of metadata.
func (a *App) pill(c *ui.Context, text string) {
	if text == "" {
		return
	}
	t := a.T
	a.chipBox(c, t.Chip, t.SurfaceSunken).Shrink(1).MinWidth(0).Children(func() {
		ui.Text(c, text).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0)
	})
}

// ---------- buttons ----------

// The one button family (docs/design/ui.md, Components):
//
//   - primary: the one thing to do. Ink, and it presses down (PressPrimary).
//   - secondary: a choice beside it. The surface with a hairline, flat;
//     it darkens as it is pressed.
//   - text (quiet): words only, with a tint under them on hover.
//   - accent: the composer's send.
//   - icon: a square of any of these (iconButton).
//
// Three heights (ControlSM/MD/LG); every button of one height has the same
// corners, padding and type. Hover, press and keyboard focus look the same
// on all of them.
type btnKind int

const (
	btnPrimary   btnKind = iota // dark press-down pebble button
	btnSecondary                // light, flat, hairline
	btnText                     // text button
	btnAccent                   // accent, as the composer's send
)

// controlHeight snaps a height to the family's three: small (chrome,
// inline lines), medium (cards, the conversation), large (setup screens).
func (a *App) controlHeight(h float32) float32 {
	t := a.T
	switch {
	case h <= (t.ControlSM+t.ControlMD)/2:
		return t.ControlSM
	case h < (t.ControlMD+t.ControlLG)/2:
		return t.ControlMD
	}
	return t.ControlLG
}

// button is a button of the family. It reports a click.
func (a *App) button(c *ui.Context, label string, kind btnKind, height float32, onSurface ui.Color) bool {
	return a.buttonFor(c, label, "", kind, height, onSurface)
}

// buttonFor is a button whose accessible name says what it acts on ("Go:
// rebase · Fix CI"), so two "Go" buttons on one screen are told apart
// by screen readers and automation; the visible text stays label.
func (a *App) buttonFor(c *ui.Context, label, about string, kind btnKind, height float32, onSurface ui.Color) bool {
	t := a.T
	name := label
	if about != "" {
		name = label + " · " + about
	}
	h := a.controlHeight(height)
	size, padX := t.MD, t.S4
	switch h {
	case t.ControlSM:
		size, padX = t.SM, t.S3
	case t.ControlLG:
		padX = t.S5
	}
	if kind == btnText {
		padX = t.S2 + 2
	}
	b := ui.Row(c.Key("btn:"+name)).Height(h).Padding(0, padX).Radius(t.RadiusSM).
		Justify(ui.Center).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, kind, h, onSurface)
	b.Children(func() {
		ui.Text(c, label).FontSize(size).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(about != "")
	})
	return b.Clicked()
}

// buttonLook styles b as a button of kind on onSurface, h tall: its
// background, edge, depth and hover/press states. It returns the ink for
// what is on it.
func (a *App) buttonLook(c *ui.Context, b ui.Element, kind btnKind, h float32, onSurface ui.Color) ui.Color {
	t := a.T
	hover, down := b.Hovered(), b.Pressed()
	switch kind {
	case btnPrimary:
		bg := t.Ink
		if hover && !down {
			bg = t.Ink.Mix(t.InkSoft, 0.45)
		}
		b.Background(bg)
		a.press(c, b, a.pressFor(t.PressPrimary, h))
		return t.OnUserBubble
	case btnAccent:
		bg := t.Accent
		if hover && !down {
			bg = t.Accent.Mix(t.NeedsYou.Strong, 0.35)
		}
		b.Background(bg)
		a.press(c, b, a.pressFor(t.PressAccent, h))
		return t.OnAccent
	case btnSecondary:
		bg := t.Surface
		switch {
		case down:
			bg = t.SurfaceSunken
		case hover:
			bg = t.SurfaceSunken.Mix(t.Surface, 0.55)
		}
		b.Background(bg).Border(1, t.Line)
		a.sink(c, b, down)
		return t.Ink
	}
	// Text: no edge until the pointer comes over it.
	if hover || down {
		tint := 0.08
		if down {
			tint = 0.14
		}
		b.Background(t.NeedsYou.Ink.Alpha(float32(tint)))
	}
	return t.NeedsYou.Ink
}

// pressFor is a press depth for a control h tall: a small control sits
// lower (2 points), the others at the theme's depth.
func (a *App) pressFor(p theme.Press, h float32) theme.Press {
	if h <= a.T.ControlSM && p.Offset > 2 {
		p.Offset = 2
	}
	return p
}

// sink moves a flat control a point down while it is pressed.
func (a *App) sink(c *ui.Context, e ui.Element, down bool) {
	if c.Preferences().ReduceMotion {
		return
	}
	y := float32(0)
	if down {
		y = 1
	}
	e.Translate(0, e.AnimateTo("sink", y, ui.Animation{Duration: a.T.PressDur}))
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
	y = e.AnimateTo("press", y, ui.Animation{Duration: a.T.PressDur})
	e.Translate(0, y).Shadow(0, press.Offset-y, 0, 0, press.Color)
}

// navButton is a button of the window's chrome (Devices, On hand): a
// secondary button at the small height with a glyph before its word.
func (a *App) navButton(c *ui.Context, key, label, name string, glyph func()) bool {
	t := a.T
	left := t.S3
	if glyph != nil {
		left = t.S2 - 2 // a glyph sits close to the edge, as in a chip
	}
	b := ui.Row(c.Key("nav:"+key)).Gap(t.S2).Height(t.ControlSM).Padding(0, t.S3, 0, left).Radius(t.RadiusSM).
		AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnSecondary, t.ControlSM, t.Chrome)
	b.Children(func() {
		if glyph != nil {
			glyph()
		}
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
	})
	return b.Clicked()
}

// iconButton is a square button that draws its icon, in one of the
// family's kinds.
func (a *App) iconButton(c *ui.Context, label string, size float32, kind btnKind, draw func(fg ui.Color) func(p *ui.Painter, r ui.Rect)) bool {
	t := a.T
	b := ui.Box(c.Key("icon:"+label)).Size(size, size).Radius(t.RadiusSM).Label(label).
		Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, kind, size, t.Surface)
	b.Draw(draw(fg))
	return b.Clicked()
}

// ---------- notices ----------

// noticeTone is what a notice is about.
type noticeTone int

const (
	noticeInfo  noticeTone = iota // the app telling or offering something
	noticeDone                    // something good happened
	noticeAlert                   // something held, to look at
)

// notice is the app speaking, never the partner: a slim, quiet strip just
// above the composer, in small type, with a glyph tile at its start and
// small buttons at its end. The partner speaks in large type on the paper
// and in cards; a notice is neither, so it is never mistaken for a
// message. body writes its words; actions its buttons (ControlSM).
func (a *App) notice(c *ui.Context, key string, tone noticeTone, glyph func(), body func(), actions func()) ui.Element {
	t := a.T
	bg := t.SurfaceSunken.Mix(t.Bg, 0.45)
	switch tone {
	case noticeDone:
		bg = t.Done.Surface
	case noticeAlert:
		bg = t.Failed.Surface
	}
	row := ui.Row(c.Key(key)).Gap(t.S3).Wrap().Padding(t.S2, t.S2, t.S2, t.S3).MinHeight(t.ControlSM + 2*t.S2).
		Radius(t.RadiusMD).Background(bg).AlignItems(ui.Center).Role(ui.RoleStatus)
	if tone == noticeAlert {
		row.Role(ui.RoleAlert)
	}
	a.enter(c, row)
	row.Children(func() {
		if glyph != nil {
			glyph()
		}
		ui.Column(c).Grow(1).Basis(240).MinWidth(0).Gap(2).Children(body)
		if actions != nil {
			ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(actions)
		}
	})
	return row
}

// aboveComposer centers what it holds on the conversation's column, just
// above the composer: where notices go.
func (a *App) aboveComposer(c *ui.Context, body func()) {
	t := a.T
	ui.Row(c).Justify(ui.Center).Padding(0, t.S5, t.S2, t.S5).Children(func() {
		ui.Column(c).Grow(1).MaxWidth(convWidth).Children(body)
	})
}

// glyphTile is a glyph on a small tile: a notice's or a row's icon.
func (a *App) glyphTile(c *ui.Context, size float32, bg ui.Color, draw func(p *ui.Painter, r ui.Rect)) {
	ui.Box(c).Size(size, size).Radius(a.T.RadiusXS).Background(bg).Draw(draw).Shrink(0)
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

// drawPrompt is a terminal's prompt: a chevron and a cursor line.
func drawPrompt(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-6, cy-4.5)
		m.LineTo(cx-1.5, cy)
		m.LineTo(cx-6, cy+4.5)
		m.MoveTo(cx+0.5, cy+5)
		m.LineTo(cx+6.5, cy+5)
		p.StrokePath(&m, 2, col)
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
		ui.Row(c).Gap(t.S2).Children(func() {
			ui.Box(c).Size(22, 22).Radius(t.RadiusXS).Background(t.Done.Surface).Draw(drawCheck(t.Done.Ink))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	goText := a.L.T("decision.go")
	if d.GoLabel != "" {
		goText = a.L.T("decision.go.label", d.GoLabel)
	}
	ui.Row(c.Key("decide:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		about := a.decisionAbout(d)
		if a.buttonFor(c, goText, about, btnPrimary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "go", "")
		}
		if a.buttonFor(c, a.L.T("decision.hold"), about, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.buttonFor(c, a.L.T("decision.reply"), about, btnText, st.height, st.quietBg) {
			a.replyOpen[d.DecisionID] = !a.replyOpen[d.DecisionID]
		}
	})
	if a.replyOpen[d.DecisionID] {
		draft := a.replyDraft[d.DecisionID]
		ui.Row(c.Key("reply:"+d.DecisionID)).Gap(t.S2).Padding(t.S1, t.S1, t.S1, t.S3).Radius(t.RadiusMD).Background(t.Surface).Children(func() {
			ui.TextArea(c, &draft).Lines(1, 4).Placeholder(a.L.T("decision.reply.placeholder")).AutoFocus().
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).Grow(1).FontSize(t.MD).
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
			if a.iconButton(c, a.L.T("composer.send"), t.ControlMD, btnPrimary, drawSend) && draft != "" {
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

// decisionAbout names what a decision is about, for its buttons'
// accessible names: its task's title, else the question's start.
func (a *App) decisionAbout(d *store.DecisionState) string {
	if t := a.S.Task(d.TaskID); t != nil && t.Title() != "" {
		return t.Title()
	}
	q := []rune(d.Question)
	if len(q) > 40 {
		return string(q[:40]) + "…"
	}
	return string(q)
}
