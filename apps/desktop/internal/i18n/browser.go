package i18n

// D190: 看它上网 / Watch it browse, and taking turns in Ducter's own browser.
// The same keys and words as the phone (apps/web/src/i18n.ts). Glossary:
// design/product-model.md (换我来 / My turn, 还给它 / Hand it back).
var zhBrowser = Table{
	"live.watch":          "查看",
	"live.watch.title":    "看它上网",
	"live.using":          "%s 正在用它",
	"live.on":             "在 %s 上",
	"live.myturn":         "接手",
	"live.handback":       "还给它",
	"live.close":          "关闭",
	"live.forward":        "前进",
	"live.yourturn":       "现在你在用。它看不见这个页面，也不会动它。",
	"live.yourturn.short": "你在用 · 它看不见",
	"live.elsewhere":      "你正在另一台设备上用它",
	"live.nopage":         "它还没打开网页。一打开，这里就能看到。",
	"live.address":        "网址",
	"live.address.hint":   "输入网址",
	"live.badurl":         "这里只能打开 http 或 https 的网页",
	"live.doing.open":     "正在打开 %s",
	"live.doing.read":     "正在看这一页",
	"live.doing.click":    "正在点「%s」",
	"live.doing.click.0":  "正在点",
	"live.doing.type":     "正在填写「%s」",
	"live.doing.type.0":   "正在输入",
	"live.doing.press":    "正在按 %s",
	"live.doing.scroll":   "正在翻页",
	"live.doing.back":     "正在后退",
	"live.doing.tab":      "切换到了另一个标签页",
	"live.doing.shot":     "正在截图",
}

var enBrowser = Table{
	"live.watch":          "Watch",
	"live.watch.title":    "Watch it browse",
	"live.using":          "%s is using it",
	"live.on":             "on %s",
	"live.myturn":         "My turn",
	"live.handback":       "Hand it back",
	"live.close":          "Close",
	"live.forward":        "Forward",
	"live.yourturn":       "It's your turn. It can't see this page or touch it.",
	"live.yourturn.short": "Your turn · it can't see this",
	"live.elsewhere":      "You're using it on another device",
	"live.nopage":         "It hasn't opened a page yet. You'll see it here as soon as it does.",
	"live.address":        "Web address",
	"live.address.hint":   "Type a web address",
	"live.badurl":         "Only http and https pages open here",
	"live.doing.open":     "Opening %s",
	"live.doing.read":     "Reading the page",
	"live.doing.click":    "Clicking “%s”",
	"live.doing.click.0":  "Clicking",
	"live.doing.type":     "Typing in “%s”",
	"live.doing.type.0":   "Typing",
	"live.doing.press":    "Pressing %s",
	"live.doing.scroll":   "Scrolling",
	"live.doing.back":     "Going back",
	"live.doing.tab":      "Switched tabs",
	"live.doing.shot":     "Taking a screenshot",
}

func init() {
	for k, v := range zhBrowser {
		zh[k] = v
	}
	for k, v := range enBrowser {
		en[k] = v
	}
}
