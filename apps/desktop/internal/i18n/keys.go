package i18n

// D233: 密钥 / Keys a task asks you for, in Settings › Autofill and on the
// card. The same keys and words as the phone (apps/web/src/i18n-autofill.ts).

var zhKeys = Table{
	"af.keys":           "密钥",
	"af.keys.ask":       "让任务向我要密钥",
	"af.keys.ask.help":  "任务要用 API 密钥或部署密钥时，会在对话里问你要。关掉后，它只在报告里说需要哪一个。",
	"af.key.add":        "添加密钥",
	"af.key.why":        "任务的命令要用的密钥，比如部署密钥。只在要用的那条命令里用，不进对话，也不进记录。",
	"af.key.name":       "它是什么",
	"af.key.name.eg":    "DigitalOcean 部署密钥",
	"af.key.env":        "变量名",
	"af.key.value":      "密钥",
	"af.key.kept":       "已存",
	"af.use.given":      "把 %s 交给了任务",
	"af.use.given.once": "把 %s 交给了任务，只这一次",
	"af.use.refused":    "你没给 %s",
	"key.title":         "%s 需要一个密钥",
	"key.what":          "要什么",
	"key.env":           "变量名",
	"key.why":           "为什么",
	"key.field":         "把密钥粘贴到这里",
	"key.remember":      "记住，以后直接用",
	"key.once":          "只这一次",
	"key.replaces":      "会换掉已存的那一个",
	"key.note":          "它只在要用的那条命令里读这个密钥：不进对话，不进记录，Ducter 自己的 AI 也看不到。任务若故意把它打印出来，自己会看到。",
	"key.go":            "保存，继续",
	"key.go.once":       "交给它，继续",
	"key.hold":          "不给",
	"key.resolved":      "已交给 %s",
	"key.resolved.hold": "你没给",
	"key.task":          "这个任务",
}

var enKeys = Table{
	"af.keys":           "Keys",
	"af.keys.ask":       "Let tasks ask me for keys",
	"af.keys.ask.help":  "When a task needs an API or deploy key, it asks you in the conversation. Off: it only says in its report which one it needs.",
	"af.key.add":        "Add a key",
	"af.key.why":        "A key a task's commands use, like a deploy key. It goes only into the command that needs it, never into the conversation or the history.",
	"af.key.name":       "What it is",
	"af.key.name.eg":    "DigitalOcean deploy key",
	"af.key.env":        "Variable name",
	"af.key.value":      "Key",
	"af.key.kept":       "kept",
	"af.use.given":      "Gave %s to a task",
	"af.use.given.once": "Gave %s to a task, just this once",
	"af.use.refused":    "You didn't give %s",
	"key.title":         "%s needs a key",
	"key.what":          "What",
	"key.env":           "Variable",
	"key.why":           "Why",
	"key.field":         "Paste the key here",
	"key.remember":      "Remember it",
	"key.once":          "Just this once",
	"key.replaces":      "This replaces the one kept",
	"key.note":          "The task reads it only inside the command that needs it: never in the conversation or the history, and Ducter's own AI never sees it. A task that printed it on purpose would see it itself.",
	"key.go":            "Save and continue",
	"key.go.once":       "Give it and continue",
	"key.hold":          "Don't give",
	"key.resolved":      "Given to %s",
	"key.resolved.hold": "You didn't give it",
	"key.task":          "This task",
}

func init() {
	for k, v := range zhKeys {
		zh[k] = v
	}
	for k, v := range enKeys {
		en[k] = v
	}
}
