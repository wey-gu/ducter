package i18n

// D382: 晚点再问我 / Ask me later on an ask. The phone (apps/web/src/i18n.ts)
// uses the same keys for the same words.

var zhLater = Table{
	"later.ask":           "晚点再问我",
	"later.tonight":       "今晚 %s",
	"later.morning":       "明早 %s",
	"later.morning.today": "早上 %s",
	"later.monday":        "下周一 %s",
	"later.pick":          "选个时间…",
	"later.then":          "到时再问我",
	"later.note":          "到时再问你。在那之前，什么都不做。",
	"later.bad.past":      "选一个晚一点的时间。",
	"later.bad.far":       "选 30 天以内的时间。",
	"later.away":          "%s 再问你",
	"later.now":           "现在就定",
	"later.back":          "你说晚点再问，现在来问你。",
	"later.row":           "%s 再问你：%s",
}

var enLater = Table{
	"later.ask":           "Ask me later",
	"later.tonight":       "Tonight, %s",
	"later.morning":       "Tomorrow, %s",
	"later.morning.today": "This morning, %s",
	"later.monday":        "Monday, %s",
	"later.pick":          "Pick a time…",
	"later.then":          "Ask me then",
	"later.note":          "I'll ask you again then. Nothing happens before that.",
	"later.bad.past":      "Pick a time a little later.",
	"later.bad.far":       "Pick a time within 30 days.",
	"later.away":          "Asking again %s",
	"later.now":           "Decide now",
	"later.back":          "You said to ask later, so here it is.",
	"later.row":           "Asking again %s: %s",
}

func init() {
	for k, v := range zhLater {
		zh[k] = v
	}
	for k, v := range enLater {
		en[k] = v
	}
}
