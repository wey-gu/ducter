package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D331: the opened task says where the loan of the person's phone stands,
// in their language: a Go waiting for the unlock, the phone out of reach and
// why, a pause by their lock, the phone asking after the unlock.
func TestHandsetLinesSayWhereTheLoanStands(t *testing.T) {
	zh, _ := iaApp(t, i18n.ZH)
	en, _ := iaApp(t, i18n.EN)
	for _, c := range []struct {
		h                     protocol.HandsetCard
		zhLine, zhWhy, enLine string
	}{
		{protocol.HandsetCard{Device: "p", Wait: "unlock"}, "借给它了：解锁你的 Pixel Fold 就开始", "", "Lent: starts when you unlock your Pixel Fold"},
		{protocol.HandsetCard{Device: "p", Wait: "away", Away: "limited"}, "借给它了：现在连不上你的 Pixel Fold，连上就开始", "安卓限制了那台手机上 Ducter 的后台：在应用信息里把 Ducter 的「电池」设为「无限制」。", "Lent: can't reach your Pixel Fold right now; starts when it connects"},
		{protocol.HandsetCard{Device: "p", Wait: "away"}, "借给它了：现在连不上你的 Pixel Fold，连上就开始", "Ducter 启动以后还没连上过它。在那台手机上打开 Ducter 就好。", "Lent: can't reach your Pixel Fold right now; starts when it connects"},
		{protocol.HandsetCard{Device: "p", Paused: "locked"}, "暂停了：你的 Pixel Fold 锁着", "它什么都不做。解锁以后，在手机上点「继续借给它」才接着用。", "Paused: your Pixel Fold is locked"},
		{protocol.HandsetCard{Device: "p", Paused: "asking"}, "在你的 Pixel Fold 上问你：继续借给它吗？", "", "Asking on your Pixel Fold: keep lending it?"},
		{protocol.HandsetCard{Device: "p"}, "正在用你的 Pixel Fold", "", "On your Pixel Fold"},
	} {
		h := c.h
		if l, w := zh.handsetLines(&h, "Pixel Fold"); l != c.zhLine || w != c.zhWhy {
			t.Errorf("zh %+v: %q / %q", h, l, w)
		}
		if l, _ := en.handsetLines(&h, "Pixel Fold"); l != c.enLine {
			t.Errorf("en %+v: %q", h, l)
		}
	}
	// The new ends are hairlines like the others: the person's Not now, a pause that lasted too long.
	for _, s := range []string{
		"Your loan of Pixel Fold ended: the user chose Not now (不借了) on the phone. The phone was returned to them.",
		"Your loan of Pixel Fold ended: the user left it locked for 30 minutes, so the paused loan gave it back.",
	} {
		if say, name, ok := toldOf(s, "ducter"); !ok || say != "taken_back" || name != "Pixel Fold" {
			t.Errorf("%q: %q %q %v", s, say, name, ok)
		}
	}
}
