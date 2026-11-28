package views

import (
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

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
	// isn't Ducter's plain pick (D89): each its own muted element (D291).
	var who []string
	if w, why := a.whoLine(t); w != "" && !finished(t) && att != protocol.Dropped {
		who = append(a.bodyParts(t), why)
	}
	name := spoken(a.L, append([]string{title, detail}, who...)...)
	row := ui.Row(c.Key("task:" + t.ID)).Gap(th.S2).Wrap().AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).
		Label(name).Focusable().MinWidth(0)
	hover := row.Hovered()
	row.Children(func() {
		ui.Box(c).Size(16, 16).Draw(stateMark(att)(th.InkMuted)).Shrink(0)
		tl := uiText(c, title).FontSize(th.SM).FontWeight(700).TextColor(th.InkSoft).AccessHidden(true)
		if hover {
			tl.TextColor(th.Ink).Underline()
		}
		for _, f := range append([]string{detail}, who...) {
			if f != "" {
				uiText(c, f).FontSize(th.SM).TextColor(th.InkMuted).AccessHidden(true)
			}
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
		l := uiText(c, text).FontSize(t.SM).FontWeight(700).TextColor(col).MinWidth(0).Shrink(1).AccessHidden(true)
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
		uiText(c, text).FontSize(t.SM).TextColor(col).MinWidth(0)
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

// countPebble is a count of what needs the person, on a figure's shoulder
// or beside a back button (D517, ui.md "Shared controls"): a clay pebble in
// the needs-you surface and ink on its ledge, ringed in the ground it sits
// on. The caller places it (Absolute, Top, Right).
func (a *App) countPebble(c *ui.Context, key string, n int, ground ui.Color) ui.Element {
	t := a.T
	return ui.Box(c.Key("pebble:"+key)).MinWidth(19).Height(18).Padding(0, 5).Radius(8).
		Background(t.NeedsYou.Surface).Border(1.5, ground).Shadow(0, 2, 0, 0, t.NeedsYou.Ledge).
		AlignItems(ui.Center).Justify(ui.Center).AccessHidden(true).Children(func() {
		uiText(c, strconv.Itoa(n)).FontSize(11).FontWeight(800).TextColor(t.NeedsYou.Ink)
	})
}

// needsDoor is a needs-you count as a door (D535, ui.md "Shared controls"):
// its words in the needs-you ink on a small clay pill of the needs-you
// surface, the drawn chevron after them; it sinks into its ledge as it is
// pressed and shows the keyboard's ring. A tap opens the next item.
func (a *App) needsDoor(c *ui.Context, key, words, about string) bool {
	t := a.T
	b := ui.Row(c.Key("door:"+key)).Gap(t.S1).AlignItems(ui.Center).Height(t.ChipSM+6).Padding(0, t.S2, 0, t.S3).
		Radius(t.Pill).Background(t.NeedsYou.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).
		Label(spoken(a.L, words, about)).Focusable().Shrink(0)
	ledge := float32(2)
	switch {
	case b.Pressed():
		ledge = 0
		if !c.Preferences().ReduceMotion {
			b.Translate(0, 2)
		}
		b.Background(t.NeedsYou.Surface.Mix(t.NeedsYou.Dot, 0.24))
	case b.Hovered():
		b.Background(t.NeedsYou.Surface.Mix(t.NeedsYou.Dot, 0.14))
	}
	if ledge > 0 {
		b.Shadow(0, ledge, 0, 0, t.NeedsYou.Ledge)
	}
	if b.FocusVisible() {
		b.Border(2, t.Accent)
	}
	b.Children(func() {
		uiText(c, words).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).SingleLine().AccessHidden(true)
		a.glyph(c, 12, drawChevron(t.NeedsYou.Ink, false))
	})
	return b.Clicked()
}

// pebbleDoor is countPebble as a door (D535): the same pebble with a
// pointer's room round it (4 on each side); under the pointer it lifts a
// point off its ledge, pressed it sinks. The caller places the element and
// reads the bool (pressed). The pebble stays out of the accessibility tree:
// its row says the count and opens the same door from the keyboard.
func (a *App) pebbleDoor(c *ui.Context, key string, n int, ground ui.Color) (ui.Element, bool) {
	hit := ui.Box(c.Key("pdoor:" + key)).Padding(4).Cursor(ui.CursorPointer).AccessHidden(true)
	y := float32(0)
	switch {
	case hit.Pressed():
		y = 1
	case hit.Hovered():
		y = -1
	}
	hit.Children(func() {
		p := a.countPebble(c, key, n, ground)
		if !c.Preferences().ReduceMotion {
			p.Translate(0, p.AnimateTo("lift", y, a.T.Snappy))
		}
	})
	return hit, hit.Clicked()
}

// countDoor is 「n 个待你处理」 in the conversation's bar: the count's own words
// in the needs-you ink, a text button of the bar (the crumbs' tint under
// the pointer), the door to the next item; it says whether it was pressed.
func (a *App) countDoor(c *ui.Context, words string, tint ui.Color) bool {
	t := a.T
	l := uiText(c.Key("who-needs"), words).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink).SingleLine().
		Padding(1, t.S1+2).Radius(t.RadiusXS).Cursor(ui.CursorPointer).Role(ui.RoleLink).
		Label(spoken(a.L, words, a.L.T("door.line.about"))).Focusable()
	if l.Hovered() || l.Pressed() {
		l.Background(tint)
	}
	if l.FocusVisible() {
		l.Border(2, t.Accent)
	}
	return l.Clicked()
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
	name := spoken(a.L, label, about)
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
		uiText(c, label).FontSize(size).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(about != "")
	})
	return b.Clicked()
}

