package i18n

// D157: where a task runs (design/where.md §8). Said on every task once two
// or more computers run tasks; the reason on hover; asked only when whose
// sign-ins act or "now vs wait" is at stake. "Computer" in copy is always the
// computer's own name, never 机器 / machine. Glossary: design/product-model.md.
var zhWhere = Table{
	"where.on":                 "在 %s 上",
	"where.your_chrome":        "用你的 Chrome",
	"where.ducter_browser":     "用 Ducter 自己的浏览器",
	"where.app":                "用 %s",
	"where.why":                "为什么在 %[1]s 上：%[2]s",
	"where.reason.always_on":   "一直醒着，合上 %s 也不停",
	"where.reason.always_on.0": "一直醒着，合上电脑也不停",
	"where.reason.signed_in":   "要用你登录着的 %s",
	"where.reason.signed_in.0": "要用你登录着的网站",
	"where.reason.only_app":    "只有 %[1]s 有 %[2]s",
	"where.reason.only_chrome": "只有 %s 有你的 Chrome",
	"where.reason.only_web":    "只有 %s 能上网",
	"where.reason.awake":       "%[1]s 睡着了，%[2]s 醒着",
	"where.reason.changes":     "要用的文件在 %s 上",
	"where.reason.agent_here":  "%[1]s 只在 %[2]s 上",
	"where.reason.no_signin":   "用不着你的登录，%s 自己的浏览器就够了",
	"where.reason.moved":       "%[1]s 连不上，换到 %[2]s 上了",
	"where.reason.you":         "你说的，在 %s 上做",
	"where.reason.rule":        "你的规则：%s",
	"where.reason.home":        "Ducter 就住在 %s 上",
	"where.first_line":         "以后每件事会写明在哪台电脑上做。",

	"switch.computer.awake":  "醒着",
	"switch.computer.asleep": "睡着了",
	"switch.computer.away":   "连不上",
	"switch.computer.on":     "一直醒着",
	"switch.cant.chrome":     "要用你的 Chrome，%s 上没有",
	"switch.cant.web":        "要上网，%s 上没开",
	"switch.cant.app":        "要用 Mac 应用，这台没有",
	"switch.cant.folder":     "文件夹在别的电脑上，搬不走",
	"switch.waits":           "睡着了 · 醒了再做",
	"switch.waits.away":      "连不上 · 连上再做",
	"switch.move.explain":    "从最近保存的进度接着做；分支会先推上去。",
	"switch.move.plain":      "从最近保存的进度接着做。",
	"switch.move.widens":     "会用你的 Chrome，你登录着的网站它都能用。",
	"switch.move.signin":     "那边没登录这个网站，得你登一下。",
	"switch.move.go":         "换到 %s 上接着做",

	"newtask.computer":           "在哪台电脑上做",
	"newtask.computer.always_on": "一直醒着",
	"newtask.computer.mac":       "有你的 Chrome 和 Mac 应用",
	"newtask.computer.asleep":    "睡着了 · 醒了就开始",
	"newtask.computer.away":      "连不上",
	"newtask.agent.elsewhere":    "在 %s 上",

	"move.closing.button": "合上之前搬走",
	"move.closing.none":   "%s 上没有在做的事，合上就好。",
}

var enWhere = Table{
	"where.on":                 "on %s",
	"where.your_chrome":        "in your Chrome",
	"where.ducter_browser":     "in Ducter's own browser",
	"where.app":                "in %s",
	"where.why":                "Why %[1]s: %[2]s",
	"where.reason.always_on":   "Always awake; keeps going when %s closes",
	"where.reason.always_on.0": "Always awake; keeps going when a laptop closes",
	"where.reason.signed_in":   "Needs your signed-in %s",
	"where.reason.signed_in.0": "Needs the sites you're signed in to",
	"where.reason.only_app":    "Only %[1]s has %[2]s",
	"where.reason.only_chrome": "Only %s has your Chrome",
	"where.reason.only_web":    "Only %s can browse",
	"where.reason.awake":       "%[1]s is asleep; %[2]s is awake",
	"where.reason.changes":     "The files are on %s",
	"where.reason.agent_here":  "%[1]s is only on %[2]s",
	"where.reason.no_signin":   "No sign-in needed; %s's own browser will do",
	"where.reason.moved":       "%[1]s couldn't be reached, so it's on %[2]s",
	"where.reason.you":         "You said %s",
	"where.reason.rule":        "Your rule: %s",
	"where.reason.home":        "Ducter lives on %s",
	"where.first_line":         "From now on, every task says which computer it's on.",

	"switch.computer.awake":  "Awake",
	"switch.computer.asleep": "Asleep",
	"switch.computer.away":   "Can't reach",
	"switch.computer.on":     "Always awake",
	"switch.cant.chrome":     "Needs your Chrome; not on %s",
	"switch.cant.web":        "Needs the web; off on %s",
	"switch.cant.app":        "Needs a Mac app; not on this one",
	"switch.cant.folder":     "The folder is on another computer; it can't move",
	"switch.waits":           "Asleep · when it wakes",
	"switch.waits.away":      "Can't reach · when it's back",
	"switch.move.explain":    "Continues from its last saved progress; the branch is pushed first.",
	"switch.move.plain":      "Continues from its last saved progress.",
	"switch.move.widens":     "It will use your Chrome, with every site you're signed in to.",
	"switch.move.signin":     "It isn't signed in to this site there; you'd sign in.",
	"switch.move.go":         "Continue on %s",

	"newtask.computer":           "On which computer",
	"newtask.computer.always_on": "Always awake",
	"newtask.computer.mac":       "Has your Chrome and Mac apps",
	"newtask.computer.asleep":    "Asleep · starts when it wakes",
	"newtask.computer.away":      "Can't reach",
	"newtask.agent.elsewhere":    "on %s",

	"move.closing.button": "Move before closing",
	"move.closing.none":   "Nothing is running on %s. Close it whenever.",
}

func init() {
	for k, v := range zhWhere {
		zh[k] = v
	}
	for k, v := range enWhere {
		en[k] = v
	}
}
