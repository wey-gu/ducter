package i18n

// D198: 打开 / Open on an opened task: its working copy in Finder, a
// Terminal or an editor on this Mac. Glossary: design/product-model.md.
var zhOpenIn = Table{
	"task.open":          "打开",
	"task.open.about":    "打开它的工作副本",
	"task.open.finder":   "在 Finder 中显示",
	"task.open.terminal": "在终端打开",
	"task.open.editor":   "用 %s 打开",
	"task.open.failed":   "没能打开：%s",
	"task.folder.about":  "工作副本：%s",
}

var enOpenIn = Table{
	"task.open":          "Open",
	"task.open.about":    "Open its working copy",
	"task.open.finder":   "Show in Finder",
	"task.open.terminal": "Open in Terminal",
	"task.open.editor":   "Open in %s",
	"task.open.failed":   "Couldn't open it: %s",
	"task.folder.about":  "Working copy: %s",
}

func init() {
	for k, v := range zhOpenIn {
		zh[k] = v
	}
	for k, v := range enOpenIn {
		en[k] = v
	}
}
