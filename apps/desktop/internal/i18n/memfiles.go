package i18n

// D566: keeping what Ducter made in the person's Nowledge Mem. The same keys
// and words as the web client (apps/web/src/i18n-memfiles.ts).

var zhMemFiles = Table{
	"memfile.save":             "存到 Nowledge Mem",
	"memfile.saving":           "正在存到 Nowledge Mem…",
	"memfile.saved":            "已在 Nowledge Mem",
	"memfile.open":             "在 Nowledge Mem 里看",
	"memfile.openWeb":          "打开 Nowledge Mem",
	"memfile.failed":           "没存进去：%s",
	"memfile.retry":            "再试一次",
	"memfile.signin":           "去登录",
	"memfile.settings":         "去设置",
	"memfile.why.off":          "记忆关着",
	"memfile.why.missing":      "还没接上 Nowledge Mem",
	"memfile.why.signed_out":   "Nowledge Mem 的登录失效了",
	"memfile.why.unreachable":  "这会儿连不上 Nowledge Mem",
	"memfile.why.secret":       "里面像有密钥或密码，留在这儿",
	"memfile.why.gone":         "这个文件已经不在了",
	"memfile.why.refused":      "Nowledge Mem 说「%s」",
	"memfile.why.refused.none": "Nowledge Mem 没收下",
	"memfile.row":              "做好的文件也存进 Nowledge Mem",
	"memfile.row.line":         "任务做完时，报告和文档存进 Nowledge Mem 的「Ducter」文件夹。日志、代码、截图不存，有密钥的文件也不存。",
	"memfile.trouble":          "上次「%s」没存进去：%s",
	"said.memfiles.on":         "好，以后做好的报告和文档我都存一份到 Nowledge Mem。",
	"said.memfiles.off":        "好，做好的文件不再自动存进 Nowledge Mem，想存的时候点文件下面的「存到 Nowledge Mem」。",
}

var enMemFiles = Table{
	"memfile.save":             "Save to Nowledge Mem",
	"memfile.saving":           "Saving to Nowledge Mem…",
	"memfile.saved":            "In Nowledge Mem",
	"memfile.open":             "Open in Nowledge Mem",
	"memfile.openWeb":          "Open Nowledge Mem",
	"memfile.failed":           "Not saved: %s",
	"memfile.retry":            "Try again",
	"memfile.signin":           "Sign in",
	"memfile.settings":         "Open Settings",
	"memfile.why.off":          "memory is off",
	"memfile.why.missing":      "Nowledge Mem isn't connected yet",
	"memfile.why.signed_out":   "Nowledge Mem's sign-in has lapsed",
	"memfile.why.unreachable":  "Nowledge Mem can't be reached right now",
	"memfile.why.secret":       "it looks like it holds a key or password, so it stays here",
	"memfile.why.gone":         "this file is no longer here",
	"memfile.why.refused":      "Nowledge Mem said “%s”",
	"memfile.why.refused.none": "Nowledge Mem didn't take it",
	"memfile.row":              "Also keep files I make in Nowledge Mem",
	"memfile.row.line":         "When a task is done, its reports and documents go to the “Ducter” folder in Nowledge Mem. Logs, code and screenshots don't, nor any file with a key in it.",
	"memfile.trouble":          "“%s” wasn't saved last time: %s",
	"said.memfiles.on":         "Got it: from now on I'll keep a copy of the reports and documents I make in Nowledge Mem.",
	"said.memfiles.off":        "Got it: files I make no longer go to Nowledge Mem by themselves. To keep one, tap Save to Nowledge Mem under it.",
}

func init() {
	for k, v := range zhMemFiles {
		zh[k] = v
	}
	for k, v := range enMemFiles {
		en[k] = v
	}
}
