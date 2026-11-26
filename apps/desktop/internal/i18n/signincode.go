package i18n

// D599: 用一次性码登录 / Sign in with a one-time code: the card's words, and
// an ask's own links and codes. The web client carries the same keys
// (apps/web/src/i18n-signin-code.ts).

var zhSigninCode = Table{
	"dsi.title":       "登录 %s",
	"dsi.line":        "打开 %s 的页面，填入这个码。登好了我会自己看到，不用回我。",
	"dsi.line.nocode": "打开 %s 的页面登录。登好了我会自己看到，不用回我。",
	"dsi.code":        "一次性码",
	"dsi.open":        "打开 %s",
	"dsi.copy":        "复制",
	"dsi.copied":      "已复制",
	"dsi.copy.failed": "没能复制。长按这个码，自己选中它。",
	"dsi.wait":        "等你在 %s 上确认",
	"dsi.left":        "这个码还能用 %d 分钟",
	"dsi.expired":     "这个码过期了。再要一个，我接着等你。",
	"dsi.again":       "再要一个码",
	"dsi.done":        "已登录 %s",
	"ask.copy":        "复制 %s",
}

var enSigninCode = Table{
	"dsi.title":       "Sign in to %s",
	"dsi.line":        "Open %s's page and enter this code. I'll see when you're signed in, so no need to tell me.",
	"dsi.line.nocode": "Open %s's page and sign in. I'll see when you're done, so no need to tell me.",
	"dsi.code":        "One-time code",
	"dsi.open":        "Open %s",
	"dsi.copy":        "Copy",
	"dsi.copied":      "Copied",
	"dsi.copy.failed": "Couldn't copy. Press and hold the code to select it.",
	"dsi.wait":        "Waiting for you to confirm it on %s",
	"dsi.left":        "This code works for %d more min",
	"dsi.expired":     "This code ran out. Get a new one and I'll keep waiting.",
	"dsi.again":       "Get a new code",
	"dsi.done":        "Signed in to %s",
	"ask.copy":        "Copy %s",
}

func init() {
	for k, v := range zhSigninCode {
		zh[k] = v
	}
	for k, v := range enSigninCode {
		en[k] = v
	}
}
