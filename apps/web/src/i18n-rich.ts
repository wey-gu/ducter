// D303: rich answers in the conversation. The same keys and words as the Mac
// (apps/desktop/internal/i18n/rich.go); test/rich.test.ts keeps them equal.
export const richWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "rich.table": "表格",
    "rich.choices": "选一个回复",
    "rich.tell": "报一下进度",
    "rich.told.all": "都勾好了。",
    "rich.told.none": "还一个都没勾。",
    "rich.told.both": "勾好了：%s。还没：%s。",
    "rich.join": "、",
  },
  en: {
    "rich.table": "Table",
    "rich.choices": "Pick a reply",
    "rich.tell": "Send progress",
    "rich.told.all": "All done.",
    "rich.told.none": "Nothing ticked yet.",
    "rich.told.both": "Done: %s. Not yet: %s.",
    "rich.join": ", ",
  },
};
