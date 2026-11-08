// Package i18n holds every user-facing string of the desktop client, by
// key, in Chinese and English (docs/design/product-model.md §1: no court
// vocabulary; partners, not hierarchy). Views never hard-code copy.
package i18n

import (
	"fmt"
	"os"
	"strings"
	"unicode"
)

// Lang is a supported language.
type Lang string

const (
	ZH Lang = "zh"
	EN Lang = "en"
)

// Table maps keys to strings of one language. Strings may hold fmt verbs.
type Table map[string]string

var zh = Table{
	"result.asked":                  "已经跟 %s 说了",
	"task.dossier.body":             "谁在做",
	"task.dossier.reason":           "为什么是它",
	"task.dossier.body.none":        "还没有用量",
	"face.done":                     "%s 刚交回一件事",
	"face.napping":                  "%s 还没醒",
	"weekday.0":                     "周日 %s",
	"weekday.1":                     "周一 %s",
	"weekday.2":                     "周二 %s",
	"weekday.3":                     "周三 %s",
	"weekday.4":                     "周四 %s",
	"weekday.5":                     "周五 %s",
	"weekday.6":                     "周六 %s",
	"decision.no_default":           "这件不会自己动，等你定",
	"decision.answered":             "%s · %s",
	"secret.held":                   "这像是密钥。别发在对话里，我不需要看到它。",
	"secret.send":                   "照样发送",
	"secret.cancel":                 "不发了",
	"outside.title":                 "对外",
	"outside.seen":                  "从对话记录里看到的",
	"outside.none":                  "还没有对外动过",
	"outside.nothing.merged":        "没有 · 已合回本机的 %s，在%s上，没推送",
	"outside.nothing.repo":          "没有 · 改动只在 %s 分支上，在%s上",
	"outside.nothing":               "没有",
	"result.howknow":                "怎么知道的",
	"result.more":                   "+%d",
	"result.merge":                  "合回 %s",
	"result.pr":                     "开草稿 PR",
	"result.changes":                "看改动",
	"result.ask.merge":              "把「%s」的改动合回 %s",
	"result.acting.merge":           "正在合回 %s…",
	"result.acting.open_pr":         "正在开草稿 PR…",
	"result.merged":                 "已经合回 %s",
	"result.merged.toast":           "「%s」合回去了 · %s",
	"result.pr.toast":               "草稿 PR 开好了 · %s",
	"result.action.failed":          "没做成：%s",
	"result.ask.pr":                 "给「%s」开一个草稿 PR",
	"header.working":                "在做 %d 件",
	"header.needs":                  "%d 件等你",
	"header.done":                   "今天交回 %d 件",
	"header.thinking":               "在想…",
	"onhand.calm":                   "现在没有要你定的事。",
	"onhand.calm.working":           "现在没有要你定的事。%s 在做 %d 件，做完会告诉你。",
	"app.title":                     "Ducter",
	"nav.conversation":              "对话",
	"nav.onhand":                    "手头",
	"nav.back":                      "回到对话",
	"header.summary":                "手头 %d 件事，%d 件等你",
	"header.summary.none":           "手头没事，随时说",
	"conn.connecting":               "正在连上…",
	"conn.offline":                  "连不上 Ducter，正在重试",
	"composer.placeholder":          "跟 %s 说点什么…",
	"composer.task":                 "直接跟这件事说",
	"composer.send":                 "发送",
	"composer.label":                "跟 %s 说",
	"empty.conversation":            "说一句话就能开始。要做的事交给我，需要你的时候我会来问。",
	"day.today":                     "今天",
	"decision.go":                   "好",
	"decision.go.label":             "好，%s",
	"decision.hold":                 "先等等",
	"decision.reply":                "回复…",
	"decision.reply.placeholder":    "回复这件事…",
	"decision.default.go":           "你不回的话，%s后我会%s。这一步能撤销。",
	"decision.default.hold":         "你不回的话，我会先停着等你。",
	"decision.default.due":          "默认马上生效",
	"decision.default.label":        "默认：%s",
	"decision.resolved.go":          "已经说好",
	"decision.resolved.hold":        "先等等了",
	"decision.resolved.reply":       "已回复：%s",
	"decision.resolved.default":     "按默认做了",
	"decision.goall":                "都按默认 · %d",
	"living.title":                  "你不在的时候",
	"living.unread":                 "刚更新 · 未读",
	"living.needsyou":               "等你 · %d",
	"living.evidence":               "证据",
	"living.details":                "看细节",
	"state.queued":                  "排队中",
	"state.working":                 "在做",
	"state.needs_you":               "等你",
	"state.blocked":                 "在等",
	"state.done_claimed":            "做完了 · 核对中",
	"state.done":                    "做完了",
	"state.failed":                  "没成",
	"state.dropped":                 "放下了",
	"state.superseded":              "换到别处接着做了",
	"lane.needs_you":                "等你",
	"lane.needs_you.hint":           "需要你一句话的事",
	"lane.working":                  "在做",
	"lane.waiting":                  "在等",
	"lane.done":                     "今天做完",
	"lane.empty":                    "现在没有",
	"count.needs_you":               "等你",
	"count.working":                 "在做",
	"count.waiting":                 "在等",
	"count.done_today":              "今天做完",
	"onhand.title":                  "手头",
	"onhand.forecast":               "接下来什么时候需要你",
	"onhand.open":                   "展开 →",
	"onhand.checking":               "核对中",
	"onhand.loose":                  "随手",
	"onhand.waiting.for":            "在等 · %s",
	"onhand.reported":               "%s汇报",
	"task.transcript":               "对话记录",
	"task.transcript.hint":          "工具调用已折叠",
	"task.brief":                    "任务书 · 来自 %s",
	"task.report":                   "向 %s 汇报",
	"task.report.needs_input":       "向 %s 汇报 · 需要决定",
	"task.report.done":              "向 %s 汇报 · 做完了",
	"task.report.blocked":           "向 %s 汇报 · 卡住了",
	"task.report.failed":            "向 %s 汇报 · 没成",
	"task.checkpoint":               "存档 · %s",
	"task.you":                      "你",
	"task.turn.done":                "这一轮做完了",
	"task.changes":                  "改动 · %d 个文件",
	"task.changes.none":             "还没有改动",
	"task.changes.noplace":          "这件事不在代码仓库里做，没有改动可看",
	"task.changes.error":            "读不到改动：%s",
	"task.changes.refresh":          "刷新",
	"task.dossier.why":              "为什么是 %s",
	"task.dossier.checkpoints":      "存档",
	"task.dossier.checkpoints.none": "还没有存档",
	"task.dossier.evidence":         "证据",
	"task.dossier.evidence.none":    "还没有证据",
	"task.dossier.where":            "在哪儿做",
	"task.loading":                  "正在读这件事的记录…",
	"task.unknown":                  "这件事",
	"place.none":                    "不需要环境",
	"device.local":                  "这台 Mac",
	"time.now":                      "刚刚",
	"time.min":                      "%d 分钟",
	"time.hour":                     "%d 小时",
	"time.ago.min":                  "%d 分钟前",
	"time.ago.hour":                 "%d 小时前",
	"time.opened":                   "开了 %s",
	"time.tomorrow":                 "明天 %s",
	"face.idle":                     "%s 正在待命",
	"face.working":                  "%s 正在做事",
	"face.needs_you":                "%s 有事找你",
	"job.running":                   "在做",
	"job.done":                      "做完了",
	"job.failed":                    "没成",
	"tool.ok":                       "成功",
	"tool.fail":                     "失败",
	"delivery.sending":              "正在送过去…",
	"delivery.steered":              "插进了这一轮",
	"delivery.prompted":             "送到了，开始新一轮",
	"delivery.queued":               "排在这一轮之后",
	"delivery.failed":               "没送到：%s",
	"task.from.partner":             "%s 对它说",
	"task.action.drop":              "放下",
	"task.action.pause":             "先停",
	"task.action.retry":             "再试一次",
	"task.usage":                    "用量 · 输入 %s · 输出 %s",
	"undo.dropped":                  "放下了「%s」",
	"undo.action":                   "撤销",
	"waiter.at":                     "%s 再看",
	"onhand.empty":                  "手头没事。在对话里说一句，%s 就会接着做。",
	"empty.conversation.title":      "你好，我是 %s。",
	"empty.try":                     "可以这样开头",
	"suggest.1":                     "看看 ~/dev/ducter 里哪些测试没过，修好了告诉我",
	"suggest.2":                     "把今天 docs/decisions.md 里新加的决定总结给我",
	"suggest.3":                     "明早 9 点提醒我回 HawDB 那个 PR 的评论",
	"firstrun.title":                "Ducter 还没启动",
	"firstrun.body":                 "在终端运行这一行，Ducter 就在这台 Mac 上开工：",
	"firstrun.copy":                 "复制",
	"firstrun.copied":               "复制好了",
	"firstrun.source":               "从源码运行：在 Ducter 仓库里执行 bun run up",
	"firstrun.retry.in":             "%d 秒后再连一次",
	"firstrun.retrying":             "正在连…",
	"firstrun.retry":                "现在就连",
	"firstrun.where":                "在找 %s",
	"firstrun.auto":                 "不用管这个窗口，连上了它自己会切过去。",
	"firstrun.elsewhere":            "我的 Ducter 在另一台机器上",
	"connect.title":                 "连接到你的 Ducter",
	"connect.body":                  "在运行 Ducter 的那台机器上运行这一行，把它给的地址和配对码填在下面：",
	"connect.address":               "地址",
	"connect.address.placeholder":   "ducter.example.com，或者粘贴整条链接",
	"connect.code":                  "配对码",
	"connect.code.placeholder":      "K7QM-4XPA",
	"connect.code.hint":             "通过 SSH 隧道连 127.0.0.1 时可以不填",
	"connect.go":                    "连上",
	"connect.busy":                  "正在连…",
	"connect.back":                  "返回",
	"connect.safe":                  "配对码只能用一次。之后这台 Mac 会记住这个连接；随时可以在那台机器上用 ducter devices 断开它。",
	"connect.revoked":               "这台 Mac 已经和你的 Ducter 断开了。重新配对一下就能回来。",
	"connect.err.code":              "这个码不对，或者已经过期了。在那台机器上再运行一次 ducter pair。",
	"connect.err.locked":            "试错太多次了。等 10 分钟再试，或者换一个新码。",
	"connect.err.nocode":            "这个地址需要配对码。在那台机器上运行 ducter pair 拿一个。",
	"connect.err.address":           "这看起来不像一个地址。",
	"connect.err.notducter":         "%s 上没有 Ducter 在回应。",
	"connect.err.unreachable":       "连不上 %s。地址对吗？用 SSH 隧道的话，隧道还开着吗？",
}

