package i18n

// D216: On hand as a workspace: Find, a draft PR or a merge on a row, many
// at once, and the switcher. The web uses the same keys and words
// (apps/web/src/i18n-onhand.ts); a test keeps them equal.

var zhOnhand = Table{
	"onhand.find.placeholder": "找一件事…",
	"onhand.find.none":        "没有对得上的。",
	"onhand.pr.draft":         "草稿 PR",
	"onhand.pr.merged":        "已合并",
	"onhand.sel.n":            "选了 %d 件",
	"onhand.sel.merge":        "合并 %d 件",
	"onhand.sel.pr":           "开 %d 个草稿 PR",
	"onhand.sel.pause":        "暂停 %d 件",
	"onhand.sel.drop":         "%d 件不做了…",
	"onhand.sel.drop.ask":     "这 %d 件都不做了？",
	"onhand.sel.drop.yes":     "都不做了",
	"onhand.sel.drop.no":      "再想想",
	"onhand.sel.clear":        "不选了",
	"switch.label":            "打开一件事",
	"switch.menu":             "打开一件事…",
	"switch.placeholder":      "打开哪件事？打几个字…",
	"switch.new":              "新建：「%s」",
}

var enOnhand = Table{
	"onhand.find.placeholder": "Find a task…",
	"onhand.find.none":        "Nothing matches.",
	"onhand.pr.draft":         "Draft PR",
	"onhand.pr.merged":        "Merged",
	"onhand.sel.n":            "%d selected",
	"onhand.sel.merge":        "Merge %d",
	"onhand.sel.pr":           "Open %d draft PRs",
	"onhand.sel.pause":        "Pause %d",
	"onhand.sel.drop":         "Cancel %d…",
	"onhand.sel.drop.ask":     "Cancel all %d?",
	"onhand.sel.drop.yes":     "Cancel them",
	"onhand.sel.drop.no":      "Keep them",
	"onhand.sel.clear":        "Deselect",
	"switch.label":            "Open a task",
	"switch.menu":             "Open Task…",
	"switch.placeholder":      "Which task? Type a few words…",
	"switch.new":              "New task: “%s”",
}

func init() {
	for k, v := range zhOnhand {
		zh[k] = v
	}
	for k, v := range enOnhand {
		en[k] = v
	}
}
