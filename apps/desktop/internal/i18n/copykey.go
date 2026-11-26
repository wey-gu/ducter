package i18n

// D539: 复制密钥 / Copy a key, and Ducter 存着的密钥 / Keys Ducter keeps on
// each computer's card. The same keys and words as the web
// (apps/web/src/i18n-autofill.ts).

var zhCopyKey = Table{
	"copykey.title":       "把 %[2]s 上的 %[1]s 复制到 %[3]s？",
	"copykey.from":        "来自",
	"copykey.to":          "复制到",
	"copykey.note":        "只给 Ducter 的任务用，不显示，不进聊天记录。",
	"copykey.go":          "复制",
	"copykey.retry":       "再试一次",
	"copykey.hold":        "以后再说",
	"copykey.copying":     "正在复制…",
	"copykey.done":        "已复制到 %s",
	"copykey.held":        "没有复制",
	"copykey.failed":      "没能复制到 %s：%s",
	"copykey.why.offline": "它现在没连上",
	"copykey.why.old":     "它上面的 Ducter 还不能存密钥，更新一下就行",
	"copykey.why.gone":    "原来那台电脑上已经找不到它了",
	"copykey.why.failed":  "没有成功",
	"copykey.and":         " 和 ",
	"kept.title":          "Ducter 存着的密钥",
	"kept.count":          "%d 个",
	"kept.lede":           "只给 Ducter 在这台电脑上的任务用，锁着存在这台电脑上，谁也看不到内容。",
	"kept.from":           "从 %s 复制来",
	"kept.remove":         "删掉",
	"kept.remove.sure":    "确定删掉",
	"kept.none":           "还没有。这台电脑上的任务要用另一台电脑上的密钥时，Ducter 会问你要不要复制过来。",
	"kept.offline":        "它现在没连上，连上后能看到。",
	"kept.old":            "这台电脑上的 Ducter 还不能存密钥，更新一下就行。",
	"kept.failed":         "现在读不到，等会儿再看。",
}

var enCopyKey = Table{
	"copykey.title":       "Copy %[1]s from %[2]s to %[3]s?",
	"copykey.from":        "From",
	"copykey.to":          "To",
	"copykey.note":        "Only for Ducter's tasks there. Never shown, never in the conversation.",
	"copykey.go":          "Copy",
	"copykey.retry":       "Try again",
	"copykey.hold":        "Not now",
	"copykey.copying":     "Copying…",
	"copykey.done":        "Copied to %s",
	"copykey.held":        "Not copied",
	"copykey.failed":      "Couldn't copy to %s: %s",
	"copykey.why.offline": "it isn't connected now",
	"copykey.why.old":     "Ducter there can't keep keys yet; update it first",
	"copykey.why.gone":    "it's no longer on the computer it came from",
	"copykey.why.failed":  "it didn't go through",
	"copykey.and":         " and ",
	"kept.title":          "Keys Ducter keeps",
	"kept.count":          "%d",
	"kept.lede":           "Only for Ducter's tasks on this computer, locked on it. Nobody can see what they hold.",
	"kept.from":           "Copied from %s",
	"kept.remove":         "Remove",
	"kept.remove.sure":    "Remove it",
	"kept.none":           "None yet. When a task here needs a key that's on another of your computers, Ducter asks whether to copy it.",
	"kept.offline":        "It isn't connected now; the list shows once it is.",
	"kept.old":            "Ducter on this computer can't keep keys yet; update it first.",
	"kept.failed":         "Can't read it right now; look again in a moment.",
}

func init() {
	for k, v := range zhCopyKey {
		zh[k] = v
	}
	for k, v := range enCopyKey {
		en[k] = v
	}
}