// busyButton is a secondary button at work (D552: 更新中… while the
// update it started runs): the same clay standing on its ledge, the shared
// spinner before its words in the soft ink, no hover, no press, no click.
// The web's Btn with busy.
func (a *App) busyButton(c *ui.Context, label, about string, height float32, onSurface ui.Color) {
	t := a.T
	name := spoken(a.L, label, about)
	h := a.controlHeight(height)
	size, padX := t.MD, t.S5-4
	if h == t.ControlSM {
		size, padX = t.SM, t.S3+2
	}
	p := t.PressSecondary
	p.Offset = 3
	bg := t.Bg
	if st, ok := a.onTint(onSurface); ok {
		bg, p.Color, p.Rim = t.Surface, st.Ledge.Mix(st.Strong, 0.45), ui.Transparent
	}
	b := ui.Row(c.Key("busy:"+name)).Height(h).Padding(0, padX).Gap(t.S2).Radius(a.buttonRadius(h)).
		Justify(ui.Center).AlignItems(ui.Center).Role(ui.RoleButton).Label(name).Shrink(0).Background(bg)
	b.InsetShadow(0, 1.5, 0, 0, p.Hi)
	if p.Rim.A > 0 {
		b.InsetShadow(0, 0, 0, 1, p.Rim)
	}
	b.Shadow(0, t.Drop.Y, t.Drop.Blur, -4, t.Drop.Color)
	b.Shadow(0, p.Offset, 0, 0, p.Color)
	if p.Seam.A > 0 {
		b.Shadow(0, 1, 0, 0, p.Seam)
	}
	b.Children(func() {
		ui.Box(c).Size(12, 12).Shrink(0).Center().AccessHidden(true).Children(func() { ui.Spinner(c).Size(11, 11) })
		uiText(c, label).FontSize(size).FontWeight(700).TextColor(t.InkSoft).SingleLine().AccessHidden(true)
	})
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
// here draws it as the place shown (D262): pressed into the bar, sunken
// with no ledge, its word in ink; a click on it does nothing new.
func (a *App) navButton(c *ui.Context, key, label, name string, glyph func(), here bool) bool {
	t := a.T
	left, right := t.S3, t.S3
	if glyph != nil {
		left = t.S2 - 2 // a glyph sits close to the edge, as in a chip
		if label == "" {
			right = left
		}
	}
	b := ui.Row(c.Key("nav:"+key)).Gap(t.S2).Height(t.ControlSM).Padding(0, right, 0, left).Radius(t.RadiusSM).
		AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name).Focusable().Shrink(0)
	if label == "" {
		b.Tooltip(name)
	}
	var fg ui.Color
	if here {
		b.Background(t.SurfaceSunken)
		fg = t.Ink
	} else {
		fg = a.buttonLook(c, b, btnSecondary, t.ControlSM, t.Chrome)
	}
	b.Children(func() {
		if glyph != nil {
			glyph()
		}
		if label != "" {
			uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
		}
	})
	return b.Clicked() && !here
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

// iconButtonTip is iconButton whose tooltip says more than its name (its
// key: D567's 铺满（⌘Return）), kept by key so a toggle that renames itself
// keeps the focus.
func (a *App) iconButtonTip(c *ui.Context, key, label, tip string, size float32, kind btnKind, draw func(fg ui.Color) func(p *ui.Painter, r ui.Rect)) bool {
	t := a.T
	b := ui.Box(c.Key("icon:"+key)).Size(size, size).Radius(a.buttonRadius(size)).Label(label).Tooltip(tip).
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
func (a *App) aboveComposer(c *ui.Context, body func()) { a.aboveComposerAt(c, convWidth, body) }

// aboveComposerAt is aboveComposer on a composer of another measure (the
// opened task's, D493): whatever sits over it shares its edges.
func (a *App) aboveComposerAt(c *ui.Context, measure float32, body func()) {
	t := a.T
	ui.Row(c).Justify(ui.Center).Padding(0, t.S5, t.S2, t.S5).Children(func() {
		ui.Column(c).Grow(1).MaxWidth(measure).MinWidth(0).Children(body)
	})
}

// glyph is a drawn mark at the start of a notice or a row: the glyph
// alone, in its ink, never on a tile (D73).
func (a *App) glyph(c *ui.Context, size float32, draw func(p *ui.Painter, r ui.Rect)) {
	ui.Box(c).Size(size, size).Draw(draw).Shrink(0)
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
	// under is drawn under the row (D482: the default, said once).
	under func()
}

// defaultBelow is the default under an On hand card's or a sheet's row
// (D482), in the needs-you ink; a where ask says its own lines above instead.
func (a *App) defaultBelow(c *ui.Context, d *store.DecisionState) func() {
	if d.Where != nil || d.Cal != nil {
		return nil
	}
	return func() { a.defaultUnder(c, d, a.T.NeedsYou.Ink, a.T.SM, nil) }
}

// decisionButtons builds Go / Hold / Reply… and the reply field, or how
// the decision was resolved.
func (a *App) decisionButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	if d.Checkout != nil {
		a.checkoutButtons(c, d, st) // D436: 去付款 opens the checkout live; the person pays
		return
	}
	if d.SignIn != nil && d.SignIn.Step != "" {
		a.stepButtons(c, d, st) // D436: a step on the page that's the person's
		return
	}
	if d.SignIn != nil {
		a.signInButtons(c, d, st) // D151: Sign in opens the live view
		return
	}
	if d.DeviceSignIn != nil {
		a.deviceSignInButtons(c, d, st) // D599: Open {service}, the code with Copy, settled by itself
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
	if d.Key != nil {
		a.keyButtons(c, d, st) // D233: what and why, the masked field, remember or once
		return
	}
	if d.CopyKey != nil {
		a.copyKeyButtons(c, d, st) // D539: what, from, to, the note; 先不 · 复制
		return
	}
	if d.Handset != nil && d.Handset.Kind == "record" {
		a.handsetRecordButtons(c, d, st) // D280: the person's turn on the phone, to allow a recording
		return
	}
	if d.Resolved != nil || d.Pending != "" {
		msg := a.answeredWords(d)
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			uiText(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		a.leftDraft(c, d, st)
		return
	}
	// D403: a reply already written: its first line, 先等等 and 看草稿 (the card in the
	// conversation, where the words are); never Send away from the card.
	if d.Draft != nil && d.FindID != "" {
		if d.Draft.First != "" {
			uiText(c, d.Draft.First).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
		}
		ui.Row(c.Key("draft-acts:" + d.DecisionID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if a.buttonFor(c, a.L.T("draft.see"), d.Question, btnPrimary, st.height, st.quietBg) {
				a.draftJump = d.FindID
				a.Route = RouteConversation
				a.markRead()
			}
			if a.buttonFor(c, a.L.T("decision.hold"), d.Question, btnSecondary, st.height, st.quietBg) {
				a.Decide(d.DecisionID, "hold", "")
			}
		})
		return
	}
	// D382: put off: when it asks again, and Decide now; back: said once.
	if a.laterAway(c, d, st.quietBg) {
		return
	}
	a.laterBack(c, d)
	a.decideRow(c, d, a.decisionAbout(d), st.height, st.quietBg, st.after, st.under)
}

// decideRow is an ask's one grammar (D482), on every surface a go/hold ask
// stands (the conversation's card, On hand, the opened task, a sheet), as on
// the web (views.tsx DecideRow): the one action that says exactly what happens
// leads; the other ways follow it as quiet text, each meaning one thing (先不用 /
// Not now declines, 回复… / Reply… says something else, 晚点再问我 / Ask me later
// brings it back at a time); then under, the default said once. Reply… opens
// its field in place of the row, with its own 发送 / Send where Go stood and
// 取消 / Cancel (Enter sends, Esc closes): nothing else sends while it is open.
func (a *App) decideRow(c *ui.Context, d *store.DecisionState, about string, height float32, bg ui.Color, after, under func()) {
	// D493: the row and what stands under it keep one step of the scale
	// apart (12; the Go's ledge takes 4 of it), on every surface.
	ui.Column(c.Key("dk:" + d.DecisionID)).Gap(a.T.S3).Children(func() { a.decideRowIn(c, d, about, height, bg, after, under, nil) })
}

// decideRowLead is decideRow with lead drawn where Go stands (D599: Open
// {service} on a one-time-code sign-in, a page to open, not a Go).
func (a *App) decideRowLead(c *ui.Context, d *store.DecisionState, about string, height float32, bg ui.Color, lead, under func()) {
	ui.Column(c.Key("dk:" + d.DecisionID)).Gap(a.T.S3).Children(func() { a.decideRowIn(c, d, about, height, bg, nil, under, lead) })
}

func (a *App) decideRowIn(c *ui.Context, d *store.DecisionState, about string, height float32, bg ui.Color, after, under, lead func()) {
	t := a.T
	id := d.DecisionID
	// D601 (D61 GQ4): said go to this kind twice here: the offer leads, in one line.
	if d.Always != nil && d.Always.Often && !a.replyOpen[id] {
		uiText(c, a.L.T("always.often")).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).LineHeight(1.45)
	}
	if a.replyOpen[id] {
		a.replyField(c, d, about, height, bg)
	} else {
		ui.Row(c.Key("decide:" + id)).Gap(t.S1).Wrap().AlignItems(ui.Center).Children(func() {
			if lead != nil {
				lead()
				ui.Box(c).Width(t.S2).Shrink(0)
			} else if d.Key == nil {
				// D233: a key card's Go is its own, carrying the key; a plain Go
				// here could only be refused by the home and hide the card.
				if a.buttonFor(c, a.goLabel(d), about, btnPrimary, height, bg) {
					a.Decide(id, "go", "")
				}
				ui.Box(c).Width(t.S2).Shrink(0)
			}
			// D601: 以后这类直接做 / Always do this, the second choice beside Go
			// (secondary, never the default): Go now and from now on.
			if d.Always != nil && lead == nil && d.Key == nil {
				if a.buttonFor(c, a.alwaysLabel(d), about, btnSecondary, height, bg) {
					a.DecideAlways(id)
				}
				ui.Box(c).Width(t.S2).Shrink(0)
			}
			if d.Asker != nil && d.Asker.Other != "" {
				// X1 (D170): the asking agent's second option, answered in its own
				// words (a reply), never Hold.
				if a.buttonFor(c, d.Asker.Other, about, btnText, height, bg) {
					a.Decide(id, "reply", d.Asker.Other)
				}
			} else if a.buttonFor(c, a.holdLabel(d), about, btnText, height, bg) {
				a.Decide(id, "hold", "")
			}
			// D650: the stall ask's third choice: change when it ends, on its page.
			if d.Keep != nil && d.Keep.Ask == "stall" {
				if a.buttonFor(c, a.L.T("keep.ask.changeEnd"), about, btnText, height, bg) {
					a.openKeepEdit(d.Keep.ID, "until")
				}
			}
			// D650: a Keep's own ask (stall, budget) has its own choices; no Reply or Ask me later
			// on it (the page is where the person says more).
			if d.Keep == nil && d.Budget == nil {
				if a.buttonFor(c, a.L.T("decision.reply"), about, btnText, height, bg) {
					a.replyOpen[id] = true
					delete(a.laterOpen, id)
				}
				a.laterToggle(c, d, about, height, bg)
			}
			if after != nil {
				after()
			}
		})
	}
	if d.Asker != nil && d.Asker.Suggests {
		uiText(c, a.L.T("peer.suggests", d.GoLabel)).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
	}
	if under != nil {
		under()
	}
	if !a.replyOpen[id] {
		a.laterTimes(c, d, bg)
	}
}

// alwaysLabel (D601) is the second choice's words: 以后直接发 / Always post on
// a review round's card, else 以后这类直接做 / Always do this.
func (a *App) alwaysLabel(d *store.DecisionState) string {
	if d.Always != nil && d.Always.Action == "pr_review" {
		return a.L.T("always.post")
	}
	return a.L.T("always.do")
}

// replyField is an ask's reply, opened from Reply… in place of its row
// (D482): the words, then 发送 / Send where Go stood and 取消 / Cancel. Enter
// sends, Esc closes and goes back to the buttons.
func (a *App) replyField(c *ui.Context, d *store.DecisionState, about string, height float32, bg ui.Color) {
	t := a.T
	id := d.DecisionID
	draft := a.replyDraft[id]
	send := func(txt string) {
		if strings.TrimSpace(txt) == "" {
			return
		}
		a.Decide(id, "reply", strings.TrimSpace(txt))
		a.replyDraft[id] = ""
		draft = ""
	}
	ui.Column(c.Key("reply:" + id)).Gap(t.S2).Children(func() {
		ui.TextArea(c, &draft).Lines(1, 4).Placeholder(a.L.T("decision.reply.placeholder")).Label(a.L.T("decision.reply.placeholder")).AutoFocus().
			Background(t.Sunken).Border(1, t.Line).Radius(t.RadiusSM).Padding(t.S2, t.S3).FontSize(t.MD).TextColor(t.Ink).
			OnTextKey(func(k ui.TextKey) bool {
				switch {
				case k.Key == ui.KeyEnter && k.Mods == 0:
					send(k.Text())
					k.SetText("")
					return true
				case k.Key == ui.KeyEscape:
					a.replyOpen[id] = false
					return true
				}
				return false
			})
		ui.Row(c.Key("reply-acts:" + id)).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			if a.buttonFor(c, a.L.T("decision.reply.send"), about, btnPrimary, height, bg) {
				send(draft)
			}
			ui.Box(c).Width(t.S2).Shrink(0)
			if a.buttonFor(c, a.L.T("decision.reply.cancel"), about, btnText, height, bg) {
				a.replyOpen[id] = false
			}
		})
	})
	a.replyDraft[id] = draft
}

