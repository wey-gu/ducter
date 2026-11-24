package i18n

// D271: the end line says only what state proves; a wake and what Ducter
// itself told the task are hairlines; the locator. The same keys and words
// as the phone (apps/web/src/i18n.ts). Glossary: design/product-model.md
// (在等 / Waiting, 等到了 / Wait over, 这个任务的经过 / What happened in this task).
// D291: a hairline's time, and when a wait comes back, are their own muted
// element beside the words, never joined to them.
var zhLoop = Table{
	// D320: a text cut at its most, opened whole in the viewer (the same words as apps/web/src/i18n-transcript.ts).
	"text.all":           "显示全部（%s 字）",
	"end.wait":           "%s 回来",
	"end.wait.bare":      "在等：%s",
	"wake.over":          "等到了",
	"locator.wakes":      "等到了 %d 次",
	"wake.timer":         "到时间了",
	"told.lent":          "你把 %s 借给了它",
	"told.returned":      "又交回给它了",
	"told.returned.name": "%s 又能用了",
	"told.declined":      "你没把手机借给它",
	"told.stopped":       "你让它停下了",
	"told.reopened":      "你重新打开了这个任务",
	"told.adopted":       "在 Ducter 里接着做",
	"told.other":         "%s 提醒了它一句",
	"told.looked":        "另一个 AI（%s）看过，让它补一下",
	"told.taken_back":    "你收回了 %s",
	"told.given_back":    "它把 %s 还给你了",
	"told.loan_lost":     "%s 断开了，借用结束了",
	"locator.name":       "这个任务的经过",
	"locator.brief":      "交给它的事",
	"locator.quiet":      "%d 条提示",
	// D325: the locator's list: a report, the marks of a session, what someone sent without words.
	"locator.report":      "交回了进展",
	"locator.compacted":   "压缩了上下文",
	"locator.switched":    "换了做事的 AI agent",
	"locator.moved":       "换到另一台电脑上接着做",
	"locator.interrupted": "中断了",
	"locator.media":       "发了图片或文件",
	"locator.ask":         "问了你",
	"turn.go":             "你点了「%s」",
	"group.more":          "还有 %d 步",
}

var enLoop = Table{
	"text.all":            "Show all (%s characters)",
	"end.wait":            "Back at %s",
	"end.wait.bare":       "Waiting: %s",
	"wake.over":           "Wait over",
	"locator.wakes":       "Wait over %d times",
	"wake.timer":          "Time's up",
	"told.lent":           "You lent it your %s",
	"told.returned":       "Handed back to it",
	"told.returned.name":  "%s is back for it",
	"told.declined":       "You didn't lend it your phone",
	"told.stopped":        "You stopped it",
	"told.reopened":       "You reopened this task",
	"told.adopted":        "Picked up in Ducter",
	"told.other":          "%s gave it a note",
	"told.looked":         "Another AI (%s) looked it over and asked for a fix",
	"told.taken_back":     "You took back your %s",
	"told.given_back":     "It gave your %s back",
	"told.loan_lost":      "Lost your %s; the loan ended",
	"locator.name":        "What happened in this task",
	"locator.brief":       "The task it was given",
	"locator.quiet":       "%d notes",
	"locator.report":      "Reported back",
	"locator.compacted":   "Context compacted",
	"locator.switched":    "Switched who does it",
	"locator.moved":       "Moved to another computer",
	"locator.interrupted": "Interrupted",
	"locator.media":       "Sent pictures or files",
	"locator.ask":         "Asked you",
	"turn.go":             "You chose “%s”",
	"group.more":          "%d more steps",
}

func init() {
	for k, v := range zhLoop {
		zh[k] = v
	}
	for k, v := range enLoop {
		en[k] = v
	}
}
