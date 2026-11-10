package i18n

import "testing"

// The guard behind every view test (views/main_test.go): an empty string in
// a placeholder the copy prints is heard; one the copy doesn't print isn't.
func TestEmptyPlaceholderIsHeard(t *testing.T) {
	var heard []string
	OnEmptyArg = func(key string, arg int) { heard = append(heard, key) }
	defer func() { OnEmptyArg = nil }()
	zh := New(ZH)
	zh.T("live.try.note", "")                   // 这是  上的浏览器看到的网页
	zh.T("step.computer.launch.app", "", "备忘录") // %[2]s only: the empty first one isn't printed
	zh.T("live.try.note", "hel")
	if len(heard) != 1 || heard[0] != "live.try.note" {
		t.Fatalf("heard %q", heard)
	}
	for _, c := range []struct {
		f    string
		n    int
		want []bool
	}{
		{"%s and %s", 2, []bool{true, true}},
		{"%[2]s only", 2, []bool{false, true}},
		{"100%% of %s", 1, []bool{true}},
		{"%d%% left", 1, []bool{true}},
	} {
		got := usedArgs(c.f, c.n)
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("usedArgs(%q) = %v", c.f, got)
			}
		}
	}
}