// defaultUnder is an ask's default said once under its row (D482): what
// happens if the person doesn't answer, as a sentence; with a small ring of
// the time left when it goes by itself.
func (a *App) defaultUnder(c *ui.Context, d *store.DecisionState, ink ui.Color, size float32, after func()) {
	t := a.T
	line := a.defaultLine(c, d)
	if line == "" && after == nil {
		return
	}
	// D493: at the column's edge (under the Go's own edge), the ring centred
	// on the sentence's first line, so a sentence that wraps hangs under itself.
	ui.Row(c.Key("dflt:" + d.DecisionID)).Gap(t.S2).Wrap().AlignItems(ui.Start).Children(func() {
		if left, ok := a.defaultIn(d); ok && d.DefaultOption == "go" && d.Reversible && d.Where == nil {
			frac := float32(1)
			if total := store.ParseTime(d.DefaultAt).Sub(a.decisionTime(d)); total > 0 {
				frac = max(0, float32(left)/float32(total))
			}
			ui.Box(c).Size(16, 16).Shrink(0).Margin(max(0, (size*1.45-16)/2), 0, 0, 0).Draw(drawRing(ink.Alpha(0.45), t.Accent, frac)).AccessHidden(true)
		}
		if line != "" {
			uiText(c, autospace(line)).FontSize(size).TextColor(ink).LineHeight(1.45).MinWidth(0).Shrink(1)
		}
		if after != nil {
			// D584: a quiet button (28 tall, its words centred) sits on the sentence's first line,
			// not 4pt under it: lifted by half the difference of the two heights.
			ui.Row(c.Key("dflt-after")).Margin(min(0, (size*1.45-28)/2), 0, 0, 0).Children(after)
		}
	})
}

