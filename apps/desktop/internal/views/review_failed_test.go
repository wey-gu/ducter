package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D667 (research/247 Brief A): the one failed review line is a real card in the
// scroll — the failed to-dos, the exact words, and 再试一次 / Try again. It is never a
// toast or a line inside the sheet.
func TestReviewFailedCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		w := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		app, _ := iaApp(t, lang)
		app.LocaleFixed = true
		now := time.Now().UTC()
		ref := protocol.SourceItemRef{Source: "s", Kind: "github", Ref: "acme/mem#11108", Label: "#11108", Where: "acme/mem", Title: w("设置卡的标签", "Fix the settings card's label")}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(1, now.Add(-2*time.Minute).Format(time.RFC3339), "default", "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_failed", Question: w("有 1 个没留上，要再试一次吗？", "1 didn't go through. Try again?"),
				GoLabel: w("再试一次", "Try again"), HoldLabel: w("先不留", "Not now"), DefaultOption: "hold", Reversible: false,
				Src: &protocol.SourceAsk{Kind: "group_review_failed", Item: ref, GroupID: "g1", Failed: []protocol.SourceAskFailed{{Item: ref, Text: "Fixed in #11163.", Op: "comment", Why: "gh: Server Error (HTTP 500)"}}},
			}),
		}})
		for _, width := range []int{1000, 1400} {
			tt := ui.NewTesterWith(app.View, width, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			todoFrames(tt, 4)
			for _, want := range []string{w("有 1 个没留上，要再试一次吗？", "1 didn't go through. Try again?"), w("再试一次", "Try again"), w("设置卡的标签", "Fix the settings card's label"), "Fixed in #11163."} {
				if !hasText(tt, want) {
					t.Errorf("%s %d: no %q in %q", lang, width, want, tt.Texts())
				}
			}
		}
	}
}
