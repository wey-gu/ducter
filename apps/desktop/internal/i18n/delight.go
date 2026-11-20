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
	"notify.pv.off":     "不弹出来：它在「手头的事」里等你。",
	// To-do sources: what the choice does, as the row's line (a standing go says itself instead).
	"todos.what.new.tell":          "新的来了，在对话里跟你说一声。",
	"todos.what.new.take":          "新的来了直接开始做，一天最多 5 个。",
	"todos.what.new.quiet":         "你问起来再看。",
	"todos.what.done.ask":          "做完先问你，再在 issue 下留言。",
	"todos.what.done.comment":      "做完自己留言；要关掉还是先问你。",
	"todos.what.done.close":        "做完自己留言，并关掉 issue。",
	"todos.what.done.tick":         "做完在笔记里勾掉；想撤回，把勾点掉就行。",
	"todos.what.done.ask.obsidian": "做完先问你，再勾掉。",
	"todos.what.done.leave":        "做完不动你的笔记。",
}

var enDelight = Table{
	"notify.pv":                    "What a notification looks like",
	"notify.pv.now":                "now",
	"notify.pv.ask":                "Two ways to fix CI. Try the smaller change first?",
	"notify.pv.default":            "No answer in %s, and I'll try it.",
	"notify.pv.quiet":              "Silent from %s to %s; you hear it all after.",
	"notify.pv.anytime":            "It can ring any time.",
	"notify.pv.off":                "No pop-up: it waits for you in On hand.",
	"todos.what.new.tell":          "New ones: a word in the conversation.",
	"todos.what.new.take":          "New ones start by themselves, up to 5 a day.",
	"todos.what.new.quiet":         "Looked at when you ask.",
	"todos.what.done.ask":          "Done: it asks before commenting on the issue.",
	"todos.what.done.comment":      "Done: it comments; closing still asks.",
	"todos.what.done.close":        "Done: it comments and closes the issue.",
	"todos.what.done.tick":         "Done: ticked off in your note; untick to undo.",
	"todos.what.done.ask.obsidian": "Done: it asks before ticking it off.",
	"todos.what.done.leave":        "Done: your note stays as it is.",
}

func init() {
	for k, v := range zhDelight {
		zh[k] = v
	}
	for k, v := range enDelight {
		en[k] = v
	}
}
