package views

// D599: an ask's own words, and 登录 {service} with a one-time code
// (design/device-signin.md). A task wrote 「请打开 https://github.com/login/
// device，输入设备码 8694-B656…完成后请回复「已授权」」 into its question, and the
// card drew it as a bold title the person could neither click nor copy.
// Now every ask's words are selectable, their links open in the browser,
// and a code (in backticks, or a one-time code as a CLI prints it) is copied
// with one click (askText, the web's AskText). A one-time-code sign-in gets
// its own card: Open {service} (which copies the code first), the code large
// with Copy (codeToCopy, the web's CodeToCopy), the wait with how long the
// code still works, and 再要一个码 once it ran out; no 回复「已授权」: Ducter
// sees the sign-in by the CLI's own check and the card says 已登录 GitHub.

import (
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// askToken is one piece of an ask's words (packages/protocol/src/ask-text.ts).
type askToken struct {
	kind string // text | link | code
	text string
}

// askPiece finds a link, a code in backticks or a one-time code
// (ask-text.ts's PIECE; Go's RE2 has no look-around, so the code's edges
// are checked by hand).
var askPiece = regexp.MustCompile("(https?://[^\\s\"'<>()\\[\\]{}「」『』（），。、；：！？]+)|`([^`\\n]{1,200})`|([A-Z0-9]{4,5}-[A-Z0-9]{4,6})")

var hasDigit = regexp.MustCompile(`[0-9]`)

func codeEdge(s string, i int) bool {
	if i < 0 || i >= len(s) {
		return true
	}
	b := s[i]
	return !(b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || b == '-')
}

// askTokens cuts an ask's words into its pieces, in order.
func askTokens(s string) []askToken {
	var out []askToken
	push := func(kind, text string) {
		if text == "" {
			return
		}
		if n := len(out); kind == "text" && n > 0 && out[n-1].kind == "text" {
			out[n-1].text += text
			return
		}
		out = append(out, askToken{kind, text})
	}
	at := 0
	for _, m := range askPiece.FindAllStringSubmatchIndex(s, -1) {
		i, j := m[0], m[1]
		switch {
		case m[2] >= 0:
			push("text", s[at:i])
			url := strings.TrimRight(s[m[2]:m[3]], ".,;:!?")
			push("link", url)
			push("text", s[m[2]+len(url):m[3]])
		case m[4] >= 0:
			push("text", s[at:i])
			if c := strings.TrimSpace(s[m[4]:m[5]]); c != "" {
				push("code", c)
			} else {
				push("text", s[i:j])
			}
		default:
			push("text", s[at:i])
			c := s[m[6]:m[7]]
			if codeEdge(s, i-1) && codeEdge(s, j) && hasDigit.MatchString(c) {
				push("code", c)
			} else {
				push("text", c)
			}
		}
		at = j
	}
	push("text", s[at:])
	return out
}

// askHasPieces says whether an ask's words hold a link or a code.
func askHasPieces(s string) bool {
	for _, p := range askTokens(s) {
		if p.kind != "text" {
			return true
		}
	}
	return false
}

var mdEscape = strings.NewReplacer(`\`, `\\`, "*", `\*`, "_", `\_`, "[", `\[`, "]", `\]`, "<", `\<`, ">", `\>`, "#", `\#`, "`", "\\`", "|", `\|`, "~", `\~`, "!", `\!`)

// askMarkdown is an ask's words as Markdown for the view: its words as they
// are, its links as links, its codes as code; strong for a question.
func askMarkdown(s string, strong bool) string {
	var b strings.Builder
	for _, p := range askTokens(s) {
		switch p.kind {
		case "link":
			b.WriteString("[" + mdEscape.Replace(p.text) + "](" + p.text + ")")
		case "code":
			b.WriteString("`" + p.text + "`")
		default:
			b.WriteString(mdEscape.Replace(p.text))
		}
	}
	if strong {
		return "**" + b.String() + "**"
	}
	return b.String()
}

// askCopyScheme is the code's own link: clicking a code copies it.
const askCopyScheme = "ducter-copy:"

// askOptions is the Markdown look of an ask's words at size and weight
// (the question's, or a bubble's), made once per theme and language.
func (a *App) askOptions(size float32, weight int, leading float32) *markdown.Options {
	key := askOptKey{size, weight, a.mdLang, a.uiTheme}
	if a.askMd == nil {
		a.askMd = map[askOptKey]*markdown.Options{}
	}
	if o := a.askMd[key]; o != nil {
		return o
	}
	th := a.markdownTheme(size, leading)
	th.StrongWeight = weight
	th.CodeBackground = chipGround(a.T)
	th.CodeSize = 0.88
	link := a.mdLink(func() string { return "" })
	o := &markdown.Options{
		Theme:          th,
		ShareSelection: true,
		CodeLink:       func(code string) (string, bool) { return askCopyScheme + code, true },
		OnLink: func(u string) {
			if code, ok := strings.CutPrefix(u, askCopyScheme); ok {
				a.askCopy = code
				return
			}
			link(u)
		},
	}
	a.askMd[key] = o
	return o
}

type askOptKey struct {
	size   float32
	weight int
	lang   any
	theme  any
}

// askText draws an ask's words (D599): plain and selectable when they hold
// no link or code; else as Markdown, its links opening the browser and each
// code copied with one click (said in a toast). size and weight are the
// words' own (the question's 18/600, a bubble's).
func (a *App) askText(c *ui.Context, key, text string, size float32, weight int, col ui.Color) {
	a.askCopied(c)
	if !askHasPieces(text) {
		uiText(c, text).Font(a.T.Body).FontSize(size).FontWeight(weight).LineHeight(leadingFor(text, 1.45)).TextColor(col).Selectable()
		return
	}
	ui.Column(c.Key("ask-text:" + key)).MinWidth(0).Children(func() {
		markdown.View(c, askMarkdown(unjoin(text), weight >= 600), a.askOptions(size, weight, leadingFor(text, 1.45)))
	})
}

// askCopied puts a code clicked in an ask's words on the clipboard, once,
// and says so.
func (a *App) askCopied(c *ui.Context) {
	if a.askCopy == "" {
		return
	}
	code := a.askCopy
	a.askCopy = ""
	c.WriteClipboard(code)
	c.AddToast(ui.Toast{ID: "ask-copy", Title: a.L.T("dsi.copied") + " " + code, Timeout: 1600 * time.Millisecond})
}

// codeToCopy is a one-time code to type on another page (D599): the code
// large in mono on the paper set into the card, selectable whole, and 复制 /
// Copy at its right saying 已复制 / Copied for a moment; off, a code that ran
// out: faded and struck through, no Copy. The web's CodeToCopy.
func (a *App) codeToCopy(c *ui.Context, key, code string, off bool, bg ui.Color) {
	t := a.T
	ui.Row(c.Key("code-copy:"+key)).Gap(t.S3).MinHeight(64).Padding(t.S2, t.S2, t.S2, t.S4).Radius(t.RadiusSM).Background(t.Sunken).
		AlignItems(ui.Center).Label(a.L.T("dsi.code")).Children(func() {
		ink := t.Ink
		if off {
			ink = t.InkMuted.Alpha(0.6)
		}
		tx := uiText(c, code).Font(t.Mono).FontSize(28).FontWeight(700).LetterSpacing(2.4).TextColor(ink).Grow(1).Basis(0).MinWidth(0).Selectable()
		if off {
			tx.Strikethrough()
		}
		if off {
			return
		}
		label := a.L.T("dsi.copy")
		if a.justCopied(c, "dsi:"+key) {
			label = a.L.T("dsi.copied")
		}
		if a.buttonFor(c, label, code, btnSecondary, t.ControlMD, t.Surface) {
			c.WriteClipboard(code)
			a.copied = copiedState{"dsi:" + key, a.Now()}
		}
	})
}

// deviceSignInButtons is the one-time-code card's body under its title
// (D599): the line, the code with Copy, Open {service} (copying the code
// first) with 先不用 and 回复… after it, and the wait with the minutes left;
// once the code ran out, 再要一个码; answered, 已登录 GitHub.
func (a *App) deviceSignInButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	s := d.DeviceSignIn
	if d.Resolved != nil || d.Pending != "" {
		a.answeredLine(c, d)
		return
	}
	now := a.Now()
	until, _ := time.Parse(time.RFC3339Nano, s.Until)
	out := !until.IsZero() && !now.Before(until)
	about := a.decisionAbout(d)
	ui.Column(c.Key("dsi:" + d.DecisionID)).Gap(t.S3).Children(func() {
		line := a.L.T("dsi.expired")
		if !out {
			if s.Code != "" {
				line = a.L.T("dsi.line", s.Service)
			} else {
				line = a.L.T("dsi.line.nocode", s.Service)
			}
		}
		uiText(c, line).FontSize(t.SM).LineHeight(leadingFor(line, 1.5)).TextColor(t.InkSoft)
		if s.Code != "" {
			a.codeToCopy(c, d.DecisionID, s.Code, out, st.quietBg)
		}
		lead := func() {
			if out {
				if a.buttonFor(c, a.L.T("dsi.again"), about, btnPrimary, st.height, st.quietBg) {
					a.Decide(d.DecisionID, "go", "")
				}
				return
			}
			if a.buttonFor(c, a.L.T("dsi.open", s.Service), about, btnPrimary, st.height, st.quietBg) {
				if s.Code != "" {
					c.WriteClipboard(s.Code)
					a.copied = copiedState{"dsi:" + d.DecisionID, a.Now()}
				}
				a.openLink(s.URL)
			}
		}
		var under func()
		if !out {
			under = func() {
				left := until.Sub(now)
				mins := int((left + time.Minute - 1) / time.Minute)
				if mins < 1 {
					mins = 1
				}
				c.After(min(left, 30*time.Second))
				a.aliveLine(c, "dsi-live:"+d.DecisionID, a.L.T("dsi.wait", s.Service), a.L.T("dsi.left", mins), func() {
					if task := a.S.Task(d.TaskID); task != nil && task.Harness() != "" {
						a.coinBox(c, "dsi-live:"+d.DecisionID, task.Harness(), 22, false, coinWorking)
					}
				})
			}
		}
		a.decideRowLead(c, d, about, st.height, st.quietBg, lead, under)
	})
}

// deviceSignInTitle is the card's own title (the task's words are not shown).
func (a *App) deviceSignInTitle(s *protocol.DeviceSignInAsk) string {
	return a.L.T("dsi.title", s.Service)
}

// askWords is a card's question (D599): a task's own words through
// askText (selectable, links and codes real) at the ask's size and weight;
// the card's own titles as before. lines > 0 cuts plain words at that many
// lines (On hand's card).
func (a *App) askWords(c *ui.Context, d *store.DecisionState, q string, lines int) {
	t := a.T
	if q == d.Question && askHasPieces(q) {
		a.askText(c, "q:"+d.DecisionID, q, t.AskSize, t.AskWeight, t.Ink)
		return
	}
	e := a.askQuestion(c, keepTail(autospace(q))).Selectable()
	if lines > 0 {
		e.MaxLines(lines)
	}
}

// partnerAskWords is an ask in the partner's bubble (D599): as partnerWords, but a link or a code
// in it is real, and the card's one kind mark leads its words (D642). A calendar card answers
// kind "" — its date leaf is the mark.
func (a *App) partnerAskWords(c *ui.Context, key, text, kind string) {
	t := a.T
	mark := func() {
		if kind != "" {
			a.kindMark(c, kind, 16, t.OnPartnerBubble.Alpha(0.72))
		}
	}
	if !askHasPieces(text) {
		if kind == "" {
			a.partnerWords(c, text)
			return
		}
		a.partnerBubble(c, a.takeJoin(), func() {
			ui.Row(c.Key("ask-mark")).Gap(t.S2).AlignItems(ui.Start).Children(func() {
				mark()
				uiText(c, autospace(text)).Selectable().CopyData(autospaceCopy).FontSize(t.PartnerSize).
					LineHeight(leadingFor(text, 1.5)).TextColor(t.OnPartnerBubble).Grow(1).Basis(0).MinWidth(0)
			})
		})
		return
	}
	a.partnerBubble(c, a.takeJoin(), func() {
		a.askCopied(c)
		ui.Row(c.Key("ask-mark")).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			mark()
			ui.Column(c.Key("ask-bubble:" + key)).Grow(1).Basis(0).MinWidth(0).Children(func() {
				markdown.View(c, askMarkdown(mdSpace(text), false), a.askOptions(t.PartnerSize, 400, leadingFor(text, 1.5)))
			})
		})
	})
}
