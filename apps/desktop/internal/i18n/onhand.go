package i18n

// D216: On hand as a workspace: Find, a draft PR or a merge on a row, many
// at once, and the switcher. The web uses the same keys and words
// (apps/web/src/i18n-onhand.ts); a test keeps them equal.

var zhOnhand = Table{
	"onhand.find.placeholder": "搜索…",
	"onhand.find.none":        "没有匹配的结果。",
	"onhand.pr.draft":         "草稿 PR",
	"onhand.pr.merged":        "已合并",
	"onhand.sel.n":            "已选 %d 件",
	"onhand.sel.merge":        "合并 %d 件",
	"onhand.sel.pr":           "创建 %d 个草稿 PR",
	"onhand.sel.pause":        "暂停 %d 件",
	"onhand.sel.drop":         "取消 %d 件…",
	"onhand.sel.drop.ask":     "取消这 %d 件事？",
	"onhand.sel.drop.yes":     "全部取消",
	"onhand.sel.drop.no":      "保留",
	"onhand.sel.clear":        "取消选择",
	"switch.label":            "打开一件事",
	"switch.menu":             "打开一件事…",
	"switch.placeholder":      "打开哪件事？输入几个字…",
	"switch.new":              "新建：「%s」",
	"onhand.new":              "新结果",
	"onhand.fold.needs":       "%d 件等你",
	"onhand.fold.working":     "%d 件在做",
	"onhand.fold.new":         "%d 个新结果",
	"onhand.fold.new.one":     "1 个新结果",
	"onhand.fold.open":        "展开",
	"onhand.fold.close":       "收起",
	"onhand.next":             "下一件事",
	"onhand.prev":             "上一件事",
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
	"onhand.new":              "New result",
	"onhand.fold.needs":       "%d needs you",
	"onhand.fold.working":     "%d working",
	"onhand.fold.new":         "%d new results",
	"onhand.fold.new.one":     "1 new result",
	"onhand.fold.open":        "Expand",
	"onhand.fold.close":       "Collapse",
	"onhand.next":             "Next Task",
	"onhand.prev":             "Previous Task",
}

func init() {
	for k, v := range zhOnhand {
		zh[k] = v
	}
	for k, v := range enOnhand {
		en[k] = v
	}
}
