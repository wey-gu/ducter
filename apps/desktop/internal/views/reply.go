package views

import (
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D236: 回复 / Reply to one message (design/conversation.md "Replies",
// research/72), at parity with the web client (apps/web/src/reply.tsx).
// The look is the imprint: the message replied to, as a small copy of its
// own bubble (its voice's colour, its tail) pressed into the reply like a
// pebble into clay. It sits in the composer while the reply is written,
// inside the sent bubble after, and a click brings the original back and
// finds it (its own tint deepens once). On the Mac: hover a bubble for the
// round Reply beside it, or right-click it for Reply / Copy.

// replyTo is what the composer replies to: the message (or one find of a
// note) and how its imprint reads. Core fills the quote from the Log; the
// client only names the seq (and the find).
type replyTo struct {
	seq    int64
	findID string
	from   string // "you" | "partner"
	quote  string
	pics   int
}

func (r *replyTo) want() *protocol.ReplyWant {
	if r == nil {
		return nil
	}
	return &protocol.ReplyWant{Seq: r.seq, FindID: r.findID}
}

func (r *replyTo) key() string {
	if r.findID != "" {
		return itoa(r.seq) + "/" + r.findID
	}
	return itoa(r.seq)
}

// replyState is the window's part of replying.
type replyState struct {
	// replying is the one message the composer replies to.
	replying *replyTo
	// next is the target of the bubble being drawn; the bubble takes it
	// (as join), and entry clears what no bubble took.
	next *replyTo
	// tab is the user's reply the next partner bubble answers, pressed into
	// its top (answerOf); taken and cleared as next is.
	tab *replyTo
	// noPebble is set while a picture message's words are drawn: the
	// pebble stands beside the whole message (pictures and words) instead.
	noPebble bool
	// held is the pebble under the pointer or pressed, kept while the
	// pointer is on it outside what it replies to (a find's, in the gutter).
	held string
	// found is the message an imprint just brought back: its tint deepens
	// once, from at, and settles.
	found struct {
		seq    int64
		findID string
		at     time.Time
	}
	// rows are the conversation's rows as last drawn, for the jump.
	rows []row
	// prevUser is, per row, the user message before it.
	prevUser map[int64]int64
	// pressIn are the replies this window sent: their imprint settles into
	// the bubble once, as the echo replaces the pending one.
	pressIn map[string]bool
}

// shown is how much of a quote the imprint holds: two lines' worth (core
// keeps up to 200 characters).
const shownQuote = 120

// StartReply makes the composer reply to r: its imprint slides into the
// composer and the field takes the keyboard.
func (a *App) StartReply(r *replyTo) {
	if r == nil {
		return
	}
	a.rp.replying = r
	a.focusComposer = true
}

// CancelReply puts a reply away; it reports whether there was one.
func (a *App) CancelReply() bool {
	if a.rp.replying == nil {
		return false
	}
	a.rp.replying = nil
	return true
}

// whoOf is who said the quoted words, in the label's literal words.
func (a *App) whoOf(from string) string {
	if from == "you" {
		return a.L.T("reply.you")
	}
	return firstNonEmpty(a.S.PersonaName, "Ducter")
}

// replyOf is what replying to this row of the conversation names.
func (a *App) replyOf(e *store.Entry) *replyTo {
	switch {
	case e == nil:
		return nil
	case e.User != nil:
		return &replyTo{seq: e.FirstSeq, from: "you", quote: plainWords(e.User.Text), pics: len(e.User.Media)}
	case e.AI != nil && (strings.TrimSpace(e.AI.Text) != "" || len(e.AI.Media) > 0):
		return &replyTo{seq: e.FirstSeq, from: "partner", quote: plainWords(e.AI.Text), pics: len(e.AI.Media)}
	case e.Job != nil && e.Job.Ack != nil:
		return &replyTo{seq: e.FirstSeq, from: "partner", quote: e.Job.Ack.Text}
	case e.Decision != nil:
		q := e.Decision.Question
		if d := a.S.Decisions[e.Decision.DecisionID]; d != nil {
			q = firstNonEmpty(d.Said, d.Question, q)
		}
		return &replyTo{seq: e.FirstSeq, from: "partner", quote: plainWords(q)}
	}
	return nil
}

// takeReply hands the bubble being drawn its reply target.
func (a *App) takeReply() *replyTo {
	r := a.rp.next
	a.rp.next = nil
	return r
}

// answerOf is the user's reply a partner answer answers, when it comes
// after other messages: shown as an imprint tab above its bubble.
func (a *App) answerOf(e *store.Entry) *replyTo {
	var to int64
	switch {
	case e.AI != nil:
		to = e.AI.ReplyTo
	case e.Job != nil && e.Job.Ack != nil:
		to = e.Job.Ack.ReplyTo
	}
	if to == 0 || to == a.rp.prevUser[e.FirstSeq] {
		return nil
	}
	for _, x := range a.S.Channel {
		if x.FirstSeq == to {
			if x.User == nil || x.User.Reply == nil {
				return nil
			}
			return &replyTo{seq: to, from: "you", quote: plainWords(x.User.Text)}
		}
	}
	return nil
}

// noteRows remembers the rows drawn and the user message before each.
func (a *App) noteRows(rows []row) {
	a.rp.rows = rows
	a.rp.prevUser = map[int64]int64{}
	var last int64
	for _, r := range rows {
		if e := r.entry; e != nil {
			a.rp.prevUser[e.FirstSeq] = last
			if e.User != nil {
				last = e.FirstSeq
			}
		}
	}
}

// jumpTo brings the message an imprint quotes into view and finds it (its
// own tint deepens once, and it settles). One no longer in the
// conversation says so.
func (a *App) jumpTo(c *ui.Context, seq int64, findID string) bool {
	for i, r := range a.rp.rows {
		if e := r.entry; e != nil && (e.FirstSeq == seq || e.Event.Seq == seq) {
			a.list.ScrollTo(i, ui.Center)
			a.rp.found.seq, a.rp.found.findID, a.rp.found.at = seq, findID, a.Now()
			c.Invalidate()
			return true
		}
	}
	c.Toast(a.L.T("reply.gone"))
	return false
}

// foundAt is how far the found tint is in at now (0 none … 1 deepest):
// it deepens to 22%, holds to 55%, and settles by the end.
func (a *App) foundAt(c *ui.Context, seq int64, findID string) float32 {
	k, on := a.foundLevel(seq, findID)
	if on {
		c.After(16 * time.Millisecond) // the next frame of the find
	}
	return k
}

// foundLevel is foundAt's curve at the app's clock, and whether the find
// is still going.
func (a *App) foundLevel(seq int64, findID string) (float32, bool) {
	f := a.rp.found
	if f.seq == 0 || f.seq != seq || f.findID != findID {
		return 0, false
	}
	dur := a.T.Reply.FoundDur
	el := a.Now().Sub(f.at)
	if el < 0 || el >= dur {
		return 0, false
	}
	x := float32(el) / float32(dur)
	switch {
	case x < 0.22:
		return easeWave(float64(x/0.22) / 2), true
	case x < 0.55:
		return 1, true
	default:
		return easeWave(0.5 + float64((x-0.55)/0.45)/2), true
	}
}

// found tints a bubble being found and lifts it a little (not under reduced motion).
func (a *App) found(c *ui.Context, e ui.Element, r *replyTo, base, deep ui.Color, lift float32) ui.Color {
	if r == nil {
		return base
	}
	k := a.foundAt(c, r.seq, r.findID)
	if k == 0 {
		return base
	}
	if !c.Preferences().ReduceMotion && lift > 0 {
		s := 1 + lift*k
		e.Scale(s, s)
	}
	return base.Mix(deep, k)
}

// imprintOn is what an imprint is pressed into.
type imprintOn int

const (
	onUser     imprintOn = iota // the user's sent bubble
	onPartner                   // the partner's answer, pressed into its top
	onComposer                  // the composer's card
)

// imprintInset is how far an imprint sits in from the sides and top of the
// bubble it is pressed into.
const imprintInset = 6

// imprint is who, then the quote, in a small copy of that voice's bubble
// (its tail) debossed into what holds it: the clay above its top and left
// rims shades the hollow, its lower edge catches the light, its floor a
// little below the bubble's own colour, and no border line. The quote is
// quieter than the words around it. Still holds it in place; else a click
// jumps to the message it quotes. land is the sent message's clientId: a
// reply this window sent lands from raised into the hollow once.
func (a *App) imprint(c *ui.Context, key string, r *replyTo, quote string, part bool, on imprintOn, still bool, land string) ui.Element {
	t := a.T
	rt := t.Reply
	rad := rt.Radius
	if r.from == "you" {
		rad = rt.RadiusYou
	}
	bg, ink, who := rt.OnPartner, rt.Ink, t.InkSoft
	switch on {
	case onUser:
		bg, ink, who = rt.OnUser, rt.InkOnUser, t.OnUserBubble
	case onComposer:
		bg = rt.OnSurface
	}
	words := clipQuote(quote, shownQuote)
	if part && words != "" {
		words = "“" + words + "”"
	}
	if words == "" && r.pics > 0 {
		words = a.L.T("reply.pics", r.pics)
	}
	name := a.whoOf(r.from)
	box := ui.Column(c.Key("imprint:"+key)).MinWidth(0).Padding(6, 11, 7, 12).
		Radius(rad[0], rad[1], rad[2], rad[3])
	// sink is how far it is pressed in: 1 sits in the hollow; a landing
	// reply comes from 0 (a pebble standing on the clay).
	sink := float32(1)
	if land != "" && a.rp.pressIn[land] && !c.Preferences().ReduceMotion {
		landed := ui.Local(box, "landed", func() bool { return false })
		target := float32(1)
		if !*landed {
			target, *landed = 0, true
			c.Invalidate()
		}
		sink = box.AnimateTo("sink", target, ui.Animation{Spring: ui.SpringOptions{Duration: rt.PressIn, Bounce: t.Bouncy.Spring.Bounce}})
		up := 1 - sink
		box.Translate(0, -4*up).Scale(1+0.03*up, 1+0.03*up)
	}
	k := max(0, min(1, sink))
	if !still && box.Pressed() {
		bg = bg.Mix(t.Ink, 0.03) // pressed a little deeper
	}
	box.Background(bg)
	d := rt.Deboss
	for _, in := range []theme.Inset{d.Top, d.Left, d.Light} {
		box.InsetShadow(in.X, in.Y, in.Blur, in.Spread, in.Color.Alpha(float32(in.Color.A)/255*k))
	}
	if k < 1 {
		box.Shadow(0, rt.Raised.Y, rt.Raised.Blur, 0, rt.Raised.Color.Alpha(float32(rt.Raised.Color.A)/255*(1-k)))
	}
	if !still {
		box.Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Label(a.L.T("reply.jump", name))
	}
	box.Children(func() {
		ui.Text(c, name).FontSize(t.XXS).FontWeight(800).LetterSpacing(0.22).TextColor(who).SingleLine().AccessHidden(!still)
		ui.Text(c, autospace(words)).FontSize(t.XS).LineHeight(leadingFor(words, 1.4)).TextColor(ink).MaxLines(2).AccessHidden(!still)
	})
	if !still && box.Clicked() {
		a.jumpTo(c, r.seq, r.findID)
	}
	return box
}

// sentImprint is a sent reply's imprint, from what core logged with it.
func (a *App) sentImprint(c *ui.Context, key string, ref *protocol.ReplyRef, on imprintOn, land string) ui.Element {
	r := &replyTo{seq: ref.Seq, findID: ref.FindID, from: ref.From, pics: len(ref.Media)}
	if r.from != "you" {
		r.from = "partner"
	}
	return a.imprint(c, key, r, ref.Quote, ref.Part, on, false, land)
}

// D256: the reply pebble. While the pointer is over something that can be
// replied to, one small clay pebble rests in the gutter beside it, on the
// side away from its voice's edge (left of the person's, right of the
// partner's), its ledge on the bubble's bottom line; never on a bubble's or
// a card's content. It settles in from the bubble's side, shows the word
// 回复 / Reply while the pointer is on it (when the window has room), and
// presses down onto its ledge like the other clay buttons.

// pebbleSize is the pebble's height (and its width while round).
const pebbleSize = 30

// pebbleGap is the gutter between what is replied to and its pebble.
func (a *App) pebbleGap() float32 { return a.T.S2 }

// hoverReply is the pebble beside a bubble. Hidden, it keeps its place, so
// the bubble never shifts.
func (a *App) hoverReply(c *ui.Context, r *replyTo, show bool, side int) {
	if r == nil || a.rp.noPebble {
		return
	}
	if !show {
		ui.Box(c.Key("hover-reply:"+r.key())).Size(pebbleSize, pebbleSize).Shrink(0).AccessHidden(true)
		return
	}
	a.replyButton(c, r, side)
}

// replyButton is the pebble itself. side is -1 when it stands left of what
// it replies to (it settles in from the right), +1 when right.
func (a *App) replyButton(c *ui.Context, r *replyTo, side int) ui.Element {
	t := a.T
	b := ui.Row(c.Key("hover-reply:" + r.key())).Height(pebbleSize).MinWidth(pebbleSize).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).Gap(t.S1 + 1).
		Radius(pebbleSize / 2).Background(t.Surface).
		Role(ui.RoleButton).Focusable().Cursor(ui.CursorPointer).Label(a.L.T("reply.action")).Tooltip(a.L.T("reply.action"))
	on, down := b.Hovered() || b.FocusVisible(), b.Pressed()
	if on || down {
		a.rp.held = r.key()
	} else if a.rp.held == r.key() {
		a.rp.held = ""
	}
	if down {
		// Pressed into its ledge, like clay.
		b.Translate(0, 2).Shadow(0, 1, 0, 0, t.Line)
	} else {
		b.Shadow(0, 3, 0, 0, t.Line).Shadow(0, 4, 10, -3, t.Raised.Color)
	}
	if !c.Preferences().ReduceMotion {
		in := ui.Local(b, "in", func() bool { return false })
		p := ui.Pose{}
		if !*in {
			p, *in = ui.Pose{X: float32(-side) * 6, Scale: 0.82, Fade: 1}, true
			c.Invalidate()
		}
		b.AnimatePose(p, t.Bouncy)
	}
	ink := t.InkMuted
	if on {
		ink = t.Accent
	}
	words := on && a.winW >= 900
	if words {
		b.Padding(0, t.S3, 0, t.S2+2)
	}
	b.Children(func() {
		ui.Box(c).Size(16, 16).Shrink(0).Draw(drawReply(ink))
		if words {
			ui.Text(c, a.L.T("reply.action")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().Unselectable()
		}
	})
	if b.Clicked() {
		a.StartReply(r)
	}
	return b
}

// replyMenu is right-click on a bubble: Reply, then Copy. D254: with words
// selected in it, Copy is the selection's (the system's own items, Select
// All with it); else the whole message, as written (copyText).
func (a *App) replyMenu(c *ui.Context, e ui.Element, r *replyTo, text string) {
	e.ContextMenu(func(m *ui.Menu) {
		if r != nil && m.Item(a.L.T("reply.action")).Chosen() {
			a.StartReply(r)
		}
		if len(e.SelectedTexts()) > 0 {
			m.EditItems()
			return
		}
		if m.Item(a.L.T("reply.copy")).Chosen() {
			c.WriteClipboard(copyText(text))
			c.Toast(a.L.T("reply.copied"))
		}
	})
}

// composerReply is what this replies to, pressed into the composer's card
// above the words: the accent reply mark, the imprint, and a drawn ×.
func (a *App) composerReply(c *ui.Context) {
	t := a.T
	r := a.rp.replying
	if r == nil {
		return
	}
	row := ui.Row(c.Key("replying:"+r.key())).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Padding(t.S1, 0, 0, 0).
		Role(ui.RoleGroup).Label(a.L.T("reply.to", a.whoOf(r.from)))
	if !c.Preferences().ReduceMotion {
		in := ui.Local(row, "in", func() bool { return false })
		p := ui.Pose{}
		if !*in {
			p, *in = ui.Pose{Y: 10, Fade: 1}, true
			c.Invalidate()
		}
		row.AnimatePose(p, t.Bouncy)
	}
	row.Children(func() {
		a.glyph(c, 18, drawReply(t.Accent))
		a.imprint(c, "composer", r, r.quote, false, onComposer, false, "").Grow(1)
		if a.iconButton(c, a.L.T("reply.cancel"), t.ChipLG, btnText, drawCross) {
			a.CancelReply()
		}
	})
}

// drawReply is Ducter's reply mark (D256): the one drawn chevron (D213's
// open angle, round ends) pointing back, on a single line that sweeps back
// from below, as a hand does to point at what was said. Drawn on a 16-unit
// grid at a 1.8 stroke, like the chevron. Never a text arrow (the Mac and
// iOS turn those into emoji).
func drawReply(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W, r.H) / 16
		x0, y0 := r.X+(r.W-16*s)/2, r.Y+(r.H-16*s)/2
		at := func(x, y float32) (float32, float32) { return x0 + x*s, y0 + y*s }
		var m ui.Path
		m.MoveTo(at(6.4, 3))
		m.LineTo(at(3, 6.4))
		m.LineTo(at(6.4, 9.8))
		m.MoveTo(at(3.4, 6.4))
		c1x, c1y := at(9, 6.4)
		c2x, c2y := at(12.8, 8.2)
		ex, ey := at(12.8, 13)
		m.CubeTo(c1x, c1y, c2x, c2y, ex, ey)
		p.StrokePath(&m, max(1.5, 1.8*s), col)
	}
}

