// D254: keeping your place in the conversation, and copying from it. The same keys and words as the
// Mac (apps/desktop/internal/i18n/conv.go); test/follow.test.ts keeps them equal.
export const convWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "conv.new.n": "%s 条新消息",
    "conv.new.one": "1 条新消息",
    "conv.new.label": "回到新消息，%s 条",
    "conv.divider": "新消息",
    "conv.copied": "已拷贝",
    "conv.copy.failed": "没能拷贝。用「选择文字」自己选一下。",
    "conv.copy.link": "拷贝链接",
    "conv.select": "选择文字",
    "conv.select.done": "完成",
    "conv.select.all": "全部拷贝",
    "conv.log": "和 %s 的对话",
  },
  en: {
    "conv.new.n": "%s new messages",
    "conv.new.one": "1 new message",
    "conv.new.label": "Go to new messages, %s",
    "conv.divider": "New messages",
    "conv.copied": "Copied",
    "conv.copy.failed": "Couldn't copy. Use Select text to pick the words yourself.",
    "conv.copy.link": "Copy link",
    "conv.select": "Select text",
    "conv.select.done": "Done",
    "conv.select.all": "Copy all",
    "conv.log": "Conversation with %s",
  },
};
