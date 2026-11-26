package i18n

// D426: several things in one message, line by line under it. The same keys
// and words as the web client (apps/web/src/i18n-asks.ts);
// apps/web/test/asks.test.ts keeps them equal.

var zhAsks = Table{
	"asks.count":  "好了 %d 个，还有 %d 个",
	"asks.needs":  "待你处理",
	"asks.failed": "没做成",
	"asks.reply":  "回复这一条",
}

var enAsks = Table{
	"asks.count":  "%d done, %d to go",
	"asks.needs":  "Needs you",
	"asks.failed": "Didn't work",
	"asks.reply":  "Reply to this one",
}

func init() {
	for k, v := range zhAsks {
		zh[k] = v
	}
	for k, v := range enAsks {
		en[k] = v
	}
}
