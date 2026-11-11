package i18n

// D155: one computer, one card. The command line (and the app window) on a
// computer fold into that computer's card as one quiet line; a phone's or
// a window's card says what it is and what it does for you in plain words;
// and "Let this Mac do tasks" on a Mac connected to a Ducter elsewhere.
// Glossary: design/product-model.md.
var zhComputers = Table{
	"device.cli.too":              "命令行也连着",
	"device.cli.only":             "命令行连着",
	"device.app.too":              "Ducter app 也连着",
	"device.fold.more":            "更多",
	"device.cli.name":             "%s 上的命令行",
	"device.app.name":             "%s 上的 Ducter app",
	"device.disconnect.means.cli": "在这台电脑上，ducter 命令就连不上了；这台电脑别的连接不受影响。想再连上，在 app 里重新连一次，或用 ducter connect。",
	"device.kind.iphone.safari":   "你的 iPhone · 用 Safari 连着",
	"device.kind.iphone.app":      "你的 iPhone · 用 Ducter app 连着",
	"device.kind.ipad.safari":     "你的 iPad · 用 Safari 连着",
	"device.kind.ipad.app":        "你的 iPad · 用 Ducter app 连着",
	"device.kind.android":         "你的安卓手机 · 用浏览器连着",
	"device.kind.android.app":     "你的安卓手机 · 用 Ducter app 连着",
	"device.kind.mac.app":         "一台 Mac · 用 Ducter app 连着",
	"device.kind.browser":         "一个浏览器 · 打开的是网页版",
	"device.kind.cli":             "一台电脑",
	"device.kind.other":           "一台设备",
	"device.client.never":         "还没连上过",
	"device.does":                 "它能为你做的",
	"device.does.phone":           "收到提醒 · 回答等你决定的事 · 和 %s 说话",
	"device.does.app":             "和 %s 说话 · 看手头的事 · 管理设备",
	"device.does.browser":         "和 %s 说话 · 回答等你决定的事",
	"device.does.cli":             "在终端里用 ducter：看状态、开新的事、回答",
	"work.mac.title":              "让这台 Mac 也替 %s 做事",
	"work.mac.note.off":           "%s 能把事派到这台 Mac 上，用这里登录的 AI（Claude Code 这些）和这里的代码仓库。它只做事，看不到你们的对话。",
	"work.mac.note.on":            "在后台运行：登录时自己开始，停了会自己重启。日志在 %s。",
	"work.mac.starting":           "正在连接…",
	"work.mac.stopping":           "正在停止…",
	"work.mac.err":                "没能开始：%s",
	"work.mac.err.notoken":        "这个连接没有设备令牌（本机隧道），在终端里用 ducter worker 连。",
}

var enComputers = Table{
	"device.cli.too":              "The command line is connected too",
	"device.cli.only":             "The command line is connected",
	"device.app.too":              "The Ducter app is connected too",
	"device.fold.more":            "More",
	"device.cli.name":             "the command line on %s",
	"device.app.name":             "the Ducter app on %s",
	"device.disconnect.means.cli": "ducter commands on that computer can't reach your Ducter anymore; its other connections stay. To connect it again, connect again in the app, or use ducter connect.",
	"device.kind.iphone.safari":   "Your iPhone · connected through Safari",
	"device.kind.iphone.app":      "Your iPhone · through the Ducter app",
	"device.kind.ipad.safari":     "Your iPad · connected through Safari",
	"device.kind.ipad.app":        "Your iPad · through the Ducter app",
	"device.kind.android":         "Your Android phone · through its browser",
	"device.kind.android.app":     "Your Android phone · through the Ducter app",
	"device.kind.mac.app":         "A Mac · through the Ducter app",
	"device.kind.browser":         "A browser · the web app",
	"device.kind.cli":             "A computer",
	"device.kind.other":           "A device",
	"device.client.never":         "Hasn't connected yet",
	"device.does":                 "What it does for you",
	"device.does.phone":           "Get notifications · Answer what waits for you · Talk with %s",
	"device.does.app":             "Talk with %s · See what's on hand · Manage devices",
	"device.does.browser":         "Talk with %s · Answer what waits for you",
	"device.does.cli":             "Use ducter in a terminal: status, new tasks, answers",
	"work.mac.title":              "Let this Mac do tasks for %s",
	"work.mac.note.off":           "%s can send tasks to this Mac, with the AI agents signed in here (Claude Code and others) and the repos here. It only does tasks; it never sees your conversation.",
	"work.mac.note.on":            "Runs in the background: starts at login, restarts if it stops. Log: %s.",
	"work.mac.starting":           "Connecting…",
	"work.mac.stopping":           "Stopping…",
	"work.mac.err":                "Couldn't turn it on: %s",
	"work.mac.err.notoken":        "This connection has no device token (a tunnel on this Mac). Use ducter worker in a terminal.",
}

func init() {
	for k, v := range zhComputers {
		zh[k] = v
	}
	for k, v := range enComputers {
		en[k] = v
	}
}
