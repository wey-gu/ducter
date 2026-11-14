package i18n

// D257: Settings › 记忆 / Memory and › 你的其他 AI / Your other AI agents.
// The web uses the same keys and words (apps/web/src/i18n-memory.ts); a test
// keeps them equal. The home's Mem steps keep their D225/D229 words
// (bridge.mem.*) in i18n.go.

var zhMemory = Table{
	"settings.tab.memory":       "记忆",
	"settings.list.memory":      "它记得关于你的事，和 Nowledge Mem",
	"settings.tab.peers":        "你的其他 AI",
	"settings.list.peers":       "终端里的 Claude Code、Codex 怎么找它",
	"settings.lede.memory":      "%s 记得关于你的事，都在这里：随时能看，也能让它忘掉。",
	"settings.lede.peers":       "你在别处用的 AI，比如终端里的 Claude Code、Codex，可以通过 Nowledge Mem 找 %s 帮忙，或者让它来问你。",
	"mem.hero.on":               "%s 记得你",
	"mem.hero.on.body":          "你说过的偏好、定下的事，它都记在 Nowledge Mem 里。换一次对话、换一个 AI 工具，都接得上。",
	"mem.hero.empty.body":       "还没记下什么。跟它说一句「记住，周报每周五下午发」，它就记下了。",
	"mem.hero.off":              "%s 现在不记新的事",
	"mem.hero.missing":          "%s 记得这次对话",
	"mem.hero.missing.body":     "你们聊过的，它都记着。装上 Nowledge Mem（免费，在你自己的电脑上），它就能跨天记住你，你的其他 AI 工具也能用同一份记忆。",
	"mem.hero.signin":           "就差登录 Nowledge Mem 了",
	"mem.hero.signin.body":      "登录以后，它记下的事就存进你自己的 Nowledge Mem。",
	"mem.hero.busy":             "Nowledge Mem 马上就好…",
	"mem.switch.note":           "聊天和替你做事时，它都会想起记得的事，也会记下新的。",
	"mem.notes.title":           "它记下的",
	"mem.notes.lede":            "在你们的对话里记下的，最新的在前。",
	"mem.when.today":            "今天",
	"mem.when.week":             "这一周",
	"mem.when.earlier":          "更早",
	"mem.notes.all":             "在 Nowledge Mem 里看全部",
	"mem.app.on":                "已连上",
	"mem.app.where":             "在 %s 上",
	"mem.app.local":             "用 %s 自己的记忆库",
	"mem.app.name":              "它在 Nowledge Mem 里叫「%s」。",
	"mem.app.off":               "关着的时候，Ducter 不读也不写 Nowledge Mem。",
	"mem.app.missing":           "%s 上还没有 Nowledge Mem。",
	"mem.app.missing.here":      "这里还没有 Nowledge Mem。",
	"mem.app.what":              "Nowledge Mem 是一个免费的记忆工具，跑在你自己的电脑上；你用的其他 AI 工具也能读写同一份记忆。",
	"mem.app.learn":             "了解 Nowledge Mem",
	"mem.update.newer":          "Nowledge Mem 有新版本 %s",
	"mem.update.newer.any":      "Nowledge Mem 有新版本",
	"mem.update.newer.body":     "%s 上现在是 %s。更新只换程序：登录不变，记忆不动。",
	"mem.update.newer.body.any": "更新只换程序：登录不变，记忆不动。",
	"mem.update.app.body":       "%s 上的这份是 Nowledge Mem 应用自带的，在 Nowledge Mem 应用里更新就好。",
	"mem.update.needed":         "Nowledge Mem 要更新一下",
	"mem.badge.newer":           "Nowledge Mem 有新版本",
	"mem.badge.needed":          "Nowledge Mem 要更新",
	"peers.mem.first":           "要先在「记忆」里把 %s 上的 Nowledge Mem 装好、登录，%s 才能跟你的其他 AI 连上。",
	"peers.mem.update":          "%s 上的 Nowledge Mem 要更新到 %s 以上，才能跟你的其他 AI 连上。",
	"peers.mem.newer":           "Nowledge Mem 有新版本。连不上的时候，先更新它，再试一次。",
	"peers.mem.go":              "去「记忆」",
}

