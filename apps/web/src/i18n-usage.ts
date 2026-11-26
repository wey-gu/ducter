// D591: where the week's allowance went (glossary in design/product-model.md, "what was used"):
// Settings › Overview's quiet section, and the limit card's line naming what used most of it. The
// same keys and words as the Mac (apps/desktop/internal/i18n/usage.go). The partner speaks (我, I).
// No " · " joins (D291): each fact is its own element.
export const usageWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "usage.head": "这周的额度用在了哪儿",
    "usage.agent": "%s %s",
    "usage.more": "更多",
    "usage.models": "按模型",
    "usage.talk": "我回你的消息",
    "usage.looks": "我做的检查",
    "usage.you": "你开的任务",
    "usage.mine": "我开的任务",
    "usage.note": "只算用量，不算钱；缓存的输入便宜得多，按十分之一算。",
    "usage.open": "打开「%s」",
    "usage.why": "这周 %s 用得最多的是「%s」（%s）",
    "usage.why.this": "这周 %s 用得最多的就是这个任务（%s）",
  },
  en: {
    "usage.head": "Where this week's allowance went",
    "usage.agent": "%s %s",
    "usage.more": "More",
    "usage.models": "By model",
    "usage.talk": "My replies to you",
    "usage.looks": "Checks I ran",
    "usage.you": "Tasks you started",
    "usage.mine": "Tasks I started",
    "usage.note": "Use only, not money. Cached input costs far less, so it counts at a tenth.",
    "usage.open": "Open “%s”",
    "usage.why": "Most of %s this week went to “%s” (%s)",
    "usage.why.this": "This task used the most of %s this week (%s)",
  },
};

/**
 * The share never wraps alone onto a line of its own: it stays glued to the word (or, in Chinese,
 * the characters) before it, as one unbreakable piece at the end of the line.
 */
export function glueTail(full: string, pct: string): [string, string] {
  const i = full.lastIndexOf(pct);
  if (i < 0) return [full, ""];
  // A space before the bracket (English): the word before it goes along; else (Chinese) the two
  // characters before the bracket.
  const j = full[i - 2] === " " ? Math.max(0, full.lastIndexOf(" ", i - 3) + 1) : Math.max(0, i - 3);
  return [full.slice(0, j), full.slice(j)];
}
