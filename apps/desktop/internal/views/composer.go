package views

// D519: the one composer. Words for the partner or a task are typed in one
// box wherever they are typed: the conversation (跟 Ducter 说点什么…), an
// opened task, a Keep's page (想改什么，直接说). One card on the paper
// (Surface, RadiusXL, Raised), the words growing to their lines, what belongs
// beside them (pictures, the mic, the context ring, Stop), and the round
// accent send with its drawn arrow. Its states are the send's: empty
// (sunken and flat, its arrow muted, not pressable; D547), ready (raised on
// its ledge), sending (pressed into its ledge, the words greyed, until the
// home has them). D547: every button in the row is one size (ControlMD),
// round, on one bottom line; an opened task's card is tiered (the words their
// own line, the buttons under them). The
// web's apps/web/src/composer.tsx is the same; TestOneComposer fails on any
// other copy.

import (
	"strings"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"

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
	tools       func() // in the row, after the words (the mic, the model chip, the context ring)
	// end (D547): in the row just before Send, kept S3 apart from it (a working task's Stop).
	end func()
	// tiered (D547): the words take their own line, the whole measure, and the buttons the line
	// under them inside the card (an opened task, whose row carries the chip and the meter).
	tiered bool
	keys   func(k ui.TextKey) bool
	// tray (D242, issue #68): the picture tray a paste fills; "" takes none.
	tray     string
	onSend   func(text string) bool // true: sent (the words are emptied)
	sendMenu func(m *ui.Menu)       // the send's alternates, on right-click (D530: 等它做完再说)
	box      func(box ui.Element)   // the card, before its children (drops)
	// mentions (D534): @ and / work here, for the partner (where "") or a task.
	mentions *mentionPlace
}

// composerBox draws the one composer and returns its card.
func (a *App) composerBox(c *ui.Context, o composerOpts) ui.Element {
	t := a.T
	// D547: S2 round the row's buttons, which are round and concentric with the card. Without a
	// leading control (pictures) the words keep clear of the round edge: the inset a leading
	// control would have given them (D519: 「想改什么…」 sat on the edge).
	left := t.S2
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
		size = composerButton(t)
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
		// D547: the buttons stand on one bottom line, so as the words grow only the card's top moves.
		words := func() {
			ink := t.Ink
			if o.sending {
				ink = t.InkMuted
			}
			ta := ui.TextArea(c.Key(o.key), o.draft).Lines(1, lines).MinHeight(0).Placeholder(o.placeholder).Label(o.label).
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0).Grow(1).FontSize(fs).TextColor(ink).
				OnPaste(func(text string) bool { return a.pasteFiles(o.tray, text) }).
				OnTextKey(func(k ui.TextKey) bool {
					// D534: the open @ or / list takes its keys first.
					if o.mentions != nil && a.mentionKeys(o.key, o.mentions, k) {
						return true
					}
					if o.keys != nil && o.keys(k) {
						return true
					}
					if k.Key == ui.KeyEnter && (k.Mods == 0 || k.Mods == ui.Cmd) { // D573: ⌘↩ sends too, as the web
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
		}
		label := o.sendLabel
		if label == "" {
			label = a.L.T("composer.send")
		}
		buttons := func(spread bool) {
			if o.tools != nil {
				o.tools()
			}
			if spread {
				ui.Box(c).Grow(1)
			}
			if o.end != nil {
				o.end()
				ui.Box(c).Size(t.S1, 1).Shrink(0) // Stop kept apart from Send (the row's gaps and this: 20)
			}
			if a.sendButton(c, label, size, state, o.sendMenu) && send(*o.draft) {
				*o.draft = ""
			}
		}
		if o.tiered {
			ui.Row(c).Padding(0, t.S2, 0, t.S2).Children(words)
			ui.Row(c).Gap(t.S2).AlignItems(ui.End).Children(func() {
				if o.lead != nil {
					o.lead()
				}
				buttons(true)
			})
		} else {
			ui.Row(c).Gap(t.S2).AlignItems(ui.End).Children(func() {
				if o.lead != nil {
					o.lead()
				}
				words()
				buttons(false)
			})
		}
		if o.mentions != nil {
			a.mentionPop(c, o.key, o.mentions, box, o.draft)
		}
	})
	return box
}

// sendButton is the composer's send: the round accent button with the drawn
// arrow. empty: sunken and flat, not pressable (D547); sending: pressed into its
// ledge and still, until the home has the words. It reports a click when ready.
// menu, when given, holds the send's alternates (the one clay menu, D421) on
// a right-click or Control-click while there is something to send.
func (a *App) sendButton(c *ui.Context, label string, size float32, state sendState, menu ...func(m *ui.Menu)) bool {
	t := a.T
	b := ui.Box(c.Key("send:"+label)).Size(size, size).Radius(size / 2).Label(label).
		Role(ui.RoleButton).Shrink(0)
	switch state {
	case sendReady:
		b.Cursor(ui.CursorPointer).Focusable()
		if len(menu) > 0 && menu[0] != nil {
			a.contextMenu(c, b, menu[0])
		}
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
		// D547: empty, sunken and flat with a muted arrow: plainly not pressable, never a faded accent.
		b.Background(t.Sunken).Border(1, t.Line)
		b.Draw(drawSend(t.InkMuted.Alpha(0.6)))
	}
	return false
}

// composerButton is the one size of every button in the composer's row
// (attach, the mic, Stop, Send; D547): ControlMD, round.
func composerButton(t *theme.Tokens) float32 { return t.ControlMD }

// roundButton is a button of the composer's row: one size, round, in the
// family's clay (attach and the mic quiet, Stop the secondary; D547).
func (a *App) roundButton(c *ui.Context, label string, kind btnKind, draw func(fg ui.Color) func(p *ui.Painter, r ui.Rect)) bool {
	t := a.T
	size := composerButton(t)
	b := ui.Box(c.Key("round:"+label)).Size(size, size).Radius(size / 2).Label(label).Tooltip(label).
		Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, kind, size, t.Surface)
	b.Draw(draw(fg))
	return b.Clicked()
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

// tagTone is a tag's tint: plain (sunken), on (done) or needs (needs you);
// D542: the other states' own (working, waiting, failed) for a task's state.
type tagTone int

const (
	tagPlain tagTone = iota
	tagOn
	tagNeeds
	tagWorking
	tagWaiting
	tagFailed
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
	case tagWorking:
		bg, ink, w = t.Working.Surface, t.Working.Ink, 700
	case tagWaiting:
		bg, ink, w = t.Waiting.Surface, t.Waiting.Ink, 700
	case tagFailed:
		bg, ink, w = t.Failed.Surface, t.Failed.Ink, 700
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
