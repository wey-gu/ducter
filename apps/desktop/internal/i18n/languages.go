package i18n

// D292: the words of languages themselves (the reply-language list), and
// the small joins and marks views used to choose between by comparing a
// language: a list's separator, quotes, a bracket, a date beside a time.

var zhLanguages = Table{
	"partner.talk.other": "其他语言…",
	"partner.talk.more":  "其他语言",

	"words.sep":       "、",
	"words.quote":     "「%s」",
	"words.quote.sep": "",
	"words.paren":     "%s（%s）",
	"words.and":       "%s、%s",

	"peer.someone": "一个没留名字的 agent",
	"peer.in.host": "%s 里的 agent",
	// D418: one of the person's own agents, by its own words, else as theirs.
	"peer.yours":              "你的 %s",
	"peer.yours.role":         "你的 %s（%s）",
	"peer.own.someone":        "你自己的一个 agent",
	"peer.first.own":          "第一次：%s 通过 Nowledge Mem 连上了 %s。它交来的活、要你定的事，都会这样出现在这里；你的回复会送回它那边。",
	"peer.ping.one":           "%s 发来联络测试，%s",
	"peer.ping.one.late":      "%s 发来联络测试，是 %s发的，%s",
	"peer.ping.many":          "%s 发来 %d 条联络测试，%s",
	"peer.ping.many.late":     "%s 发来 %d 条联络测试，最早的是 %s发的，%s",
	"peer.ping.answered.one":  "已回复",
	"peer.ping.answered.many": "都回了",
	"peer.ping.answering":     "正在回复",
	"peer.ping.failed":        "没回成",
	"peer.ping.failed.some":   "%d 条没回成",

	"cal.rel.date":   "%s %s",
	"cal.when.sep":   " ",
	"cal.date.clock": "%[1]s %[2]s",

	"routine.cal.day": "%d 号",
}

var enLanguages = Table{
	"partner.talk.other": "Other language…",
	"partner.talk.more":  "Other languages",

	"words.sep":       ", ",
	"words.quote":     "“%s”",
	"words.quote.sep": ", ",
	"words.paren":     "%s (%s)",
	"words.and":       "%s and %s",

	"peer.someone": "an unnamed agent",
	"peer.in.host": "an agent in %s",

	// D418: one of the person's own agents, by its own words, else as theirs.
	"peer.yours":              "your %s",
	"peer.yours.role":         "your %s (%s)",
	"peer.own.someone":        "one of your own agents",
	"peer.first.own":          "A first: %s connected to %s through Nowledge Mem. Work it hands over and calls it needs from you will show up here like this; your answer goes back to it.",
	"peer.ping.one":           "%s sent a contact test; %s",
	"peer.ping.one.late":      "%s sent a contact test %s; %s",
	"peer.ping.many":          "%s sent %d contact tests; %s",
	"peer.ping.many.late":     "%s sent %d contact tests, the earliest %s; %s",
	"peer.ping.answered.one":  "answered",
	"peer.ping.answered.many": "all answered",
	"peer.ping.answering":     "answering",
	"peer.ping.failed":        "not answered",
	"peer.ping.failed.some":   "%d not answered",

	"cal.rel.date":   "%s, %s",
	"cal.when.sep":   ", ",
	"cal.date.clock": "%[2]s %[1]s",

	"routine.cal.day": "%d",
}

func init() {
	for k, v := range zhLanguages {
		zh[k] = v
	}
	for k, v := range enLanguages {
		en[k] = v
	}
}
