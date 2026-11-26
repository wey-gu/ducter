package i18n

// D456: the opened task's header (where it sits among what is on hand, the
// steps to the one before and after) and 键盘 / Keyboard, the sheet of every
// key (⌘/). The web mirrors this table whole (apps/web/src/i18n-taskview.ts;
// apps/web/test/words.test.ts keeps them equal).

var zhTaskview = Table{
	"tv.prev": "上一个任务",
	"tv.next": "下一个任务",
	"tv.pos":  "第 %d 个，共 %d 个",
	// D542: the opened task's state Tag, in D525's register.
	"task.tag.needs_you": "待你处理",
	// D544: the line that keeps a task in rounds who it is while its transcript is read.
	"loop.round":          "第 %d 轮",
	"loop.top":            "回到开头",
	"loop.quiet":          "又看过 %d 次，都没有变化，%s 到 %s",
	"task.tag.working":    "进行中",
	"task.tag.queued":     "还没开始",
	"task.tag.blocked":    "等待中",
	"task.tag.done":       "已完成",
	"task.tag.failed":     "没完成",
	"task.tag.dropped":    "已取消",
	"task.tag.superseded": "换到别处接着做了",
	"keys.title":          "键盘",
	"keys.menu":           "键盘…",
	"keys.g.any":          "在哪儿都能用",
	"keys.g.task":         "打开一个任务时",
	"keys.g.find":         "找什么都行里",
	"keys.find":           "找什么都行",
	"keys.new":            "新任务",
	"keys.conv":           "对话",
	"keys.onhand":         "任务",
	"keys.devices":        "设备",
	"keys.past":           "做过的事",
	"keys.settings":       "设置",
	"keys.nth":            "任务里的第 1 到第 9 个",
	"keys.partner":        "第 1 到第 4 个伙伴",
	"keys.walk":           "上一个、下一个任务",
	"keys.bench":          "工作台",
	"keys.up":             "回到上一层",
	"keys.this":           "这张表",
	"keys.density":        "打开的任务：宽松或紧凑",
	"keys.rows":           "上下移动（方向键也行）",
	"keys.open":           "打开",
	"keys.continue":       "接着做",
	"keys.redo":           "从某一步开新任务",
	"keys.seed":           "带着它开新任务",
	"keys.loose":          "打错一个字母也找得到，也可以只打标题里每个词的头一个字母。",
}

var enTaskview = Table{
	"tv.prev":             "Previous task",
	"tv.next":             "Next task",
	"tv.pos":              "%d of %d",
	"task.tag.needs_you":  "Needs you",
	"loop.round":          "Round %d",
	"loop.top":            "Back to the top",
	"loop.quiet":          "Looked %d more times; nothing changed, %s to %s",
	"task.tag.working":    "Working",
	"task.tag.queued":     "Not started yet",
	"task.tag.blocked":    "Waiting",
	"task.tag.done":       "Done",
	"task.tag.failed":     "Didn't work",
	"task.tag.dropped":    "Cancelled",
	"task.tag.superseded": "Continued elsewhere",
	"keys.title":          "Keyboard",
	"keys.menu":           "Keyboard…",
	"keys.g.any":          "Anywhere",
	"keys.g.task":         "In an opened task",
	"keys.g.find":         "In Find anything",
	"keys.find":           "Find anything",
	"keys.new":            "New task",
	"keys.conv":           "Conversation",
	"keys.onhand":         "Tasks",
	"keys.devices":        "Devices",
	"keys.past":           "Past tasks",
	"keys.settings":       "Settings",
	"keys.nth":            "The first to ninth task in Tasks",
	"keys.partner":        "The first to fourth partner",
	"keys.walk":           "Previous and next task",
	"keys.bench":          "Workbench",
	"keys.up":             "Back up a level",
	"keys.this":           "This list",
	"keys.density":        "An opened task: comfortable or compact",
	"keys.rows":           "Move down and up (the arrow keys too)",
	"keys.open":           "Open",
	"keys.continue":       "Continue",
	"keys.redo":           "New task from a step",
	"keys.seed":           "New task from this",
	"keys.loose":          "A word one letter off still finds it, and so do the first letters of a title's words.",
}

func init() {
	for k, v := range zhTaskview {
		zh[k] = v
	}
	for k, v := range enTaskview {
		en[k] = v
	}
}
