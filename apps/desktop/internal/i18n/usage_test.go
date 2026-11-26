package i18n

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// D591: the Mac's usage words are the web's, key for key and word for word,
// and none joins facts with " · " (D291).
func TestUsageWordsMatchTheWeb(t *testing.T) {
	src, err := os.ReadFile("../../../web/src/i18n-usage.ts")
	if err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`"(usage\.[a-z_.]+)": "((?:[^"\\]|\\.)*)"`)
	web := map[string][]string{}
	for _, m := range re.FindAllStringSubmatch(string(src), -1) {
		web[m[1]] = append(web[m[1]], m[2])
	}
	for k, v := range web {
		if len(v) != 2 {
			t.Fatalf("%s: %d words on the web", k, len(v))
		}
		if zhUsage[k] != v[0] || enUsage[k] != v[1] {
			t.Errorf("%s: mac %q / %q, web %q / %q", k, zhUsage[k], enUsage[k], v[0], v[1])
		}
	}
	if len(web) != len(zhUsage) || len(web) != len(enUsage) {
		t.Errorf("keys: web %d, mac zh %d en %d", len(web), len(zhUsage), len(enUsage))
	}
	for _, tb := range []Table{zhUsage, enUsage} {
		for k, v := range tb {
			if strings.Contains(v, " · ") {
				t.Errorf("%s joins with a dot: %q", k, v)
			}
		}
	}
}
