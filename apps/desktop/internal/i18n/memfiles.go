package i18n

// D566: keeping what Ducter made in the person's Nowledge Mem. The same keys
// and words as the web client (apps/web/src/i18n-memfiles.ts).

var zhMemFiles = Table{
	"memfile.save":            "存到 Nowledge Mem",
	"memfile.saving":          "正在存到 Nowledge Mem…",
	"memfile.saved":           "已存进 Nowledge Mem",
	"memfile.open":            "去看",
	"memfile.failed":          "没存进去：%s",
	"memfile.retry":           "再试一次",
	"memfile.signin":          "去登录",
	"memfile.settings":        "去设置",
	"memfile.why.off":         "记忆关着",
	"memfile.why.missing":     "还没接上 Nowledge Mem",
	"memfile.why.signed_out":  "Nowledge Mem 要重新登录",
	"memfile.why.unreachable": "连不上 Nowledge Mem",
	"memfile.why.secret":      "里面像有密钥，留在这儿",
	"memfile.why.gone":        "文件已经不在了",
	"memfile.why.refused":     "Nowledge Mem 没收下",
	"memfile.row":             "做好的文件也存进 Nowledge Mem",
	"memfile.row.line":        "任务做完时，报告和文档存进 Nowledge Mem 的「Ducter」文件夹。日志、代码、截图不存，有密钥的文件也不存。",
	"memfile.trouble":         "上次「%s」没存进去：%s",
	"said.memfiles.on":        "好，以后做好的报告和文档我都存一份到 Nowledge Mem。",
	"said.memfiles.off":       "好，做好的文件不再自动存进 Nowledge Mem，想存的时候点文件下面的「存到 Nowledge Mem」。",
	"memfile.why.no_space":    "Nowledge Mem 要知道放哪个空间",
	"memfile.raw":             "原话",
	// D575: Mem's only write target is a Space others read: asked once, the person's own Space the default.
	"memfile.shared":           "Nowledge Mem 会放进「%s」，%s 人能看到。",
	"memfile.shared.some":      "Nowledge Mem 会放进「%s」，别人也能看到。",
	"memfile.shared.only":      "Nowledge Mem 只能放进「%s」，%s 人能看到。",
	"memfile.shared.only.some": "Nowledge Mem 只能放进「%s」，别人也能看到。",
	"memfile.pick.personal":    "只给我看",
	"memfile.pick.shared":      "放进「%s」",
	"memfile.why.shared_space": "Nowledge Mem 会放进别人也看得到的空间，先在文件下面选一次放哪",
}

var enMemFiles = Table{
	"memfile.save":             "Save to Nowledge Mem",
	"memfile.saving":           "Saving to Nowledge Mem…",
	"memfile.saved":            "In Nowledge Mem",
	"memfile.open":             "Open",
	"memfile.failed":           "Not saved: %s",
	"memfile.retry":            "Try again",
	"memfile.signin":           "Sign in",
	"memfile.settings":         "Open Settings",
	"memfile.why.off":          "memory is off",
	"memfile.why.missing":      "Nowledge Mem isn't connected",
	"memfile.why.signed_out":   "Nowledge Mem's sign-in lapsed",
	"memfile.why.unreachable":  "can't reach Nowledge Mem",
	"memfile.why.secret":       "it seems to hold a key, so it stays",
	"memfile.why.gone":         "the file is gone",
	"memfile.why.refused":      "Nowledge Mem didn't take it",
	"memfile.row":              "Also keep files I make in Nowledge Mem",
	"memfile.row.line":         "When a task is done, its reports and documents go to the “Ducter” folder in Nowledge Mem. Logs, code and screenshots don't, nor any file with a key in it.",
	"memfile.trouble":          "“%s” wasn't saved last time: %s",
	"said.memfiles.on":         "Got it: from now on I'll keep a copy of the reports and documents I make in Nowledge Mem.",
	"said.memfiles.off":        "Got it: files I make no longer go to Nowledge Mem by themselves. To keep one, tap Save to Nowledge Mem under it.",
	"memfile.why.no_space":     "Nowledge Mem needs a space for it",
	"memfile.raw":              "Its words",
	"memfile.shared":           "Nowledge Mem would put it in “%s”, seen by %s people.",
	"memfile.shared.some":      "Nowledge Mem would put it in “%s”, seen by others.",
	"memfile.shared.only":      "Nowledge Mem can only put it in “%s”, seen by %s people.",
	"memfile.shared.only.some": "Nowledge Mem can only put it in “%s”, seen by others.",
	"memfile.pick.personal":    "Only me",
	"memfile.pick.shared":      "Put it in “%s”",
	"memfile.why.shared_space": "Nowledge Mem would put it where others can read it; choose once under the file",
}

func init() {
	for k, v := range zhMemFiles {
		zh[k] = v
	}
	for k, v := range enMemFiles {
		en[k] = v
	}
}
