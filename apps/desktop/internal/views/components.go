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
// you (design/ui.md, Persona face).
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

// ---------- tasks in the partner's words ----------

// taskLine is a task inside the partner's words: a drawn mark of where it
// stands, its title as a link, and its status line in muted words. No
// fill, no capsule (D73): the words say the state.
func (a *App) taskLine(c *ui.Context, t *store.Task, detail string) {
	th := a.T
	att := t.Attention()
	title := t.Title()
	if h := t.Browsing(); h != "" {
		detail = a.L.T(t.BrowsingKey(), h)
	} else if t.Place().Kind == "browser" && !finished(t) {
		a.ensureHistory(t.ID) // browser status lines come with the task's stream
	}
	if sameWords(detail, title) {
		detail = "" // a status line that only repeats the title says nothing
	}
	if detail == "" {
		detail = a.stateLabel(att)
	}
	// Who is doing it ends the line while it is under way, with why when it
	// isn't Ducter's plain pick (D89).
	if who, why := a.whoLine(t); who != "" && !finished(t) && att != protocol.Dropped {
		detail += " · " + who
		if why != "" {
			detail += " · " + why
		}
	}
	name := title
	if detail != "" {
		name += " · " + detail
	}
	row := ui.Row(c.Key("task:" + t.ID)).Gap(th.S2).Wrap().AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).
		Label(name).Focusable().MinWidth(0)
	hover := row.Hovered()
	row.Children(func() {
		ui.Box(c).Size(16, 16).Draw(stateMark(att)(th.InkMuted)).Shrink(0)
		tl := ui.Text(c, title).FontSize(th.SM).FontWeight(700).TextColor(th.InkSoft).AccessHidden(true)
		if hover {
			tl.TextColor(th.Ink).Underline()
		}
		if detail != "" {
			ui.Text(c, "· "+detail).FontSize(th.SM).TextColor(th.InkMuted).AccessHidden(true)
		}
		a.glyph(c, 12, drawChevron(th.InkMuted, false))
	})
	if row.Clicked() {
		a.OpenTask(t.ID)
	}
}

// stateMark is the drawn mark of an attention state: → under way, clock
// waiting, a speech bubble asking you, ✓ done, × didn't work. "!" is never
// a state's mark: it reads as an alarm.
func stateMark(att protocol.Attention) func(ui.Color) func(*ui.Painter, ui.Rect) {
	switch att {
	case protocol.Blocked, protocol.Queued:
		return drawClock
	case protocol.NeedsYou:
		return drawAsk
	case protocol.Done, protocol.DoneClaimed:
		return drawCheck
	case protocol.Failed, protocol.Dropped, protocol.Superseded:
		return drawCross
	}
	return drawArrow
}

// quietLink is a quiet text link in a line of proof: its words in soft
// ink, then the drawn chevron (D213, never a font's ›); the words underline
// on hover. It wraps, never truncates.
func (a *App) quietLink(c *ui.Context, key, text, name string) bool {
	t := a.T
	row := ui.Row(c.Key("link:" + key)).Gap(2).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).
		Label(name).Focusable().MinWidth(0).Shrink(1)
	hover := row.Hovered() || row.Pressed()
	row.Children(func() {
		col := t.InkSoft
		if hover {
			col = t.Ink
		}
		l := ui.Text(c, text).FontSize(t.SM).FontWeight(700).TextColor(col).MinWidth(0).Shrink(1).AccessHidden(true)
		if hover {
			l.Underline()
		}
		a.glyph(c, 12, drawChevron(col, false))
	})
	return row.Clicked()
}

// mark is a drawn glyph and plain words in one color: a line of proof
// ("✓ 50/50 pass"), or what went out ("↗ git push …").
func (a *App) mark(c *ui.Context, draw func(ui.Color) func(*ui.Painter, ui.Rect), text string, col ui.Color) ui.Element {
	return a.markIn(c, draw, col, text, col)
}

