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
}

func init() {
	for k, v := range zhFile {
		zh[k] = v
	}
	for k, v := range enFile {
		en[k] = v
	}
}
