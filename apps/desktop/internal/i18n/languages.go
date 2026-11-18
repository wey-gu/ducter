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
