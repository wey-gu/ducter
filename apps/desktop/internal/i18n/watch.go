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
	// D353: what the last look found, its own fact; when it looks next, the one number.
	"watch.nothing":   "还没有新的",
	"watch.next.min":  "%d 分钟后再看",
	"watch.next.hour": "%d 小时后再看",
	"watch.next.day":  "%d 天后再看",
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
	"watch.nothing":   "Nothing new yet",
	"watch.next.min":  "Next look in %d min",
	"watch.next.hour": "Next look in %d h",
	"watch.next.day":  "Next look in %d d",
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
