package i18n

// D469 round 2: the Partner page's head in the partner's own voice. The same key and words as the
// web client (apps/web/src/i18n-settings.ts).

var zhSetCraft = Table{
	"partner.say": "我在 %[1]s 上运行，用 %[2]s 想事情。",
}

var enSetCraft = Table{
	"partner.say": "I run on %[1]s and think with %[2]s.",
}

func init() {
	for k, v := range zhSetCraft {
		zh[k] = v
	}
	for k, v := range enSetCraft {
		en[k] = v
	}
}
