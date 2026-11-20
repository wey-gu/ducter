package i18n

// D438: 小窗 / Mini window, the partner beside whatever the person works in
// (design/ui.md "The mini window"). Mac only.

var zhFloat = Table{
	"float.name":       "小窗",
	"float.show":       "显示小窗",
	"float.hide":       "收起小窗",
	"float.close":      "收起",
	"float.open":       "打开对话",
	"float.needs.open": "在手头的事里看",
	"float.key":        "⌃⌥⌘空格",
	"float.key.taken":  "快捷键被别的应用占用了",
	"float.first":      "我在这儿陪着你。按 %s 可以收起我，再按一次我就回来。",
	"float.first.menu": "我在这儿陪着你。快捷键被别的应用占用了，在菜单栏点「小窗」可以收起我，再点一次我就回来。",
}

var enFloat = Table{
	"float.name":       "Mini window",
	"float.show":       "Show Mini Window",
	"float.hide":       "Hide Mini Window",
	"float.close":      "Hide",
	"float.open":       "Open the conversation",
	"float.needs.open": "See them in On hand",
	"float.key":        "⌃⌥⌘Space",
	"float.key.taken":  "Its shortcut is taken by another app",
	"float.first":      "I'll stay right here. Press %s to put me away, and again to bring me back.",
	"float.first.menu": "I'll stay right here. Another app holds my shortcut, so choose Mini window in the menu bar to put me away, and again to bring me back.",
}

func init() {
	for k, v := range zhFloat {
		zh[k] = v
	}
	for k, v := range enFloat {
		en[k] = v
	}
}