// markIn is a mark whose glyph has its own ink: a passed check's ✓ in the
// done ink beside muted words (D76).
func (a *App) markIn(c *ui.Context, draw func(ui.Color) func(*ui.Painter, ui.Rect), glyph ui.Color, text string, col ui.Color) ui.Element {
	t := a.T
	row := ui.Row(c).Gap(t.S1 + 2).AlignItems(ui.Center).MinWidth(0)
	row.Children(func() {
		if draw != nil {
			ui.Box(c).Size(16, 16).Draw(draw(glyph)).Shrink(0)
		}
		ui.Text(c, text).FontSize(t.SM).TextColor(col).MinWidth(0)
	})
	return row
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

// ---------- buttons ----------

// The one button family (design/ui.md, Components; D76):
//
//   - primary: the one thing to do. Ink, cream words.
//   - secondary: a choice beside it. Cream with a 1-point inner rim; on a
//     tinted card, white on the card's own ledge color.
//   - accent: the composer's send and the equip. Orange.
//   - text (quiet): words only, a soft ink tint under them on hover and
//     press; in a needs-you card, in its ink.
//   - icon: a square of any of these (iconButton).
//
// Every filled button is clay: it stands on a ledge in a darker shade of
// its fill (3 points; 4 at the large height), with a soft drop under it
// and a 1.5-point highlight along its inner top edge, and sinks into the
// ledge as it is pressed (70 ms). Text buttons, chips and containers are
// flat. Three heights (ControlSM/MD/LG: 36/44/52) with their own radius
// (12/14/18) and type (13/15/16, 700).
type btnKind int

const (
	btnPrimary   btnKind = iota // ink clay button
	btnSecondary                // cream clay button
	btnText                     // text button
	btnAccent                   // orange clay button: the composer's send
)

// controlHeight snaps a height to the family's three: small (chrome,
// inline lines), medium (cards, the conversation), large (setup screens,
// the composer's send, the equip).
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

// buttonRadius is the corner radius of a button h tall.
func (a *App) buttonRadius(h float32) float32 {
	t := a.T
	switch a.controlHeight(h) {
	case t.ControlSM:
		return t.ButtonRadius[0]
	case t.ControlMD:
		return t.ButtonRadius[1]
	}
	return t.ButtonRadius[2]
}

// button is a button of the family. It reports a click.
func (a *App) button(c *ui.Context, label string, kind btnKind, height float32, onSurface ui.Color) bool {
	return a.buttonFor(c, label, "", kind, height, onSurface)
}

// textPad is a text button's side padding at control height h: its hover
// fill reaches that far past its words.
func (a *App) textPad(h float32) float32 {
	if a.controlHeight(h) == a.T.ControlSM {
		return a.T.S2 + 2
	}
	return a.T.S3
}

// textRow is a row that starts with text buttons, pulled left by their
// padding so their words line up with the card's text edge (the padding
// is for the hover fill, not for indenting).
func (a *App) textRow(c *ui.Context, h float32) ui.Element {
	return ui.Row(c).MarginStart(-a.textPad(h))
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
	size, padX := t.MD, t.S5-4 // 15 / 20
	switch h {
	case t.ControlSM:
		size, padX = t.SM, t.S3+2 // 13 / 14
	case t.ControlLG:
		size, padX = t.Bubble, t.S5 // 16 / 24
	}
	if kind == btnText {
		padX = a.textPad(h)
	}
	b := ui.Row(c.Key("btn:"+name)).Height(h).Padding(0, padX).Radius(a.buttonRadius(h)).
		Justify(ui.Center).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, kind, h, onSurface)
	b.Children(func() {
		ui.Text(c, label).FontSize(size).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(about != "")
	})
	return b.Clicked()
}

// onTint reports whether a surface is a tinted card's (needs you, done,
// didn't work), where a secondary button turns white on the card's ledge.
func (a *App) onTint(s ui.Color) (theme.StateColors, bool) {
	t := a.T
	for _, st := range []theme.StateColors{t.NeedsYou, t.Done, t.Failed, t.Working, t.Waiting} {
		if s == st.Surface {
			return st, true
		}
	}
	return theme.StateColors{}, false
}

