package views

// D456: finding forgives the hand, as packages/protocol/src/fuzzy.ts (the
// home's Past index and the web use that one; this mirrors it word for word,
// pinned by loosefind_test.go's cases, the same as the TypeScript's):
//   - a slip of one letter in a Latin word of five or more ("compactoin");
//   - the first letters of the title's Latin words ("wgc" → "WAL 的 group commit").

import (
	"regexp"
	"strings"
)

var (
	looseWord   = regexp.MustCompile(`[a-z0-9]+`)
	looseLatin  = regexp.MustCompile(`^[a-z][a-z0-9]*$`)
	looseLetter = regexp.MustCompile(`^[a-z]+$`)
	looseSplit  = regexp.MustCompile(`[^A-Za-z0-9]+`)
	looseCaps   = regexp.MustCompile(`^[A-Z]{2,}[0-9]*$`)
)

// oneEdit is true when a and b are at most one edit apart (one letter
// changed, added, dropped, or two neighbours swapped).
func oneEdit(a, b string) bool {
	if a == b {
		return true
	}
	la, lb := len(a), len(b)
	if la-lb > 1 || lb-la > 1 {
		return false
	}
	if la == lb {
		i := 0
		for i < la && a[i] == b[i] {
			i++
		}
		if i == la {
			return true
		}
		if i+1 < la && a[i] == b[i+1] && a[i+1] == b[i] && a[i+2:] == b[i+2:] {
			return true
		}
		return a[i+1:] == b[i+1:]
	}
	s, l := a, b
	if la > lb {
		s, l = b, a
	}
	i := 0
	for i < len(s) && s[i] == l[i] {
		i++
	}
	return s[i:] == l[i+1:]
}

// nearIn reports a word in text one slip away from term (lowercase Latin, five or more).
func nearIn(term, text string) bool {
	if len(term) < 5 || !looseLatin.MatchString(term) || text == "" {
		return false
	}
	for _, w := range looseWord.FindAllString(text, -1) {
		if len(w)-len(term) > 1 || len(term)-len(w) > 1 || (w[0] != term[0] && (len(w) < 2 || w[1] != term[1])) {
			continue
		}
		if oneEdit(term, w) {
			return true
		}
	}
	return false
}

func latinWords(title string) []string {
	var out []string
	for _, w := range looseSplit.Split(title, -1) {
		if w != "" && (w[0] >= 'A' && w[0] <= 'Z' || w[0] >= 'a' && w[0] <= 'z') {
			out = append(out, w)
		}
	}
	return out
}

// initialsIn is true when term (3–6 Latin letters) is a run of the title's initials.
func initialsIn(term, title string) bool {
	if len(term) < 3 || len(term) > 6 || !looseLetter.MatchString(term) {
		return false
	}
	ws := latinWords(title)
	var firsts, spelled strings.Builder
	for _, w := range ws {
		firsts.WriteString(strings.ToLower(w[:1]))
		if looseCaps.MatchString(w) {
			spelled.WriteString(strings.ToLower(w))
		} else {
			spelled.WriteString(strings.ToLower(w[:1]))
		}
	}
	f, s := firsts.String(), spelled.String()
	if len(f) > 1 && strings.Contains(f, term) {
		return true
	}
	if s == f || !strings.Contains(s, term) {
		return false
	}
	for _, w := range ws {
		if strings.ToLower(w) == term {
			return false
		}
	}
	return true
}

// looseMatch is the app's own loose match of one typed word against what it holds for a task.
func looseMatch(word, hay, title string) bool {
	return strings.Contains(hay, word) || nearIn(word, hay) || initialsIn(word, title)
}