// leftDraft (D481): words typed into this card's reply box while it was
// answered somewhere else: kept, and offered as a message to the partner
// quoting the card, never dropped with the box.
func (a *App) leftDraft(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	draft := strings.TrimSpace(a.replyDraft[d.DecisionID])
	if draft == "" || d.Pending != "" {
		return
	}
	ui.Column(c.Key("left:"+d.DecisionID)).Gap(t.S2).Padding(t.S3, t.S3, t.S3, t.S3).Radius(t.RadiusMD).Background(t.Surface).Children(func() {
		uiText(c, a.L.T("decision.left.line")).FontSize(t.SM).TextColor(t.InkMuted)
		uiText(c, draft).FontSize(t.MD).TextColor(t.Ink).LineHeight(1.5)
		ui.Row(c.Key("left-acts:" + d.DecisionID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Spacer(c)
			if a.buttonFor(c, a.L.T("decision.left.drop"), draft, btnText, st.height, st.quietBg) {
				delete(a.replyDraft, d.DecisionID)
			}
			if a.buttonFor(c, a.L.T("decision.left.send"), draft, btnSecondary, st.height, st.quietBg) {
				delete(a.replyDraft, d.DecisionID)
				a.sendLeftDraft(d, draft)
			}
		})
	})
}

// holdLabel is Hold's words: 先等等, or what holding means for a where ask
// (等它醒) or the closing card (先不搬) (D157).
func (a *App) holdLabel(d *store.DecisionState) string {
	switch {
	case d.HoldLabel != "":
		return d.HoldLabel // D334: 不理 / Ignore, as the card's code said it
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
	case d.Handset != nil && d.Handset.Kind == "setup":
		return a.L.T("handset.setup.hold") // D247: 先不用 / Not now
	case d.Handset != nil && d.Handset.Kind == "record":
		return a.L.T("handset.record.hold") // D280: 不录了 / Skip recording
	case d.Handset != nil:
		return a.L.T("handset.ask.hold") // D238: 不借 / Not now
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
	if d.Sender != nil {
		return d.GoLabel // D334: 答应 / Let it, as the card's code said it
	}
	if d.Src != nil && d.GoLabel != "" {
		return d.GoLabel // D341: 留言 / 留言并关掉 / 停下, as the card's code said it
	}
	if d.Loop != nil && d.Loop.Move != "" && d.GoLabel != "" {
		return d.GoLabel // D429: 换到醒着的电脑上跑 / Run it on an awake computer, whole
	}
	if d.Computer != nil && d.Computer.Kind == "user" {
		return a.L.T("computeruse.user.done") // D235: their own turn in an app: 好了 / Done
	}
	if d.Handset != nil && d.Handset.Kind == "setup" {
		return a.L.T("handset.setup.go") // D247: 去打开 / Turn it on (the guide opens on that phone)
	}
	if d.Handset != nil {
		return a.L.T("handset.ask.go") // D238: 借给它 / Lend it
	}
	if d.Phone != nil && d.Phone.Kind == "user" && d.Phone.On != nil {
		return a.L.T("handset.user.done") // D238: their own step on their own phone: 好了 / Done
	}
	return a.shortGo(d.GoLabel)
}

// defaultLine says what happens if the user doesn't answer.
func (a *App) defaultLine(c *ui.Context, d *store.DecisionState) string {
	if d.Call != nil || d.Cal != nil || d.Draft != nil {
		return "" // D189 (4), D222: it waits for the owner; no default, no countdown (D403: a drafted reply waits in its card)
	}
	if d.Handset != nil && d.Handset.Kind == "record" {
		return a.handsetRecordLeft(c, d) // D280: how long Android's prompt on the phone still waits
	}
	if d.Asker != nil {
		return a.L.T("peer.default") // silence never answers for the user (D164)
	}
	if d.Saying != nil {
		return a.L.T("decision.saying.default") // D379: nothing waits on it; unanswered, it still goes by their words
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
	// D493: the sentence quotes the Go button exactly as it reads (按「好，30
	// 分钟后再试」办 / go with "Try again in 30 minutes"), never splices the
	// model's label in as a verb ("29 分钟后我就 30 分钟后再试"); a Go that
	// names no action (好 / Go) has nothing to quote: 我就接着做 / I'll go ahead.
	// D315: only its own end mark goes ("等你登录后继续。，").
	label := strings.TrimRight(strings.TrimSpace(a.goLabel(d)), "。．.！!；;，,")
	if label == "" || label == a.L.T("decision.go") {
		return a.L.T("decision.default.goon", a.duration(left+time.Second*59/60))
	}
	return a.L.T("decision.default.go", a.duration(left+time.Second*59/60), label)
}

// decisionAbout names what a decision is about, for its buttons'
// accessible names: its task's title, else the question's start.
func (a *App) decisionAbout(d *store.DecisionState) string {
	if t := a.S.Task(d.TaskID); t != nil && t.Title() != "" {
		return t.Title()
	}
	if d.Cal != nil {
		return a.calAsk(d.Cal) // D642: a reader hears the short ask, never the title again
	}
	q := []rune(d.Question)
	if len(q) > 40 {
		return string(q[:40]) + "…"
	}
	return string(q)
}

// ---------- the one row hover (D529) ----------

// rowGround is what a row or card stands on, for its hover (D529): the
// neutral clay card, a neutral card on a tinted ledge (a sheet in 等你), or
// a card tinted in a state's own surface.
type rowGround struct {
	tint *theme.StateColors // nil: neutral
	own  bool               // the row's own fill is the tint's surface
	page bool               // a row lying flat on the page's paper, no card under it
	well bool               // D592: a sunken well that opens (a Keep's 你的原话)
}

func groundWell() rowGround { return rowGround{well: true} }

func groundNeutral() rowGround                    { return rowGround{} }
func groundPage() rowGround                       { return rowGround{page: true} }
func groundLedge(s *theme.StateColors) rowGround  { return rowGround{tint: s} }
func groundTinted(s *theme.StateColors) rowGround { return rowGround{tint: s, own: true} }

// rowHoverFill is the fill a hovered row takes on its ground: a neutral
// card warms toward SurfaceSunken (light) or lifts toward SurfaceRaised
// (dark, where sunken is the darker); a card on a tinted ledge warms within
// that tint; a tinted card deepens a little within its own. Never grey.
func (a *App) rowHoverFill(g rowGround) (rest, hover ui.Color) {
	t := a.T
	switch {
	case g.page:
		return t.Bg, t.Sunken // the paper warms to its sunken tint
	case g.well:
		return t.SurfaceSunken, t.SurfaceSunken.Mix(t.LineSoft, 0.5) // the well deepens within itself
	case g.tint != nil && g.own:
		return g.tint.Surface, g.tint.Surface.Mix(g.tint.Ledge, 0.28)
	case g.tint != nil && t.Dark:
		return t.Surface, t.Surface.Mix(g.tint.Surface, 0.45)
	case g.tint != nil:
		return t.Surface, t.Surface.Mix(g.tint.Surface, 0.5)
	case t.Dark:
		return t.Surface, t.Surface.Mix(t.SurfaceRaised, 0.9)
	}
	return t.Surface, t.Surface.Mix(t.SurfaceSunken, 0.55)
}

// rowPressFill is a pressed row's fill: a step deeper within the same
// ground (sunk, in dark too).
func (a *App) rowPressFill(g rowGround) ui.Color {
	t := a.T
	switch {
	case g.page:
		return t.Sunken.Mix(t.SurfaceSunken, 0.6)
	case g.well:
		return t.SurfaceSunken.Mix(t.LineSoft, 0.8)
	case g.tint != nil && g.own:
		return g.tint.Surface.Mix(g.tint.Ledge, 0.5)
	case g.tint != nil:
		return t.Surface.Mix(g.tint.Surface, 0.8)
	}
	return t.Surface.Mix(t.SurfaceSunken, 0.9)
}

// rowHover is the one row hover (D529), for every row and card a pointer
// can open: the fill cross-fades to rowHoverFill over Hover (140 ms; at
// once under reduced motion) and nothing else changes: no size, no line
// break, no position. on adds a reason of the caller's to show it (the
// keys on it, its menu open). It says whether the row is revealed (pointed
// at, the keyboard focus inside it, or on), for revealSlot.
func (a *App) rowHover(c *ui.Context, row ui.Element, g rowGround, on bool) bool {
	revealed := on || row.Hovered() || row.FocusWithin()
	rest, hover := a.rowHoverFill(g)
	k := float32(0)
	if revealed {
		k = 1
	}
	if !c.Preferences().ReduceMotion {
		k = row.AnimateTo("hover", k, a.T.Hover)
	}
	switch {
	case row.Pressed():
		row.Background(a.rowPressFill(g))
	case k >= 0.999:
		row.Background(hover)
	case k > 0.001:
		row.Background(rest.Mix(hover, k))
	case g.own:
		row.Background(rest)
	}
	return revealed
}

// cardLift is a free-standing card's hover (Past tasks; D76, D529): it
// lifts by its shadow alone (the drop opens, the ledge deepens), never by
// moving, over Hover; at once under reduced motion. It returns how far.
func (a *App) cardLift(c *ui.Context, card ui.Element, on bool) float32 {
	k := float32(0)
	if on {
		k = 1
	}
	if !c.Preferences().ReduceMotion {
		k = card.AnimateTo("lift", k, a.T.Hover)
	}
	return k
}

// revealSlot holds a row's hover-revealed controls (×, ⋯, Pause; D529).
// They are always built, so their room is kept and the keyboard reaches
// them (Tab into the row reveals them, as hover does); they cross-fade in
// over Hover and never push anything. A row that already shows actions
// puts its slot in that same action group.
func (a *App) revealSlot(c *ui.Context, key string, on bool, build func()) ui.Element {
	slot := ui.Row(c.Key(key)).Gap(2).AlignItems(ui.Center).Shrink(0)
	k := float32(0)
	if on {
		k = 1
	}
	if !c.Preferences().ReduceMotion {
		k = slot.AnimateTo("reveal", k, a.T.Hover)
	}
	slot.Opacity(k).Children(build)
	return slot
}

// stepNumber is a step's number in a short numbered sequence: a sunken disc
// with the number (the lend sheet's three steps; D518 a sign-in's two).
func (a *App) stepNumber(c *ui.Context, n int) {
	t := a.T
	ui.Row(c).Size(26, 26).Shrink(0).Radius(13).Background(t.Sunken).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
		uiText(c, strconv.Itoa(n)).FontSize(t.SM).FontWeight(800).TextColor(t.InkSoft)
	})
}

