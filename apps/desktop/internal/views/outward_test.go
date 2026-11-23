package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D496: Sent out says what went out in words, as the web does (d496.test.ts).
func TestOutsideSentence(t *testing.T) {
	a := &App{L: i18n.New(i18n.ZH)}
	rows := []store.OutsideAct{
		{Act: store.OutwardAct{Kind: "push", Target: "ducter/graph-error-response-tests"}, Count: 2},
		{Act: store.OutwardAct{Kind: "pr_create", N: 10847}, Count: 1},
		{Act: store.OutwardAct{Kind: "pr_edit", N: 10847, Fields: []string{"labels", "body"}}, Count: 1},
	}
	want := []string{"推送到 ducter/graph-error-response-tests（2 次）", "开了 PR #10847", "改了 PR #10847 的说明和标签"}
	for i, r := range rows {
		if got := a.outsideSentence(r, ""); got != want[i] {
			t.Errorf("%d: %q, want %q", i, got, want[i])
		}
	}
	a.L = i18n.New(i18n.EN)
	if got := a.outsideSentence(rows[2], ""); got != "Edited PR #10847's description and labels" {
		t.Errorf("en: %q", got)
	}
}
