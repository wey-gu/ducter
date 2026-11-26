package i18n

// D445: Settings, the second polish round (delight and flow). Notifications
// shows what a notification would look like, live with the pane's choices.
// The phone (apps/web/src/i18n-delight.ts) uses the same keys for the same words.

var zhDelight = Table{
	"notify.pv":         "通知会是这样",
	"notify.pv.now":     "现在",
	"notify.pv.ask":     "CI 有两种修法，先试改动小的那个？",
	"notify.pv.default": "%s内没回，我就先试它。",
	"notify.pv.quiet":   "%s 到 %s 不响，到点一起告诉你。",
	"notify.pv.anytime": "随时会响。",
	"notify.pv.off":     "不弹出来：它在「任务」里等你。",
	// To-do sources: what the choice does, as the row's line (a standing go says itself instead).
	"todos.what.new.tell":          "在对话里跟你说一声。",
	"todos.what.new.take":          "直接开始做，一天最多 5 个。",
	"todos.what.new.quiet":         "你问起来再看。",
	"todos.what.done.ask":          "先问你，再在 issue 下留言。",
	"todos.what.done.comment":      "自己留言；要关掉还是先问你。",
	"todos.what.done.close":        "自己留言，并关掉 issue。",
	"todos.what.done.tick":         "在笔记里勾掉；想撤回，把勾点掉就行。",
	"todos.what.done.ask.obsidian": "先问你，再勾掉。",
	"todos.what.done.leave":        "不动你的笔记。",
}

var enDelight = Table{
	"notify.pv":                    "What a notification looks like",
	"notify.pv.now":                "now",
	"notify.pv.ask":                "Two ways to fix CI. Try the smaller change first?",
	"notify.pv.default":            "No answer in %s, and I'll try it.",
	"notify.pv.quiet":              "Silent from %s to %s; you hear it all after.",
	"notify.pv.anytime":            "It can ring any time.",
	"notify.pv.off":                "No pop-up: it waits for you in Tasks.",
	"todos.what.new.tell":          "A word in the conversation.",
	"todos.what.new.take":          "They start by themselves, up to 5 a day.",
	"todos.what.new.quiet":         "Looked at when you ask.",
	"todos.what.done.ask":          "I ask before commenting on the issue.",
	"todos.what.done.comment":      "It comments; closing still asks.",
	"todos.what.done.close":        "It comments and closes the issue.",
	"todos.what.done.tick":         "Ticked off in your note; untick to undo.",
	"todos.what.done.ask.obsidian": "I ask before ticking it off.",
	"todos.what.done.leave":        "Your note stays as it is.",
}

func init() {
	for k, v := range zhDelight {
		zh[k] = v
	}
	for k, v := range enDelight {
		en[k] = v
	}
}
