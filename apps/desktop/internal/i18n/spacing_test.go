package i18n

import (
	"regexp"
	"sort"
	"testing"
)

// cjkLatin finds a Han character directly against a Latin letter or a digit,
// either way round ("隐藏Ducter", "3个"). D78: a space goes between them.
// Printf verbs (%s, %d, %[1]s) are left out: what fills them decides.
var cjkLatin = regexp.MustCompile(`\p{Han}[A-Za-z0-9]|[A-Za-z0-9]\p{Han}`)
var verbs = regexp.MustCompile(`%(\[\d+\])?[-+# 0]*\d*(\.\d+)?[a-zA-Z]`)

// spacingAllowed are the strings that run Han and Latin together on purpose.
var spacingAllowed = map[string]bool{}

// Hits lists "key: text" for every zh string with Han against Latin or a digit.
func spacingHits(t Table) []string {
	var out []string
	for k, v := range t {
		if spacingAllowed[k] {
			continue
		}
		if cjkLatin.MatchString(verbs.ReplaceAllString(v, "\x00")) {
			out = append(out, k+": "+v)
		}
	}
	sort.Strings(out)
	return out
}

func TestZhSpacesHanAndLatin(t *testing.T) {
	if h := spacingHits(Table{"a": "隐藏Ducter", "b": "退出 Ducter", "c": "%s检查过", "d": "3个"}); len(h) != 2 || h[0] != "a: 隐藏Ducter" {
		t.Fatalf("the check itself: %v", h)
	}
	for _, h := range spacingHits(Tables()[ZH]) {
		t.Errorf("Han against Latin or a digit without a space (D78): %s", h)
	}
}
