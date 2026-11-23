package i18n

// D307: the Settings rows the last lanes left on their own surfaces: a
// pasted key in Settings › Partner and on the home's card in Devices
// (D298), when a limit runs out (D297), and what the person's own AI
// agents keep: the first words' looking and Past tasks' hidden agents
// (D298, D299). The same keys and words as the web
// (apps/web/src/i18n-settings.ts). No " · " joins (D291).

var zhSettingsMore = Table{
	"key.settings.row":         "贴一个 API 密钥",
	"records.title":            "你的 AI agent 留下的记录",
	"records.look":             "读它们留下的记录",
	"records.look.help":        "在「做过的事」里列出它们在 %s 上的对话；你让它看看时，也从中找接着做的事。只读名字、文件夹、时间和你说的第一句与最后一句，密钥一律遮住。关掉后，看到的也一并忘掉。",
	"records.past.note":        "它们的对话在「做过的事」里，点一下就能接着做。",
	"records.hidden":           "%s 的对话不在「做过的事」里显示",
	"records.folder":           "这个文件夹不看",
	"records.show":             "再显示",
	"said.records.on":          "好，又会读这些记录了，「做过的事」里能看到它们。",
	"said.records.off":         "好，以后不再看这些记录，看到的也忘了。",
	"said.records.shown":       "好，%s 的对话又会在「做过的事」里了。",
	"said.records.folder":      "好，%s 又会看了。",
	"handoff.title":            "额度用完的时候",
	"handoff.row":              "直接换别的 AI agent 接着做",
	"handoff.help":             "不等额度恢复，同一台电脑上的另一个接着做。",
	"said.handoff.on":          "好，额度用完时我直接换别的 AI agent 接着做。",
	"said.handoff.off":         "好，额度用完时我等它恢复，再接着做。",
	"density.title":            "打开的任务",
	"density.help":             "紧凑：头像缩到标题旁边，一屏多看几行；⌘⇧D 随时切换。",
	"density.comfortable":      "宽松",
	"density.compact":          "紧凑",
	"density.said.compact":     "打开的任务排紧凑了，⌘⇧D 换回。",
	"density.said.comfortable": "打开的任务恢复宽松了。",
}

var enSettingsMore = Table{
	"key.settings.row":         "Paste an API key",
	"records.title":            "What your AI agents keep",
	"records.look":             "Read what they keep",
	"records.look.help":        "Lists their conversations on %s in Past tasks, and finds what to pick up when you ask it to look. Only names, folders, times and your first and last words are read, keys hidden. Off, what it saw is forgotten too.",
	"records.past.note":        "Their conversations are in Past tasks, ready to carry on.",
	"records.hidden":           "%s's conversations aren't shown in Past tasks",
	"records.folder":           "This folder is left out",
	"records.show":             "Show again",
	"said.records.on":          "Got it: I'll read those records again, and they're back in Past tasks.",
	"said.records.off":         "Fine: I won't look at those records again, and I've forgotten what I saw.",
	"said.records.shown":       "Got it: %s's conversations are back in Past tasks.",
	"said.records.folder":      "Got it: %s is back in.",
	"handoff.title":            "When a limit runs out",
	"handoff.row":              "Hand it to another AI agent right away",
	"handoff.help":             "No waiting for the reset: another one on the same computer carries on.",
	"said.handoff.on":          "Got it: when a limit runs out, I'll hand the task to another AI agent right away.",
	"said.handoff.off":         "Got it: when a limit runs out, I'll wait for it to come back and carry on.",
	"density.title":            "An opened task",
	"density.help":             "Compact puts the face small beside the title, so more fits on screen; ⌘⇧D switches any time.",
	"density.comfortable":      "Comfortable",
	"density.compact":          "Compact",
	"density.said.compact":     "Opened tasks are compact now. ⌘⇧D switches back.",
	"density.said.comfortable": "Opened tasks are comfortable again.",
}

func init() {
	for k, v := range zhSettingsMore {
		zh[k] = v
	}
	for k, v := range enSettingsMore {
		en[k] = v
	}
}