// setupStep is one live step of a setup checklist (D664: Nowledge Mem's setup; the web's
// SetupStep). Its mark on the step number's sunken disc says how it stands: the number while it is
// next (ringed in the accent) or later (muted), a drawn check on the done tint, the shared spinner
// while it runs or is looked at again, a drawn cross on the failed tint. Its title, one line, then
// the next step's one action (aside) under the words. state says it in words for VoiceOver.
func (a *App) setupStep(c *ui.Context, n int, look, title, line, state string, aside func()) {
	t := a.T
	ui.Row(c.Key("setup-step:" + strconv.Itoa(n))).Gap(t.S3).AlignItems(ui.Start).Label(state + " " + title).Children(func() {
		ui.Row(c).Width(40).Shrink(0).Justify(ui.Center).Padding(1, 0, 0, 0).Children(func() {
			disc := ui.Row(c).Size(26, 26).Radius(13).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true)
			switch look {
			case "done":
				disc.Background(t.Done.Surface).Shadow(0, 2, 0, 0, t.Done.Ledge)
			case "failed":
				disc.Background(t.Failed.Surface).Shadow(0, 2, 0, 0, t.Failed.Ledge)
			case "now":
				disc.Background(t.Surface).InsetShadow(0, 0, 0, 1.5, t.Accent).Shadow(0, 2, 0, 0, t.Line2)
			case "later":
				disc.Background(t.Sunken)
			default:
				disc.Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2)
			}
			disc.Children(func() {
				switch look {
				case "done":
					a.glyph(c, 14, drawCheck(t.Done.Ink))
				case "failed":
					a.glyph(c, 12, drawCross(t.Failed.Ink))
				case "busy":
					ui.Box(c).Size(12, 12).Center().Children(func() { ui.Spinner(c).Size(11, 11) })
				default:
					col := t.Ink
					if look == "later" {
						col = t.InkMuted
					}
					uiText(c, strconv.Itoa(n)).FontSize(t.SM).FontWeight(800).TextColor(col).LineHeight(1)
				}
			})
		})
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).Children(func() {
			col := t.Ink
			if look == "later" {
				col = t.InkMuted
			}
			// The title and its line read as one, as a row's do (gap 2); the action stands apart.
			ui.Column(c).Gap(2).MinWidth(0).Children(func() {
				uiText(c, keepClauses(title)).FontSize(t.MD).FontWeight(600).LineHeight(a.leading(1.5)).TextColor(col)
				if line != "" {
					uiText(c, keepClauses(line)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
			})
			if aside != nil {
				aside()
			}
		})
	})
}

