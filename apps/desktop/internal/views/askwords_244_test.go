package views

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// research/244 rule 5: a four-point task question whose partner words keep one point keeps its own
// question on the card; the restating words are not drawn as a second bubble.
func TestTaskQuestionKeepsEveryPointD244(t *testing.T) {
	app, _, _ := mediaApp(t, i18n.ZH)
	q := "PR #11230 的远程访问设置：\n1. 移除「本机访问也需要密钥」这个开关\n2. 加上同事说的提示\n3. 改一处文案\n4. 补一个测试"
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 9*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: q, GoLabel: "继续", DefaultOption: "go", Reversible: true}),
		mev(2, 8*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "按同事的建议，移除「本机访问也需要密钥」这个开关吗？", DecisionID: "d1"}),
	}})
	d := app.S.Decisions["d1"]
	if d == nil || d.Said != "" {
		t.Fatalf("the words dropped points but became the question: %+v", d)
	}
	tt := mediaTester(app, 1150, 1000)
	if hasText(tt, "按同事的建议") {
		t.Errorf("a restating bubble is drawn: %q", tt.Texts())
	}
	for _, point := range []string{"1. 移除", "2. 加上", "3. 改一处文案", "4. 补一个测试"} {
		if !hasText(tt, point) {
			t.Errorf("point %q missing from the card: %q", point, tt.Texts())
		}
	}
}

// research/244 rule 7: a decision answered before it was drawn reads as what was done, never as a
// question with buttons.
func TestGroupReviewRecordD244(t *testing.T) {
	app, _, _ := mediaApp(t, i18n.ZH)
	record := "在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）下留了言：「Fixed in #11163.」"
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 2*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d2", Question: "在这 2 个下面留言？", Record: record, GoLabel: "留言", DefaultOption: "hold", Reversible: false}),
		mev(2, time.Minute, "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d2", Option: "go", By: "user"}),
	}})
	tt := mediaTester(app, 1150, 1000)
	if !hasText(tt, "下留了言") || !hasText(tt, "Fixed in #11163.") {
		t.Errorf("the record is not drawn: %q", tt.Texts())
	}
	if hasText(tt, "在这 2 个下面留言？") {
		t.Errorf("a record still reads as a question: %q", tt.Texts())
	}
	if hasText(tt, app.L.T("decision.reply")) {
		t.Errorf("a record shows the answer controls: %q", tt.Texts())
	}
}

// research/244 rules 4 and 5: a to-do offer is a card that lists each to-do by its title (Take /
// Not now, Not now the default), never a bubble question about numbers.
func TestTodoOfferCardD244(t *testing.T) {
	app, _, _ := mediaApp(t, i18n.ZH)
	item := func(n int, title string) protocol.SourceItemRef {
		return protocol.SourceItemRef{Source: "s", Kind: "github", Ref: "acme/web#" + itoa(int64(n)), Label: "#" + itoa(int64(n)), Where: "acme/web", Title: title}
	}
	a, b := item(16, "设置卡的焦点环"), item(17, "设置卡的滚动")
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{
			DecisionID: "d_offer", Question: "「设置卡的焦点环」、「设置卡的滚动」在你的待办里，要我开始吗？",
			GoLabel: "接下", HoldLabel: "现在不", DefaultOption: "hold", Reversible: false, Offer: true,
			Src: &protocol.SourceAsk{Kind: "offer", Item: a, Items: []protocol.SourceAskItem{{Item: a}, {Item: b}}},
		}),
	}})
	tt := mediaTester(app, 1150, 1000)
	for _, want := range []string{"设置卡的焦点环", "设置卡的滚动", "接下", "现在不"} {
		if !hasText(tt, want) {
			t.Errorf("offer card: no %q in %q", want, tt.Texts())
		}
	}
}