// ---------- words ----------

var (
	mdFence  = regexp.MustCompile("(?s)```.*?```")
	mdImage  = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	mdLink   = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	mdLead   = regexp.MustCompile(`(?m)^\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+`)
	mdMarks  = regexp.MustCompile("(\\*\\*|__|`|~~)")
	mdEmph   = regexp.MustCompile(`(^|[\s(])[*_]([^*_\n]+)[*_]`)
	spaceRun = regexp.MustCompile(`\s+`)
	cutTail  = regexp.MustCompile(`[\s,.;:，。；：、]+$`)
)

// plainWords is a message's words without Markdown, on one line, as the
// protocol's plainWords.
func plainWords(md string) string {
	s := mdFence.ReplaceAllString(md, " ")
	s = mdImage.ReplaceAllString(s, " ")
	s = mdLink.ReplaceAllString(s, "$1")
	s = mdLead.ReplaceAllString(s, "")
	s = mdMarks.ReplaceAllString(s, "")
	s = mdEmph.ReplaceAllString(s, "$1$2")
	return strings.TrimSpace(spaceRun.ReplaceAllString(s, " "))
}

// clipQuote is at most n characters, cut at a word (anywhere in CJK), with
// an ellipsis when cut, as the protocol's clipQuote.
func clipQuote(s string, n int) string {
	s = strings.TrimSpace(spaceRun.ReplaceAllString(s, " "))
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	rs := []rune(s)
	cut := rs[:n-1]
	if sp := lastSpace(cut); sp > n*6/10 && !isHan(cut[sp-1]) {
		cut = cut[:sp]
	}
	return cutTail.ReplaceAllString(string(cut), "") + "…"
}

func lastSpace(rs []rune) int {
	for i := len(rs) - 1; i >= 0; i-- {
		if rs[i] == ' ' {
			return i
		}
	}
	return -1
}
