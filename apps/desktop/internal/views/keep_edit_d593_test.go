package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D593: a change among a Keep's rounds is said as what changed: words added
// from now on as what was added, a long text as the part that differs (core
// cuts it), never the whole words twice.
func TestKeepEditSentenceD593(t *testing.T) {
	zh := &App{L: i18n.New(i18n.ZH)}
	en := &App{L: i18n.New(i18n.EN)}
	added := protocol.KeepEdit{Field: "said", To: "以后只发 /lgtm"}
	if got := zh.keepEditSentence("you", added); got != "你加了一句：以后只发 /lgtm" {
		t.Fatalf("zh added: %q", got)
	}
	if got := en.keepEditSentence("you", protocol.KeepEdit{Field: "said", To: "only /lgtm from now on"}); got != "You added: only /lgtm from now on" {
		t.Fatalf("en added: %q", got)
	}
	if got := zh.keepEditSentence("you", protocol.KeepEdit{Field: "said"}); got != "你改了说的话" {
		t.Fatalf("zh said: %q", got)
	}
	cut := protocol.KeepEdit{Field: "until", From: "…审及看板规则；不巡查100gle分派、部署或生产。", To: "…审及看板规则；不部署或生产。", Cut: true}
	if got := zh.keepEditSentence("you", cut); got != "你把…审及看板规则；不巡查 100gle 分派、部署或生产。改成了…审及看板规则；不部署或生产。" {
		t.Fatalf("zh cut: %q", got)
	}
}