var enMemory = Table{
	"settings.tab.memory":       "Memory",
	"settings.list.memory":      "What it remembers about you, and Nowledge Mem",
	"settings.tab.peers":        "Your other AI agents",
	"settings.list.peers":       "How Claude Code, Codex and others reach it",
	"settings.lede.memory":      "What %s remembers about you lives here: see it any time, and have it forget anything.",
	"settings.lede.peers":       "The AI you use elsewhere, like Claude Code or Codex in a terminal, can reach %s through Nowledge Mem, to hand it work or have it ask you.",
	"mem.hero.on":               "%s remembers you",
	"mem.hero.on.body":          "The preferences you've stated and the things you've decided live in Nowledge Mem, so a new conversation, or another AI tool, picks up where you left off.",
	"mem.hero.empty.body":       "Nothing noted yet. Say \"remember, the weekly report goes out Friday afternoon\" and it's noted.",
	"mem.hero.off":              "%s isn't noting anything new",
	"mem.hero.missing":          "%s remembers this conversation",
	"mem.hero.missing.body":     "It remembers what you've talked about here. With Nowledge Mem (free, on your own computer) it remembers you across days, and your other AI tools share the same memory.",
	"mem.hero.signin":           "One step left: sign in to Nowledge Mem",
	"mem.hero.signin.body":      "Once signed in, what it notes goes into your own Nowledge Mem.",
	"mem.hero.busy":             "Nowledge Mem is almost ready…",
	"mem.switch.note":           "It recalls what it knows while you talk and while it works for you, and notes new things.",
	"mem.notes.title":           "What it noted",
	"mem.notes.lede":            "Noted in your conversations, newest first.",
	"mem.when.today":            "Today",
	"mem.when.week":             "This week",
	"mem.when.earlier":          "Earlier",
	"mem.notes.all":             "See everything in Nowledge Mem",
	"mem.app.on":                "Connected",
	"mem.app.where":             "On %s",
	"mem.app.local":             "Uses %s's own memory store",
	"mem.app.name":              "In Nowledge Mem it goes by %s.",
	"mem.app.off":               "While it's off, Ducter neither reads nor writes Nowledge Mem.",
	"mem.app.missing":           "Nowledge Mem isn't on %s yet.",
	"mem.app.missing.here":      "Nowledge Mem isn't here yet.",
	"mem.app.what":              "Nowledge Mem is a free memory app that runs on your own computer; the other AI tools you use can read and write the same memory.",
	"mem.app.learn":             "About Nowledge Mem",
	"mem.update.newer":          "Nowledge Mem %s is out",
	"mem.update.newer.any":      "A new Nowledge Mem is out",
	"mem.update.newer.body":     "%s has %s now. An update only swaps the program: you stay signed in, and your memories don't move.",
	"mem.update.newer.body.any": "An update only swaps the program: you stay signed in, and your memories don't move.",
	"mem.update.app.body":       "The copy on %s comes with the Nowledge Mem app; update it in the Nowledge Mem app.",
	"mem.update.needed":         "Nowledge Mem needs an update",
	"mem.badge.newer":           "Mem update available",
	"mem.badge.needed":          "Mem needs an update",
	"peers.mem.first":           "Nowledge Mem on %s needs to be installed and signed in, in Memory, before %s can connect with your other AI agents.",
	"peers.mem.update":          "Nowledge Mem on %s needs %s or later to connect with your other AI agents.",
	"peers.mem.newer":           "A newer Nowledge Mem is out. If connecting doesn't work, update it first, then try again.",
	"peers.mem.go":              "Go to Memory",
}

func init() {
	for k, v := range zhMemory {
		zh[k] = v
	}
	for k, v := range enMemory {
		en[k] = v
	}
}
