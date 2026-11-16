package i18n

// D298: the partner's first words (what they were read from, and 别再看了 /
// Stop looking) and a pasted API key, in the first run and in the
// conversation. The partner's own words for a key's result come from the
// home (packages/protocol/src/api-keys.ts keyWords). Glossary:
// design/product-model.md, "API key" and "First words".

var zhFirstWords = Table{
	"first.from":             "从这台电脑上你的 %s 留下的记录里看到的：只在这里读，只给你看。",
	"first.from.and":         " 和 ",
	"first.stop":             "别再看了",
	"first.stopped":          "好，以后不再看这些记录。",
	"first.again":            "还是看吧",
	"key.paste.title":        "贴一个 API 密钥，我就能开始",
	"key.paste.body":         "DeepSeek、Kimi、智谱 GLM、OpenAI、Anthropic、OpenRouter 的密钥都行。它只存在这台电脑上的 Ducter 里，不进聊天记录。",
	"key.paste.field":        "API 密钥",
	"key.paste.eg":           "sk-…",
	"key.paste.check":        "检查",
	"key.paste.checking":     "在检查…",
	"key.paste.install":      "在终端里装上 pi",
	"key.paste.instead":      "或者，贴一个 API 密钥",
	"key.paste.instead.note": "不用订阅：按用量付费的密钥也行。",
	"key.paste.back":         "收起",
	"setup.ready.sep":        "、",
	"key.paste.check.open":   "贴密钥",
	"key.paste.failed":       "没检查成：%s",
}

var enFirstWords = Table{
	"first.from":             "Found in what your %s keep on this computer: read here, shown only to you.",
	"first.from.and":         " and ",
	"first.stop":             "Stop looking",
	"first.stopped":          "Fine, I won't look at those records again.",
	"first.again":            "Look again",
	"key.paste.title":        "Paste an API key and I can start",
	"key.paste.body":         "A key from DeepSeek, Kimi, Zhipu GLM, OpenAI, Anthropic or OpenRouter works. It stays in Ducter on this computer, never in the conversation.",
	"key.paste.field":        "API key",
	"key.paste.eg":           "sk-…",
	"key.paste.check":        "Check",
	"key.paste.checking":     "Checking…",
	"key.paste.install":      "Install pi in Terminal",
	"key.paste.instead":      "Or paste an API key",
	"key.paste.instead.note": "No subscription needed: a key you pay for by use works too.",
	"key.paste.back":         "Hide",
	"setup.ready.sep":        ", ",
	"key.paste.check.open":   "Paste a key",
	"key.paste.failed":       "The check didn't go through: %s",
}

func init() {
	for k, v := range zhFirstWords {
		zh[k] = v
	}
	for k, v := range enFirstWords {
		en[k] = v
	}
}
