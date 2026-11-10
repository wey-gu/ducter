// The partner's own words for what it noticed (design/connectors.md §13), zh and en together.
// Clients word the controls (i18n keys); core words the messages, in the language the partner
// talks in. D78 spacing: a space between Chinese and Latin words or numbers.
import type { FindKind } from "@ducter/protocol";

export const KIND_WORDS: Record<FindKind, { zh: string; en: string }> = {
  mismatch: { zh: "两件事对不上", en: "Two things don't match" },
  waiting_on_you: { zh: "在等你回", en: "Waiting on you" },
  waiting_on_them: { zh: "你在等别人回", en: "You're waiting on someone" },
  promised: { zh: "你答应过的", en: "Something you promised" },
  deadline: { zh: "快到期 · 要花钱", en: "Deadlines and money" },
  plan_changed: { zh: "计划变了", en: "A plan changed" },
  meeting: { zh: "开会前", en: "Before a meeting" },
};

const join = (xs: string[], zh: boolean) => (zh ? xs.join("、") : xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const W = {
  /**
   * The morning note's opening: a greeting and nothing else (D172). It never says what or how much
   * was read ("看了 214 封信"): restraint; the things themselves follow.
   */
  open: (zh: boolean) => (zh ? "早。" : "Morning."),
  /** 没说的：12 封通知和收据，看标题就知道；1 封像推销，没理它；还有 2 件没说。 (more: worth saying, over one note's cap) */
  leftOut(zh: boolean, l: { notices: number; promo: number; muted: number; more?: number }): string | undefined {
    const parts = zh
      ? [l.notices ? `${l.notices} 封通知和收据，看标题就知道` : "", l.promo ? `${l.promo} 封像推销，没理它` : "", l.muted ? `${l.muted} 封是你说过不用告诉你的` : "", l.more ? `还有 ${l.more} 件没说` : ""]
      : [l.notices ? `${l.notices} notices and receipts the subject says all of` : "", l.promo ? `${l.promo} looked like marketing` : "", l.muted ? `${l.muted} from senders you muted` : "", l.more ? `${l.more} more not said` : ""];
    const xs = parts.filter(Boolean);
    if (!xs.length) return;
    return zh ? `没说的：${xs.join("；")}。` : `Left out: ${xs.join("; ")}.`;
  },
  firstOffer: (zh: boolean, apps: string[]) =>
    zh ? `已经能看你的 ${join(apps, true)} 了。要不要我现在看一眼过去 3 天，有没有在等你回的？` : `I can read your ${join(apps, false)} now. Want me to look through the last 3 days for anything waiting on you?`,
  /** The first look's answer: only what matters (D172), never how much it read. */
  firstAnswer: (zh: boolean, k: number) => (zh ? (k ? `有 ${k} 件在等你回：` : "没有在等你回的。") : k ? (k === 1 ? "One thing is waiting on you:" : `${k} things are waiting on you:`) : "Nothing is waiting on you."),
  firstLater: (zh: boolean) => (zh ? "好，先不看。" : "OK, not now."),
  keepNote: (zh: boolean) => (zh ? "早上那条还要吗？" : "Keep the morning note?"),
  budget: (zh: boolean, name: string) => (zh ? `${name} 这个月的额度用完了，这个月剩下的日子我只说急的。` : `${name} used this month's budget; for the rest of the month I'll only say what's urgent.`),
  muteRule: (zh: boolean, kind: FindKind, sender?: string) => {
    const k = KIND_WORDS[kind];
    if (zh) return sender ? `${sender} 的「${k.zh}」不用告诉我` : `「${k.zh}」这类不用告诉我`;
    return sender ? `Don't tell me "${k.en}" from ${sender}` : `Don't tell me "${k.en}"`;
  },
  /** The lock screen's body (§6, D172): the finds' own first clauses, never an "N things" summary. */
  lockBody(zh: boolean, texts: string[]) {
    return texts.map((t) => t.split(/[。.!?！？]/)[0]!.trim()).filter(Boolean).join(zh ? "；" : "; ");
  },
  taskTitle: (zh: boolean, goLabel: string, about: string) => (zh ? `${goLabel} · ${about}` : `${goLabel} · ${about}`),
};
