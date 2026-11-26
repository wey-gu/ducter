package views

import (
	"strings"
	"unicode"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// Chinese typography (D78) on MyGo's text, which sets one font size and one
// letter-spacing per run and can't scale one fallback face:
//
//   - headings use the Display face (Bricolage for Latin, Resource Han
//     Rounded CN Bold for Chinese) and, holding Chinese, one size step
//     down instead of the web's 94% size-adjust (34→32, 28→26, 20→19);
//   - Latin tightening applies only to text without Chinese: a run with
//     Chinese keeps letter-spacing 0;
//   - Chinese reading text is 1.75 high (Latin keeps its own);
//   - dynamic text gets a quarter-em space (U+2005) between Chinese and
//     Latin or digits at display time; copying strips it again;
//   - kinsoku is Core Text's own line breaking, which keeps 。，、？！）」
//     off a line's start and （「 off its end.

// autospaceGap is the quarter-em space put between Chinese and Latin.
const autospaceGap = ' '

// isHan reports whether r is a Chinese character (not punctuation).
func isHan(r rune) bool { return unicode.Is(unicode.Han, r) }

// hasHan reports whether s holds a Chinese character.
func hasHan(s string) bool {
	for _, r := range s {
		if isHan(r) {
			return true
		}
	}
	return false
}

func isLatinOrDigit(r rune) bool {
	return r < 0x250 && (unicode.IsLetter(r) || unicode.IsDigit(r))
}

// autospace puts a quarter-em space between a Chinese character and a
// Latin letter or digit that touch, for text shown as it came (the
// partner's words, titles); copied text is stripped of it (autospaceCopy).
// Inline code (between backticks) and fenced code blocks are left alone.
func autospace(s string) string {
	s = keepTokens(s)
	if !hasHan(s) {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 16)
	var prev rune
	inCode, fence := false, false
	lines := strings.SplitAfter(s, "\n")
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fence = !fence
			b.WriteString(line)
			prev = '\n'
			continue
		}
		if fence {
			b.WriteString(line)
			prev = '\n'
			continue
		}
		for _, r := range line {
			if r == '`' {
				// Inline code gets the same gap from the Chinese around it.
				if !inCode && isHan(prev) {
					b.WriteRune(autospaceGap)
				}
				inCode = !inCode
				b.WriteRune(r)
				prev = 'a' // after a code span, as after a Latin word
				if inCode {
					prev = r
				}
				continue
			}
			if !inCode && ((isHan(prev) && isLatinOrDigit(r)) || (isLatinOrDigit(prev) && isHan(r))) {
				b.WriteRune(autospaceGap)
			}
			b.WriteRune(r)
			prev = r
		}
	}
	return b.String()
}

// wordJoiner keeps a short code token whole: Core Text breaks a line
// after a hyphen, and "hawdb-net" must never break (D73).
const wordJoiner = '\u2060'

