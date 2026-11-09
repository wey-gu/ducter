package i18n

// 开一件事 / New task (D128, design/new-task.md): the card, On hand's
// grouping by project, and the opened task's Changes header. Its own
// table, folded into zh and en by init. The phone (apps/web/src/i18n.ts)
// uses the same keys for the same words.

var zhNewTask = Table{
	"newtask.button":         "开一件事",
	"task.brief.you":         "你交代的",
	"newtask.menu":           "开一件事…",
	"newtask.title":          "开一件事",
	"newtask.where":          "在哪儿做",
	"newtask.who":            "谁来做",
	"newtask.what":           "做什么",
	"newtask.nowhere":        "不用文件夹",
	"newtask.placeholder":    "想让它做什么？",
	"newtask.verbatim":       "你写的话会原样交给它",
	"newtask.suggested":      "推荐",
	"newtask.picked":         "%s，是你选的",
	"newtask.loading":        "稍等…",
	"newtask.nobody":         "现在没有 AI agent 能接这件事。",
	"newtask.branch.title":   "从哪个分支开始",
	"newtask.branch.default": "默认",
	"newtask.cancel":         "取消",
	"newtask.start":          "开始",
	"newtask.starting":       "在开…",
	"newtask.err.empty":      "先写一句要它做什么。",
	"newtask.err.conn":       "还没连上 Ducter，连上了再开。",
	"newtask.err.no_agent":   "现在没有 AI agent 能接这件事。",
	"newtask.err.not_repo":   "这个文件夹不是 git 仓库。",
	"newtask.err.offline":    "那台设备现在连不上。",
	"newtask.err.failed":     "没开成：%s",
	"newtask.err.unknown":    "没开成，再试一次？",
	"onhand.by.state":        "按状态",
	"onhand.by.project":      "按项目",
	"onhand.by":              "怎么排",
	"onhand.other":           "其他",
	"onhand.newhere":         "在这儿开一件",
}

var enNewTask = Table{
	"newtask.button":         "New task",
	"task.brief.you":         "What you asked for",
	"newtask.menu":           "New Task…",
	"newtask.title":          "New task",
	"newtask.where":          "Where",
	"newtask.who":            "Who does it",
	"newtask.what":           "What",
	"newtask.nowhere":        "No folder",
	"newtask.placeholder":    "What should it do?",
	"newtask.verbatim":       "It gets your words as you wrote them",
	"newtask.suggested":      "Suggested",
	"newtask.picked":         "%s; you picked it",
	"newtask.loading":        "One moment…",
	"newtask.nobody":         "No AI agent can take this right now.",
	"newtask.branch.title":   "Start from which branch",
	"newtask.branch.default": "default",
	"newtask.cancel":         "Cancel",
	"newtask.start":          "Start",
	"newtask.starting":       "Starting…",
	"newtask.err.empty":      "Say what it should do first.",
	"newtask.err.conn":       "Not connected to Ducter yet. Try again once it is.",
	"newtask.err.no_agent":   "No AI agent can take this right now.",
	"newtask.err.not_repo":   "That folder isn't a git repository.",
	"newtask.err.offline":    "That device can't be reached right now.",
	"newtask.err.failed":     "It didn't start: %s",
	"newtask.err.unknown":    "It didn't start. Try again?",
	"onhand.by.state":        "By state",
	"onhand.by.project":      "By project",
	"onhand.by":              "Group by",
	"onhand.other":           "Other",
	"onhand.newhere":         "New task here",
}

func init() {
	for k, v := range zhNewTask {
		zh[k] = v
	}
	for k, v := range enNewTask {
		en[k] = v
	}
}
