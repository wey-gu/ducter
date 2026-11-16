// The server's side of languages (D292): the shared core is @ducter/protocol's lang.ts.
import { detect, languageOfTexts, type Bodies, type LangTag } from "@ducter/protocol";
import type { LogStore, SettingsApi } from "@ducter/protocol/src/internal.ts";

/** The language some words are in (a routine's name and brief, a wait's reason), else English. */
export function langOfText(...texts: (string | undefined)[]): LangTag {
  return detect(texts.filter(Boolean).join("\n"))?.lang ?? "en";
}

const INTL: Record<string, string> = { zh: "zh-CN", en: "en-US" };

/** The Intl locale dates and numbers are written in for a language: zh → zh-CN, en → en-US, ko → ko. */
export function intlLocale(tag: LangTag | undefined): string {
  return (tag && INTL[tag]) || tag || "en-US";
}

/** How many of the person's latest messages tell the conversation's language. */
const RECENT = 20;

/**
 * The conversation's language (D292): the partner's setting when one is chosen, else the
 * language of the person's latest messages in the Log (nothing extra is stored, so it survives
 * a restart), else undefined (nothing said yet).
 */
export function talkLang(settings: SettingsApi | undefined, log: LogStore | undefined): LangTag | undefined {
  const l = settings?.get().language;
  if (l && l !== "auto") return l;
  if (!log) return undefined;
  const texts = log.read({ stream: "channel", kinds: ["user_msg"], limit: RECENT }).map((e) => (e.body as Bodies["user_msg"]).text ?? "");
  return languageOfTexts(texts);
}
