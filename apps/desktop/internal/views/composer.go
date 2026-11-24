package views

// D519: the one composer. Words for the partner or a task are typed in one
// box wherever they are typed: the conversation (跟 Ducter 说点什么…), an
// opened task, a Keep's page (想改什么，直接说). One card on the paper
// (Surface, RadiusXL, Raised), the words growing to their lines, what belongs
// beside them (pictures, the mic, the context ring, Stop), and the round
// accent send with its drawn arrow. Its states are the send's: empty
// (resting at 45%, not pressable), ready (raised on its ledge), sending
// (pressed into its ledge, the words greyed, until the home has them). The
// web's apps/web/src/composer.tsx is the same; TestOneComposer fails on any
// other copy.

import (
	"strings"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"

	"github.com/egoist/mygo/ui"
)

// sendState is the composer's send: empty, ready or sending.
type sendState int

const (
	sendEmpty sendState = iota
	sendReady
	sendSending
)

// composerOpts is one composer: its key, its words, how it looks and what
// it does. keys handles a key first (return true to take it); without it
// Enter sends and Shift+Enter breaks the line.
type composerOpts struct {
	key         string
	draft       *string
	placeholder string
	label       string
	lines       int     // most lines the words grow to (default 8)
	fontSize    float32 // default the bubble's type
	sendSize    float32 // default ControlLG
	sending     bool
	canSend     *bool // overrides "has words" (pictures alone may go)
	autoFocus   bool
	focus       bool // take the focus this frame (the caller clears its flag)
	sendLabel   string
	before      func() // inside the card, above the words (a reply pressed in, pictures)
	lead        func() // in the row, before the words (add pictures)
	tools       func() // in the row, after the words (the mic, the context ring, Stop)
	keys        func(k ui.TextKey) bool
	onSend      func(text string) bool // true: sent (the words are emptied)
	box         func(box ui.Element)   // the card, before its children (drops)
	// mentions (D534): @ and / work here, for the partner (where "") or a task.
	mentions *mentionPlace
}

// composerBox draws the one composer and returns its card.
func (a *App) composerBox(c *ui.Context, o composerOpts) ui.Element {
	t := a.T
	// Without a leading control (pictures) the words keep clear of the round edge: the inset a
	// leading control would have given them (D519: 「想改什么…」 sat on the edge).
	left := t.S3
	if o.lead == nil {
		left = t.S5
	}
	box := ui.Column(c.Key(o.key+"-box")).Grow(1).Padding(t.S2, t.S2, t.S2, left).
		Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	if o.box != nil {
		o.box(box)
	}
	lines := o.lines
	if lines == 0 {
		lines = 8
	}
	fs := o.fontSize
	if fs == 0 {
		fs = t.Bubble
	}
	size := o.sendSize
	if size == 0 {
		size = t.ControlLG
	}
	ready := len(strings.TrimSpace(*o.draft)) > 0
	if o.canSend != nil {
		ready = *o.canSend
	}
	state := sendEmpty
	switch {
	case o.sending:
		state = sendSending
	case ready:
		state = sendReady
	}
	send := func(text string) bool {
		if state != sendReady || o.onSend == nil {
			return false
		}
		return o.onSend(text)
	}
	box.Children(func() {
		if o.before != nil {
			o.before()
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if o.lead != nil {
				o.lead()
			}
			ink := t.Ink
			if o.sending {
				ink = t.InkMuted
			}
			ta := ui.TextArea(c.Key(o.key), o.draft).Lines(1, lines).MinHeight(0).Placeholder(o.placeholder).Label(o.label).
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0).Grow(1).FontSize(fs).TextColor(ink).
				OnTextKey(func(k ui.TextKey) bool {
					// D534: the open @ or / list takes its keys first.
					if o.mentions != nil && a.mentionKeys(o.key, o.mentions, k) {
						return true
					}
					if o.keys != nil && o.keys(k) {
						return true
					}
					if k.Key == ui.KeyEnter && k.Mods == 0 {
						if o.sending {
							return true
						}
						if send(k.Text()) {
							k.SetText("")
							*o.draft = ""
						}
						return true
					}
					return false // Shift+Enter breaks the line
				})
			if o.autoFocus {
				ta.AutoFocus()
			}
			if o.mentions != nil {
				a.mentionMarks(ta, o.mentions, *o.draft)
				a.mentionsDetect(o.key, o.mentions, ta, *o.draft)
			}
			if o.focus {
				ta.Focus()
			}
			if o.tools != nil {
				o.tools()
			}
			label := o.sendLabel
			if label == "" {
				label = a.L.T("composer.send")
			}
			if a.sendButton(c, label, size, state) && send(*o.draft) {
				*o.draft = ""
			}
		})
		if o.mentions != nil {
			a.mentionPop(c, o.key, o.mentions, box, o.draft)
		}
	})
	return box
}

