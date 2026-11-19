package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D404: an expiry typed without a slash, as on a number pad, reads the same.
func TestParseExpD404(t *testing.T) {
	cases := []struct {
		in     string
		mm, yy int
		ok     bool
	}{
		{"08/29", 8, 29, true},
		{"0829", 8, 29, true},
		{"829", 8, 29, true},
		{"08 29", 8, 29, true},
		{"8/2029", 8, 2029, true},
		{"13/29", 13, 29, false},
		{"0/29", 0, 29, false},
		{"0", 0, 0, false},
	}
	for _, c := range cases {
		mm, yy, ok := parseExp(c.in)
		if ok != c.ok || (ok && (mm != c.mm || yy != c.yy)) {
			t.Errorf("parseExp(%q) = %d, %d, %v; want %d, %d, %v", c.in, mm, yy, ok, c.mm, c.yy, c.ok)
		}
	}
}

// D404: a failed connect in the home's own English words is said in the person's language.
func TestFailedDetailsSaidD404(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for detail, key := range failedDetails {
			if got := L.T(key); got == key || got == "" {
				t.Errorf("%s: %q has no words for %q", lang, key, detail)
			}
		}
	}
}