var en = Table{
	"result.asked":                  "Told %s",
	"task.dossier.body":             "Who's doing it",
	"task.dossier.reason":           "Why this one",
	"task.dossier.body.none":        "No usage yet",
	"face.done":                     "%s just handed something back",
	"face.napping":                  "%s isn't up yet",
	"weekday.0":                     "Sun %s",
	"weekday.1":                     "Mon %s",
	"weekday.2":                     "Tue %s",
	"weekday.3":                     "Wed %s",
	"weekday.4":                     "Thu %s",
	"weekday.5":                     "Fri %s",
	"weekday.6":                     "Sat %s",
	"decision.no_default":           "I won't go ahead on this without you",
	"decision.answered":             "%s · %s",
	"secret.held":                   "This looks like a key. Don't send it in the conversation; I never need to see it.",
	"secret.send":                   "Send anyway",
	"secret.cancel":                 "Don't send",
	"outside.title":                 "Outside",
	"outside.seen":                  "Seen in the transcript",
	"outside.none":                  "Hasn't touched anything outside",
	"outside.nothing.merged":        "Nothing · merged into %s locally · %s · not pushed",
	"outside.nothing.repo":          "Nothing · the changes stay on the %s branch · %s",
	"outside.nothing":               "Nothing",
	"result.howknow":                "How I know",
	"result.more":                   "+%d",
	"result.merge":                  "Merge into %s",
	"result.pr":                     "Open draft PR",
	"result.changes":                "See changes",
	"result.ask.merge":              "Merge the changes from “%s” into %s",
	"result.acting.merge":           "Merging into %s…",
	"result.acting.open_pr":         "Opening a draft PR…",
	"result.merged":                 "Merged into %s",
	"result.merged.toast":           "“%s” is merged · %s",
	"result.pr.toast":               "Draft PR is open · %s",
	"result.action.failed":          "Didn't work: %s",
	"result.ask.pr":                 "Open a draft PR for “%s”",
	"header.working":                "Working on %d",
	"header.needs":                  "%d need you",
	"header.done":                   "%d handed back today",
	"header.thinking":               "Thinking…",
	"onhand.calm":                   "Nothing needs you right now.",
	"onhand.calm.working":           "Nothing needs you right now. %s is working on %d and will tell you when they're done.",
	"app.title":                     "Ducter",
	"nav.conversation":              "Conversation",
	"nav.onhand":                    "On hand",
	"nav.back":                      "Back to the conversation",
	"header.summary":                "%d tasks on hand, %d need you",
	"header.summary.none":           "Nothing on hand. Say anything.",
	"conn.connecting":               "Connecting…",
	"conn.offline":                  "Can't reach Ducter, retrying",
	"composer.placeholder":          "Say something to %s…",
	"composer.task":                 "Talk to this task",
	"composer.send":                 "Send",
	"composer.label":                "Talk to %s",
	"empty.conversation":            "Say one thing to begin. Hand me the work; I'll come to you when it needs you.",
	"day.today":                     "Today",
	"decision.go":                   "Go",
	"decision.go.label":             "Go: %s",
	"decision.hold":                 "Hold",
	"decision.reply":                "Reply…",
	"decision.reply.placeholder":    "Reply about this…",
	"decision.default.go":           "If you don't answer, I'll %[2]s in %[1]s. It can be undone.",
	"decision.default.hold":         "If you don't answer, I'll hold and wait for you.",
	"decision.default.due":          "The default applies now",
	"decision.default.label":        "Default: %s",
	"decision.resolved.go":          "Agreed",
	"decision.resolved.hold":        "On hold",
	"decision.resolved.reply":       "Replied: %s",
	"decision.resolved.default":     "Went with the default",
	"decision.goall":                "Go on all defaults · %d",
	"living.title":                  "While you were away",
	"living.unread":                 "Just updated · unread",
	"living.needsyou":               "Needs you · %d",
	"living.evidence":               "Evidence",
	"living.details":                "Details",
	"state.queued":                  "Queued",
	"state.working":                 "Working",
	"state.needs_you":               "Needs you",
	"state.blocked":                 "Waiting",
	"state.done_claimed":            "Done · checking",
	"state.done":                    "Done",
	"state.failed":                  "Didn't work",
	"state.dropped":                 "Dropped",
	"state.superseded":              "Continued elsewhere",
	"lane.needs_you":                "Needs you",
	"lane.needs_you.hint":           "Things that need a word from you",
	"lane.working":                  "Working",
	"lane.waiting":                  "Waiting",
	"lane.done":                     "Done today",
	"lane.empty":                    "None right now",
	"count.needs_you":               "Needs you",
	"count.working":                 "Working",
	"count.waiting":                 "Waiting",
	"count.done_today":              "Done today",
	"onhand.title":                  "On hand",
	"onhand.forecast":               "When you'll be needed next",
	"onhand.open":                   "Open →",
	"onhand.checking":               "Checking",
	"onhand.loose":                  "Loose",
	"onhand.waiting.for":            "Waiting · %s",
	"onhand.reported":               "reported %s",
	"task.transcript":               "Transcript",
	"task.transcript.hint":          "Tool calls collapsed",
	"task.brief":                    "Brief · from %s",
	"task.report":                   "Report to %s",
	"task.report.needs_input":       "Report to %s · needs a decision",
	"task.report.done":              "Report to %s · done",
	"task.report.blocked":           "Report to %s · stuck",
	"task.report.failed":            "Report to %s · didn't work",
	"task.checkpoint":               "Checkpoint · %s",
	"task.you":                      "You",
	"task.turn.done":                "Turn done",
	"task.changes":                  "Changes · %d files",
	"task.changes.none":             "No changes yet",
	"task.changes.noplace":          "This task doesn't work in a repo, so there are no changes to show",
	"task.changes.error":            "Can't read the changes: %s",
	"task.changes.refresh":          "Refresh",
	"task.dossier.why":              "Why %s",
	"task.dossier.checkpoints":      "Checkpoints",
	"task.dossier.checkpoints.none": "No checkpoints yet",
	"task.dossier.evidence":         "Evidence",
	"task.dossier.evidence.none":    "No evidence yet",
	"task.dossier.where":            "Where",
	"task.loading":                  "Reading this task's history…",
	"task.unknown":                  "This task",
	"place.none":                    "No environment",
	"device.local":                  "This Mac",
	"time.now":                      "just now",
	"time.min":                      "%d min",
	"time.hour":                     "%d h",
	"time.ago.min":                  "%d min ago",
	"time.ago.hour":                 "%d h ago",
	"time.opened":                   "open %s",
	"time.tomorrow":                 "tomorrow %s",
	"face.idle":                     "%s is standing by",
	"face.working":                  "%s is working",
	"face.needs_you":                "%s needs you",
	"job.running":                   "Working",
	"job.done":                      "Done",
	"job.failed":                    "Didn't work",
	"tool.ok":                       "ok",
	"tool.fail":                     "failed",
	"delivery.sending":              "Sending…",
	"delivery.steered":              "Steered into this turn",
	"delivery.prompted":             "Delivered as the next turn",
	"delivery.queued":               "Queued after this turn",
	"delivery.failed":               "Not delivered: %s",
	"task.from.partner":             "%s told it",
	"task.action.drop":              "Drop",
	"task.action.pause":             "Pause",
	"task.action.retry":             "Try again",
	"task.usage":                    "Usage · %s in · %s out",
	"undo.dropped":                  "Dropped “%s”",
	"undo.action":                   "Undo",
	"waiter.at":                     "back at %s",
	"onhand.empty":                  "Nothing on hand. Say one thing in the conversation and %s picks it up.",
	"empty.conversation.title":      "Hi, I'm %s.",
	"empty.try":                     "You could start with",
	"suggest.1":                     "Find the failing tests in ~/dev/ducter, fix them, and tell me",
	"suggest.2":                     "Summarize what's new in docs/decisions.md today",
	"suggest.3":                     "Remind me at 9 tomorrow to answer the comments on the HawDB PR",
	"firstrun.title":                "Ducter isn't running yet",
	"firstrun.body":                 "Run this in a terminal and Ducter starts working on this Mac:",
	"firstrun.copy":                 "Copy",
	"firstrun.copied":               "Copied",
	"firstrun.source":               "From source: run bun run up in the Ducter repo",
	"firstrun.retry.in":             "Trying again in %d s",
	"firstrun.retrying":             "Connecting…",
	"firstrun.retry":                "Try now",
	"firstrun.where":                "Looking for %s",
	"firstrun.auto":                 "Leave this window open; it switches over by itself once Ducter is up.",
	"firstrun.elsewhere":            "My Ducter is on another machine",
	"connect.title":                 "Connect to your Ducter",
	"connect.body":                  "On the machine running Ducter, run this, then enter the address and pairing code it shows:",
	"connect.address":               "Address",
	"connect.address.placeholder":   "ducter.example.com, or paste the whole link",
	"connect.code":                  "Pairing code",
	"connect.code.placeholder":      "K7QM-4XPA",
	"connect.code.hint":             "Not needed for 127.0.0.1 through an SSH tunnel",
	"connect.go":                    "Connect",
	"connect.busy":                  "Connecting…",
	"connect.back":                  "Back",
	"connect.safe":                  "The code works once. After that this Mac remembers the connection; disconnect it anytime with ducter devices on that machine.",
	"connect.revoked":               "This Mac was disconnected from your Ducter. Pair it again to come back.",
	"connect.err.code":              "That code is wrong or has expired. Run ducter pair on that machine again.",
	"connect.err.locked":            "Too many wrong codes. Wait 10 minutes, or get a new code.",
	"connect.err.nocode":            "This address needs a pairing code. Get one by running ducter pair on that machine.",
	"connect.err.address":           "That doesn't look like an address.",
	"connect.err.notducter":         "Nothing at %s answers like a Ducter.",
	"connect.err.unreachable":       "Can't reach %s. Is the address right? If you use an SSH tunnel, is it still open?",
}

