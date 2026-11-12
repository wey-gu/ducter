package i18n

// D156: each AI agent's version on a device card, the update with its own
// updater, and its steps. Glossary: design/product-model.md.
var zhAgentVer = Table{
	"agentv.version":           "版本 %s",
	"agentv.available":         "有新版本 %s",
	"agentv.current":           "已经是最新的",
	"agentv.button":            "更新",
	"agentv.retry":             "再试一次",
	"agentv.how.app":           "随 %s app 更新",
	"agentv.how.ducter":        "随 Ducter 更新",
	"agentv.how.unknown":       "不知道它是怎么装的，在原来的地方更新它。",
	"agentv.unverified":        "Ducter 还没验证过这个版本。",
	"agentv.latest.unverified": "Ducter 还没验证过 %s，要等你点一下才装。",
	"agentv.phase.waiting":     "等它手上的事停下…",
	"agentv.phase.updating":    "正在更新到 %s…",
	"agentv.phase.checking":    "在检查 %s…",
	"agentv.phase.done":        "已更新到 %s",
	"agentv.phase.failed":      "没能更新",
	"agentv.phase.rolledback":  "没能更新，已经换回 %s",
	"agentv.away":              "%s 现在连不上，等它醒着再更新。",
	"agentv.why.how":           "这一份不从这里更新。",
	"agentv.why.offline":       "那台电脑现在连不上。",
	"agentv.why.running":       "已经在更新了。",
	"agentv.why.busy":          "它手上的事一直没停，等做完再试。",
	"agentv.why.network":       "连不上它的更新渠道，等有网了再试。",
	"agentv.why.no_update":     "没有更新的版本。",
	"agentv.why.unverified":    "Ducter 还没验证过那个版本。",
	"agentv.why.version":       "新版本没有回应。",
	"agentv.why.signed_out":    "更新以后需要重新登录。",
	"agentv.why.unchanged":     "更新程序跑完了，版本没变。",
	"agentv.why.interrupted":   "更新时那台电脑上的 Ducter 重启了，把它打断了。",
	"agentv.why.failed":        "出了点问题，再试一次。",
}

var enAgentVer = Table{
	"agentv.version":           "Version %s",
	"agentv.available":         "Update to %s",
	"agentv.current":           "Up to date",
	"agentv.button":            "Update",
	"agentv.retry":             "Try again",
	"agentv.how.app":           "Updates with the %s app",
	"agentv.how.ducter":        "Updates with Ducter",
	"agentv.how.unknown":       "Installed some other way; update it where it came from.",
	"agentv.unverified":        "Ducter hasn't checked this version yet.",
	"agentv.latest.unverified": "Ducter hasn't checked %s yet, so it waits for your tap.",
	"agentv.phase.waiting":     "Waiting for its work to settle…",
	"agentv.phase.updating":    "Updating to %s…",
	"agentv.phase.checking":    "Checking %s…",
	"agentv.phase.done":        "Done, now on %s",
	"agentv.phase.failed":      "Didn't update",
	"agentv.phase.rolledback":  "Didn't update; back on %s",
	"agentv.away":              "%s can't be reached right now; update it when it's awake.",
	"agentv.why.how":           "This copy isn't updated from here.",
	"agentv.why.offline":       "That computer can't be reached right now.",
	"agentv.why.running":       "It's already updating.",
	"agentv.why.busy":          "Its work kept running; try again when it's done.",
	"agentv.why.network":       "Couldn't reach where it updates from; try again when online.",
	"agentv.why.no_update":     "Nothing newer is out.",
	"agentv.why.unverified":    "Ducter hasn't checked that version yet.",
	"agentv.why.version":       "The new version didn't answer.",
	"agentv.why.signed_out":    "After the update its sign-in stopped working.",
	"agentv.why.unchanged":     "Its updater ran, but the version didn't change.",
	"agentv.why.interrupted":   "Ducter on that computer restarted during the update and cut it off.",
	"agentv.why.failed":        "Something went wrong; try again.",
}

func init() {
	for k, v := range zhAgentVer {
		zh[k] = v
	}
	for k, v := range enAgentVer {
		en[k] = v
	}
}
