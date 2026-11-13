package i18n

// D238, 用这台手机 / Use this phone: a task borrows the person's own Android
// phone after asking. The same keys and words as the web client
// (apps/web/src/i18n-handset.ts); the Mac uses the ones it shows.

var zhHandset = Table{
	"chip.handset":         "用这台手机",
	"handset.elsewhere":    "在 %s 上打开 Ducter，在那里加上：安卓要你在那台手机上亲手打开一个开关。",
	"handset.away":         "这台手机上的 Ducter 现在没开着。打开它，任务就能借用。",
	"handset.where":        "借给任务时，它在 %s 上读屏幕、点、滑、打字。发送、付款、删除这类事先等你点 Go；银行、钱包、密码和验证器应用它碰不到，密码框从不读、不填。没借出去的时候，它什么都不读。",
	"handset.remove":       "移除",
	"handset.remove.means": "也会关掉安卓里 Ducter 的开关",
	"handset.using":        "「%s」正在用这台手机",
	"handset.stop":         "停下",
	"handset.task":         "正在用你的 %s",
	"handset.ask.go":       "借给它",
	"handset.ask.hold":     "不借",
	"handset.setup.go":     "去打开",
	"handset.setup.hold":   "先不用",
	"handset.user.done":    "好了",
}

var enHandset = Table{
	"chip.handset":         "Use this phone",
	"handset.elsewhere":    "Open Ducter on %s and add it there: Android wants you to flip one switch on that phone yourself.",
	"handset.away":         "Ducter isn't open on this phone right now. Open it, and tasks can borrow it.",
	"handset.where":        "While a task borrows it, it reads the screen on %s and taps, swipes and types. Anything that sends, pays or deletes waits for your Go; banking, wallet, password and authenticator apps stay out of reach, and password fields are never read or typed. When it isn't lent, it reads nothing.",
	"handset.remove":       "Remove",
	"handset.remove.means": "also turns off Ducter's switch in Android",
	"handset.using":        "“%s” is using this phone",
	"handset.stop":         "Stop",
	"handset.task":         "On your %s",
	"handset.ask.go":       "Lend it",
	"handset.ask.hold":     "Not now",
	"handset.setup.go":     "Turn it on",
	"handset.setup.hold":   "Not now",
	"handset.user.done":    "Done",
}

func init() {
	for k, v := range zhHandset {
		zh[k] = v
	}
	for k, v := range enHandset {
		en[k] = v
	}
}