// Tables returns the tables by language, for tests.
func Tables() map[Lang]Table { return map[Lang]Table{ZH: zh, EN: en} }

// Strings translates keys in one language.
type Strings struct {
	Lang  Lang
	table Table
}

// New returns the strings of a language (English for an unknown one).
func New(l Lang) *Strings {
	if l == ZH {
		return &Strings{Lang: ZH, table: zh}
	}
	return &Strings{Lang: EN, table: en}
}

// T translates key, formatting args into it. A missing key shows itself,
// so it is seen and fixed.
func (s *Strings) T(key string, args ...any) string {
	v, ok := s.table[key]
	if !ok {
		if v, ok = en[key]; !ok {
			return key
		}
	}
	if len(args) == 0 {
		return v
	}
	return fmt.Sprintf(v, args...)
}

// Detect picks the language: DUCTER_LOCALE, else the system's preferred
// languages (as mygo reports them), else LANG, else English.
func Detect(preferred []string) Lang {
	if l := os.Getenv("DUCTER_LOCALE"); l != "" {
		return parse(l)
	}
	for _, p := range preferred {
		if l := parse(p); l != "" {
			return l
		}
	}
	if l := parse(os.Getenv("LANG")); l != "" {
		return l
	}
	return EN
}

// Fixed reports whether DUCTER_LOCALE pins the language.
func Fixed() bool { return os.Getenv("DUCTER_LOCALE") != "" }

// FromText guesses the language a person writes in: Chinese with any Han
// character, English with Latin words and none, else "".
func FromText(text string) Lang {
	latin := 0
	for _, r := range text {
		switch {
		case unicode.Is(unicode.Han, r):
			return ZH
		case r < 0x80 && unicode.IsLetter(r):
			latin++
		}
	}
	if latin >= 3 {
		return EN
	}
	return ""
}

func parse(tag string) Lang {
	tag = strings.ToLower(tag)
	switch {
	case strings.HasPrefix(tag, "zh"):
		return ZH
	case strings.HasPrefix(tag, "en"):
		return EN
	}
	return ""
}
