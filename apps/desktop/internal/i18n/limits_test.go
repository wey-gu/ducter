package i18n

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// D297: the Mac's limit words are the web's, key for key and word for word,
// and none joins facts with " · " (D291).
func TestLimitWordsMatchTheWeb(t *testing.T) {
	src, err := os.ReadFile("../../../web/src/i18n-limits.ts")
	if err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`"((?:limit|note|wake)\.[a-z_.]+)": "((?:[^"\\]|\\.)*)"`)
	web := map[string][]string{}
	for _, m := range re.FindAllStringSubmatch(string(src), -1) {
		web[m[1]] = append(web[m[1]], m[2])
	}
	for k, v := range web {
		if len(v) != 2 {
			t.Fatalf("%s: %d words on the web", k, len(v))
		}
		if zhLimits[k] != v[0] || enLimits[k] != v[1] {
			t.Errorf("%s: mac %q / %q, web %q / %q", k, zhLimits[k], enLimits[k], v[0], v[1])
		}
	}
	if len(web) != len(zhLimits) || len(web) != len(enLimits) {
		t.Errorf("keys: web %d, mac zh %d en %d", len(web), len(zhLimits), len(enLimits))
	}
	for _, tb := range []Table{zhLimits, enLimits} {
		for k, v := range tb {
			if strings.Contains(v, " · ") {
				t.Errorf("%s joins with a dot: %q", k, v)
			}
		}
	}
}