// lineField is the shared one-line field (D536; the web's Field): the
// control height, as wide as its column allows up to 420, a hairline that
// becomes the one accent ring while typing in it. strong: a name, bolder.
func (a *App) lineField(c *ui.Context, key, label string, v *string, placeholder string, strong bool, submit func()) ui.Element {
	t := a.T
	in := ui.TextInput(c.Key("input:"+key), v).Placeholder(placeholder).Label(label).
		FontSize(t.MD).Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusSM).Background(t.Surface).
		Width(420).MaxWidthPercent(100)
	if strong {
		in.FontWeight(700)
	}
	if in.Focused() {
		in.Border(2, t.Accent)
	} else {
		in.Border(1, t.Line2)
	}
	if submit != nil {
		in.OnSubmit(submit)
	}
	return in
}

// ---------- the ask cards' kind marks (D642) ----------

// kindMark is one drawn mark per kind of Go card: the same 20-grid family as Done for you's
// pictures (D314), in one ink. The calendar's own mark is dateLeaf, because a date is the thing.
func (a *App) kindMark(c *ui.Context, kind string, size float32, col ui.Color) {
	if kind == "" {
		return
	}
	a.glyph(c, size, drawAskKind(kind, col))
}

// dateLeaf is a calendar entry's date: the month on a band, the day large, the weekday under it. It is
// a small clay tile standing on its own 2-pt base; the calendar's own colour is the band's dot, never
// a bar. done: a drawn check; cancel: the day struck quietly; failed: a cross.
func (a *App) dateLeaf(c *ui.Context, month, day, weekday string, color ui.Color, state string) {
	t := a.T
	dim := t.InkMuted
	leaf := ui.Column(c.Key("cal-leaf")).Width(56).Shrink(0).Radius(t.RadiusSM).Background(t.SurfaceRaised).
		Shadow(0, 2, 0, 0, t.Line).Clip().AccessHidden(true)
	leaf.Children(func() {
		ui.Row(c.Key("band")).Height(17).Padding(0, 5).AlignItems(ui.Center).Gap(4).Background(t.SurfaceRaised.Mix(color, 0.14)).Children(func() {
			uiText(c, month).FontSize(t.XS - 1).FontWeight(700).TextColor(t.InkMuted).SingleLine()
			ui.Box(c.Key("dot")).Size(5, 5).Radius(2.5).Shrink(0).Background(color)
		})
		ui.Column(c.Key("num")).AlignItems(ui.Center).Padding(2, 0, 3, 0).Gap(0).Children(func() {
			d := uiText(c, day).FontSize(t.XL).FontWeight(800).TextColor(t.Ink).LineHeight(1.15)
			if state == "cancel" {
				d.TextColor(dim)
			}
			uiText(c, weekday).FontSize(t.XS - 1).TextColor(t.InkMuted).LineHeight(1.3)
		})
	})
	if state == "done" || state == "failed" || state == "cancel" {
		leaf.Draw(func(p *ui.Painter, r ui.Rect) {
			if state == "cancel" {
				// The quiet strike: one fine diagonal across the day, inset from the leaf's edges and
				// clipped to the tile below its month band (never through the band or the rounded corners).
				p.Clip(ui.Rect{X: r.X + 2, Y: r.Y + 17, W: r.W - 4, H: r.H - 19}, t.RadiusSM-2, func() {
					var m ui.Path
					m.MoveTo(r.X+14, r.Y+24)
					m.LineTo(r.X+38, r.Y+50)
					p.StrokePath(&m, 1.5, t.InkMuted.Alpha(0.55))
				})
				return
			}
			disc, ink := t.Done.Surface, t.Done.Ink
			if state == "failed" {
				disc, ink = t.Failed.Surface, t.Failed.Ink
			}
			bx, by := r.X+r.W-13, r.Y+r.H-13
			p.Fill(ui.Rect{X: bx, Y: by, W: 12, H: 12}, disc, 6)
			if state == "done" {
				drawCheck(ink)(p, ui.Rect{X: bx + 2, Y: by + 2, W: 8, H: 8})
			} else {
				drawCross(ink)(p, ui.Rect{X: bx + 2.5, Y: by + 2.5, W: 7, H: 7})
			}
		})
	}
}

