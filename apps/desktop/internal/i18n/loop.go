package i18n

// D271: the end line says only what state proves; a wake and what Ducter
// itself told the task are hairlines; the locator. The same keys and words
// as the phone (apps/web/src/i18n.ts). Glossary: design/product-model.md
// (在等 / Waiting, 等到了 / Wait over, 说过的话 / What was said).
var zhLoop = Table{
	"end.wait":           "在等：%s · 下次 %s",
	"end.wait.timer":     "在等：%s · %s 叫醒",
	"end.wait.bare":      "在等：%s",
	"wake.over":          "等到了 · %s",
	"wake.timer":         "到时间了 · %s",
	"told.lent":          "你把 %s 借给了它 · %s",
	"told.returned":      "又交回给它了 · %s",
	"told.returned.name": "%s 又能用了 · %s",
	"told.declined":      "你没把手机借给它 · %s",
	"told.stopped":       "你让它停下了 · %s",
	"told.reopened":      "你重新打开了这件事 · %s",
	"told.other":         "%s 提醒了它一句 · %s",
	"locator.name":       "这件事里说过的话",
	"locator.brief":      "交给它的事",
	"group.more":         "还有 %d 步",
}

var enLoop = Table{
	"end.wait":           "Waiting: %s · next look %s",
	"end.wait.timer":     "Waiting: %s · wakes at %s",
	"end.wait.bare":      "Waiting: %s",
	"wake.over":          "Wait over · %s",
	"wake.timer":         "Time's up · %s",
	"told.lent":          "You lent it your %s · %s",
	"told.returned":      "Handed back to it · %s",
	"told.returned.name": "%s is back for it · %s",
	"told.declined":      "You didn't lend it your phone · %s",
	"told.stopped":       "You stopped it · %s",
	"told.reopened":      "You reopened this task · %s",
	"told.other":         "%s gave it a note · %s",
	"locator.name":       "What was said in this task",
	"locator.brief":      "The task it was given",
	"group.more":         "%d more steps",
}

func init() {
	for k, v := range zhLoop {
		zh[k] = v
	}
	for k, v := range enLoop {
		en[k] = v
	}
}
