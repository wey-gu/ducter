package i18n

// D276, 聊天软件 / Chat apps: the partner in the person's own Telegram bot and
// Slack app, more windows on the one conversation. The same keys and words as
// the web client (apps/web/src/i18n-channels.ts).

var zhChannels = Table{
	"settings.tab.chats":   "聊天软件",
	"settings.list.chats":  "在 Telegram 和 Slack 里也能说话",
	"chats.lede":           "在你常用的聊天软件里也能找 %s。还是同一段对话：你在哪儿说，它就在哪儿回。",
	"chats.goes":           "你在这儿说的，它在这儿回。它自己来找你的事，只发到你最后说话的地方，一件只说一次，也守你的免打扰时间。付款、密码这类事不会发到这里。",
	"chats.telegram":       "Telegram",
	"chats.slack":          "Slack",
	"chats.state.off":      "还没连上",
	"chats.state.starting": "正在连…",
	"chats.state.unlinked": "还差一步：让你的账号连上它",
	"chats.state.linked":   "连着：%s",
	"chats.state.cant":     "连不上了",
	"chats.cant.key":       "%s 不认这个密钥了。重新贴一次就好。",
	"chats.cant.blocked":   "这个机器人被停用或者被拉黑了。",
	"chats.cant.conflict":  "另一个程序也在读这个机器人的消息。先关掉它，再回来。",
	"chats.cant.network":   "现在连不上 %s，我会一直试。",
	"chats.tg.who":         "Telegram 会存一份你们的聊天记录。",
	"chats.tg.step1":       "在 Telegram 里找 @BotFather，发 /newbot，给它起个名字，比如「%s」。",
	"chats.tg.step2":       "BotFather 会给你一串密钥，贴在下面。",
	"chats.tg.key":         "机器人的密钥",
	"chats.tg.open":        "在 Telegram 里打开",
	"chats.tg.code":        "或者在 Telegram 里给它发：%s",
	"chats.sl.who":         "这个工作区的管理员可能看得到你在这儿说的话。",
	"chats.sl.step1":       "打开 api.slack.com/apps，选 Create New App › From a manifest，选你的工作区。",
	"chats.sl.step2":       "把下面这段贴进去，创建，然后 Install to Workspace。",
	"chats.sl.step3":       "在 Basic Information 里建一个 App-Level Token（勾 connections:write），在 OAuth & Permissions 里拷贝 Bot User OAuth Token，两个都贴在下面。",
	"chats.sl.copy":        "拷贝这段",
	"chats.sl.copied":      "拷好了",
	"chats.sl.bot":         "Bot User OAuth Token（xoxb- 开头）",
	"chats.sl.app":         "App-Level Token（xapp- 开头）",
	"chats.sl.code":        "在 Slack 里给 %s 发：%s",
	"chats.connect":        "连上",
	"chats.connecting":     "正在连…",
	"chats.bad.key":        "这串密钥不对。再拷贝一次试试。",
	"chats.bad.network":    "现在连不上，稍后再试。",
	"chats.code.get":       "让我的账号连上",
	"chats.code.ttl":       "10 分钟内有效，只能用一次。别人发来的，%s 一概不理。",
	"chats.unlink":         "解除连接",
	"chats.forget":         "断开 %s",
	"chats.stranger":       "有人在 %s 找过 %s，没理他。",
	"chats.via":            "来自 %s",
}

var enChannels = Table{
	"settings.tab.chats":   "Chat apps",
	"settings.list.chats":  "Talk in Telegram and Slack too",
	"chats.lede":           "Reach %s from the chat apps you already use. It's still one conversation: it answers where you spoke.",
	"chats.goes":           "What you say here gets its answer here. When it comes to you on its own, it goes only to where you last spoke, once, and keeps your quiet hours. Payments and passwords never go here.",
	"chats.telegram":       "Telegram",
	"chats.slack":          "Slack",
	"chats.state.off":      "Not connected",
	"chats.state.starting": "Connecting…",
	"chats.state.unlinked": "One more step: link your account to it",
	"chats.state.linked":   "Linked: %s",
	"chats.state.cant":     "Can't connect",
	"chats.cant.key":       "%s no longer takes this key. Paste it again.",
	"chats.cant.blocked":   "The bot was turned off or blocked.",
	"chats.cant.conflict":  "Another program reads this bot's messages too. Stop it, then come back.",
	"chats.cant.network":   "%s can't be reached right now. I'll keep trying.",
	"chats.tg.who":         "Telegram keeps a copy of your chats.",
	"chats.tg.step1":       "In Telegram, find @BotFather, send /newbot and give it a name, like “%s”.",
	"chats.tg.step2":       "BotFather gives you a key (a long line after “Use this”). Paste it below.",
	"chats.tg.key":         "The bot's key",
	"chats.tg.open":        "Open in Telegram",
	"chats.tg.code":        "Or send it this in Telegram: %s",
	"chats.sl.who":         "This workspace's admins may be able to see what's said here.",
	"chats.sl.step1":       "Open api.slack.com/apps, choose Create New App › From a manifest, and pick your workspace.",
	"chats.sl.step2":       "Paste the text below, create the app, then Install to Workspace.",
	"chats.sl.step3":       "In Basic Information, make an App-Level Token (with connections:write); in OAuth & Permissions, copy the Bot User OAuth Token. Paste both below.",
	"chats.sl.copy":        "Copy this",
	"chats.sl.copied":      "Copied",
	"chats.sl.bot":         "Bot User OAuth Token (starts with xoxb-)",
	"chats.sl.app":         "App-Level Token (starts with xapp-)",
	"chats.sl.code":        "In Slack, send %s this: %s",
	"chats.connect":        "Connect",
	"chats.connecting":     "Connecting…",
	"chats.bad.key":        "That key isn't right. Try copying it again.",
	"chats.bad.network":    "Can't connect right now. Try again in a bit.",
	"chats.code.get":       "Link my account",
	"chats.code.ttl":       "Works once, for 10 minutes. %s ignores anyone else who writes.",
	"chats.unlink":         "Unlink",
	"chats.forget":         "Disconnect %s",
	"chats.stranger":       "Someone else wrote in %s to %s. It didn't answer.",
	"chats.via":            "via %s",
}

func init() {
	for k, v := range zhChannels {
		zh[k] = v
	}
	for k, v := range enChannels {
		en[k] = v
	}
}
