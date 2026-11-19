package i18n

// D383: 给你做的 / Made for you, Past tasks' middle tab (design/made.md). The
// same keys and words as the web client (apps/web/src/i18n-past.ts).

var zhMade = Table{
	"made.tab":         "给你做的",
	"made.line":        "%s 给你做的文件、图片、表格和链接，聊天里做的也在这里。",
	"made.find":        "名字、PDF、表格、截图、哪天…",
	"made.all":         "全部",
	"made.c.file":      "文件",
	"made.c.picture":   "图片",
	"made.c.table":     "表格",
	"made.c.chart":     "图表",
	"made.c.list":      "清单",
	"made.c.link":      "链接",
	"made.k.file":      "文件",
	"made.k.picture":   "图片",
	"made.k.table":     "表格",
	"made.k.chart":     "图表",
	"made.k.list":      "清单",
	"made.k.link":      "链接",
	"made.from":        "来自「%s」",
	"made.asked":       "你问的：%s",
	"made.inconv":      "在对话里",
	"made.pinned":      "已置顶",
	"made.task":        "看那件事",
	"made.hit.task":    "那件事",
	"made.hit.ask":     "你问的",
	"made.hit.content": "里面有",
	"made.hit.report":  "它说过",
	"made.n":           "找到 %d 个",
	"made.none":        "没找到。换几个字，或者直接问%s。",
	"made.empty":       "还没有给你做的东西。让%s查点什么、做个表格，做好的会在这里。",
}

var enMade = Table{
	"made.tab":         "Made for you",
	"made.line":        "The files, pictures, tables and links %s made for you, including the ones in your chats.",
	"made.find":        "A name, a PDF, a table, a day…",
	"made.all":         "All",
	"made.c.file":      "Files",
	"made.c.picture":   "Pictures",
	"made.c.table":     "Tables",
	"made.c.chart":     "Charts",
	"made.c.list":      "Lists",
	"made.c.link":      "Links",
	"made.k.file":      "File",
	"made.k.picture":   "Picture",
	"made.k.table":     "Table",
	"made.k.chart":     "Chart",
	"made.k.list":      "List",
	"made.k.link":      "Link",
	"made.from":        "From “%s”",
	"made.asked":       "You asked: %s",
	"made.inconv":      "In the conversation",
	"made.pinned":      "Pinned",
	"made.task":        "See the task",
	"made.hit.task":    "Task",
	"made.hit.ask":     "You asked",
	"made.hit.content": "Inside",
	"made.hit.report":  "It said",
	"made.n":           "%d found",
	"made.none":        "Nothing found. Try other words, or just ask %s.",
	"made.empty":       "Nothing made for you yet. Ask %s to look something up or make a table, and it shows up here.",
}

func init() {
	for k, v := range zhMade {
		zh[k] = v
	}
	for k, v := range enMade {
		en[k] = v
	}
}