// buttonLook styles b as a button of kind on onSurface, h tall: its
// fill, clay depth and hover/press states. It returns the ink for what is
// on it.
func (a *App) buttonLook(c *ui.Context, b ui.Element, kind btnKind, h float32, onSurface ui.Color) ui.Color {
	t := a.T
	hover, down := b.Hovered(), b.Pressed()
	ledge := float32(3)
	if h >= t.ControlLG {
		ledge = 4
	}
	switch kind {
	case btnPrimary:
		p := t.PressPrimary
		p.Offset = ledge
		top, bottom := p.Top, t.Ink
		if hover && !down {
			top, bottom = top.Mix(t.InkSoft, 0.4), bottom.Mix(t.InkSoft, 0.4)
		}
		// A vertical gradient: lighter at the top, ink at the bottom.
		b.Gradient(top, bottom, 180)
		a.press(c, b, p)
		return t.Bg
	case btnAccent:
		bg := t.Accent
		if hover && !down {
			bg = t.Accent.Mix(t.Surface, 0.1)
		}
		b.Background(bg)
		p := t.PressAccent
		p.Offset = ledge
		a.press(c, b, p)
		return t.OnAccent
	case btnSecondary:
		p := t.PressSecondary
		p.Offset = ledge
		bg := t.Bg
		if st, ok := a.onTint(onSurface); ok {
			// On a tinted card the ledge is a deeper shade of the card's own
			// tint, so a white button reads as tall as an ink one (its base
			// would otherwise vanish into the card).
			bg, p.Color, p.Rim = t.Surface, st.Ledge.Mix(st.Strong, 0.45), ui.Transparent
		}
		if hover && !down {
			bg = bg.Mix(t.Surface, 0.6)
		}
		b.Background(bg)
		a.press(c, b, p)
		return t.Ink
	}
	// Text: no edge until the pointer comes over it.
	fg := t.InkSoft
	if st, ok := a.onTint(onSurface); ok {
		fg = st.Ink
	}
	if hover || down {
		tint := 0.06
		if down {
			tint = 0.11
		}
		b.Background(t.Ink.Alpha(float32(tint)))
	}
	return fg
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

// press gives a button its clay (D76): the highlight along its inner top
// edge and its rim, the ledge under it, and a soft drop; pressed, it
// sinks into the ledge (the ledge goes to 0, the drop tightens). Reduced
// motion keeps the change without the movement.
func (a *App) press(c *ui.Context, e ui.Element, press theme.Press) {
	if press.Offset == 0 {
		return
	}
	t := a.T
	target := float32(0)
	if e.Pressed() || a.pressAll {
		target = 1
	}
	k := target
	if !c.Preferences().ReduceMotion {
		k = e.AnimateTo("press", target, ui.Animation{Duration: t.PressDur})
	}
	y := press.Offset * k
	lerp := func(a, b float32) float32 { return a + (b-a)*k }
	if k > 0 && !c.Preferences().ReduceMotion {
		e.Translate(0, y)
	}
	e.InsetShadow(0, 1.5, 0, 0, press.Hi)
	if press.Rim.A > 0 {
		e.InsetShadow(0, 0, 0, 1, press.Rim)
	}
	// MyGo paints a later shadow over an earlier one (CSS is the other
	// way round): the soft drop first, then the ledge, then the seam (1
	// point, right under the fill); seam and ledge sink to nothing as it
	// is pressed.
	d, dp := t.Drop, t.DropPressed
	if press.Drop.A > 0 {
		d.Color = press.Drop
	}
	e.Shadow(0, lerp(d.Y, dp.Y), lerp(d.Blur, dp.Blur), lerp(-4, 0), d.Color.Mix(dp.Color, k))
	if l := press.Offset - y; l > 0.01 {
		e.Shadow(0, l, 0, 0, press.Color)
		if press.Seam.A > 0 {
			e.Shadow(0, min(1, l), 0, 0, press.Seam)
		}
	}
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
	b := ui.Box(c.Key("icon:"+label)).Size(size, size).Radius(a.buttonRadius(size)).Label(label).
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

// glyph is a drawn mark at the start of a notice or a row: the glyph
// alone, in its ink, never on a tile (D73).
func (a *App) glyph(c *ui.Context, size float32, draw func(p *ui.Painter, r ui.Rect)) {
	ui.Box(c).Size(size, size).Draw(draw).Shrink(0)
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

// drawArrow is a forward arrow: something under way.
func drawArrow(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-5.5, cy)
		m.LineTo(cx+5.5, cy)
		m.MoveTo(cx+1.5, cy-4)
		m.LineTo(cx+5.5, cy)
		m.LineTo(cx+1.5, cy+4)
		p.StrokePath(&m, 2.2, col)
	}
}

// drawOut is a ↗: something went out.
func drawOut(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-4.5, cy+4.5)
		m.LineTo(cx+4.5, cy-4.5)
		m.MoveTo(cx-2, cy-4.5)
		m.LineTo(cx+4.5, cy-4.5)
		m.LineTo(cx+4.5, cy+2)
		p.StrokePath(&m, 2, col)
	}
}

