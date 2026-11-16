// Package voice is voice in the conversation on the Mac (D305): hold to
// talk turns the person's speech into words in the composer with macOS's
// own recognizer, and Read aloud says a partner's message with macOS's own
// voice. This file is the port of packages/protocol/src/voice.ts (which
// locale a recognizer or a voice is asked for, what of a message is said,
// how a held press reads its slide); both pass fixtures/voice.json.
package voice

import (
	"math"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
)

// region is a language's usual region when nothing the person prefers says one.
var region = map[string]string{
	"zh": "zh-CN", "zh-Hant": "zh-TW", "en": "en-US", "ja": "ja-JP", "ko": "ko-KR",
	"es": "es-ES", "fr": "fr-FR", "de": "de-DE", "pt": "pt-BR", "it": "it-IT",
	"ru": "ru-RU", "ar": "ar-SA", "nl": "nl-NL", "sv": "sv-SE", "pl": "pl-PL",
	"tr": "tr-TR", "uk": "uk-UA", "vi": "vi-VN", "th": "th-TH", "id": "id-ID",
	"hi": "hi-IN",
}

// simplified is the tag Simplified Chinese normalizes to.
var simplified = lang.NormalizeTag("zh-Hans")

var (
	reHantRegion = regexp.MustCompile(`(?i)^zh-(TW|HK|MO)$`)
	reZhHantPref = regexp.MustCompile(`(?i)^zh-(TW|HK|MO|Hant)`)
	reFull       = regexp.MustCompile(`^[a-z]{2,3}-[A-Z]{2}$`)
)

// SpeechLocale is the locale a recognizer or a voice is asked for, from the
// conversation's language (D292): a preferred locale of the same language
// wins, else the language's usual region, else the tag itself.
func SpeechLocale(tag string, preferred []string) string {
	t := lang.NormalizeTag(tag)
	if t == "" {
		t = "en"
	}
	base := lang.BaseTag(t)
	hant := t == "zh-Hant" || reHantRegion.MatchString(t)
	baseHead, _, _ := strings.Cut(base, "-")
	for _, p := range preferred {
		n := lang.NormalizeTag(p)
		if n == "" || !strings.Contains(n, "-") {
			continue
		}
		if hant {
			if reHantRegion.MatchString(n) {
				return n
			}
			continue
		}
		nHead, _, _ := strings.Cut(n, "-")
		// Simplified Chinese never takes a Traditional region (a script
		// rule, not a language branch: Han is split by script, D292).
		if nHead == baseHead && !(base == simplified && reZhHantPref.MatchString(n)) {
			return n
		}
	}
	if reFull.MatchString(t) {
		return t
	}
	key := base
	if hant {
		key = "zh-Hant"
	}
	if r, ok := region[key]; ok {
		return r
	}
	if r, ok := region[baseHead]; ok {
		return r
	}
	return t
}

// ReadLang is the language a partner's message is read aloud in: its own,
// else the conversation's, else the interface's.
func ReadLang(text, conv, ui string) string {
	if d := lang.Detect(text); d.Lang != "" {
		return d.Lang
	}
	if conv != "" {
		return conv
	}
	return ui
}

var (
	reCode     = regexp.MustCompile("(?s)```.*?(```|$)")
	rePic      = regexp.MustCompile(`!\[([^\]]*)\]\([^)]*\)`)
	reLink     = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	reAddr     = regexp.MustCompile(`<?https?://[^\s>)]+>?`)
	reInline   = regexp.MustCompile("`([^`]+)`")
	reHeading  = regexp.MustCompile(`^\s{0,3}#{1,6}\s+`)
	reQuote    = regexp.MustCompile(`^\s*>\s?`)
	reList     = regexp.MustCompile(`^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?`)
	reRule     = regexp.MustCompile(`^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$`)
	reBars     = regexp.MustCompile(`\s*\|\s*`)
	reBold1    = regexp.MustCompile(`\*\*(.+?)\*\*`)
	reBold2    = regexp.MustCompile(`__(.+?)__`)
	reEm       = regexp.MustCompile(`(^|[^\p{L}\p{N}*_])[*_]([^\s]|[^\s].*?[^\s])[*_]($|[^\p{L}\p{N}*_])`)
	reStrike   = regexp.MustCompile(`~~(.+?)~~`)
	reHr       = regexp.MustCompile(`^\s*(?:-{3,}|\*{3,}|_{3,})\s*$`)
	reEnds     = regexp.MustCompile(`[.!?。！？：:;；,，、…]$`)
	reCJKEnd   = regexp.MustCompile(`[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]$`)
	reHan      = regexp.MustCompile(`\p{Han}`)
	reSpaces   = regexp.MustCompile(`\s{2,}`)
	reCJKPunct = regexp.MustCompile(`[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}。！？，、：；]`)
)

