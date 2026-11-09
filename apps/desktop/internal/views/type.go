package views

import (
	"strings"
	"unicode"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
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

// keepTokens joins the hyphens of short Latin tokens ("hawdb-net",
// "ducter/fix-ci") to their letters, so a line never breaks inside them.
// Long paths may still wrap.
func keepTokens(s string) string {
	if !strings.Contains(s, "-") {
		return s
	}
	rs := []rune(s)
	var b strings.Builder
	for i, r := range rs {
		if r == '-' && i > 0 && i+1 < len(rs) && isLatinOrDigit(rs[i-1]) && isLatinOrDigit(rs[i+1]) && tokenLen(rs, i) <= 24 {
			b.WriteRune(wordJoiner)
			b.WriteRune(r)
			b.WriteRune(wordJoiner)
			continue
		}
		b.WriteRune(r)
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

// heading is a title at size (20, 28 or 34) in the heading face, 800.
func (a *App) heading(c *ui.Context, text string, size float32) ui.Element {
	lh := float32(1.2)
	if size < 28 {
		lh = 1.3
	}
	return ui.Text(c, text).Font(a.T.Display).FontSize(headSize(text, size)).FontWeight(800).
		LetterSpacing(headTracking(text, size)).LineHeight(lh)
}

// leading is the line height of reading text: Chinese 1.75, else latin.
func (a *App) leading(latin float32) float32 {
	if a.L.Lang == i18n.ZH {
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
