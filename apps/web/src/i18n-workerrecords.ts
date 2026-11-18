// D377: the person's own AI agents' records on a computer for tasks (its card). The same words as
// the Mac's (apps/desktop/internal/i18n/workerrecords.go).
export const workerRecordsWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "wrec.title": "你的 AI agent 留下的记录",
    "wrec.unasked": "还没读过",
    "wrec.on": "可以读",
    "wrec.off": "你说过别再看了",
    "wrec.why": "你在 %s 上用 %s 时留下的对话记录。让 %s 读的话，你在对话里说「接着我终端里那个 Claude 在做的」，它就能在这台电脑上找到，接着做。",
    "wrec.scope": "只读每段对话的名字、文件夹、时间，和你在里面说的第一句与最后一句；不看代码和文件，密钥一律遮住。",
    "wrec.why.on": "%s 能读 %s 上 %s 的对话记录，你开口找的时候才读。",
    "wrec.allow": "读它们留下的记录",
    "wrec.stop": "别再看了",
    "wrec.and": "%s和%s",
    "wrec.comma": "、",
    "wrec.away": "%s 现在连不上，回来了再点。",
    "wrec.old": "%s 上的 Ducter 太旧了，先更新它。",
  },
  en: {
    "wrec.title": "What your AI agents keep",
    "wrec.unasked": "Not read yet",
    "wrec.on": "Can be read",
    "wrec.off": "You said stop looking",
    "wrec.why": "The conversations you had with %[2]s on %[1]s. Let %[3]s read them, and when you say \"carry on what Claude was doing in my terminal\", it finds yours on this computer and carries it on.",
    "wrec.scope": "Only each conversation's name, folder and time, and your first and last words in it: no code, no files, and keys stay hidden.",
    "wrec.why.on": "%[1]s can read your %[3]s conversations on %[2]s, only when you ask it to find one.",
    "wrec.allow": "Read what they keep",
    "wrec.stop": "Stop looking",
    "wrec.and": "%s and %s",
    "wrec.comma": ", ",
    "wrec.away": "%s can't be reached now; tap again when it's back.",
    "wrec.old": "Ducter on %s is too old for this: update it first.",
  },
};
