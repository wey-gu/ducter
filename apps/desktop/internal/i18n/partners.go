package i18n

// D309, D486: 伙伴们 / Your partners (design/personas.md). The
// same keys and words as the web (apps/web/src/i18n-partners.ts). No " · "
// joins (D291).

var zhPartners = Table{
	"partners.title":             "伙伴们",
	"partners.help":              "每个伙伴有自己的名字和对话，互相看不到。你的设备、账号和手头的事是大家一起用的。",
	"partners.add":               "再加一个伙伴",
	"partners.add.help":          "比如一个管工作、一个管家里，或者家里每人一个。",
	"partners.add.name":          "叫它什么",
	"partners.add.placeholder":   "比如：小家",
	"partners.add.go":            "加上",
	"partners.add.cancel":        "不加了",
	"partners.look":              "它的颜色",
	"partners.look.sand":         "沙色",
	"partners.look.sage":         "青苔",
	"partners.look.sky":          "天蓝",
	"partners.look.plum":         "梅子",
	"partners.look.apricot":      "杏色",
	"partners.rename":            "改名字",
	"partners.rename.save":       "好",
	"partners.talking":           "正在聊",
	"partners.error.empty":       "先给它起个名字。",
	"partners.error.long":        "名字短一点，24 个字以内。",
	"partners.error.taken":       "已经有伙伴叫这个名字了。",
	"partners.error.full":        "最多四个伙伴。",
	"partners.error.unknown":     "没改成，再试一次。",
	"partners.say":               "也可以直接跟我说：「再给我做一个管家里事的伙伴」。",
	"partners.about":             "它管什么",
	"partners.about.placeholder": "比如：家里的事、看病、孩子",
	"partners.about.shown":       "管：%s",
	"partners.change":            "改一下",
	"partners.remove":            "移除",
	"partners.remove.ask":        "移除%s？",
	"partners.remove.what":       "它的对话会留着，它的任务交给%s。",
	"partners.remove.go":         "移除",
	"partners.remove.keep":       "留着",
	"partners.passed":            "%s 转过来的",
	"partners.passed.gone":       "另一个伙伴转过来的",
	"partners.asks.from":         "%s 问你",
	"partners.added":             "%s 来了。",
	"partners.switch":            "换到%s",
	"partners.switch.asks":       "换到%s，有 %d 个等你",
}

var enPartners = Table{
	"partners.title":             "Your partners",
	"partners.help":              "Each partner has its own name and conversation, and can't see the others'. Your devices, accounts and On hand are shared.",
	"partners.add":               "Add a partner",
	"partners.add.help":          "One for work and one for home, say, or one for each person in the family.",
	"partners.add.name":          "Its name",
	"partners.add.placeholder":   "For example: Home",
	"partners.add.go":            "Add",
	"partners.add.cancel":        "Cancel",
	"partners.look":              "Its colour",
	"partners.look.sand":         "Sand",
	"partners.look.sage":         "Sage",
	"partners.look.sky":          "Sky",
	"partners.look.plum":         "Plum",
	"partners.look.apricot":      "Apricot",
	"partners.rename":            "Rename",
	"partners.rename.save":       "Save",
	"partners.talking":           "Talking now",
	"partners.error.empty":       "Give it a name first.",
	"partners.error.long":        "Keep the name to 24 characters.",
	"partners.error.taken":       "A partner already has that name.",
	"partners.error.full":        "Four partners at most.",
	"partners.error.unknown":     "That didn't change. Try again.",
	"partners.say":               "Or just tell me: \"make me another partner for things at home\".",
	"partners.about":             "What it looks after",
	"partners.about.placeholder": "For example: home, the doctor, the kids",
	"partners.about.shown":       "Looks after: %s",
	"partners.change":            "Change",
	"partners.remove":            "Remove",
	"partners.remove.ask":        "Remove %s?",
	"partners.remove.what":       "Its conversation is kept, and %s takes over its tasks.",
	"partners.remove.go":         "Remove",
	"partners.remove.keep":       "Keep",
	"partners.passed":            "Passed on by %s",
	"partners.passed.gone":       "Passed on by another partner",
	"partners.asks.from":         "%s asks you",
	"partners.added":             "%s is here.",
	"partners.switch":            "Switch to %s",
	"partners.switch.asks":       "Switch to %s, %d need you",
}

func init() {
	for k, v := range zhPartners {
		zh[k] = v
	}
	for k, v := range enPartners {
		en[k] = v
	}
}
