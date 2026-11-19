package i18n

// Settings as one place (D150): the rail of tabs, each section's one-line
// lede, and the rows that are new with the redesign. The phone
// (apps/web/src/i18n.ts) uses the same keys for the same words.

var zhSettings = Table{
	"settings.tab.partner":    "伙伴",
	"settings.tab.notify":     "通知",
	"settings.tab.accounts":   "账号",
	"settings.tab.look":       "外观和声音",
	"settings.tab.run":        "在哪儿运行",
	"settings.tab.about":      "更新和关于",
	"settings.tab.about.only": "关于",

	"settings.lede.notify":   "有事要你定的时候它怎么找你，什么时候别打扰你。",
	"settings.lede.accounts": "%s 能看的邮件、日程和消息，还有替你打的电话。",
	"settings.lede.look":     "这个窗口的外观、语言和声音。只影响这台 Mac。",
	"settings.lede.run":      "Ducter 在哪台电脑上运行，关掉窗口以后它怎样。",

	"partner.header":           "在 %s 上运行，用 %s 想事情",
	"loadout.brain.auto":       "自动选的：只有 %s 登录了",
	"loadout.brain.auto_other": "自动选的：Claude Code 没登录",
	"settings.talk.row":        "回你用的语言",
	"settings.quiet.hours":     "时间段",
	"partner.memory.on.help":   "记得你说过的事，下次不用再讲一遍。",
	"partner.trust.note":       "这两张单子就是 Ducter 守的规矩，不能在这里改。",
	"acct.ai.link":             "AI 账号",
	// D296: the partner's one word after a change, in its own voice.
	"said.quiet":        "好，%s 到 %s 我不吵你，结束时一起告诉你。",
	"said.quiet.off":    "好，有事随时找你。",
	"said.default":      "好，你没回的话，%s后我按默认做。",
	"said.watch.on":     "好，%s 我自己留意着。",
	"said.watch.off":    "好，%s 你问起来我再看。",
	"said.acct.stop":    "好，%s 停了：它连着的账号我都不看了。想再用，重新连上就好。",
	"said.rename":       "好，以后我就叫%s。",
	"acct.ai.link.help": "Claude Code、Codex、pi 和 DeepSeek Harness 在「设备」里登录",

	"settings.look.group":    "外观",
	"settings.lang.group":    "语言和对话",
	"settings.lang.help":     "只改这个窗口。它跟你说话用什么语言，在「伙伴」里改。",
	"settings.sound.row":     "开场的声音",
	"settings.sound.play":    "试听",
	"settings.sound.stop":    "停止",
	"settings.preview":       "预览",
	"settings.preview.user":  "明天早上提醒我看 PR",
	"settings.preview.reply": "好，明天 9:00 叫你。",
	"settings.preview.noted": "记下了：明天 9:00 提醒看 PR",

	"settings.where.here":           "这台 Mac",
	"settings.where.elsewhere.help": "比如装在服务器上的 Ducter，用一次性的连接码连上。",
	"settings.where.useHere.help":   "忘掉这个连接，回到这台 Mac 上自己的 Ducter。",
	"settings.rest.go":              "休息",
	"settings.data.folder.row":      "数据文件夹",
	"settings.data.logs.row":        "记录",
	"settings.data.logs.help":       "Ducter 做过的每一步。报告问题时会用到。",
	"settings.data.check.row":       "检查一遍",
	"settings.data.check.help":      "跟第一次打开时一样，看看 AI agent、记忆和浏览器都在不在。",
	"settings.data.open":            "打开",
	"settings.data.run":             "检查",
	"settings.devices.link":         "你的设备和 AI 账号",
	"settings.devices.link.help":    "在「设备」里连上手机和别的电脑，登录 AI 账号",

	"settings.help.group":       "帮助",
	"settings.credits":          "素材和致谢",
	"settings.credits.help":     "开场的声音用到的录音和混响",
	"settings.update.auto.help": "下次退出 Ducter 时装好，后台的任务接着做。",
}

