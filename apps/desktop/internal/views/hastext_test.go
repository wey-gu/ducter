package views

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

// hasText is the views tests' Tester.HasText (D564): whether the last frame shows a text
// containing s, both read as said (asSaid), without the word joiners and the no-break space line
// breaking puts in. The shared rows keep their words whole (keepClauses); a test names the words
// it wants, never how a row kept them.
func hasText(tt *ui.Tester, s string) bool {
	want := asSaid(s)
	for _, got := range tt.Texts() {
		if strings.Contains(asSaid(got), want) {
			return true
		}
	}
	return false
}

// D564: hasText finds a row's words whatever kept them whole, and only the words shown.
func TestHasTextReadsAsSaid(t *testing.T) {
	kept := keepClauses("急的随时说，其他的等你有空再看。Start it again to use it.")
	tt := ui.NewTester(func(c *ui.Context) { uiText(c, kept) }, 400, 200)
	for _, s := range []string{"急的随时说", "use it.", kept, keepClauses("急的随时说")} {
		if !hasText(tt, s) {
			t.Fatalf("no %q", s)
		}
	}
	if hasText(tt, "随时说急的") {
		t.Fatal("found words not shown")
	}
}

// D564: the views tests find words with hasText only: MyGo's own HasText reads the drawn text,
// joiners and all, so a test using it breaks the day its row keeps a word whole.
func TestViewsTestsUseHasText(t *testing.T) {
	files, _ := filepath.Glob("*_test.go")
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if f != "hastext_test.go" && strings.Contains(string(b), ".Has"+"Text(") {
			t.Errorf("%s: find words with hasText(tt, s), not tt.HasText(s)", f)
		}
	}
}

// D564: a run joined whole that is wider than its line still wraps (Core Text cuts it at a
// cluster) and never overflows its box, so keepClauses may join a clause without a narrow row
// spilling; a short joined clause moves to the next line whole.
func TestKeepClausesWrapWhenTooLong(t *testing.T) {
	lines := func(s string, w float32) float32 {
		tt := ui.NewTester(func(c *ui.Context) {
			ui.Column(c).Width(w).Children(func() {
				ui.Text(c, s).FontSize(13).LineHeight(1.5).Label("probe")
			})
		}, 400, 400)
		r, _ := tt.Find("probe")
		return r.H / (13 * 1.5)
	}
	run := "我记得的关于你的事和帮我记的东西都在这里放着"
	joined := strings.Join(strings.Split(run, ""), string(wordJoiner))
	if p, j := lines(run, 130), lines(joined, 130); j != p || j < 2 {
		t.Fatalf("a joined run wider than its line: %v lines, plain %v", j, p)
	}
	plain := "急的事随时说给你听，其他的等你有空再看"
	if p, k := lines(plain, 100), lines(keepClauses(plain), 100); k <= p {
		t.Fatalf("a kept clause did not move whole: %v lines, plain %v", k, p)
	}
}
