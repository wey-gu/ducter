package i18n

// D303: rich answers in the conversation; D381: 置顶 / Pin. The same keys
// and words as the web's (apps/web/src/i18n-rich.ts); its test keeps them
// equal.

var zhRich = Table{
	"rich.table":       "表格",
	"rich.choices":     "选一个回复",
	"rich.tell":        "报一下进度",
	"rich.told.all":    "都勾好了。",
	"rich.told.none":   "还一个都没勾。",
	"rich.told.both":   "勾好了：%s。还没：%s。",
	"rich.join":        "、",
	"pin.pin":          "置顶",
	"pin.pin.about":    "置顶「%s」",
	"pin.pinned":       "已置顶",
	"pin.title":        "置顶",
	"pin.open":         "打开置顶的「%s」",
	"pin.more":         "还有 %d 个",
	"pin.progress":     "%d/%d",
	"pin.unpin":        "取消置顶",
	"pin.unpinned":     "取消置顶了：%s",
	"pin.undo":         "撤销",
	"pin.updated":      "%s 更新",
	"pin.at":           "%s 置顶",
	"pin.hint":         "让 %s 改：说“清单里加上……”，它就改在这里。",
	"pin.refused.full": "最多置顶 %d 个。先取消一个再置顶。",
	"pin.refused.gone": "这条找不到了。",
	"pin.refused.kind": "这种不能置顶。",
}

var enRich = Table{
	"rich.table":       "Table",
	"rich.choices":     "Pick a reply",
	"rich.tell":        "Send progress",
	"rich.told.all":    "All done.",
	"rich.told.none":   "Nothing ticked yet.",
	"rich.told.both":   "Done: %s. Not yet: %s.",
	"rich.join":        ", ",
	"pin.pin":          "Pin",
	"pin.pin.about":    "Pin “%s”",
	"pin.pinned":       "Pinned",
	"pin.title":        "Pinned",
	"pin.open":         "Open pinned “%s”",
	"pin.more":         "%d more",
	"pin.progress":     "%d/%d",
	"pin.unpin":        "Unpin",
	"pin.unpinned":     "Unpinned: %s",
	"pin.undo":         "Undo",
	"pin.updated":      "Updated %s",
	"pin.at":           "Pinned %s",
	"pin.hint":         "To change it, tell %s (“add … to the list”) and it changes here.",
	"pin.refused.full": "Up to %d can be pinned. Unpin one first.",
	"pin.refused.gone": "That one can't be found anymore.",
	"pin.refused.kind": "This kind can't be pinned.",
}

func init() {
	for k, v := range zhRich {
		zh[k] = v
	}
	for k, v := range enRich {
		en[k] = v
	}
}