var enSettings = Table{
	"settings.tab.partner":    "Partner",
	"settings.tab.notify":     "Notifications",
	"settings.tab.accounts":   "Accounts",
	"settings.tab.look":       "Look and sound",
	"settings.tab.run":        "Where it runs",
	"settings.tab.about":      "Updates and about",
	"settings.tab.about.only": "About",

	"settings.lede.notify":   "How it reaches you when something needs you, and when to leave you alone.",
	"settings.lede.accounts": "The mail, calendars and messages %s can read, and the calls it makes for you.",
	"settings.lede.look":     "How this window looks, which language it speaks, and whether it makes a sound. This Mac only.",
	"settings.lede.run":      "Which computer Ducter runs on, and what happens when you close the window.",

	"partner.header":           "Runs on %s and thinks with %s",
	"loadout.brain.auto":       "Picked for you: only %s is signed in",
	"loadout.brain.auto_other": "Picked for you: Claude Code isn't signed in",
	"settings.talk.row":        "Replies in",
	"settings.quiet.hours":     "Hours",
	"partner.memory.on.help":   "Remembers what you've told it, so you don't have to say it twice.",
	"partner.trust.note":       "These two lists are the rules Ducter keeps; they can't be changed here.",
	"acct.ai.link":             "AI accounts",
	"said.quiet":               "Got it: I'll stay quiet from %s to %s and tell you everything after.",
	"said.quiet.off":           "Got it: I'll find you whenever something comes up.",
	"said.default":             "Got it: if you don't answer, I'll go with the default after %s.",
	"said.watch.on":            "Got it: I'll keep an eye on %s myself.",
	"said.watch.off":           "Got it: I'll look at %s only when you ask.",
	"said.acct.stop":           "Done: %s is off, and I won't read its accounts. Connect it again whenever you like.",
	"said.rename":              "Got it: from now on I'm %s.",
	"acct.ai.link.help":        "Sign in to Claude Code, Codex, pi and DeepSeek Harness on Devices",

	"settings.look.group":    "Look",
	"settings.lang.group":    "Language and conversation",
	"settings.lang.help":     "This window only. The language it talks to you in is under Partner.",
	"settings.sound.row":     "The intro's sound",
	"settings.sound.play":    "Play",
	"settings.sound.stop":    "Stop",
	"settings.preview":       "Preview",
	"settings.preview.user":  "Remind me about the PR tomorrow morning",
	"settings.preview.reply": "Sure, I'll ping you at 9:00 tomorrow.",
	"settings.preview.noted": "Noted: PR reminder, tomorrow 9:00",

	"settings.where.here":           "This Mac",
	"settings.where.elsewhere.help": "Like a Ducter on a server; you connect with a one-time pairing code.",
	"settings.where.useHere.help":   "Forget this connection and go back to this Mac's own Ducter.",
	"settings.rest.go":              "Stop",
	"settings.data.folder.row":      "Data folder",
	"settings.data.logs.row":        "Log",
	"settings.data.logs.help":       "Every step Ducter took. Useful when you report a problem.",
	"settings.data.check.row":       "Run checks",
	"settings.data.check.help":      "The same checks as the first run: are the AI agents, memory and browser there.",
	"settings.data.open":            "Open",
	"settings.data.run":             "Check",
	"settings.devices.link":         "Your devices and AI accounts",
	"settings.devices.link.help":    "Connect a phone or another computer and sign in to AI accounts on Devices",

	"settings.help.group":       "Help",
	"settings.credits":          "Credits",
	"settings.credits.help":     "The recordings and reverb in the intro's sound",
	"settings.update.auto.help": "It installs the next time you quit Ducter; tasks in the background carry on.",
}

func init() {
	for k, v := range zhSettings {
		zh[k] = v
	}
	for k, v := range enSettings {
		en[k] = v
	}
}
