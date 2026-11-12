package i18n

// D224: 全部更新 / Update all. The web uses the same keys and words
// (apps/web/src/i18n-updateall.ts); a test keeps them equal. A running
// step's own words are the single update's (devup.phase.*, agentv.phase.*).

var zhUpdateAll = Table{
	"upall.title":             "有 %d 项更新",
	"upall.title.one":         "有 1 项更新",
	"upall.button":            "全部更新",
	"upall.button.one":        "更新",
	"upall.order":             "先更新 %s，再更新其他电脑，最后是各台电脑上的 AI。正在做的事不会被打断。",
	"upall.order.solo":        "正在做的事不会被打断：用到某个 AI 的事停下后，才更新那个 AI。",
	"upall.more":              "还有 %d 项",
	"upall.item.ducter":       "%s 上的 Ducter",
	"upall.item.agent":        "%[2]s 上的 %[1]s",
	"upall.versions":          "%s → %s",
	"upall.running":           "正在全部更新",
	"upall.running.one":       "正在更新",
	"upall.state.queued":      "排队中",
	"upall.state.waiting":     "等用它的 %d 件事停下",
	"upall.state.waiting.one": "等用它的那件事停下",
	"upall.state.done":        "已更新到 %s",
	"upall.state.failed":      "没能更新",
	"upall.state.rolledback":  "没能更新，已换回 %s",
	"upall.state.home":        "%s 没能更新，这台保持原版本",
	"upall.state.offline":     "连不上，未更新",
	"upall.state.stopped":     "已停止",
	"upall.why.no_answer":     "开始更新以后，一直没有收到它的结果。",
	"upall.stop":              "停止剩下的",
	"upall.done.all":          "已全部更新",
	"upall.done.some":         "已更新 %d 项，%d 项没能更新",
	"upall.done.stopped":      "已停止，已更新 %d 项",
	"upall.retry":             "再试一次",
	"upall.dismiss":           "完成",
	"upall.notnow.offline":    "%s 现在连不上，醒来后再更新。",
	"upall.notnow.app_old":    "%s 上的 Ducter 要在那台 Mac 上更新一次。",
	"upall.notnow.other":      "%s 上的 Ducter 要另外更新。",
	"upall.auto":              "以后自动更新",
	"upall.auto.note":         "在免打扰时段里（没设就是夜里 3 点到 5 点）、没有事在做的时候，按同样的顺序更新；AI 只更新到 Ducter 验证过的版本。",
	"upall.app.mac":           "这台 Mac 上的 Ducter 应用",
	"upall.app.last":          "最后重启",
	"upall.app.ready":         "已下载，最后重启",
	"upall.page.reload":       "这个页面会在最后重新载入。",
	"upall.android":           "最后，安卓 App 会检查自己的更新。",
}

var enUpdateAll = Table{
	"upall.title":             "%d updates",
	"upall.title.one":         "1 update",
	"upall.button":            "Update all",
	"upall.button.one":        "Update",
	"upall.order":             "%s first, then the other computers, then the AI agents on each. Nothing running is cut off.",
	"upall.order.solo":        "Nothing running is cut off: an AI agent updates once the tasks using it pause.",
	"upall.more":              "%d more",
	"upall.item.ducter":       "Ducter on %s",
	"upall.item.agent":        "%[1]s on %[2]s",
	"upall.versions":          "%s → %s",
	"upall.running":           "Updating everything",
	"upall.running.one":       "Updating",
	"upall.state.queued":      "Queued",
	"upall.state.waiting":     "Waiting for %d tasks using it to pause",
	"upall.state.waiting.one": "Waiting for the task using it to pause",
	"upall.state.done":        "Updated to %s",
	"upall.state.failed":      "Didn't update",
	"upall.state.rolledback":  "Didn't update; back on %s",
	"upall.state.home":        "Kept as is: %s didn't update",
	"upall.state.offline":     "Couldn't reach it; not updated",
	"upall.state.stopped":     "Stopped",
	"upall.why.no_answer":     "It never said how the update ended.",
	"upall.stop":              "Stop the rest",
	"upall.done.all":          "All updated",
	"upall.done.some":         "%d updated, %d didn't",
	"upall.done.stopped":      "Stopped; %d updated",
	"upall.retry":             "Try again",
	"upall.dismiss":           "Done",
	"upall.notnow.offline":    "Can't reach %s now; update it when it's awake.",
	"upall.notnow.app_old":    "Update Ducter on %s once, on that Mac.",
	"upall.notnow.other":      "Ducter on %s updates another way.",
	"upall.auto":              "Keep everything up to date",
	"upall.auto.note":         "In quiet hours (3–5 am if none are set), when nothing is running, in the same order; AI agents only to versions Ducter has checked.",
	"upall.app.mac":           "The Ducter app on this Mac",
	"upall.app.last":          "Restarts last",
	"upall.app.ready":         "Downloaded; restarts last",
	"upall.page.reload":       "This page reloads at the end.",
	"upall.android":           "At the end, the Android app checks for its own update.",
}

func init() {
	for k, v := range zhUpdateAll {
		zh[k] = v
	}
	for k, v := range enUpdateAll {
		en[k] = v
	}
}
