package i18n

// D565: each partner's figure, its shape, and the one line of how it
// carries itself (never what it can do). The same keys and words as the
// web (apps/web/src/i18n-partners.ts).

var zhFigures = Table{
	"partners.look.butter":       "奶黄",
	"partners.figure":            "它的样子",
	"partners.figure.pebble":     "小石子",
	"partners.figure.bun":        "包子",
	"partners.figure.sprout":     "芽芽",
	"partners.figure.cloud":      "云朵",
	"partners.figure.cube":       "方糖",
	"partners.figure.bean":       "豆豆",
	"partners.figure.air.pebble": "稳稳的，暖暖的",
	"partners.figure.air.bun":    "软乎乎，热乎乎",
	"partners.figure.air.sprout": "好奇，有朝气",
	"partners.figure.air.cloud":  "慢悠悠，不慌不忙",
	"partners.figure.air.cube":   "方方正正，有条不紊",
	"partners.figure.air.bean":   "安安静静，好脾气",
	"partners.figure.label":      "%s，%s",
	"partners.meet":              "挑一个样子。哪个都一样能干，以后随时能换。",
	"said.figure":                "好，我现在是%s了，还是我。",
}

var enFigures = Table{
	"partners.look.butter":       "Butter",
	"partners.figure":            "How it looks",
	"partners.figure.pebble":     "Pebble",
	"partners.figure.bun":        "Bun",
	"partners.figure.sprout":     "Sprout",
	"partners.figure.cloud":      "Cloud",
	"partners.figure.cube":       "Cube",
	"partners.figure.bean":       "Bean",
	"partners.figure.air.pebble": "Steady and warm",
	"partners.figure.air.bun":    "Soft and cosy",
	"partners.figure.air.sprout": "Curious and fresh",
	"partners.figure.air.cloud":  "Easy and unhurried",
	"partners.figure.air.cube":   "Neat and orderly",
	"partners.figure.air.bean":   "Quiet and easygoing",
	"partners.figure.label":      "%s, %s",
	"partners.meet":              "Pick how it looks. Any of them can do the same things, and you can change it any time.",
	"said.figure":                "There: I'm %s now. Still me.",
}

func init() {
	for k, v := range zhFigures {
		zh[k] = v
	}
	for k, v := range enFigures {
		en[k] = v
	}
}
