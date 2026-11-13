package i18n

// D239: the file viewer, a file a task showed read inside Ducter. The same
// keys and words as the web client (apps/web/src/i18n-fileview.ts); the
// Mac adds 在 Mac 上打开 / Open on this Mac for a kind it can't show.

var zhFile = Table{
	"media.file":     "文件",
	"file.save":      "存一份",
	"file.source":    "看原文",
	"file.formatted": "看排版",
	"file.lines":     "%d 行",
	"file.cut":       "这里只显示了前 %s。存一份就能看到全部。",
	"file.rowsCut":   "这里只显示了前 %d 行。存一份就能看到全部。",
	"file.none.mac":  "这种文件在 Ducter 里还打不开。可以用这台 Mac 上的应用看，或者存一份。",
	"file.openMac":   "在 Mac 上打开",
	"file.loading":   "正在打开…",
	"file.failed":    "没能打开这个文件。",
	// D242
	"file.pages":            "%d 页",
	"file.pages.one":        "1 页",
	"file.page":             "第 %d 页",
	"file.pdfFailed.mac":    "这个 PDF 在这里画不出来。可以用这台 Mac 上的应用看，或者存一份。",
	"file.find":             "查找",
	"file.find.key":         "查找（%s）",
	"file.find.placeholder": "在这个文件里找",
	"file.find.count":       "%d / %d",
	"file.find.none":        "没找到",
	"file.find.prev":        "上一个",
	"file.find.next":        "下一个",
	"code.block":            "代码",
}

var enFile = Table{
	"media.file":     "File",
	"file.save":      "Save a copy",
	"file.source":    "Show source",
	"file.formatted": "Show formatted",
	"file.lines":     "%d lines",
	"file.cut":       "Showing the first %s here. Save a copy to see all of it.",
	"file.rowsCut":   "Showing the first %d rows here. Save a copy to see all of it.",
	"file.none.mac":  "Ducter can't open this kind of file yet. Open it in an app on this Mac, or save a copy.",
	"file.openMac":   "Open on this Mac",
	"file.loading":   "Opening…",
	"file.failed":    "Couldn't open this file.",
	// D242
	"file.pages":            "%d pages",
	"file.pages.one":        "1 page",
	"file.page":             "Page %d",
	"file.pdfFailed.mac":    "This PDF can't be drawn here. Open it in an app on this Mac, or save a copy.",
	"file.find":             "Find",
	"file.find.key":         "Find (%s)",
	"file.find.placeholder": "Find in this file",
	"file.find.count":       "%d of %d",
	"file.find.none":        "No matches",
	"file.find.prev":        "Previous",
	"file.find.next":        "Next",
	"code.block":            "Code",
}

func init() {
	for k, v := range zhFile {
		zh[k] = v
	}
	for k, v := range enFile {
		en[k] = v
	}
}
