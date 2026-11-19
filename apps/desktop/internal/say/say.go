// Package say decides whether a task's own words can stand in front of
// the reader (D154). A task reports in its words, often English whatever
// the user speaks; what the app shows by itself (the living message's
// fallback line, the proof line's labels) must not paste a sentence in
// another language: the partner says the outcome in the user's, and the
// opened task keeps the agent's own words (D152). The reader's language is
// the report's (the task's Language), not the interface's (D292). The port of
// packages/protocol/src/say.ts: both pass fixtures/say.json.
package say

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
)

// InTongue says whether text is in the reader's language, any language
// (lang.InLanguage: by script where scripts tell, never wrongly held back
// where they don't).
func InTongue(text, tag string) bool {
	return lang.InLanguage(text, tag)
}

func hasCJK(s string) bool {
	return strings.IndexFunc(s, func(r rune) bool {
		return unicode.In(r, unicode.Han, unicode.Hangul, unicode.Hiragana, unicode.Katakana)
	}) >= 0
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			return false
		}
	}
	return true
}

var codeLike = regexp.MustCompile(`(?i)[/\\#` + "`" + `=]|\.[a-z0-9]{1,5}\b|\bv?\d+(\.\d+)+`)

// ReadsAsName is a label that reads the same in any language: one token,
// or code (a lower-case command of at most three words, a path, a number
// sign, a version).
func ReadsAsName(label string) bool {
	s := strings.TrimSpace(label)
	if s == "" {
		return true
	}
	if hasCJK(s) {
		return false // words, in CJK
	}
	if strings.IndexFunc(s, unicode.IsSpace) < 0 {
		return true
	}
	if codeLike.MatchString(s) {
		return true
	}
	return len(strings.Fields(s)) <= 3 && s == strings.ToLower(s) && isASCII(s)
}

var kindWords = map[string]map[string]string{
	"zh": {"test": "测试结果", "ci": "CI 结果", "log": "运行记录", "diff": "改动", "file": "文件", "url": "网页"},
	"en": {"test": "Test results", "ci": "CI results", "log": "Output", "diff": "Changes", "file": "File", "url": "Web page"},
}

var hostRe = regexp.MustCompile(`(?i)^https?://([^/?#:]+)`)

// codeRe is a pull request or an issue on a code host (GitHub's and GitLab's paths): a bare host
// ("github.com") says nothing about which one.
var codeRe = regexp.MustCompile(`(?i)^https?://[^/?#]+/[^/?#]+/([^/?#]+)/(?:-/)?(pull|pulls|merge_requests|issues)/(\d+)(?:[/?#]|$)`)

func codeLink(ref string) string {
	m := codeRe.FindStringSubmatch(strings.TrimSpace(ref))
	if m == nil {
		return ""
	}
	if strings.EqualFold(m[2], "issues") {
		return m[1] + "#" + m[3]
	}
	return "PR #" + m[3]
}

func baseName(ref string) string {
	s := strings.TrimRight(strings.TrimPrefix(strings.TrimSpace(ref), "file://"), `/\`)
	if s == "" || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
		return ""
	}
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == '/' || r == '\\' })
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

// ProofLabel is what a proof line shows for an evidence item to a reader
// of tag: its label when it is in that language or reads as a name, else
// a code host's pull request or issue by number, the page's host, the file's name, or what it is (测试结果 / Test results).
func ProofLabel(kind, label, ref, tag string) string {
	l := strings.TrimSpace(label)
	if l != "" && (InTongue(l, tag) || ReadsAsName(l)) {
		return l
	}
	if c := codeLink(ref); c != "" {
		return c
	}
	if m := hostRe.FindStringSubmatch(strings.TrimSpace(ref)); m != nil {
		return strings.TrimPrefix(m[1], "www.")
	}
	if kind == "file" {
		if b := baseName(ref); b != "" {
			return b
		}
	}
	if w, ok := lang.Words(kindWords, tag)[kind]; ok {
		return w
	}
	return l
}

// Sayable is text the app may show as is to a reader of tag, or "".
func Sayable(text, tag string) string {
	t := strings.TrimSpace(text)
	if t != "" && InTongue(t, tag) {
		return t
	}
	return ""
}
