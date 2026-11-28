package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// research/247 Brief A on the Mac: the record names only what went out, one failed line waits
// with 再试一次, and an information-only fact sits on the living card.
//
//	DUCTER_CLAIMWAIT_SHOTS=../../../../.shots/claim-wait/mac go test ./internal/views -run ClaimWaitShots
//	CLAIMWAIT_BEFORE=1 DUCTER_CLAIMWAIT_SHOTS=... for the before pair.
func TestClaimWaitShots(t *testing.T) {
	dir := os.Getenv("DUCTER_CLAIMWAIT_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_CLAIMWAIT_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	before := os.Getenv("CLAIMWAIT_BEFORE") == "1"
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, _ := mediaApp(t, lang)
		app.LocaleFixed = true
		w := func(z, e string) string {
			if lang == i18n.ZH {
				return z
			}
			return e
		}
		ref := func(n int, title string) protocol.SourceItemRef {
			return protocol.SourceItemRef{Source: "s", Kind: "github", Ref: fmt.Sprintf("nowledge-co/mem#%d", n), Label: fmt.Sprintf("#%d", n), Where: "nowledge-co/mem", Title: title}
		}
		label, scroll, old := w("设置卡的标签", "Fix the settings card's label"), w("设置卡的滚动", "Fix the settings card's scroll"), w("迁移页的旧数据", "Migrate the old rows")
		record := w("在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）下留了言：「Fixed in #11163.」", "Commented on “Fix the settings card's label” (#11108), “Fix the settings card's scroll” (#11156): “Fixed in #11163.”")
		if before {
			record = w("在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）、「迁移页的旧数据」（#10500）下留了言：「Fixed in #11163.」", "Commented on “Fix the settings card's label” (#11108), “Fix the settings card's scroll” (#11156), “Migrate the old rows” (#10500): “Fixed in #11163.”")
		}
		evs := []protocol.LogEvent{
			mev(1, 5*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("这三个都弄完了，一起过目，留言吧", "All three are done — review them together and comment")}),
			mev(2, 5*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_review", Question: w("在这 3 个下面留言？", "Comment on these 3?"), Record: record,
				GoLabel: w("留言", "Comment"), HoldLabel: w("先不留", "Not now"), DefaultOption: "hold", Reversible: false,
				Src: &protocol.SourceAsk{Kind: "group_review", Item: ref(11108, label), GroupID: "g1", Items: []protocol.SourceAskItem{{Item: ref(11108, label), Text: "Fixed in #11163."}, {Item: ref(11156, scroll), Text: "Fixed in #11163."}}},
			}),
			mev(3, 5*time.Minute, "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_review", Option: "go", By: "user"}),
		}
		if !before {
			evs = append(evs, mev(4, 4*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_review_failed", Question: w("有 1 个没留上，要再试一次吗？", "1 didn't go through. Try again?"),
				GoLabel: w("再试一次", "Try again"), HoldLabel: w("先不留", "Not now"), DefaultOption: "hold", Reversible: false,
				Src: &protocol.SourceAsk{Kind: "group_review_failed", Item: ref(10500, old), GroupID: "g1", Failed: []protocol.SourceAskFailed{{Item: ref(10500, old), Text: "Fixed in #11163.", Op: "comment", Why: "gh: Server Error (HTTP 500)"}}},
			}))
		} else {
			evs = append(evs, mev(4, 4*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w("「设置卡的标签」「设置卡的滚动」「迁移页的旧数据」都合并了，相关的事都收了尾。", "“Fix the settings card's label”, “Fix the settings card's scroll” and “Migrate the old rows” merged; everything around them is wrapped up.")}))
		}
		evs = append(evs,
			mev(5, 3*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("日报今天也照旧", "The daily note again today")}),
			mev(6, 3*time.Minute, "channel", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_daily", Title: w("每天早上的日报", "The morning note, every day"), Harness: "codex", Place: protocol.Place{Kind: "none"}, Brief: "x"}),
			mev(7, 3*time.Minute, "channel", protocol.OriginSystem, protocol.KindSubjectCard, protocol.SubjectCardBody{Card: protocol.SubjectCard{
				Key: "task:t_daily", MsgSeq: 5, Title: w("每天早上的日报", "The morning note, every day"), State: protocol.SubjectWorking,
				Line: w("在写今天的日报", "Writing today's note"), Info: func() string {
					if before {
						return ""
					}
					return w("第一次运行用了 102K token。", "Its first run cost 102K tokens.")
				}(),
				TaskID: "t_daily", At: time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339),
			}}),
		)
		app.Receive(protocol.ServerFrame{T: "events", Events: evs})
		for _, dark := range []bool{false, true} {
			for _, width := range []int{1400, 1000} {
				tt := ui.NewTesterWith(app.View, width, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				theme := "light"
				if dark {
					theme = "dark"
				}
				langName := "zh"
				if lang == i18n.EN {
					langName = "en"
				}
				side := "after"
				if before {
					side = "before"
				}
				name := fmt.Sprintf("%s-mac-%d-%s-%s.png", side, width, langName, theme)
				f, err := os.Create(filepath.Join(dir, name))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
