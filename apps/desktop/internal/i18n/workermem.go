package i18n

// D366: Nowledge Mem on a computer for tasks (its card, the lend sheet). The
// same words as the web's (apps/web/src/i18n-workermem.ts). Glossary:
// design/product-model.md.
var zhWorkerMem = Table{
	"wmem.absent":             "%s 上做事还不记得你",
	"wmem.absent.why":         "装上 Nowledge Mem，%s 上的 AI 就用你的同一份记忆：做事前想得起你的习惯，做完的也记得下来。",
	"wmem.absent.none":        "这台电脑上 Ducter 装不了 Nowledge Mem。在 %s 上照 Nowledge Mem 的说明装好，这里就会看到。",
	"wmem.install":            "装上",
	"wmem.installing":         "正在装 Nowledge Mem…",
	"wmem.signin.line":        "装好了，还差登录",
	"wmem.signin.how":         "在 Nowledge Mem 的 设置 › Connectors 里选 Any AI agent，点「生成连接链接并复制提示」，把复制下来的整段贴在这里。15 分钟内有效，只能用一次，用完就不留。",
	"wmem.signin.local":       "你的 Nowledge Mem 在 %s 的应用里，%s 够不着它。先在 Nowledge Mem 应用里打开 Access Anywhere，再在应用的 设置 › Connectors 里点「生成连接链接并复制提示」，把整段贴在这里。",
	"wmem.signin.link":        "连接链接",
	"wmem.signin.ph":          "把 Nowledge Mem 复制的整段贴在这里",
	"wmem.signin.go":          "登录",
	"wmem.connecting":         "正在登录，接上 %s 上的 AI…",
	"wmem.ready":              "记得你了",
	"wmem.ready.why":          "%s 上的 %s 用的是你的同一份记忆：做事前想得起你的习惯，做完的也记得下来。",
	"wmem.ready.left":         "%s 还没接上。",
	"wmem.ready.none":         "登录好了，%s 上的 AI 还没接上它。",
	"wmem.ready.noagent":      "登录好了。%s 上装了 AI 以后，在这儿接上就行。",
	"wmem.connect":            "接上",
	"wmem.retry":              "再试一次",
	"wmem.health.unreachable": "%s 连不上它设好的 Nowledge Mem",
	"wmem.health.signed_out":  "%s 上的登录失效了",
	"wmem.health.old":         "%s 上的 Nowledge Mem 太旧，说不出好不好",
	"wmem.health.old.how":     "在 %s 上照 Nowledge Mem 自己的说明把它更新一下，这里就会看到。",
	"wmem.again":              "再看一次",
	"wmem.update":             "更新",
	"wmem.failed.network":     "%s 上不了网，没装上。",
	"wmem.failed.space":       "%s 上空间不够了，没装上。",
	"wmem.failed.unsupported": "这台电脑上装不了它。",
	"wmem.failed.bad_link":    "这里面没找到 Nowledge Mem 的连接链接。在 Nowledge Mem 里再点一次「生成连接链接并复制提示」，把整段贴进来。",
	"wmem.failed.used":        "这个链接过期了（15 分钟）或已经用过。在 Nowledge Mem 里再生成一个，把整段贴进来。",
	"wmem.failed.refused":     "Nowledge Mem 没有接受这次登录。在 Nowledge Mem 里再生成一个链接，把整段贴进来。",
	"wmem.failed.unreachable": "%s 连不上这个链接里的 Nowledge Mem。看看链接对不对，或者那台电脑能不能上网。",
	"wmem.failed.failed":      "没弄好。",
	"wmem.and":                "%s 和 %s",
	"wmem.comma":              "、",
}

var enWorkerMem = Table{
	"wmem.absent":             "Tasks on %s don't remember you yet",
	"wmem.absent.why":         "With Nowledge Mem there, the AIs on %s share your one memory: they know how you like things before they start, and what they do is remembered.",
	"wmem.absent.none":        "Ducter can't install Nowledge Mem on this computer. Install it on %s with Nowledge Mem's own guide and it shows here.",
	"wmem.install":            "Install",
	"wmem.installing":         "Installing Nowledge Mem…",
	"wmem.signin.line":        "Installed; signing in is left",
	"wmem.signin.how":         "In Nowledge Mem, open Settings › Connectors › Any AI agent, click “Generate connect link & copy prompt”, and paste everything it copied here. It works once, within 15 minutes, and isn't kept.",
	"wmem.signin.local":       "Your Nowledge Mem lives in the app on %s, which %s can't reach. Turn on Access Anywhere in the Nowledge Mem app, then in its Settings › Connectors click “Generate connect link & copy prompt” and paste everything here.",
	"wmem.signin.link":        "Connect link",
	"wmem.signin.ph":          "Paste what Nowledge Mem copied",
	"wmem.signin.go":          "Sign in",
	"wmem.connecting":         "Signing in and connecting the AIs on %s…",
	"wmem.ready":              "Remembers you",
	"wmem.ready.why":          "On %s, your one memory reaches %s: how you like things is known before a task starts, and what it does is kept.",
	"wmem.ready.left":         "Not connected yet: %s.",
	"wmem.ready.none":         "Signed in. The AIs on %s aren't connected to it yet.",
	"wmem.ready.noagent":      "Signed in. Once %s has an AI, connect it here.",
	"wmem.connect":            "Connect",
	"wmem.retry":              "Try again",
	"wmem.health.unreachable": "%s can't reach the Nowledge Mem it's set up for",
	"wmem.health.signed_out":  "The sign-in on %s stopped working",
	"wmem.health.old":         "Nowledge Mem on %s is too old to say how it's doing",
	"wmem.health.old.how":     "Update Nowledge Mem on %s with its own guide and it shows here.",
	"wmem.again":              "Check again",
	"wmem.update":             "Update",
	"wmem.failed.network":     "%s couldn't reach the internet, so it isn't installed.",
	"wmem.failed.space":       "There isn't enough room on %s, so it isn't installed.",
	"wmem.failed.unsupported": "It can't be installed on this computer.",
	"wmem.failed.bad_link":    "There's no Nowledge Mem connect link in this. Click “Generate connect link & copy prompt” in Nowledge Mem again and paste everything it copied.",
	"wmem.failed.used":        "This link has expired (15 minutes) or was already used. Make a new one in Nowledge Mem and paste everything it copied.",
	"wmem.failed.refused":     "Nowledge Mem didn't accept this sign-in. Make a new link in Nowledge Mem and paste everything it copied.",
	"wmem.failed.unreachable": "%s couldn't reach the Nowledge Mem in this link. Check the link, or whether that computer is online.",
	"wmem.failed.failed":      "That didn't work.",
	"wmem.and":                "%s and %s",
	"wmem.comma":              ", ",
}

func init() {
	for k, v := range zhWorkerMem {
		zh[k] = v
	}
	for k, v := range enWorkerMem {
		en[k] = v
	}
}
