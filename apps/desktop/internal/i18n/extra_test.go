package i18n

import (
	"strings"
	"testing"
)

// D370: copy given more arguments than it prints never shows Go's
// "%!(EXTRA ...)", and the guard hears it so the call gets fixed; a family
// picked at run time takes only what each member prints.
func TestExtraArgsNeverShow(t *testing.T) {
	var heard []string
	OnExtraArg = func(key string, verbs, args int) { heard = append(heard, key) }
	defer func() { OnExtraArg = nil }()
	for _, l := range []Lang{ZH, EN} {
		s := New(l)
		if got := s.T("wmem.failed.bad_link", "haswell"); strings.Contains(got, "%!") {
			t.Fatalf("%s: %q", l, got)
		}
		if got := s.TFamily("wmem.failed.used", "haswell"); strings.Contains(got, "%!") {
			t.Fatalf("%s: %q", l, got)
		}
		if got := s.TFamily("wmem.failed.network", "haswell"); !strings.Contains(got, "haswell") {
			t.Fatalf("%s: %q", l, got)
		}
	}
	if len(heard) != 2 {
		t.Fatalf("guard heard %v, want the two T calls", heard)
	}
	if verbCount("a %s b %d %% c") != 2 || verbCount("%[2]s %[1]s") != -1 || verbCount("none") != 0 {
		t.Fatal("verbCount")
	}
}
