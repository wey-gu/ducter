package i18n

// D238, 用这台手机 / Use this phone: a task borrows the person's own Android
// phone after asking. The same keys and words as the web client
// (apps/web/src/i18n-handset.ts); the Mac uses the ones it shows.

var zhHandset = Table{
	"chip.handset":      "用这台手机",
	"handset.elsewhere": "在 %s 上打开 Ducter，在那里加上：安卓要你在那台手机上亲手打开一个开关。",
	"handset.away":      "这台手机现在连不上。在它上面打开 Ducter 就好。",
	"handset.quiet":     "%s 暂时没回应。Ducter 被关掉或断网时会这样；十几秒还不回来，就自动还给你。",
	// D331: where a lent phone stands, said truthfully in every window.
	"handset.wait.unlock":   "借给它了：解锁你的 %s 就开始",
	"handset.wait.away":     "借给它了：现在连不上你的 %s，连上就开始",
	"handset.wait.starting": "借给它了：正在你的 %s 上开始",
	"handset.away.limited":  "安卓限制了那台手机上 Ducter 的后台：在应用信息里把 Ducter 的「电池」设为「无限制」。",
	"handset.away.old":      "那台手机上的 Ducter 要开着才连得上：打开它，或者更新 Ducter。",
	"handset.away.offline":  "它可能没联网，或者 Ducter 被关掉了。在那台手机上打开 Ducter 就好。",
	"handset.away.unknown":  "Ducter 启动以后还没连上过它。在那台手机上打开 Ducter 就好。",
	"handset.paused":        "暂停了：你的 %s 锁着",
	"handset.paused.why":    "它什么都不做。解锁以后，在手机上点「继续借给它」才接着用。",
	"handset.paused.asking": "在你的 %s 上问你：继续借给它吗？",
	"handset.withdraw":      "不借了",
	"handset.ask.waiting":   "借给它了，还没开始",
	"handset.where":         "借给任务时，它在 %s 上读屏幕、点、滑、打字。发送、付款、删除这类事先等你点 Go；银行、钱包、密码和验证器应用它碰不到，密码框从不读、不填。没借出去的时候，它什么都不读。",
	"handset.remove":        "移除",
	"handset.remove.means":  "也会关掉安卓里 Ducter 的开关",
	"handset.using":         "「%s」正在用这台手机",
	"handset.stop":          "停下",
	"handset.task":          "正在用你的 %s",
	// D339: the task's head says where it works.
	"handset.where.on": "在你的 %s 上",
	// D339: Settings › 用这台手机: borrowing it while away, never with its screen lock PIN.
	"handset.smartlock":  "想在不碰手机时也能借给任务：在手机的「设置 › 安全」里打开 Smart Lock（有的手机叫「延长解锁」），选「随身检测」或「可信地点」。手机在你身上或在那个地方时，屏幕熄了也不用再输锁屏密码，任务能接着用。Ducter 从不要你的锁屏密码。",
	"handset.ask.go":     "借给它",
	"handset.ask.hold":   "不借",
	"handset.setup.go":   "去打开",
	"handset.setup.hold": "先不用",
	"handset.user.done":  "好了",
	// D280: Android's recording prompt is the person's turn, said in every window.
	"handset.record.title":   "在 %s 上点「立即开始」，它才能录屏",
	"handset.record.what":    "这是安卓自己的确认，只在手机上出现，只有你能点。录整个屏幕，不录声音。",
	"handset.record.left":    "还剩 %s",
	"handset.record.hold":    "不录了",
	"handset.record.on":      "开始录了",
	"handset.record.skipped": "这次不录",
	"handset.record.gave_up": "手机上没点，这次没录",
}

var enHandset = Table{
	"chip.handset":          "Use this phone",
	"handset.elsewhere":     "Open Ducter on %s and add it there: Android wants you to flip one switch on that phone yourself.",
	"handset.away":          "This phone can't be reached right now. Opening Ducter on it fixes this.",
	"handset.quiet":         "%s isn't answering right now. That happens when Ducter was closed or it lost its network; if it isn't back in a few seconds, it's handed back to you.",
	"handset.wait.unlock":   "Lent: starts when you unlock your %s",
	"handset.wait.away":     "Lent: can't reach your %s right now; starts when it connects",
	"handset.wait.starting": "Lent: starting on your %s",
	"handset.away.limited":  "Android limits Ducter in the background on that phone: set Ducter's Battery to Unrestricted in App info.",
	"handset.away.old":      "Ducter has to be open on that phone to connect: open it, or update Ducter.",
	"handset.away.offline":  "It may be offline, or Ducter was closed there. Opening Ducter on it fixes this.",
	"handset.away.unknown":  "It hasn't connected since Ducter started. Opening Ducter on it fixes this.",
	"handset.paused":        "Paused: your %s is locked",
	"handset.paused.why":    "It does nothing. After you unlock, tap Keep lending on the phone to carry on.",
	"handset.paused.asking": "Asking on your %s: keep lending it?",
	"handset.withdraw":      "Not now",
	"handset.ask.waiting":   "Lent, not started yet",

	"handset.where":        "While a task borrows it, it reads the screen on %s and taps, swipes and types. Anything that sends, pays or deletes waits for your Go; banking, wallet, password and authenticator apps stay out of reach, and password fields are never read or typed. When it isn't lent, it reads nothing.",
	"handset.remove":       "Remove",
	"handset.remove.means": "also turns off Ducter's switch in Android",
	"handset.using":        "“%s” is using this phone",
	"handset.stop":         "Stop",
	"handset.task":         "On your %s",
	"handset.where.on":     "on your %s",
	"handset.smartlock":    "To lend it to tasks while you're not holding it: on the phone, open Settings › Security and turn on Smart Lock (Extend Unlock on some phones), with On-body detection or Trusted places. While it's on you or in that place, it doesn't ask for the screen lock again after the screen goes off, so a task can carry on. Ducter never asks for your screen lock PIN.",
	"handset.ask.go":       "Lend it",
	"handset.ask.hold":     "Not now",
	"handset.setup.go":     "Turn it on",
	"handset.setup.hold":   "Not now",
	"handset.user.done":    "Done",
	// D280: Android's recording prompt is the person's turn, said in every window.
	"handset.record.title":   "Tap Start now on %s so it can record the screen",
	"handset.record.what":    "It's Android's own question: it shows only on the phone, and only you can answer it. The whole screen, no sound.",
	"handset.record.left":    "%s left",
	"handset.record.hold":    "Skip recording",
	"handset.record.on":      "Recording started",
	"handset.record.skipped": "Not recording this time",
	"handset.record.gave_up": "No answer on the phone; not recorded",
}

func init() {
	for k, v := range zhHandset {
		zh[k] = v
	}
	for k, v := range enHandset {
		en[k] = v
	}
}
