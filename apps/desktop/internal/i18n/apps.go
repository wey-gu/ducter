package i18n

// D405: 小应用 / Apps (design/apps.md). The same keys and words as the web
// client (apps/web/src/i18n-apps.ts).

var zhApps = Table{
	"app.made":      "%s给你做的小应用，放在「给你做的」里，随时再打开。",
	"app.changed":   "改好了",
	"app.filled":    "填好了",
	"app.gone":      "这个小应用已经删掉了。",
	"app.open":      "打开",
	"app.back":      "改回去",
	"app.opening":   "正在打开…",
	"app.ask.ph":    "让%s改这个小应用…",
	"app.ask.send":  "发送",
	"app.ask.sent":  "发给%s了，改好会在这里刷新。",
	"app.ask.limit": "这个小应用这一小时问得太多了，过会儿再试。",
	"app.ask.busy":  "它上一个问题还在等回答。",
	"app.ask.go":    "这件事要你在和%s的对话里点「好」才会做。",
	"app.only":      "不联网；它要问的都经过%s。",
	"app.updated":   "%s 更新",
	"app.asks":      "「%s」问",
	"app.about":     "关于「%s」",
	"made.c.app":    "小应用",
	"made.k.app":    "小应用",
}

var enApps = Table{
	"app.made":      "An app %s made for you. It stays in Made for you; open it any time.",
	"app.changed":   "Changed",
	"app.filled":    "Filled in",
	"app.gone":      "This app was deleted.",
	"app.open":      "Open",
	"app.back":      "Undo the change",
	"app.opening":   "Opening…",
	"app.ask.ph":    "Ask %s to change it…",
	"app.ask.send":  "Send",
	"app.ask.sent":  "Sent to %s. It refreshes here once it's changed.",
	"app.ask.limit": "This app asked too often this hour. Try again later.",
	"app.ask.busy":  "Its last question is still waiting for an answer.",
	"app.ask.go":    "This waits for your Go in your conversation with %s.",
	"app.only":      "No internet. What it asks goes through %s.",
	"app.updated":   "Updated %s",
	"app.asks":      "“%s” asks",
	"app.about":     "About “%s”",
	"made.c.app":    "Apps",
	"made.k.app":    "App",
}

func init() {
	for k, v := range zhApps {
		zh[k] = v
	}
	for k, v := range enApps {
		en[k] = v
	}
}