// Speakable is what of a message is said aloud: the words as a person reads
// them, no Markdown marks, a link's words without its address, code blocks
// skipped, each line its own sentence.
func Speakable(text string) string {
	s := strings.ReplaceAll(text, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = reCode.ReplaceAllString(s, "\n")
	s = rePic.ReplaceAllString(s, "$1")
	s = reLink.ReplaceAllString(s, "$1")
	s = reAddr.ReplaceAllString(s, "")
	s = reInline.ReplaceAllString(s, "$1")
	var lines []string
	for _, line := range strings.Split(s, "\n") {
		line = reHeading.ReplaceAllString(line, "")
		line = reQuote.ReplaceAllString(line, "")
		line = reList.ReplaceAllString(line, "")
		line = reRule.ReplaceAllString(line, "")
		line = reBars.ReplaceAllString(line, " ")
		line = reBold1.ReplaceAllString(line, "$1")
		line = reBold2.ReplaceAllString(line, "$1")
		line = reEm.ReplaceAllString(line, "$1$2$3")
		line = reStrike.ReplaceAllString(line, "$1")
		line = reHr.ReplaceAllString(line, "")
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	all := strings.Join(lines, "")
	out := make([]string, len(lines))
	for i, l := range lines {
		if i < len(lines)-1 && !reEnds.MatchString(l) {
			if reCJKEnd.MatchString(l) {
				l += "。"
			} else {
				l += "."
			}
		}
		out[i] = l
	}
	sep := " "
	if reHan.MatchString(all) {
		sep = ""
	}
	return strings.TrimSpace(reSpaces.ReplaceAllString(strings.Join(out, sep), " "))
}

// HoldIntent is what letting go does: put the words in the composer, send
// them at once, or drop them.
type HoldIntent string

const (
	Keep HoldIntent = "keep"
	Send HoldIntent = "send"
	Drop HoldIntent = "drop"
)

// The slide that arms Send (up) or Drop (left), in points, and the press
// shorter than which is a tap.
const (
	HoldSend  = 56
	HoldDrop  = 72
	HoldTapMS = 250
)

// IntentOf reads a held press's slide (dx, dy from where it started; y grows
// downward): up past HoldSend arms Send, left past HoldDrop arms Drop, the
// larger of the two when both are past.
func IntentOf(dx, dy float64) HoldIntent {
	up, left := -dy, -dx
	send, drop := up >= HoldSend, left >= HoldDrop
	switch {
	case send && drop:
		if up/HoldSend >= left/HoldDrop {
			return Send
		}
		return Drop
	case send:
		return Send
	case drop:
		return Drop
	}
	return Keep
}

// JoinHeard puts heard words after what is typed: a space between Latin
// words, none around CJK; nothing heard leaves the draft as it was.
func JoinHeard(draft, heard string) string {
	h := strings.TrimSpace(heard)
	if h == "" {
		return draft
	}
	d := strings.TrimRightFunc(draft, unicode.IsSpace)
	if d == "" {
		return h
	}
	last, _ := utf8.DecodeLastRuneInString(d)
	first, _ := utf8.DecodeRuneInString(h)
	gap := " "
	if reCJKPunct.MatchString(string(last)) || reCJKPunct.MatchString(string(first)) {
		gap = ""
	}
	return d + gap + h
}

func round(v float64, places float64) float64 {
	p := math.Pow(10, places)
	return math.Floor(v*p+0.5) / p
}

// MeterBars is a level meter's bars from the microphone's level (0–1), the
// middle tallest.
func MeterBars(level float64, n int) []float64 {
	l := math.Max(0, math.Min(1, level))
	out := make([]float64, n)
	mid := float64(n-1) / 2
	for i := range out {
		shape := 1 - math.Abs(float64(i)-mid)/(mid+1)
		out[i] = round(0.18+0.82*l*shape, 2)
	}
	return out
}

// SmoothLevel rises quickly and falls slowly, so the meter is calm.
func SmoothLevel(prev, next float64) float64 {
	n := math.Max(0, math.Min(1, next))
	if n > prev {
		return round(prev+(n-prev)*0.6, 3)
	}
	return round(prev+(n-prev)*0.18, 3)
}

// LevelOfDB is the meter's level from a sound's power in dB: -50 dB is
// silence, -10 dB a voice close to the microphone.
func LevelOfDB(db float64) float64 {
	return math.Max(0, math.Min(1, (db+50)/40))
}