// drawCross is an ×: it didn't work.
func drawCross(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-4, cy-4)
		m.LineTo(cx+4, cy+4)
		m.MoveTo(cx+4, cy-4)
		m.LineTo(cx-4, cy+4)
		p.StrokePath(&m, 2.2, col)
	}
}

// drawAsk is a small speech bubble: it is asking you. The calm mark of
// needs you, beside ✓ for what it does on its own.
func drawAsk(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		l, rt, top, bot, k := cx-6, cx+6, cy-5.5, cy+3, float32(3)
		var m ui.Path
		m.MoveTo(l+k, top)
		m.LineTo(rt-k, top)
		m.QuadTo(rt, top, rt, top+k)
		m.LineTo(rt, bot-k)
		m.QuadTo(rt, bot, rt-k, bot)
		m.LineTo(cx-1, bot)
		m.LineTo(cx-4, cy+6.5)
		m.LineTo(cx-3.8, bot)
		m.LineTo(l+k, bot)
		m.QuadTo(l, bot, l, bot-k)
		m.LineTo(l, top+k)
		m.QuadTo(l, top, l+k, top)
		m.Close()
		p.StrokePath(&m, 1.9, col)
	}
}

// drawBang is an !: an alert notice's glyph (a held message), never a
// state's mark.
func drawBang(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx, cy-5)
		m.LineTo(cx, cy+1.5)
		p.StrokePath(&m, 2.4, col)
		p.Fill(ui.Rect{X: cx - 1.3, Y: cy + 3.5, W: 2.6, H: 2.6}, col, 1.3)
	}
}

// ---------- decisions ----------

// decisionStyle sizes a decision's controls by where it shows.
type decisionStyle struct {
	height   float32  // of the buttons
	quietBg  ui.Color // the light button, on the decision's surface
	question float32  // font size; 0 hides the question
	// after adds controls after Reply… in the same row (Details).
	after func()
}

