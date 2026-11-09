// Package say decides whether a task's own words can stand in front of
// the reader (D154). A task reports in its words, often English whatever
// the user speaks; what the app shows by itself (the living message's
// fallback line, the proof line's labels) must not paste a sentence in
// another language: the partner says the outcome in the user's, and the
// opened task keeps the agent's own words (D152). The port of
// packages/protocol/src/say.ts: both pass fixtures/say.json.
package say

import (
	"regexp"
	"strings"
	"unicode"
)

// isHan matches the ranges say.ts counts (CJK Ext A, Unified, Compatibility).
func isHan(r rune) bool {
	return (r >= 0x3400 && r <= 0x9fff) || (r >= 0xf900 && r <= 0xfaff)
}

func hasHan(s string) bool {
	return strings.IndexFunc(s, isHan) >= 0
}

// InTongue says whether text is in lang ("zh": any Han; "en": none).
func InTongue(text, lang string) bool {
	if lang == "zh" {
		return hasHan(text)
	}
	return !hasHan(text)
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
	if hasHan(s) {
		return false
	}
	if strings.IndexFunc(s, unicode.IsSpace) < 0 {
		return true
	}
	if codeLike.MatchString(s) {
		return true
	}
	return len(strings.Fields(s)) <= 3 && s == strings.ToLower(s)
}

var kindWords = map[string][2]string{ // zh, en
	"test": {"测试结果", "Test results"},
	"ci":   {"CI 结果", "CI results"},
	"log":  {"运行记录", "Output"},
	"diff": {"改动", "Changes"},
	"file": {"文件", "File"},
	"url":  {"网页", "Web page"},
}

var hostRe = regexp.MustCompile(`(?i)^https?://([^/?#:]+)`)

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
// of lang: its label when it is in that language or reads as a name, else
// the page's host, the file's name, or what it is (测试结果 / Test results).
func ProofLabel(kind, label, ref, lang string) string {
	l := strings.TrimSpace(label)
	if l != "" && (InTongue(l, lang) || ReadsAsName(l)) {
		return l
	}
	if m := hostRe.FindStringSubmatch(strings.TrimSpace(ref)); m != nil {
		return strings.TrimPrefix(m[1], "www.")
	}
	if kind == "file" {
		if b := baseName(ref); b != "" {
			return b
		}
	}
	if w, ok := kindWords[kind]; ok {
		if lang == "zh" {
			return w[0]
		}
		return w[1]
	}
	return l
}

// Sayable is text the app may show as is to a reader of lang, or "".
func Sayable(text, lang string) string {
	t := strings.TrimSpace(text)
	if t != "" && InTongue(t, lang) {
		return t
	}
	return ""
}
