// The partner's own words for what it noticed (design/connectors.md §13), zh and en together.
// Clients word the controls (i18n keys); core words the messages, in the language the partner
// talks in (D292: any other language falls back through the chain, ko → en; the model's rewrite
// of a find is in the conversation's own language). D78 spacing: a space between Chinese and
// Latin words or numbers.
import { fill, words, type FindKind, type LangTag, type ReadProblem } from "@ducter/protocol";

export const KIND_WORDS: Record<FindKind, { zh: string; en: string }> = {
  mismatch: { zh: "两件事对不上", en: "Two things don't match" },
  waiting_on_you: { zh: "在等你回", en: "Waiting on you" },
  waiting_on_them: { zh: "你在等别人回", en: "You're waiting on someone" },
  promised: { zh: "你答应过的", en: "Something you promised" },
  deadline: { zh: "快到期 · 要花钱", en: "Deadlines and money" },
  plan_changed: { zh: "计划变了", en: "A plan changed" },
  meeting: { zh: "开会前", en: "Before a meeting" },
  coming_up: { zh: "快到了", en: "Coming up" },
  service: { zh: "你用的服务", en: "A service you use" },
  update: { zh: "之前说的有变", en: "An update to what I told you" },
  said: { zh: "你说过的", en: "Something you said" },
};

