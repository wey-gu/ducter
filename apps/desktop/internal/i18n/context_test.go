package i18n

import (
	"os"
	"regexp"
	"sort"
	"testing"
)

// The Mac's context words are the web's, key for key and word for word.
func TestContextWordsMatchTheWeb(t *testing.T) {
	src, err := os.ReadFile("../../../web/src/i18n-context.ts")
	if err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`"((?:ctx|note)\.[a-z_.]+)": "((?:[^"\\]|\\.)*)"`)
	web := map[string][]string{}
	for _, m := range re.FindAllStringSubmatch(string(src), -1) {
		web[m[1]] = append(web[m[1]], m[2])
	}
	keys := make([]string, 0, len(web))
	for k := range web {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := web[k]
		if len(v) != 2 {
			t.Fatalf("%s: %d words on the web", k, len(v))
		}
		if zhContext[k] != v[0] || enContext[k] != v[1] {
			t.Errorf("%s: mac %q / %q, web %q / %q", k, zhContext[k], enContext[k], v[0], v[1])
		}
	}
	if len(keys) != len(zhContext) || len(keys) != len(enContext) {
		t.Errorf("keys: web %d, mac zh %d en %d", len(keys), len(zhContext), len(enContext))
	}
}
