package i18n

// D254: keeping your place in the conversation, and copying from it. The
// web uses the same keys and words (apps/web/src/i18n-conv.ts); a test
// keeps them equal.

var zhConv = Table{
	"conv.new.n":        "%s 条新消息",
	"conv.new.one":      "1 条新消息",
	"conv.new.label":    "回到新消息，%s 条",
	"conv.divider":      "新消息",
	"conv.older":        "正在载入更早的消息",
	"conv.copied":       "已拷贝",
	"conv.copy.failed":  "没能拷贝。用「选择文字」自己选一下。",
	"conv.copy.link":    "拷贝链接",
	"conv.select":       "选择文字",
	"conv.select.done":  "完成",
	"conv.select.all":   "全部拷贝",
	"conv.log":          "和 %s 的对话",
	"day.after.task":    "做完了「%s」",
	"day.after.keep":    "开始看守「%s」",
	"day.after.account": "连上了 %s",
	"day.after.chat":    "接上了 %s",
	"day.after.app":     "做好了「%s」",
	"day.after.yes":     "好，每天早上",
	"day.after.no":      "不用了",
}

var enConv = Table{
	"conv.new.n":        "%s new messages",
	"conv.new.one":      "1 new message",
	"conv.new.label":    "Go to new messages, %s",
	"conv.divider":      "New messages",
	"conv.older":        "Loading earlier messages",
	"conv.copied":       "Copied",
	"conv.copy.failed":  "Couldn't copy. Use Select text to pick the words yourself.",
	"conv.copy.link":    "Copy link",
	"conv.select":       "Select text",
	"conv.select.done":  "Done",
	"conv.select.all":   "Copy all",
	"conv.log":          "Conversation with %s",
	"day.after.task":    "Finished “%s”",
	"day.after.keep":    "Started looking after “%s”",
	"day.after.account": "Connected %s",
	"day.after.chat":    "Connected %s",
	"day.after.app":     "Made “%s”",
	"day.after.yes":     "Yes, each morning",
	"day.after.no":      "No thanks",
}

func init() {
	for k, v := range zhConv {
		zh[k] = v
	}
	for k, v := range enConv {
		en[k] = v
	}
}
