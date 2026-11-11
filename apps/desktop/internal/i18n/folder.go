package i18n

// D142: a folder that isn't a git repo. Its Changes say what the task did
// in plain words, and 改回去 / Undo all changes puts the folder back.
// ".one" is the singular (English only reads differently).
var folderZH = Table{
	"folder.moved":          "整理了 %d 个文件",
	"folder.moved.one":      "整理了 1 个文件",
	"folder.movedInto":      "把 %d 个文件整理进 %d 个新文件夹",
	"folder.folders":        "新建了 %d 个文件夹",
	"folder.folders.one":    "新建了 1 个文件夹",
	"folder.renamed":        "重命名了 %d 个文件",
	"folder.renamed.one":    "重命名了 1 个文件",
	"folder.added":          "新增 %d 个文件",
	"folder.added.one":      "新增 1 个文件",
	"folder.changed":        "修改了 %d 个文件",
	"folder.changed.one":    "修改了 1 个文件",
	"folder.removed":        "删除了 %d 个文件",
	"folder.removed.one":    "删除了 1 个文件",
	"folder.until":          "%s前都能还原",
	"folder.anytime":        "随时都能还原",
	"folder.working":        "它做完后，可以全部还原",
	"folder.undo":           "全部还原",
	"folder.keep":           "保留改动",
	"folder.undone":         "已还原，文件夹回到了它动手之前的样子",
	"folder.kept":           "已保留这些改动",
	"folder.expired":        "已经过了 7 天，不能再还原",
	"folder.list":           "查看改动",
	"folder.confirm":        "它做完之后，又有 %d 个文件被改过（%s）。改回去的话，这些也会变回它动手之前的样子。",
	"folder.confirm.one":    "它做完之后，又有 1 个文件被改过（%[2]s）。改回去的话，它也会变回它动手之前的样子。",
	"folder.confirm.go":     "仍然还原",
	"folder.confirm.no":     "取消",
	"folder.row.added":      "新建 %s",
	"folder.row.dir":        "新建文件夹 %s",
	"folder.row.removed":    "删除 %s",
	"folder.row.removedDir": "删除文件夹 %s",
	"folder.row.changed":    "修改 %s",
	"folder.row.restore":    "还原这项",
	"folder.more":           "另有 %d 项没列出",
	"folder.date":           "%[1]d 月 %[2]d 日",
	"folder.sep":            "，",
}

var folderEN = Table{
	"folder.moved":          "Moved %d files",
	"folder.moved.one":      "Moved 1 file",
	"folder.movedInto":      "Moved %d files into %d new folders",
	"folder.folders":        "made %d new folders",
	"folder.folders.one":    "made 1 new folder",
	"folder.renamed":        "renamed %d",
	"folder.renamed.one":    "renamed 1",
	"folder.added":          "added %d files",
	"folder.added.one":      "added 1 file",
	"folder.changed":        "changed %d files",
	"folder.changed.one":    "changed 1 file",
	"folder.removed":        "deleted %d files",
	"folder.removed.one":    "deleted 1 file",
	"folder.until":          "You can undo this until %s",
	"folder.anytime":        "You can undo this",
	"folder.working":        "You can undo all of it once it's done",
	"folder.undo":           "Undo all changes",
	"folder.keep":           "Keep the changes",
	"folder.undone":         "Undone: the folder is exactly as it was before",
	"folder.kept":           "You kept these changes",
	"folder.expired":        "It's been 7 days; this can't be undone any more",
	"folder.list":           "See what changed",
	"folder.confirm":        "%d files changed after it finished (%s). Undoing puts those back to how they were before the task too.",
	"folder.confirm.one":    "1 file changed after it finished (%[2]s). Undoing puts it back to how it was before the task too.",
	"folder.confirm.go":     "Undo anyway",
	"folder.confirm.no":     "Not now",
	"folder.row.added":      "New %s",
	"folder.row.dir":        "New folder %s",
	"folder.row.removed":    "Deleted %s",
	"folder.row.removedDir": "Deleted folder %s",
	"folder.row.changed":    "Changed %s",
	"folder.row.restore":    "Undo this",
	"folder.more":           "%d more not listed",
	"folder.date":           "%[3]s %[2]d",
	"folder.sep":            ", ",
}

func init() {
	for k, v := range folderZH {
		zh[k] = v
	}
	for k, v := range folderEN {
		en[k] = v
	}
}
