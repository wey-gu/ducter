package i18n

// D436: 跑腿到付款 / An errand to the checkout (design/errand.md): the 去付款
// card, the live view while the person pays, a step on a page that's theirs.
// The web client carries the same keys (apps/web/src/i18n-errand.ts).

var zhErrand = Table{
	"co.title":           "到 %s 的付款这一步了",
	"co.what":            "买什么",
	"co.total":           "一共",
	"co.where":           "在哪",
	"co.more":            "还有 %d 样",
	"co.why":             "Ducter 不会替你点付款，付款这一下是你自己的。",
	"co.pic":             "付款页现在的样子",
	"co.go":              "去付款",
	"co.hold":            "暂不购买",
	"co.resolved":        "你付好了",
	"co.resolved.hold":   "已暂缓购买",
	"co.live.title":      "在 %s 付款",
	"co.live.band":       "轮到你付款了。它看不见这个页面，也不会替你点。",
	"co.live.notyet":     "还没付",
	"co.live.paid":       "付好了",
	"step.title":         "%s 这一步要你来",
	"step.why":           "你来做这一步。做的时候它看不见这个页面。",
	"step.open":          "去处理",
	"step.later":         "以后再说",
	"step.resolved":      "做好了",
	"step.resolved.hold": "暂不处理",
	"step.live.done":     "好了",
}

var enErrand = Table{
	"co.title":           "Ready to pay on %s",
	"co.what":            "What",
	"co.total":           "Total",
	"co.where":           "Where",
	"co.more":            "%d more",
	"co.why":             "Ducter never presses pay. That tap is yours.",
	"co.pic":             "The checkout page as it is now",
	"co.go":              "Go to checkout",
	"co.hold":            "Not now",
	"co.resolved":        "You paid",
	"co.resolved.hold":   "Purchase on hold",
	"co.live.title":      "Paying on %s",
	"co.live.band":       "Your turn to pay. It can't see this page and won't press anything.",
	"co.live.notyet":     "Not yet",
	"co.live.paid":       "I've paid",
	"step.title":         "Your step on %s",
	"step.why":           "You do this step. While you do, it can't see the page.",
	"step.open":          "Do it",
	"step.later":         "Not now",
	"step.resolved":      "Done",
	"step.resolved.hold": "Not now",
	"step.live.done":     "Done",
}

func init() {
	for k, v := range zhErrand {
		zh[k] = v
	}
	for k, v := range enErrand {
		en[k] = v
	}
}
