package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// research/244 rules 4, 5 and 7 on the Mac: the offer card with its titles, the task's question
// keeping every point with no restating bubble, the group review as a record, the
// merged summary naming its PRs, and a write card naming its to-do.
//
//	DUCTER_LINES244_SHOTS=../../../../.shots/lines-244 go test ./internal/views -run Lines244Shots
func TestLines244Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_LINES244_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_LINES244_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, _ := mediaApp(t, lang)
		ref := func(n int, title string) protocol.SourceItemRef {
			return protocol.SourceItemRef{Source: "s", Kind: "github", Ref: fmt.Sprintf("nowledge-co/mem#%d", n), Label: fmt.Sprintf("#%d", n), Where: "nowledge-co/mem", Title: title}
		}
		zh := lang == i18n.ZH
		w := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		focus := w("设置卡的焦点环", "Fix the settings card's focus ring")
		scroll := w("设置卡的滚动", "Fix the settings card's scroll")
		back := w("登录后回到原页面", "Sign in returns to the right page")
		q := w("PR #11230 的远程访问设置还有四点要定：\n1. 移除「本机访问也需要密钥」这个开关吗？\n2. 同事建议的提示加在哪一页？\n3. 「远程访问」那段文案改成什么？\n4. 要不要补一个本机访问的测试？",
			"PR #11230 still has four things to decide:\n1. Remove the “local access needs a key too” switch?\n2. Which page gets the hint a teammate suggested?\n3. What should the “remote access” copy say?\n4. Should there be a test for local access?")
		record := w("在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）下留了言：「Fixed in #11163.」",
			"Commented on “Fix the settings card's label” (#11108), “Fix the settings card's scroll” (#11156): “Fixed in #11163.”")
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			mev(1, 9*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("就这几个，今天做哪个你看着办", "These ones; you pick what to do today")}),
			mev(2, 9*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_offer", Question: w("你的待办里有 3 个新的，要我开始吗？", "3 new in your to-dos. Shall I start them?"),
				GoLabel: w("接下", "Take them"), HoldLabel: w("现在不", "Not now"), DefaultOption: "hold", DefaultAt: time.Now().Add(10 * time.Hour).Format(time.RFC3339), Reversible: false, Offer: true,
				Src: &protocol.SourceAsk{Kind: "offer", Item: ref(11115, focus), Items: []protocol.SourceAskItem{{Item: ref(11115, focus)}, {Item: ref(11108, scroll)}, {Item: ref(11156, back)}}},
			}),
			mev(3, 8*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_grp", Question: w("在这 2 个下面留言？", "Comment on these 2?"), Record: record,
				GoLabel: w("留言", "Comment"), HoldLabel: w("先不留", "Not now"), DefaultOption: "hold", Reversible: false,
				Src: &protocol.SourceAsk{Kind: "group_review", Item: ref(11108, w("设置卡的标签", "Fix the settings card's label")), GroupID: "g1", Items: []protocol.SourceAskItem{
					{Item: ref(11108, w("设置卡的标签", "Fix the settings card's label")), Text: "Fixed in #11163."},
					{Item: ref(11156, scroll), Text: "Fixed in #11163."},
				}},
			}),
			mev(4, 8*time.Minute, "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_grp", Option: "go", By: "user"}),
			mev(5, 7*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w("「设置卡的标签」「设置卡的滚动」「迁移页的旧数据」都合并了，相关的事都收了尾。", "“Fix the settings card's label”, “Fix the settings card's scroll” and “Migrate the old rows” merged; everything around them is wrapped up."),
				Settled: &protocol.SettledNote{PRs: 3, Refs: []string{"nowledge-co/mem#11230", "nowledge-co/mem#11163", "nowledge-co/mem#10500"}, Names: []protocol.SettledName{{Ref: "nowledge-co/mem#11230", Title: w("设置卡的标签", "Fix the settings card's label")}, {Ref: "nowledge-co/mem#11163", Title: scroll}, {Ref: "nowledge-co/mem#10500", Title: w("迁移页的旧数据", "Migrate the old rows")}}}}),
			mev(6, 6*time.Minute, "channel", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_remote", Title: w("远程访问设置：按方案改 #11230", "Remote access settings: the plan for #11230"), Harness: "codex", Place: protocol.Place{Kind: "none"}, Brief: "x"}),
			mev(7, 6*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d_q", TaskID: "t_remote", Question: q, GoLabel: w("继续", "Continue"), DefaultOption: "go", Reversible: true}),
			// A restating line from the partner is logged but never drawn: the card keeps its question.
			mev(9, 5*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_write", TaskID: "t_remote",
				Question: w("在 nowledge-co/mem#11115「设置卡的焦点环」下留言？", "Comment on nowledge-co/mem#11115 “Fix the settings card's focus ring”?"),
				GoLabel:  w("留言", "Comment"), HoldLabel: w("暂不留言", "Not now"), DefaultOption: "hold", Reversible: false,
				Src: &protocol.SourceAsk{Kind: "write", Item: ref(11115, focus), Text: "PR #11230 is up and waiting for review.", TaskID: "t_remote"},
			}),
		}})
		app.LocaleFixed = true
		for _, dark := range []bool{false, true} {
			for _, width := range []int{1400, 1150} {
				tt := mediaTester(app, width, 2200)
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				theme := "light"
				if dark {
					theme = "dark"
				}
				name := fmt.Sprintf("mac-conv-%d-%s-%s.png", width, theme, lang)
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
