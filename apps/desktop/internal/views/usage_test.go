package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// A task's usage is said in words in Details, in the reader's own units;
// never as bare "45 / 3" on a turn's line.
func TestUsageInWords(t *testing.T) {
	zh := &App{L: i18n.New(i18n.ZH)}
	en := &App{L: i18n.New(i18n.EN)}
	cases := []struct {
		n      int64
		zh, en string
	}{
		{48, "用了大约 48 token", "About 48 tokens"},
		{4500, "用了大约 4500 token", "About 4.5k tokens"},
		{45_000, "用了大约 4.5 万 token", "About 45k tokens"},
		{120_000, "用了大约 12 万 token", "About 120k tokens"},
		{1_230_000, "用了大约 123 万 token", "About 1.2M tokens"},
	}
	for _, c := range cases {
		if got := zh.L.T("task.usage", zh.aboutTokens(c.n)); got != c.zh {
			t.Errorf("zh %d: %q, want %q", c.n, got, c.zh)
		}
		if got := en.L.T("task.usage", en.aboutTokens(c.n)); got != c.en {
			t.Errorf("en %d: %q, want %q", c.n, got, c.en)
		}
	}
}
