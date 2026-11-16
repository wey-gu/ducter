package i18n

// D297, 额度 / limit: a task whose agent's usage limit ran out rests until
// the reset and carries on by itself; the card's two actions; the choice to
// hand it to another AI agent right away; On hand's group of tasks on one
// account; the transcript's lines. The same keys and words as the web client
// (apps/web/src/i18n-limits.ts). No " · " joins (D291).

var zhLimits = Table{
	"limit.state":         "额度 %s 恢复",
	"limit.state.unknown": "等额度恢复",
	"limit.line":          "等 %s 的额度恢复",
	"limit.head":          "%s 的额度用完了",
	"limit.back":          "额度 %s 恢复，到时接着做",
	"limit.back.unknown":  "额度恢复后接着做，%s 先去试一次",
	"limit.handoff":       "现在换 %s 接着做",
	"limit.cancel":        "先停下",
	"limit.auto":          "以后额度用完，直接换别的 AI agent 接着做",
	"limit.met":           "额度恢复了，接着做",
	"limit.group":         "%s 的额度 %s 恢复",
	"limit.group.unknown": "%s 的额度用完了",
	"limit.group.n":       "这 %d 件到时一起接着做",
	"note.limit":          "%s 的额度用完了，%s 恢复后接着做",
	"note.limit.unknown":  "%s 的额度用完了",
	"wake.limit":          "%s 的额度恢复了，%s 接着做",
}

var enLimits = Table{
	"limit.state":         "Limit resets %s",
	"limit.state.unknown": "Waiting for the limit",
	"limit.line":          "Waiting until %s's limit resets",
	"limit.head":          "%s's limit is used up",
	"limit.back":          "The limit resets at %s, and it carries on then",
	"limit.back.unknown":  "It carries on once the limit is back, and tries again at %s",
	"limit.handoff":       "Hand it to %s now",
	"limit.cancel":        "Stop here",
	"limit.auto":          "Next time a limit runs out, hand it to another AI agent right away",
	"limit.met":           "The limit is back, carrying on",
	"limit.group":         "%s's limit resets %s",
	"limit.group.unknown": "%s's limit ran out",
	"limit.group.n":       "These %d carry on together then",
	"note.limit":          "%s's limit ran out; it carries on after it resets at %s",
	"note.limit.unknown":  "%s's limit ran out",
	"wake.limit":          "%s's limit came back at %s, carrying on",
}

func init() {
	for k, v := range zhLimits {
		zh[k] = v
	}
	for k, v := range enLimits {
		en[k] = v
	}
}
