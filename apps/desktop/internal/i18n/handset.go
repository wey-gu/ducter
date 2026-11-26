package i18n

// D238, 用这台手机 / Use this phone: a task borrows the person's own Android
// phone after asking. The same keys and words as the web client
// (apps/web/src/i18n-handset.ts); the Mac uses the ones it shows.

var zhHandset = Table{
	"handset.lock.never":   "锁屏密码只给安卓，Ducter 从来不要。",
	"handset.lock.s3":      "打开「随身检测」或「可信地点」",
	"handset.lock.s2":      "按提示确认一次锁屏密码",
	"handset.lock.s1.alt":  "有的手机叫 Smart Lock",
	"handset.lock.s1":      "在手机上打开「设置」，搜「延长解锁」",
	"handset.lock.why":     "手机一锁，任务就停。让它在你身边时保持解锁：",
	"handset.lock.sub":     "可选，在手机上设一次",
	"handset.lock.row":     "锁屏时也能借给任务",
	"handset.g":            "只在借出去时看屏幕、点、打字，发送、付款、删除先等你点 Go。银行、钱包、密码、验证器它都碰不到。",
	"handset.off.go":       "停止借用",
	"handset.off.keep":     "留着",
	"handset.off.ask":      "以后不借给任务了？",
	"handset.chip.about":   "任务要用手机时，会先问你借不借。",
	"handset.status.lent":  "正借给一个任务",
	"handset.status.ready": "随时能借给任务",
	"chip.handset":         "用这台手机",
	"handset.elsewhere":    "在 %s 的 Ducter 里加上：安卓要你在手机上亲手开一个开关。",
	"handset.away":         "这台手机现在连不上。在它上面打开 Ducter 就好。",
	"handset.quiet":        "%s 暂时没回应。Ducter 被关掉或断网时会这样；十几秒还不回来，就自动还给你。",
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
	"handset.withdraw":      "取消借用",
	"handset.ask.waiting":   "借给它了，还没开始",
	"handset.remove.means":  "安卓里 Ducter 的开关也会关上。",
	"handset.using":         "「%s」正在用这台手机",
	"handset.stop":          "停止",
	"handset.task":          "正在用你的 %s",
	// D339: the task's head says where it works.
	"handset.where.on": "在你的 %s 上",
	// D339: Settings › 用这台手机: borrowing it while away, never with its screen lock PIN.
	"handset.ask.go":     "借给它",
	"handset.ask.hold":   "不借",
	"handset.setup.go":   "去打开",
	"handset.setup.hold": "先不用",
	"handset.user.done":  "好了",
	// D280: Android's recording prompt is the person's turn, said in every window.
	"handset.record.title":   "在 %s 上点「立即开始」，它才能录屏",
	"handset.record.what":    "这是安卓自己的确认，只在手机上出现，只有你能点。录整个屏幕，不录声音。",
	"handset.record.left":    "还剩 %s",
	"handset.record.hold":    "跳过录制",
	"handset.record.on":      "开始录了",
	"handset.record.skipped": "这次不录",
	"handset.record.gave_up": "手机上没点，这次没录",
}

var enHandset = Table{
	"handset.lock.never":    "Your screen lock stays with Android. Ducter never asks for it.",
	"handset.lock.s3":       "Turn on On-body detection or Trusted places",
	"handset.lock.s2":       "Confirm your screen lock when it asks",
	"handset.lock.s1.alt":   "Some phones call it Smart Lock",
	"handset.lock.s1":       "On the phone, open Settings and search for Extend Unlock",
	"handset.lock.why":      "A locked phone stops the task. Let it stay unlocked while it's with you:",
	"handset.lock.sub":      "Optional, set once on the phone",
	"handset.lock.row":      "Lend it while it's locked",
	"handset.g":             "It sees, taps and types only while lent, and sends, pays or deletes only on your Go. Banks, wallets, passwords and 2FA stay off-limits.",
	"handset.off.go":        "Stop lending",
	"handset.off.keep":      "Keep it",
	"handset.off.ask":       "Stop lending it to tasks?",
	"handset.chip.about":    "When a task needs a phone, it asks you first.",
	"handset.status.lent":   "Lent to a task now",
	"handset.status.ready":  "Ready to lend to tasks",
	"chip.handset":          "Use this phone",
	"handset.elsewhere":     "Add it in Ducter on %s: Android wants you to flip one switch there yourself.",
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
	"handset.withdraw":      "Cancel the loan",
	"handset.ask.waiting":   "Lent, not started yet",

	"handset.remove.means": "Ducter's switch in Android turns off too.",
	"handset.using":        "“%s” is using this phone",
	"handset.stop":         "Stop",
	"handset.task":         "On your %s",
	"handset.where.on":     "on your %s",
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
