package protocol

import (
	"regexp"
	"strings"
)

// research/244 rule 5: a question stands alone. A task's question said in the
// partner's words keeps every point, or the card keeps its own question and
// the words are not drawn. Code reads only structure: how many points the
// task's question makes, and which #refs it names.
var (
	askPoint = regexp.MustCompile(`(?m)(^|\n)\s*(\d+[.)、]|[-*\x{2022}]|第[一二三四五六七八九十]+)`)
	askRef   = regexp.MustCompile(`(?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#\d+`)
)

// AskPoints counts the numbered or bulleted points a text makes.
func AskPoints(text string) int { return len(askPoint.FindAllStringIndex(text, -1)) }

// AskRefs names every #ref in a text, lowercased.
func AskRefs(text string) []string {
	seen := map[string]bool{}
	var out []string
	for _, r := range askRef.FindAllString(text, -1) {
		r = strings.ToLower(r)
		if !seen[r] {
			seen[r] = true
			out = append(out, r)
		}
	}
	return out
}

// KeepsPoints reports whether the partner's words keep the task's question:
// all its points (when it makes more than one) and every #ref it names. A
// one-point question is covered by the same #ref check, not only the numbered
// ones. The task's or to-do's own title is never required here: the card
// already names it (the ask's heading is the task's title; a to-do card's body
// shows its chip and title), so asking the partner to say it again is
// redundant and would hide code-built cards such as a key ask, whose question
// is not the partner's to paraphrase.
func KeepsPoints(question, said string) bool {
	if strings.TrimSpace(said) == "" {
		return false
	}
	if AskPoints(question) >= 2 && AskPoints(said) < AskPoints(question) {
		return false
	}
	low := strings.ToLower(said)
	for _, ref := range AskRefs(question) {
		short := ref
		if i := strings.Index(ref, "#"); i >= 0 {
			short = ref[i:]
		}
		if !strings.Contains(low, ref) && !strings.Contains(low, short) {
			return false
		}
	}
	return true
}