// ---------- D662: the dense table's row and the selection's bar ----------

// tableRowH is one row of the dense table (列表 / List, D662): 32 tall.
const tableRowH = 32

// tableRow is one row of the dense table (D662, research/245 §3.5): 32
// tall, the cells side by side, the keys' row outlined in the accent, a
// picked row in its own tint, the one row hover (D529) otherwise. The
// whole row is one press; it reports the press and the modifiers held, so
// ⌘-click and ⇧-click can pick (the caller decides). It holds cells, not a
// meaning: the columns belong to the list. The web's TableRow.
func (a *App) tableRow(c *ui.Context, key, label string, at, sel bool, cells func()) (bool, ui.Modifiers) {
	t := a.T
	row := ui.Row(c.Key("tr:"+key)).Height(tableRowH).Shrink(0).Gap(t.S2).Padding(0, t.S3).AlignItems(ui.Center).MinWidth(0).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).AccessSelected(sel).Focusable()
	if sel {
		row.Background(t.Accent.Alpha(0.12))
	} else {
		a.rowHover(c, row, groundNeutral(), false)
	}
	if at {
		row.InsetShadow(0, 0, 0, 2, t.Accent) // outlined inside: nothing in the row moves
	}
	row.Children(cells)
	return row.Clicked(), row.ClickModifiers()
}

