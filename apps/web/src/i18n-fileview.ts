// D239: the file viewer (glossary in design/product-model.md): a file a task showed, read inside
// Ducter. The same keys and words as the Mac (apps/desktop/internal/i18n/fileview.go).
export const fileWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "media.fileOpen": "打开 %s",
    "file.save": "存一份",
    "file.source": "看原文",
    "file.formatted": "看排版",
    "file.lines": "%d 行",
    "file.cut": "这里只显示了前 %s。存一份就能看到全部。",
    "file.rowsCut": "这里只显示了前 %d 行。存一份就能看到全部。",
    "file.none": "这种文件在 Ducter 里还打不开。存一份，用你自己的应用看。",
    "file.loading": "正在打开…",
    "file.failed": "没能打开这个文件。",
    "media.copy.failed.text": "这里拷贝不了文字",
  },
  en: {
    "media.fileOpen": "Open %s",
    "file.save": "Save a copy",
    "file.source": "Show source",
    "file.formatted": "Show formatted",
    "file.lines": "%d lines",
    "file.cut": "Showing the first %s here. Save a copy to see all of it.",
    "file.rowsCut": "Showing the first %d rows here. Save a copy to see all of it.",
    "file.none": "Ducter can't open this kind of file yet. Save a copy and open it in your own app.",
    "file.loading": "Opening…",
    "file.failed": "Couldn't open this file.",
    "media.copy.failed.text": "Text can't be copied here",
  },
};