// decisionButtons builds Go / Hold / Reply… and the reply field, or how
// the decision was resolved.
func (a *App) decisionButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	if d.SignIn != nil {
		a.signInButtons(c, d, st) // D151: Sign in opens the live view
		return
	}
	if d.Phone != nil {
		a.phoneButtons(c, d, st) // D217: a Go for one tap, or the user's turn on the phone
		return
	}
	if d.Pay != nil {
		a.payButtons(c, d, st) // D191: merchant, amount, card, the code
		return
	}
	if d.Fill != nil {
		a.fillButtons(c, d, st)
		return
	}
	if d.Resolved != nil || d.Pending != "" {
		msg := a.answeredWords(d)
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	goText := a.goLabel(d)
	ui.Row(c.Key("decide:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		// One order on every surface (ui.md, Buttons): quiet text actions first, the
		// primary last, where the eye and the thumb end up (as on the phone and the site).
		about := a.decisionAbout(d)
		if a.buttonFor(c, a.L.T("decision.reply"), about, btnText, st.height, st.quietBg) {
			a.replyOpen[d.DecisionID] = !a.replyOpen[d.DecisionID]
		}
		if st.after != nil {
			st.after()
		}
		if d.Asker != nil && d.Asker.Other != "" {
			// X1 (D170): the asking agent's second option, answered in its own
			// words (a reply), never Hold.
			if a.buttonFor(c, d.Asker.Other, about, btnSecondary, st.height, st.quietBg) {
				a.Decide(d.DecisionID, "reply", d.Asker.Other)
			}
		} else if a.buttonFor(c, a.holdLabel(d), about, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.buttonFor(c, goText, about, btnPrimary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "go", "")
		}
	})
	if d.Asker != nil && d.Asker.Suggests {
		ui.Text(c, a.L.T("peer.suggests", d.GoLabel)).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
	}
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

// holdLabel is Hold's words: 先等等, or what holding means for a where ask
// (等它醒) or the closing card (先不搬) (D157).
func (a *App) holdLabel(d *store.DecisionState) string {
	switch {
	case d.Where != nil:
		return a.whereAskHold(d.Where)
	case d.Closing != nil:
		return a.L.T("move.closing.hold")
	case d.MemPlugin != nil:
		return a.L.T("memp.card.hold") // D169: 先不装 / Not now
	case d.Trust != nil:
		return a.L.T("peers.trust.hold") // X2: 还是先问我
	case d.Call != nil:
		return a.L.T("call.hold") // D189: 先不打 / Not now
	case d.Cal != nil:
		return a.calHold(d.Cal) // D222: 暂不添加 / 保留日程 …
	}
	return a.L.T("decision.hold")
}

// goLabel is the Go button's words: the action itself when it is a short
// verb ("Rebase"; zh "好，rebase"), else Go / 好: never a sentence (D127).
func (a *App) goLabel(d *store.DecisionState) string {
	if d.Where != nil {
		return a.whereAskGo(d.Where)
	}
	if d.Closing != nil {
		return a.L.T("move.closing.go")
	}
	if d.MemPlugin != nil {
		return a.L.T("memp.card.go")
	}
	if d.Call != nil {
		if d.Call.Kind == "sheet" {
			return a.L.T("call.sheet.done") // D215: 打完了 / Done calling
		}
		if d.Call.Plan != nil && d.Call.Plan.At != "" {
			return a.L.T("call.then") // D208: 到点再打 / Call then (现在就打 sits by the time)
		}
		return a.L.T("call.go") // D189: 打过去 / Call
	}
	if d.Cal != nil {
		return a.calGo(d) // D222: the action itself (添加到日历 / Move it …)
	}
	if d.Asker != nil {
		return d.GoLabel // X1: the asking agent's own option, as it named it
	}
	if d.Computer != nil && d.Computer.Kind == "user" {
		return a.L.T("computeruse.user.done") // D235: their own turn in an app: 好了 / Done
	}
	return a.shortGo(d.GoLabel)
}

// defaultLine says what happens if the user doesn't answer.
func (a *App) defaultLine(c *ui.Context, d *store.DecisionState) string {
	if d.Call != nil || d.Cal != nil {
		return "" // D189 (4), D222: it waits for the owner; no default, no countdown
	}
	if d.Asker != nil {
		return a.L.T("peer.default") // silence never answers for the user (D164)
	}
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
	if d.Closing != nil { // D157: the closing card's Go, in the reader's words
		label = a.L.T("move.closing.go")
		if a.L.Lang != i18n.ZH {
			label = strings.ToLower(label[:1]) + label[1:]
		}
	}
	if label == "" {
		return a.L.T("decision.default.goon", a.duration(left+time.Second*59/60))
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