// sendButton is the composer's send: the round accent button with the drawn
// arrow. empty: resting at 45%, not pressable; sending: pressed into its
// ledge and still, until the home has the words. It reports a click when ready.
func (a *App) sendButton(c *ui.Context, label string, size float32, state sendState) bool {
	t := a.T
	b := ui.Box(c.Key("send:"+label)).Size(size, size).Radius(a.buttonRadius(size)).Label(label).
		Role(ui.RoleButton).Shrink(0)
	switch state {
	case sendReady:
		b.Cursor(ui.CursorPointer).Focusable()
		fg := a.buttonLook(c, b, btnAccent, size, t.Surface)
		b.Draw(drawSend(fg))
		return b.Clicked()
	case sendSending:
		// Pressed in: the ledge gone, the drop tight, set down by its depth.
		ledge := float32(3)
		if size >= t.ControlLG {
			ledge = 4
		}
		b.Background(t.Accent).InsetShadow(0, 1.5, 0, 0, t.PressAccent.Hi).
			Shadow(0, t.DropPressed.Y, t.DropPressed.Blur, 0, t.DropPressed.Color)
		if !c.Preferences().ReduceMotion {
			b.Translate(0, ledge)
		}
		b.Draw(drawSend(t.OnAccent.Alpha(0.55))) // the arrow waits, muted
	default:
		b.Background(t.Accent).Opacity(0.45)
		b.Draw(drawSend(t.OnAccent))
	}
	return false
}

// drawSend is the send's arrow, drawn (never a glyph or an emoji).
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

func ptrBool(b bool) *bool { return &b }

// ---------- D519: section heads, tags, the time column ----------

// timeColW is a list's time column: "14:28", 昨天 or "11 月 22 日" on one line.
const timeColW = 76

// secHead is a section's name over its card (在等你, 手上的, 每一轮): the
// quiet label On hand's sections wear, a heading.
func (a *App) secHead(c *ui.Context, key, name string) {
	t := a.T
	ui.Row(c.Key("sec-head:"+key)).MinHeight(28).AlignItems(ui.Center).Padding(0, t.S1).Margin(t.S4+2, 0, t.S1, 0).Children(func() {
		uiText(c, name).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Role(ui.RoleHeading)
	})
}

// tagTone is a tag's tint: plain (sunken), on (done) or needs (needs you).
type tagTone int

const (
	tagPlain tagTone = iota
	tagOn
	tagNeeds
)

// tag is a small state word on its own tint (照看中, 1 件在等你, 11 月 22 日起).
func (a *App) tag(c *ui.Context, key, text string, tone tagTone) {
	t := a.T
	bg, ink, w := t.SurfaceSunken, t.InkSoft, 500
	switch tone {
	case tagOn:
		bg, ink, w = t.Done.Surface, t.Done.Ink, 700
	case tagNeeds:
		bg, ink, w = t.NeedsYou.Surface, t.NeedsYou.Ink, 700
	}
	uiText(c.Key("tag:"+key), text).FontSize(t.SM).FontWeight(w).TextColor(ink).Padding(3, 10).Radius(999).Background(bg).SingleLine().Shrink(0)
}

// timeCol is a list's time column: one line, tabular figures, one width, so
// the rows line up (today its clock, else its day: i18n.ColTime).
func (a *App) timeCol(c *ui.Context, key string, at time.Time) {
	t := a.T
	uiText(c.Key("tm:"+key), i18n.ColTime(a.L.Lang, at, a.Now())).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").
		SingleLine().Width(timeColW).Shrink(0)
}

// menuOpener is a button of the family that opens a clay menu under it
// (D421): 暂停 with its choices. build fills the menu.
func (a *App) menuOpener(c *ui.Context, key, label, about string, kind btnKind, height float32, onSurface ui.Color, build func(m *ui.Menu)) {
	t := a.T
	h := a.controlHeight(height)
	size, padX := t.SM, t.S3+2
	if h != t.ControlSM {
		size, padX = t.MD, t.S5-4
	}
	b := ui.Row(c.Key("mo:"+key)).Height(h).Padding(0, padX).Radius(a.buttonRadius(h)).Gap(t.S1).
		Justify(ui.Center).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, label, about)).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, kind, h, onSurface)
	b.Children(func() {
		uiText(c, label).FontSize(size).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
		a.glyph(c, 12, drawChevron(fg, true))
	})
	a.menuButton(c, b, build, true)
}
