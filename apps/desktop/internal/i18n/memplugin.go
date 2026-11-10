package i18n

// D169: Nowledge Mem in the user's own AI agents, one line per agent in a
// device card, 装上 / Install with its confirm, and Ducter's one card.
// Glossary: design/product-model.md.
var zhMemPlugin = Table{
	"memp.installed":       "Nowledge Mem 已装 · %s",
	"memp.installed.bare":  "Nowledge Mem 已装",
	"memp.absent":          "Nowledge Mem 没装",
	"memp.update":          "Nowledge Mem 有新版",
	"memp.review.multiple": "Nowledge Mem 装了不止一份，要看一下",
	"memp.review.unclear":  "说不好 Nowledge Mem 装好没有，要看一下",
	"memp.setting":         "正在装 Nowledge Mem…",
	"memp.btn.install":     "装上",
	"memp.btn.update":      "更新",
	"memp.btn.review":      "理一下",
	"memp.ask":             "在 %[2]s 上给 %[1]s 装上 Nowledge Mem？",
	"memp.means":           "会在 %[2]s 上开一件事，照 Nowledge Mem 的官方说明来装：只改 %[1]s 自己的设置，不动 Ducter。装好以后，重开 %[1]s 才用得上。",
	"memp.ok":              "装上",
	"memp.cancel":          "算了",
	"memp.why.offline":     "那台电脑现在连不上。",
	"memp.why.no_agent":    "那台电脑上没有登录着的 AI，没法替你装。",
	"memp.why.running":     "已经在装了。",
	"memp.why.off":         "记性关着：打开「记住事情」再装。",
	"memp.why.unknown":     "出了点问题，再试一次。",
	"memp.why.failed":      "出了点问题，再试一次。",
	"memp.card.question":   "%[2]s 上的 %[1]s 还没装 Nowledge Mem。装上以后，我在那儿做事和你自己用 %[1]s 时都记得你；会改 %[1]s 自己的设置。",
	"memp.card.go":         "装上",
	"memp.card.hold":       "先不装",
}

var enMemPlugin = Table{
	"memp.installed":       "Nowledge Mem %s installed",
	"memp.installed.bare":  "Nowledge Mem installed",
	"memp.absent":          "Nowledge Mem not installed",
	"memp.update":          "Nowledge Mem has an update",
	"memp.review.multiple": "Nowledge Mem is installed more than once; worth a look",
	"memp.review.unclear":  "Can't tell if Nowledge Mem is set up; worth a look",
	"memp.setting":         "Installing Nowledge Mem…",
	"memp.btn.install":     "Install",
	"memp.btn.update":      "Update",
	"memp.btn.review":      "Sort it out",
	"memp.ask":             "Install Nowledge Mem for %[1]s on %[2]s?",
	"memp.means":           "A task on %[2]s follows Nowledge Mem's own setup guide. It changes only %[1]s's own settings, nothing of Ducter's. Start %[1]s again afterwards to use it.",
	"memp.ok":              "Install",
	"memp.cancel":          "Cancel",
	"memp.why.offline":     "That computer can't be reached right now.",
	"memp.why.no_agent":    "No AI is signed in on that computer to do it.",
	"memp.why.running":     "It's already installing.",
	"memp.why.off":         "Memory is off: turn on Remember things first.",
	"memp.why.unknown":     "Something went wrong; try again.",
	"memp.why.failed":      "Something went wrong; try again.",
	"memp.card.question":   "%[1]s on %[2]s doesn't have Nowledge Mem. With it, my work there and your own %[1]s sessions both remember you; it changes %[1]s's own settings.",
	"memp.card.go":         "Install",
	"memp.card.hold":       "Not now",
}

func init() {
	for k, v := range zhMemPlugin {
		zh[k] = v
	}
	for k, v := range enMemPlugin {
		en[k] = v
	}
}
