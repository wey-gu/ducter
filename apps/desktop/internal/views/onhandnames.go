package views

// D471: names said whole. A title a source already cut ("Reconcile the orbit
// plugin's tail offsets with the…", a GitHub issue's) is said up to its last
// real word, never cut again; a name inside a sentence is cut at a word's
// end, never inside one. The web says the same (apps/web/src/transcript.tsx).

import (
	"strings"
)

// dangling are the English words a cut title can't end on.
var dangling = map[string]bool{"a": true, "an": true, "the": true, "and": true, "or": true, "of": true, "to": true, "for": true, "with": true, "on": true, "in": true, "at": true, "by": true, "from": true, "into": true, "when": true, "that": true, "which": true, "is": true, "are": true, "be": true, "as": true, "but": true, "if": true, "its": true, "it": true, "this": true, "their": true, "your": true, "our": true, "was": true, "were": true, "under": true, "over": true, "about": true, "after": true, "before": true, "against": true, "between": true, "during": true, "without": true, "within": true, "via": true, "while": true, "than": true, "so": true, "because": true, "not": true, "has": true, "have": true}

const trimTail = " ,，:：;；-—"

// untrail drops a source's ellipsis and the function words left dangling
// before it; a title that wasn't cut is returned as it is.
func untrail(title string) string {
	s := strings.TrimSpace(title)
	switch {
	case strings.HasSuffix(s, "…"):
		s = strings.TrimSuffix(s, "…")
	case strings.HasSuffix(s, "..."):
		s = strings.TrimSuffix(s, "...")
	default:
		return s
	}
	s = strings.TrimRight(s, trimTail)
	words := strings.Split(s, " ")
	for len(words) > 2 && dangling[strings.ToLower(words[len(words)-1])] {
		words = words[:len(words)-1]
	}
	return strings.TrimRight(strings.Join(words, " "), trimTail)
}

// cols is how wide a run of text reads: a Han or full-width character two.
func cols(s string) int {
	n := 0
	for _, r := range s {
		if isHan(r) || (r >= 0xff00 && r <= 0xffef) {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// sayName is a task named inside a sentence: its short title whole when it
// fits max columns, else cut at a word's end with "…".
func sayName(title string, max int) string {
	s := shortTitle(title)
	if cols(s) <= max {
		return s
	}
	rs := []rune(s)
	n, end := 0, 0
	for i, r := range rs {
		w := 1
		if isHan(r) || (r >= 0xff00 && r <= 0xffef) {
			w = 2
		}
		if n+w > max-1 {
			break
		}
		n += w
		end = i + 1
	}
	out := string(rs[:end])
	if end > 0 && !isHan(rs[end-1]) {
		// Latin text ends at the last space, so no word is cut.
		if i := strings.LastIndex(out, " "); i > len(out)/2 {
			out = out[:i]
		}
	}
	return strings.TrimRight(out, trimTail+"、。") + "…"
}
