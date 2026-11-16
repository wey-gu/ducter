// D298: the partner's first words and a pasted API key. The same words as the Mac's
// (apps/desktop/internal/i18n/firstwords.go); the partner's words for a key's result come from
// the home (packages/protocol/src/api-keys.ts keyWords).
export const firstWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "first.from": "从这台电脑上你的 %s 留下的记录里看到的：只在这里读，只给你看。",
    "first.from.and": " 和 ",
    "first.stop": "别再看了",
    "first.stopped": "好，以后不再看这些记录。",
    "first.again": "还是看吧",
    "key.paste.title": "贴一个 API 密钥，我就能开始",
    "key.paste.body": "DeepSeek、Kimi、智谱 GLM、OpenAI、Anthropic、OpenRouter 的密钥都行。它只存在这台电脑上的 Ducter 里，不进聊天记录。",
    "key.paste.field": "API 密钥",
    "key.paste.eg": "sk-…",
    "key.paste.check": "检查",
    "key.paste.checking": "在检查…",
    "key.paste.failed": "没检查成：%s",
  },
  en: {
    "first.from": "Found in what your %s keep on this computer: read here, shown only to you.",
    "first.from.and": " and ",
    "first.stop": "Stop looking",
    "first.stopped": "Fine, I won't look at those records again.",
    "first.again": "Look again",
    "key.paste.title": "Paste an API key and I can start",
    "key.paste.body": "A key from DeepSeek, Kimi, Zhipu GLM, OpenAI, Anthropic or OpenRouter works. It stays in Ducter on this computer, never in the conversation.",
    "key.paste.field": "API key",
    "key.paste.eg": "sk-…",
    "key.paste.check": "Check",
    "key.paste.checking": "Checking…",
    "key.paste.failed": "The check didn't go through: %s",
  },
};
