// D426: several things in one message, line by line under it. The same keys and words as the Mac
// (apps/desktop/internal/i18n/asks.go); test/asks.test.ts keeps them equal. The count's words were
// read by naive raters across the three kinds of user (design/decisions.md D426).
export const asksWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "asks.count": "好了 %d 个，还有 %d 个",
    "asks.needs": "等你定一下",
    "asks.failed": "没做成",
  },
  en: {
    "asks.count": "%d done, %d to go",
    "asks.needs": "Needs you",
    "asks.failed": "Didn't work",
  },
};