// keepTokens joins the hyphens and slashes of short Latin tokens
// ("hawdb-net", "ducter/fix-ci", "~/dev/ducter") to their letters, so a
// line never breaks inside them. Long paths may still wrap, at a slash,
// but never right after the root ("~/", "/"): a line never ends in "~/".
func keepTokens(s string) string {
	if !strings.ContainsAny(s, "-/") {
		return s
	}
	rs := []rune(s)
	var b strings.Builder
	edge := func(i int) bool { return i < 0 || unicode.IsSpace(rs[i]) || isHan(rs[i]) }
	for i, r := range rs {
		inner := i > 0 && i+1 < len(rs) && !edge(i-1) && !edge(i+1)
		switch {
		case r == '-' && inner && isLatinOrDigit(rs[i-1]) && isLatinOrDigit(rs[i+1]) && tokenLen(rs, i) <= 24:
			b.WriteRune(wordJoiner)
			b.WriteRune(r)
			b.WriteRune(wordJoiner)
		case r == '/' && inner && tokenLen(rs, i) <= 24:
			b.WriteRune(wordJoiner)
			b.WriteRune(r)
			b.WriteRune(wordJoiner)
		case r == '/' && i+1 < len(rs) && !edge(i+1) && (edge(i-1) || (rs[i-1] == '~' && edge(i-2))):
			// The root of a long path: joined to what follows.
			b.WriteRune(r)
			b.WriteRune(wordJoiner)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// tokenLen is the length of the run of non-space runes around rs[i].
func tokenLen(rs []rune, i int) int {
	l, r := i, i
	for l > 0 && !unicode.IsSpace(rs[l-1]) && !isHan(rs[l-1]) {
		l--
	}
	for r < len(rs)-1 && !unicode.IsSpace(rs[r+1]) && !isHan(rs[r+1]) {
		r++
	}
	return r - l + 1
}

// uiText is every text the views draw (ui.Text): a text holding the word
// joiners keepWords and keepTokens put in for line breaking keeps them on
// screen, and gives assistive technology its words without them, as its
// name. A screen reader spells a word with a joiner inside it letter by
// letter (D408; the Mac walk of 0.0.99). The autospace gap, a real space,
// stays: it reads as the space it is.
func uiText(c *ui.Context, s string) ui.Element {
	if onDrawn != nil {
		onDrawn(s)
	}
	e := ui.Text(c, s)
	if strings.ContainsRune(s, wordJoiner) || strings.ContainsRune(s, noBreakSpace) {
		e.Label(asSaid(s))
	}
	return e
}

// noBreakSpace is keepTail's join of a Latin sentence's last two words.
const noBreakSpace = ' '

// asSaid is a drawn text as it is said and read (D564): without the joiners line breaking put in,
// and keepTail's no-break space a plain one. uiText names its text so, and the views tests find
// a text so (hasText, findText), whatever a shared row kept whole.
func asSaid(s string) string {
	return strings.NewReplacer(string(wordJoiner), "", string(noBreakSpace), " ").Replace(s)
}

// onDrawn, when set (tests), hears every text drawn (D519: no template is
// ever drawn with its placeholders unfilled).
var onDrawn func(s string)

// unjoin is s without the word joiners line breaking put in.
func unjoin(s string) string { return strings.ReplaceAll(s, string(wordJoiner), "") }

// mdSpace is autospace for Markdown, which MyGo's view draws and reads
// out itself: the gaps without keepTokens' joiners, which its paragraphs
// would give a screen reader (D408). A short token in a reply may then
// wrap at its hyphen or slash.
func mdSpace(s string) string { return unjoin(autospace(s)) }

// unautospace takes autospace's gaps and joiners out again.
func unautospace(s string) string {
	return strings.NewReplacer(string(autospaceGap), "", string(wordJoiner), "").Replace(s)
}

// autospaceCopy is a Selectable container's copy that leaves out the gaps
// autospace put in: the clipboard gets the words as they were written.
func autospaceCopy(parts []ui.SelectedText) transfer.Data {
	var out []string
	for _, p := range parts {
		r := []rune(p.Text)
		start, end := max(0, min(p.Start, len(r))), max(0, min(p.End, len(r)))
		out = append(out, unautospace(string(r[start:end])))
	}
	return transfer.TextData(strings.Join(out, "\n\n"))
}

// headSize is a heading's size: one step down when it holds Chinese, for
// the rounded face set without a size-adjust.
func headSize(text string, size float32) float32 {
	if !hasHan(text) {
		return size
	}
	switch size {
	case 34:
		return 32
	case 28:
		return 26
	case 20:
		return 19
	}
	return size
}

// headTracking is a heading's letter-spacing: Latin tightens at large
// sizes, Chinese never does.
func headTracking(text string, size float32) float32 {
	if hasHan(text) {
		return 0
	}
	switch {
	case size >= 34:
		return -0.5
	case size >= 28:
		return -0.4
	case size >= 20:
		return -0.2
	}
	return 0
}

// askQuestion is an ask card's question (D586): the reading face at the
// theme's AskSize/AskWeight, one step under a heading, so a page of asks is
// calm and the one sentence above them stands out.
func (a *App) askQuestion(c *ui.Context, text string) ui.Element {
	return uiText(c, text).Font(a.T.Body).FontSize(a.T.AskSize).FontWeight(a.T.AskWeight).
		LineHeight(1.45)
}

// heading is a title at size (20, 28 or 34) in the heading face, 800.
func (a *App) heading(c *ui.Context, text string, size float32) ui.Element {
	lh := float32(1.2)
	if size < 28 {
		lh = 1.3
	}
	return uiText(c, text).Font(a.T.Display).FontSize(headSize(text, size)).FontWeight(800).
		LetterSpacing(headTracking(text, size)).LineHeight(lh)
}

// leading is the line height of reading text: Chinese 1.75, else latin.
func (a *App) leading(latin float32) float32 {
	if a.L.Han() {
		return 1.75
	}
	return latin
}

// leadingFor is leading for a text that may be in either language: 1.75
// when it holds Chinese.
func leadingFor(text string, latin float32) float32 {
	if hasHan(text) {
		return 1.75
	}
	return latin
}

// keepWords applies D78's line breaking to a title Core Text would split
// anywhere between Chinese characters ("修 compaction 测 / 试"): a short
// Chinese word (a run of up to four characters) is joined with word joiners
// so it stays whole, Latin words already do, and a line then breaks at a
// space, the autospace gap or punctuation. Longer Chinese runs keep their
// breaks, so a long title still wraps.
func keepWords(s string) string {
	rs := []rune(s)
	var b strings.Builder
	for i := 0; i < len(rs); {
		j := i
		for j < len(rs) && isHan(rs[j]) {
			j++
		}
		if j > i {
			for k := i; k < j; k++ {
				b.WriteRune(rs[k])
				if j-i <= 4 && k < j-1 {
					b.WriteRune('\u2060')
				}
			}
			i = j
			continue
		}
		b.WriteRune(rs[i])
		i++
	}
	return b.String()
}

// clausePunct ends a Chinese clause: what keepClauses keeps a clause's last word against.
const clausePunct = "，。；：？！、"

// keepAllRun is the longest run of Chinese characters keepClauses joins whole (D564): what a
// row's narrowest words column (rowWordsMin, 160) holds at a row's title size (MD, 15). A run
// joined whole then always fits a line of its own, so Core Text never has to cut it at a place
// of its own choosing (it does, at a cluster, when a joined run is wider than its line).
const keepAllRun = 10

// keepClauses is keepWords for a sentence (D556, D561, D564), the Mac's stand-in for the web's
// word-break: keep-all (MyGo's text keeps words whole only in Korean). A run of Chinese characters
// up to keepAllRun long (a clause or a phrase: what lies between punctuation, a space, Latin or a
// quote) is joined whole with word joiners, so a line breaks only there (「急的随时说」, 「后天到期，」);
// a longer run keeps its last four before a clause's punctuation (or the end) together, as
// keepTail's four (D493), and wraps anywhere else: never 「…才用得」 with 「上。」. A short Latin
// token keeps its hyphens and slashes (keepTokens: GPT-6.2-Sol), and a Latin sentence its last
// two words (never "running." alone). Joiners already in s are taken out first, so a
// shared row may be handed a text its caller already kept.
func keepClauses(s string) string {
	rs := []rune(keepTokens(unjoin(s)))
	var b strings.Builder
	for i := 0; i < len(rs); {
		j := i
		for j < len(rs) && isHan(rs[j]) {
			j++
		}
		if j > i {
			end := j == len(rs) || strings.ContainsRune(clausePunct, rs[j])
			for k := i; k < j; k++ {
				b.WriteRune(rs[k])
				if k < j-1 && (j-i <= keepAllRun || end && k >= j-4) {
					b.WriteRune(wordJoiner)
				}
			}
			i = j
			continue
		}
		b.WriteRune(rs[i])
		i++
	}
	// D564: only a sentence (it ends in its stop) keeps its last two Latin words: a row's title
	// has none, and joined it broke as "When I / notice something".
	if n := len(rs); n > 1 && !isHan(rs[n-2]) && strings.ContainsRune(".!?", rs[n-1]) {
		return keepTail(b.String())
	}
	return b.String()
}

// keepTail keeps a question's last few characters together (D493), so a
// wrapped question never ends on a line of its own like 「吗？」: in Chinese
// the last four characters are joined with word joiners (Core Text honours
// them, and no phrase is cut, unlike balancing); in Latin text the last two
// words are joined with a no-break space.
func keepTail(s string) string {
	rs := []rune(s)
	n := len(rs)
	if n < 8 {
		return s
	}
	if !isHan(rs[n-2]) {
		for i := n - 1; i > n-16 && i > 0; i-- {
			if rs[i] == ' ' {
				return s // already kept
			}
			if rs[i] == ' ' {
				return string(rs[:i]) + " " + string(rs[i+1:])
			}
		}
		return s
	}
	for _, r := range rs[n-4:] {
		if unicode.IsSpace(r) {
			return s
		}
	}
	var b strings.Builder
	b.WriteString(string(rs[:n-4]))
	for i := n - 4; i < n; i++ {
		b.WriteRune(rs[i])
		if i < n-1 {
			b.WriteRune(wordJoiner)
		}
	}
	return b.String()
}
