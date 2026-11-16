package i18n

// D279: a task resting on a wait of its own says when it comes back (its
// state, its rows, its end line); the watch card's ring, its looks so far,
// and the moment the wait comes true. The same keys and words as the phone
// (apps/web/src/i18n.ts). Glossary: design/product-model.md.
var zhWatch = Table{
	"watch.back":      "%s 回来",
	"watch.back.when": "有动静就回来",
	"watch.timer":     "到点就接着做",
	"watch.left.min":  "%d 分",
	"watch.left.hour": "%d 小时",
	"watch.left.day":  "%d 天",
	"watch.tally":     "看了 %d 次",
	"watch.tally.one": "看了 1 次",
	"watch.last":      "上次%s",
	"watch.last.not":  "上次%s，还没有",
	"watch.met":       "等到了，接着做",
}

var enWatch = Table{
	"watch.back":      "Back at %s",
	"watch.back.when": "Back when it happens",
	"watch.timer":     "Carries on when it's time",
	"watch.left.min":  "%d min",
	"watch.left.hour": "%d h",
	"watch.left.day":  "%d d",
	"watch.tally":     "Looked %d times",
	"watch.tally.one": "Looked once",
	"watch.last":      "Last at %s",
	"watch.last.not":  "Last at %s: not yet",
	"watch.met":       "Wait over, carrying on",
}

func init() {
	for k, v := range zhWatch {
		zh[k] = v
	}
	for k, v := range enWatch {
		en[k] = v
	}
}
