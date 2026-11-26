package i18n

// D538: 关于这台 / About this computer on a device card: what the computer
// measured of itself, and the person's computer rules about it (多放 / 少放
// this computer for heavy work, web work or all work); and where a task
// waits for room. The same keys and words as the web client's i18n.ts.
var zhAbout = Table{
	"where.reason.room":  "%s 内存不够",
	"where.waiting.room": "在等 %s 腾出内存",
	"switch.waits.room":  "等它腾出内存再做",
	"about.title":        "关于这台",
	"about.sum":          "%s 内存，空着 %s",
	"about.measured":     "它自己量的",
	"about.mem":          "内存 %s，现在空着 %s",
	"about.heavy":        "构建、测试这类重活，一次能放 %d 个",
	"about.heavy.none":   "现在放不下重活：空着的内存不到 3 GB",
	"about.cores":        "%d 核",
	"about.cores.calm":   "%d 核，现在不忙",
	"about.cores.some":   "%d 核，现在有点忙",
	"about.cores.busy":   "%d 核，现在很忙",
	"about.disk":         "硬盘还剩 %s",
	"about.gpu":          "显卡 %s",
	"about.oom":          "过去一天内存不够，停掉过 %d 个程序",
	"about.on":           "一直开着，不会睡",
	"about.sleeps":       "合上就睡",
	"about.said":         "你说过",
	"about.none":         "想让哪类活多放或少放这台，跟我说一声，或者在这里加一条。",
	"about.add":          "加一条",
	"about.way":          "多放还是少放",
	"about.more":         "多放这台",
	"about.less":         "少放这台",
	"about.which":        "哪类活",
	"about.w.heavy":      "重活",
	"about.w.web":        "上网的活",
	"about.w.all":        "所有活",
	"about.rule.more":    "这台多放%s",
	"about.rule.less":    "这台少放%s",
	"about.rule.w.heavy": "构建、测试这类重活",
	"about.rule.w.web":   "上网的活",
	"about.rule.w.all":   "活",
	"about.inmem":        "也记在 Nowledge Mem 里，你别的 AI 也知道",
	"about.keep":         "记下",
	"about.cancel":       "取消",
	"about.edit":         "修改",
	"about.remove":       "移除",
	"about.removed":      "不再按「%s」放了",
}

var enAbout = Table{
	"where.reason.room":  "%s is short on memory",
	"where.waiting.room": "Waiting for room on %s",
	"switch.waits.room":  "Waits until it has room",
	"about.title":        "About this computer",
	"about.sum":          "%s, %s free",
	"about.measured":     "Measured here",
	"about.mem":          "Memory %s, %s free now",
	"about.heavy":        "Room for %d heavy jobs at once (builds, tests)",
	"about.heavy.none":   "No room for heavy work now: under 3 GB free",
	"about.cores":        "%d cores",
	"about.cores.calm":   "%d cores, not busy now",
	"about.cores.some":   "%d cores, a little busy now",
	"about.cores.busy":   "%d cores, busy now",
	"about.disk":         "%s of disk free",
	"about.gpu":          "Graphics: %s",
	"about.oom":          "Ran out of memory %d times in the last day",
	"about.on":           "Always on, never sleeps",
	"about.sleeps":       "Sleeps when closed",
	"about.said":         "You said",
	"about.none":         "Tell me which work to put here more or less, or add it here.",
	"about.add":          "Add one",
	"about.way":          "More or less",
	"about.more":         "More here",
	"about.less":         "Less here",
	"about.which":        "Which work",
	"about.w.heavy":      "Heavy",
	"about.w.web":        "Web",
	"about.w.all":        "All",
	"about.rule.more":    "More %s here",
	"about.rule.less":    "Less %s here",
	"about.rule.w.heavy": "heavy work (builds, tests)",
	"about.rule.w.web":   "web work",
	"about.rule.w.all":   "work",
	"about.inmem":        "Also in Nowledge Mem, so your other AIs know",
	"about.keep":         "Keep",
	"about.cancel":       "Cancel",
	"about.edit":         "Edit",
	"about.remove":       "Remove",
	"about.removed":      "No longer placing by “%s”",
}

func init() {
	for k, v := range zhAbout {
		zh[k] = v
	}
	for k, v := range enAbout {
		en[k] = v
	}
}
