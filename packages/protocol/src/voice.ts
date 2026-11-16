// D305: voice in the conversation, the parts every client shares. Hold to talk turns the
// person's speech into words in the composer with the platform's own recognizer; Read aloud says
// a partner's message with the platform's own voice. What is here is pure: which locale a
// recognizer or a voice is asked for, what of a message is said aloud, and how a held press
// reads its slide. The Mac's Go port (apps/desktop/internal/voice) passes fixtures/voice.json.

import { baseTag, detect, normalizeTag, type LangTag } from "./lang.ts";

/** A recognizer's or a voice's usual region for a language, when nothing the person prefers says one. */
/** Chinese as a whole: its scripts share one base tag, so the region decides which. */
const CHINESE = normalizeTag("zh-Hans");

const REGION: Record<string, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  it: "it-IT",
  ru: "ru-RU",
  ar: "ar-SA",
  nl: "nl-NL",
  sv: "sv-SE",
  pl: "pl-PL",
  tr: "tr-TR",
  uk: "uk-UA",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
  hi: "hi-IN",
};

/**
 * The locale a recognizer or a voice is asked for, from the conversation's language (D292).
 * A locale the person prefers (the system's or the browser's list) that is the same language wins,
 * so an Australian speaking English gets en-AU; otherwise the language's usual region; otherwise
 * the tag itself. Traditional Chinese prefers zh-TW or zh-HK, never zh-CN.
 */
export function speechLocale(tag: LangTag | undefined, preferred: readonly string[] = []): string {
  const t = normalizeTag(tag) ?? "en";
  const base = baseTag(t);
  const hant = t === "zh-Hant" || /^zh-(TW|HK|MO)$/i.test(t);
  for (const p of preferred) {
    const n = normalizeTag(p);
    if (!n || !n.includes("-")) continue;
    if (hant) {
      if (/^zh-(TW|HK|MO)$/i.test(n)) return n;
      continue;
    }
    if (n.split("-")[0] === base.split("-")[0] && !(base === CHINESE && /^zh-(TW|HK|MO|Hant)/i.test(n))) return n;
  }
  if (/^[a-z]{2,3}-[A-Z]{2}$/.test(t)) return t;
  return REGION[hant ? "zh-Hant" : base] ?? REGION[base.split("-")[0]!] ?? t;
}

/** The language a partner's message is read aloud in: its own, else the conversation's, else the interface's. */
export function readLang(text: string, conv: LangTag | undefined, ui: LangTag): LangTag {
  return detect(text)?.lang ?? conv ?? ui;
}

/**
 * What of a message is said aloud. The words as a person would read them: no Markdown marks, a
 * link's words without its address, a bare address left out, a code block not read out (its
 * place gets nothing: the words around it say what it is), list marks and table bars gone, and
 * each paragraph or line its own sentence. Rich blocks (D303) are already plain text in `text`.
 */
export function speakable(text: string): string {
  let s = text.replace(/\r\n?/g, "\n");
  s = s.replace(/```[\s\S]*?(```|$)/g, "\n"); // code blocks
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // pictures: their words
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links: their words
  s = s.replace(/<?https?:\/\/[^\s>)]+>?/g, ""); // bare addresses
  s = s.replace(/`([^`]+)`/g, "$1"); // inline code: its words
  const lines: string[] = [];
  for (let line of s.split("\n")) {
    line = line
      .replace(/^\s{0,3}#{1,6}\s+/, "") // headings
      .replace(/^\s*>\s?/, "") // quotes
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "") // list marks, task boxes
      .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, "") // table rules
      .replace(/\s*\|\s*/g, " ") // table bars
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(^|[^\p{L}\p{N}*_])[*_](?!\s)(.+?)(?<!\s)[*_](?=$|[^\p{L}\p{N}*_])/gu, "$1$2")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, "")
      .trim();
    if (line) lines.push(line);
  }
  // Each line ends as a sentence so a voice pauses between them.
  return lines
    .map((l, i) => (i < lines.length - 1 && !/[.!?。！？：:;；,，、…]$/.test(l) ? (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(l) ? `${l}。` : `${l}.`) : l))
    .join(/[\p{Script=Han}]/u.test(lines.join("")) ? "" : " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** How far a held press has slid, in points, from where it started (y grows downward). */
export type Slide = { dx: number; dy: number };
/** What letting go does: put the words in the composer, send them at once, or drop them. */
export type HoldIntent = "keep" | "send" | "drop";

/** The slide that arms Send (up) or Drop (left), in points. */
export const HOLD_SEND = 56;
export const HOLD_DROP = 72;

/**
 * What letting go would do now. Up past HOLD_SEND arms Send; left past HOLD_DROP arms Drop; the
 * larger of the two wins when both are past (a diagonal pull reads by where it mostly went).
 * Coming back under a line disarms it: nothing is decided until the press ends.
 */
export function holdIntent(s: Slide): HoldIntent {
  const up = -s.dy;
  const left = -s.dx;
  const send = up >= HOLD_SEND;
  const drop = left >= HOLD_DROP;
  if (send && drop) return up / HOLD_SEND >= left / HOLD_DROP ? "send" : "drop";
  return send ? "send" : drop ? "drop" : "keep";
}

/** A press shorter than this is a tap, not a hold: it shows how to hold instead of listening. */
export const HOLD_TAP_MS = 250;

/**
 * Words heard, put into what is already typed: a space between Latin words, none before or after
 * CJK, nothing doubled. The heard words are trimmed; nothing heard leaves the draft as it was.
 */
export function joinHeard(draft: string, heard: string): string {
  const h = heard.trim();
  if (!h) return draft;
  const d = draft.replace(/\s+$/, "");
  if (!d) return h;
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}。！？，、：；]/u;
  const gap = cjk.test(d.slice(-1)) || cjk.test(h[0]!) ? "" : " ";
  return `${d}${gap}${h}`;
}

/** Where a recognizer runs, said plainly in the privacy line (D305). */
export type VoiceWhere = "device" | "apple" | "google" | "browser" | "service";

/** Why voice isn't available here, each with its own words (`voice.why.*`). */
export type VoiceWhy = "browser" | "lang" | "nomic" | "secure" | "network" | "app" | "busy" | "error" | "mac" | "mic" | "speech";

/** A level meter's bars from the microphone's level (0–1): five bars, the middle tallest. */
export function meterBars(level: number, n = 5): number[] {
  const l = Math.max(0, Math.min(1, level));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const mid = (n - 1) / 2;
    const shape = 1 - Math.abs(i - mid) / (mid + 1); // 0.33…1…0.33 for five
    out.push(Math.round((0.18 + 0.82 * l * shape) * 100) / 100);
  }
  return out;
}

/** A level that rises quickly and falls slowly, so the meter is calm (each sample at about 20 Hz). */
export function smoothLevel(prev: number, next: number): number {
  const n = Math.max(0, Math.min(1, next));
  return Math.round((n > prev ? prev + (n - prev) * 0.6 : prev + (n - prev) * 0.18) * 1000) / 1000;
}
