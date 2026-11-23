package views

import (
	"html"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// D492: 拷贝 / Copy, a whole message, everywhere it can be read
// (design/conversation.md "Copying a message"). With a mouse, a pebble of
// its own beside every message in the conversation (after the reply's) and
// a button with the copy mark under a task's words (always under a finished
// turn's answer); right-click has it too. What goes to the clipboard is the
// Markdown as written, and the same message formatted beside it, so a rich
// editor keeps its headings, lists and bold and an editor or a terminal
// gets the source. The button pressed says 已拷贝 / Copied a moment in the
// done ink; a menu that closed says it in a toast.

// copiedFor is how long a copy button says 已拷贝.
const copiedFor = 1600 * time.Millisecond

// copiedState is the button that copied last, and when.
type copiedState struct {
	key string
	at  time.Time
}

// copyMessage puts the message src on the clipboard (D492) and marks key
// as just copied.
func (a *App) copyMessage(c *ui.Context, key, src string) {
	src = strings.TrimSpace(src)
	if src == "" {
		return
	}
	c.Services().WriteClipboardData(transfer.New(transfer.NewItem(
		transfer.Bytes(transfer.HTML, []byte(mdHTML(src))),
		transfer.Bytes(transfer.Text, []byte(src)),
	)))
	a.copied = copiedState{key, a.Now()}
}

// justCopied says key's button copied within copiedFor, and draws again
// when that ends.
func (a *App) justCopied(c *ui.Context, key string) bool {
	if a.copied.key != key {
		return false
	}
	left := copiedFor - a.Now().Sub(a.copied.at)
	if left <= 0 {
		return false
	}
	c.After(left)
	return true
}

// messageOf is the whole message r names, as written: the person's words,
// the partner's Markdown, an ack, a question's words, a find.
func (a *App) messageOf(r *replyTo) string {
	if r == nil || r.line {
		return ""
	}
	if r.findID != "" {
		return r.quote // a find's reply target carries its words whole (findBlock)
	}
	for _, e := range a.S.Channel {
		if e == nil || e.FirstSeq != r.seq {
			continue
		}
		switch {
		case e.User != nil:
			return e.User.Text
		case e.AI != nil:
			return e.AI.Text
		case e.Job != nil && e.Job.Ack != nil:
			return e.Job.Ack.Text
		case e.Decision != nil:
			if d := a.S.Decisions[e.Decision.DecisionID]; d != nil {
				return firstNonEmpty(d.Said, d.Question, e.Decision.Question)
			}
			return e.Decision.Question
		}
	}
	return ""
}

// hoverCopy is the copy pebble beside a message, after the reply's (D492).
// Hidden, it keeps its place, so the bubble never shifts; a message of
// pictures alone has none.
func (a *App) hoverCopy(c *ui.Context, r *replyTo, show bool, side int) {
	if r == nil || a.rp.noPebble {
		return
	}
	text := a.messageOf(r)
	if strings.TrimSpace(text) == "" {
		return
	}
	key := "hover-copy:" + r.key()
	done := a.justCopied(c, key)
	if !show && !done {
		ui.Box(c.Key(key)).Size(pebbleSize, pebbleSize).Shrink(0).AccessHidden(true)
		return
	}
	a.copyPebble(c, key, text, side, done)
}

// copyPebble is the pebble itself, as the reply's: the copy mark, its word
// on hover in a window with room, the check and 已拷贝 once it copied.
func (a *App) copyPebble(c *ui.Context, key, text string, side int, done bool) {
	t := a.T
	label := a.L.T("reply.copy")
	if done {
		label = a.L.T("reply.copied")
	}
	b := ui.Row(c.Key(key)).Height(pebbleSize).MinWidth(pebbleSize).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).Gap(t.S1 + 1).
		Radius(pebbleSize / 2).Background(t.Surface).
		Role(ui.RoleButton).Focusable().Cursor(ui.CursorPointer).Label(label).Tooltip(label)
	on, down := b.Hovered() || b.FocusVisible(), b.Pressed()
	if down {
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
	ink, draw := t.InkMuted, drawCopy
	if on {
		ink = t.Accent
	}
	if done {
		ink, draw = t.Done.Ink, drawCheck
	}
	words := (on || done) && a.winW >= 900
	if words {
		b.Padding(0, t.S3, 0, t.S2+2)
	}
	b.Children(func() {
		ui.Box(c).Size(16, 16).Shrink(0).Draw(draw(ink))
		if words {
			uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().Unselectable()
		}
	})
	if b.Clicked() {
		a.copyMessage(c, key, text)
	}
}

// ---------- the message formatted, for the clipboard's HTML ----------

var (
	hFence  = regexp.MustCompile("^\\s*```")
	hHead   = regexp.MustCompile(`^#{1,6}\s+(.*)$`)
	hUL     = regexp.MustCompile(`^\s*[-*•]\s+(.*)$`)
	hOL     = regexp.MustCompile(`^\s*\d+[.)]\s+(.*)$`)
	hCode   = regexp.MustCompile("`([^`\n]+)`")
	hLink   = regexp.MustCompile(`\[([^\]\n]+)\]\((https?://[^\s)]+)\)`)
	hBare   = regexp.MustCompile(`(^|[\s(])(https?://[^\s<)]+)`)
	hBold   = regexp.MustCompile(`\*\*([^*\n]+)\*\*`)
	hItalic = regexp.MustCompile(`(^|[^*\w])\*([^*\n]+)\*([^*\w]|$)`)
)

// mdHTML is a message's Markdown as HTML, the same subset the conversation
// draws and the web's markdown.ts renders: paragraphs, line breaks, bold,
// italic, code, fenced code, lists, headings and links. Everything is
// escaped first.
func mdHTML(src string) string {
	lines := strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n")
	var out, para []string
	var tag string
	var items []string
	flushPara := func() {
		if len(para) > 0 {
			for i, p := range para {
				para[i] = inlineHTML(p)
			}
			out = append(out, "<p>"+strings.Join(para, "<br>")+"</p>")
			para = nil
		}
	}
	flushList := func() {
		if tag != "" {
			var b strings.Builder
			b.WriteString("<" + tag + ">")
			for _, it := range items {
				b.WriteString("<li>" + inlineHTML(it) + "</li>")
			}
			b.WriteString("</" + tag + ">")
			out = append(out, b.String())
			tag, items = "", nil
		}
	}
	for i := 0; i < len(lines); i++ {
		l := lines[i]
		if hFence.MatchString(l) {
			flushPara()
			flushList()
			var code []string
			for i++; i < len(lines) && !hFence.MatchString(lines[i]); i++ {
				code = append(code, lines[i])
			}
			out = append(out, "<pre><code>"+html.EscapeString(strings.Join(code, "\n"))+"</code></pre>")
			continue
		}
		if m := hHead.FindStringSubmatch(l); m != nil {
			flushPara()
			flushList()
			out = append(out, "<h4>"+inlineHTML(m[1])+"</h4>")
			continue
		}
		ul, ol := hUL.FindStringSubmatch(l), hOL.FindStringSubmatch(l)
		if ul != nil || ol != nil {
			flushPara()
			want, m := "ul", ul
			if ul == nil {
				want, m = "ol", ol
			}
			if tag != "" && tag != want {
				flushList()
			}
			tag = want
			items = append(items, m[1])
			continue
		}
		if strings.TrimSpace(l) == "" {
			flushPara()
			flushList()
			continue
		}
		flushList()
		para = append(para, l)
	}
	flushPara()
	flushList()
	return strings.Join(out, "")
}

func inlineHTML(s string) string {
	var codes []string
	s = strings.ReplaceAll(s, "\x00", "")
	s = hCode.ReplaceAllStringFunc(s, func(m string) string {
		codes = append(codes, hCode.FindStringSubmatch(m)[1])
		return "\x00" + string(rune('0'+len(codes)-1)) + "\x00"
	})
	s = html.EscapeString(s)
	s = hLink.ReplaceAllString(s, `<a href="$2">$1</a>`)
	s = hBare.ReplaceAllString(s, `$1<a href="$2">$2</a>`)
	s = hBold.ReplaceAllString(s, "<strong>$1</strong>")
	s = hItalic.ReplaceAllString(s, "$1<em>$2</em>$3")
	for i, code := range codes {
		s = strings.Replace(s, "\x00"+string(rune('0'+i))+"\x00", "<code>"+html.EscapeString(code)+"</code>", 1)
	}
	return s
}