const T = {
  zh: {
    join: (xs: string[]) => xs.join("、"),
    open: "早。",
    notices: "{n} 封通知和收据，看标题就知道",
    promo: "{n} 封像推销，没理它",
    muted: "{n} 封是你说过不用告诉你的",
    more: "还有 {n} 件没说",
    leftOut: "没说的：{xs}。",
    leftOutJoin: "；",
    firstOffer: "已经能看你的 {apps} 了。要不要我现在看一眼最近两周，挑出要你管的？",
    firstSome: (k: number) => `有 ${k} 件要你管：`,
    firstNone: "最近两周没有要你管的。",
    agent: "我用来想事情的 AI agent",
    not_installed: "我没法细读你的信：这台电脑上没装 {a}。现在只看得到标题，所以什么都没跟你说。",
    signed_out: "我没法细读你的信：{a} 没登录。现在只看得到标题，所以什么都没跟你说。",
    no_agent: "我没法细读你的信：还没有能用的 AI agent。现在只看得到标题，所以什么都没跟你说。",
    failing: "我细读你的信时 {a} 一直出错。现在只看得到标题，所以什么都没跟你说。",
    firstLater: "好，先不看。",
    keepNote: "早上那条还要吗？",
    noteAgain: "现在我能提前告诉你航班、维护、扣费这些了。要每天早上说几件吗？",
    budget: "{name} 这个月的额度用完了，这个月剩下的日子我只说急的。",
    ooAccounts: "oo 里的账号",
    calendar: "日历",
    muteFrom: "{sender} 的「{kind}」不用告诉我",
    muteKind: "「{kind}」这类不用告诉我",
    lockJoin: "；",
    taskTitle: "{go} · {about}",
  },
  en: {
    join: (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`),
    open: "Morning.",
    notices: "{n} notices and receipts the subject says all of",
    promo: "{n} looked like marketing",
    muted: "{n} from senders you muted",
    more: "{n} more not said",
    leftOut: "Left out: {xs}.",
    leftOutJoin: "; ",
    firstOffer: "I can read your {apps} now. Want me to look through the last two weeks for anything that needs you?",
    firstSome: (k: number) => (k === 1 ? "One thing needs you:" : `${k} things need you:`),
    firstNone: "Nothing in the last two weeks needs you.",
    agent: "the AI agent I think with",
    not_installed: "I can't read your mail closely: {a} isn't installed on this computer. I only see subjects, so I haven't told you anything.",
    signed_out: "I can't read your mail closely: {a} is signed out. I only see subjects, so I haven't told you anything.",
    no_agent: "I can't read your mail closely: no AI agent is ready yet. I only see subjects, so I haven't told you anything.",
    failing: "{a} keeps failing when I read your mail. I only see subjects, so I haven't told you anything.",
    firstLater: "OK, not now.",
    keepNote: "Keep the morning note?",
    noteAgain: "I can now tell you about flights, maintenance and billing changes ahead of time. Want a few each morning?",
    budget: "{name} used this month's budget; for the rest of the month I'll only say what's urgent.",
    ooAccounts: "Accounts in oo",
    calendar: "calendar",
    muteFrom: 'Don\'t tell me "{kind}" from {sender}',
    muteKind: 'Don\'t tell me "{kind}"',
    lockJoin: "; ",
    taskTitle: "{go} · {about}",
  },
};

export const W = {
  /**
   * The morning note's opening: a greeting and nothing else (D173). It never says what or how much
   * was read ("看了 214 封信"): restraint; the things themselves follow.
   */
  open: (lang: LangTag) => words(T, lang).open,
  /** 没说的：12 封通知和收据，看标题就知道；1 封像推销，没理它；还有 2 件没说。 (more: worth saying, over one note's cap) */
  leftOut(lang: LangTag, l: { notices: number; promo: number; muted: number; more?: number }): string | undefined {
    const t = words(T, lang);
    const xs = [l.notices ? fill(t.notices, { n: l.notices }) : "", l.promo ? fill(t.promo, { n: l.promo }) : "", l.muted ? fill(t.muted, { n: l.muted }) : "", l.more ? fill(t.more, { n: l.more }) : ""].filter(Boolean);
    if (!xs.length) return;
    return fill(t.leftOut, { xs: xs.join(t.leftOutJoin) });
  },
  firstOffer: (lang: LangTag, apps: string[]) => {
    const t = words(T, lang);
    return fill(t.firstOffer, { apps: t.join(apps) });
  },
  /** The first look's answer: only what matters (D173), never how much it read. */
  firstAnswer: (lang: LangTag, k: number) => {
    const t = words(T, lang);
    return k ? t.firstSome(k) : t.firstNone;
  },
  /** D226: said once when reading closely keeps failing (a silent watcher is the one silence that isn't success). */
  readDown(lang: LangTag, why: ReadProblem, agent: string) {
    const t = words(T, lang);
    const a = agent || t.agent;
    return fill(why === "not_installed" ? t.not_installed : why === "signed_out" ? t.signed_out : why === "no_agent" ? t.no_agent : t.failing, { a });
  },
  firstLater: (lang: LangTag) => words(T, lang).firstLater,
  keepNote: (lang: LangTag) => words(T, lang).keepNote,
  /** D250: the morning note offered back once, after the notes got better (NOTES_REV). */
  noteAgain: (lang: LangTag) => words(T, lang).noteAgain,
  budget: (lang: LangTag, name: string) => fill(words(T, lang).budget, { name }),
  /** The name said for the accounts kept in oo. */
  ooAccounts: (lang: LangTag) => words(T, lang).ooAccounts,
  /** A calendar among the apps it can read. */
  calendar: (lang: LangTag) => words(T, lang).calendar,
  muteRule: (lang: LangTag, kind: FindKind, sender?: string) => {
    const t = words(T, lang);
    const k = words(KIND_WORDS[kind], lang);
    return sender ? fill(t.muteFrom, { sender, kind: k }) : fill(t.muteKind, { kind: k });
  },
  /** The lock screen's body (§6, D173): the finds' own first clauses, never an "N things" summary. */
  lockBody(lang: LangTag, texts: string[]) {
    return texts.map((t) => t.split(/[。.!?！？]/)[0]!.trim()).filter(Boolean).join(words(T, lang).lockJoin);
  },
  taskTitle: (lang: LangTag, goLabel: string, about: string) => fill(words(T, lang).taskTitle, { go: goLabel, about }),
};
