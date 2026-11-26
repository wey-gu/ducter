// D426: several things in one message, line by line under it. The same keys and words as the Mac
// (apps/desktop/internal/i18n/asks.go); test/asks.test.ts keeps them equal. The count's words were
// read by naive raters across the three kinds of user (design/decisions.md D426). D430: the reply
// to one line, and On hand's group card counts with the same words (no counter noun).
export const asksWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "asks.count": "好了 %d 个，还有 %d 个",
    "asks.needs": "待你处理",
    "asks.failed": "没做成",
    "asks.reply": "回复这一条",
  },
  en: {
    "asks.count": "%d done, %d to go",
    "asks.needs": "Needs you",
    "asks.failed": "Didn't work",
    "asks.reply": "Reply to this one",
  },
};