// selectionBar is the bar a selection raises at the list's foot (D662):
// its count, the actions (or the one ask) the caller draws, and 取消选择 /
// Deselect at the far end. A floating clay sheet, so the rows scroll under
// it. It says whether Deselect was pressed. The web's SelectionBar.
func (a *App) selectionBar(c *ui.Context, label, clearLabel string, body func()) bool {
	t := a.T
	cleared := false
	ui.Row(c.Key("selbar")).Gap(t.S2).Padding(t.S2, t.S3).AlignItems(ui.Center).Wrap().MinWidth(0).
		Radius(t.RadiusMD).Background(t.Surface).Border(1, t.Line).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).
		Role(ui.RoleToolbar).Label(label).Children(func() {
		uiText(c.Key("n"), label).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().Shrink(0)
		body()
		ui.Spacer(c)
		cleared = a.quietButton(c, "sel-clear", clearLabel, "", false, 0)
	})
	return cleared
}

// keyCaps says a list's keys once at its foot (D457's drawn caps): each
// pair a cap and what it does, wrapping. The web's KeyCaps.
func (a *App) keyCaps(c *ui.Context, key string, items [][2]string) {
	t := a.T
	ui.Row(c.Key("keycaps:" + key)).Gap(t.S3).Wrap().AlignItems(ui.Center).MinWidth(0).Children(func() {
		for i, x := range items {
			a.keyHint(c, strconv.Itoa(i), x[0], x[1])
		}
	})
}
