package i18n

// D210: the opened task as a conversation with the agent, turn by turn. The
// same keys and words as the phone (apps/web/src/i18n.ts). Glossary:
// design/product-model.md (排队中 / Queued, 回到最新 / Jump to latest).
var zhTurns = Table{
	"look.files":          "看了 %d 个文件",
	"look.files.one":      "看了 1 个文件",
	"look.searches":       "搜了 %d 次",
	"look.searches.one":   "搜了 1 次",
	"look.and":            "，",
	"step.lines.more":     "还有 %d 行",
	"turn.earlier":        "显示更早的 %d 步",
	"foot.esc":            "再按一次 Esc 就暂停",
	"foot.keep":           "接着做",
	"jump.latest":         "回到最新",
	"delivery.queued.tag": "排队中",
}

var enTurns = Table{
	"look.files":          "Read %d files",
	"look.files.one":      "Read 1 file",
	"look.searches":       "%d searches",
	"look.searches.one":   "1 search",
	"look.and":            ", ",
	"step.lines.more":     "%d more lines",
	"turn.earlier":        "Show %d earlier steps",
	"foot.esc":            "Press Esc again to pause",
	"foot.keep":           "Keep going",
	"jump.latest":         "Jump to latest",
	"delivery.queued.tag": "Queued",
}

func init() {
	for k, v := range zhTurns {
		zh[k] = v
	}
	for k, v := range enTurns {
		en[k] = v
	}
}
