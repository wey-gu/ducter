package i18n

// D303: rich answers in the conversation. The same keys and words as the
// web's (apps/web/src/i18n-rich.ts); its test keeps them equal.

var zhRich = Table{
	"rich.table":     "表格",
	"rich.choices":   "选一个回复",
	"rich.tell":      "报一下进度",
	"rich.told.all":  "都勾好了。",
	"rich.told.none": "还一个都没勾。",
	"rich.told.both": "勾好了：%s。还没：%s。",
	"rich.join":      "、",
}

var enRich = Table{
	"rich.table":     "Table",
	"rich.choices":   "Pick a reply",
	"rich.tell":      "Send progress",
	"rich.told.all":  "All done.",
	"rich.told.none": "Nothing ticked yet.",
	"rich.told.both": "Done: %s. Not yet: %s.",
	"rich.join":      ", ",
}

func init() {
	for k, v := range zhRich {
		zh[k] = v
	}
	for k, v := range enRich {
		en[k] = v
	}
}
