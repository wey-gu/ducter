package i18n

// D360: 分组 / Groups on On hand: several tasks that are one piece of work,
// one card, run one after another. The same keys and words as the web client
// (apps/web/src/i18n-groups.ts); apps/web/test/groups.test.ts keeps them equal.
// D430: no counter noun: a part is named by its own words, and the count is
// the conversation's (asks.count).

var zhGroups = Table{
	"group.line":                 "一个做完接下一个",
	"group.side":                 "同时做",
	"group.held":                 "排着",
	"group.held.on":              "排着，在 %s 上做",
	"group.more.tasks":           "还有 %d 个",
	"group.menu":                 "这个分组",
	"group.rename":               "改名",
	"group.rename.keys":          "回车保存，Esc 取消",
	"group.toSide":               "改成同时做",
	"group.toLine":               "改成一个做完接下一个",
	"group.ungroup":              "取消分组（任务都留着）",
	"group.out":                  "移出这个分组",
	"group.up":                   "提前",
	"group.make":                 "放进一个分组",
	"group.make.name":            "分组的名字",
	"group.make.go":              "放进去",
	"group.stopped.failed":       "「%[1]s」没做成，「%[2]s」在等你决定。",
	"group.stopped.failed.many":  "「%s」没做成，后面的都在等你决定。",
	"group.stopped.dropped":      "「%[1]s」放下了，「%[2]s」在等你决定。",
	"group.stopped.dropped.many": "「%s」放下了，后面的都在等你决定。",
	"group.go":                   "不管它，往下做",
	"group.drop":                 "后面的不做了",
	"group.retry":                "再试一次",
	// D454: 移走 / Remove a finished card or group from Tasks.
	"away.remove":       "移走",
	"away.remove.about": "从任务里移走「%s」",
	"away.more":         "「%s」还能做的",
	"away.retry":        "再试一次",
	"away.why":          "看看为什么",
	"away.open":         "打开",
	"away.done":         "移走了「%s」，做过的事里还找得到",
}

var enGroups = Table{
	"group.line":                 "One after another",
	"group.side":                 "Side by side",
	"group.held":                 "In line",
	"group.held.on":              "In line, on %s",
	"group.more.tasks":           "%d more",
	"group.menu":                 "This group",
	"group.rename":               "Rename",
	"group.rename.keys":          "Enter to keep, Esc to cancel",
	"group.toSide":               "Run side by side",
	"group.toLine":               "Run one after another",
	"group.ungroup":              "Ungroup (the tasks stay)",
	"group.out":                  "Take out of the group",
	"group.up":                   "Move up",
	"group.make":                 "Put in a group",
	"group.make.name":            "The group's name",
	"group.make.go":              "Put them in",
	"group.stopped.failed":       "“%[1]s” didn't work out; “%[2]s” is waiting for you.",
	"group.stopped.failed.many":  "“%s” didn't work out; the rest are waiting for you.",
	"group.stopped.dropped":      "“%[1]s” was put down; “%[2]s” is waiting for you.",
	"group.stopped.dropped.many": "“%s” was put down; the rest are waiting for you.",
	"group.go":                   "Skip it, go on",
	"group.drop":                 "Drop the rest",
	"group.retry":                "Try it again",
	"away.remove":                "Remove",
	"away.remove.about":          "Remove “%s” from Tasks",
	"away.more":                  "More for “%s”",
	"away.retry":                 "Try again",
	"away.why":                   "See why",
	"away.open":                  "Open",
	"away.done":                  "Removed “%s”. It's still in Past tasks.",
}

func init() {
	for k, v := range zhGroups {
		zh[k] = v
	}
	for k, v := range enGroups {
		en[k] = v
	}
}
