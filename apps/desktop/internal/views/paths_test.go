package views

import (
	"strings"
	"testing"
)

// A path never breaks right after its root ("~/" alone at a line's end),
// and a short one never breaks at all.
func TestKeepTokensPaths(t *testing.T) {
	wj := string(wordJoiner)
	if got := keepTokens("看看 ~/dev/ducter 的"); got != "看看 ~"+wj+"/"+wj+"dev"+wj+"/"+wj+"ducter 的" {
		t.Errorf("short path: %q", got)
	}
	long := "跑 ~/dev/ducter-evidence/release-pass/scratch/demo 里"
	got := keepTokens(long)
	if !strings.Contains(got, "~/"+wj+"dev") {
		t.Errorf("a long path may break after its root: %q", got)
	}
	if !strings.Contains(got, "dev/ducter") {
		t.Errorf("a long path should still break at its slashes: %q", got)
	}
	if got := keepTokens("/Users/me/dev/ducter-evidence/release-pass"); !strings.HasPrefix(got, "/"+wj+"Users") {
		t.Errorf("an absolute path may break after /: %q", got)
	}
	if unautospace(keepTokens(long)) != long {
		t.Errorf("copy must give back the words as written")
	}
}
