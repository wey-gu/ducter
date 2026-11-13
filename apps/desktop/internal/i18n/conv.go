package i18n

// D254: keeping your place in the conversation, and copying from it. The
// web uses the same keys and words (apps/web/src/i18n-conv.ts); a test
// keeps them equal.

var zhConv = Table{
	"conv.new.n":       "%s 条新消息",
	"conv.new.one":     "1 条新消息",
	"conv.new.label":   "回到新消息，%s 条",
	"conv.divider":     "新消息",
	"conv.copied":      "已拷贝",
	"conv.copy.failed": "没能拷贝。用「选择文字」自己选一下。",
	"conv.copy.link":   "拷贝链接",
	"conv.select":      "选择文字",
	"conv.select.done": "完成",
	"conv.select.all":  "全部拷贝",
	"conv.log":         "和 %s 的对话",
}

var enConv = Table{
	"conv.new.n":       "%s new messages",
	"conv.new.one":     "1 new message",
	"conv.new.label":   "Go to new messages, %s",
	"conv.divider":     "New messages",
	"conv.copied":      "Copied",
	"conv.copy.failed": "Couldn't copy. Use Select text to pick the words yourself.",
	"conv.copy.link":   "Copy link",
	"conv.select":      "Select text",
	"conv.select.done": "Done",
	"conv.select.all":  "Copy all",
	"conv.log":         "Conversation with %s",
}

func init() {
	for k, v := range zhConv {
		zh[k] = v
	}
	for k, v := range enConv {
		en[k] = v
	}
}
