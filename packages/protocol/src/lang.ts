// Languages (D292, research/99). Three different things, kept apart:
//   1. the conversation language: what the person writes in and wants replies in. Any language,
//      a BCP 47 tag ("ko", "zh-Hant", "es"). detect() reads it from a message; resolveLanguage()
//      keeps the last known one through a message with no language of its own ("OK", a number,
//      an emoji, a command, a code block); languageOfTexts() derives it from the Log after a
//      restart, so nothing extra is stored.
//   2. the task/report language: the conversation language, carried as a tag from the partner
//      to the task's brief, its report, the result check (inLanguage), the cards and pushes.
//   3. the interface locale: the app's own words. A tag too; it resolves to a table through a
//      fallback chain (fallbackChain: "zh-TW" → zh-Hant → zh → en; "ko" → en) so a language
//      without a complete table shows English, never a missing key.
// Detection is Unicode scripts first (Hangul → ko, kana → ja, Han → zh / zh-Hant, Cyrillic,
// Arabic, …), then, inside the Latin script, a small stopword and diacritic score. No model, no
// dependency. The Go port (apps/desktop/internal/lang) passes the same cases (fixtures/lang.json).

import table from "./languages.json" with { type: "json" };

/** A BCP 47 language tag: "en", "ko", "zh", "zh-Hant", "pt-BR". */
export type LangTag = string;

export interface LanguageInfo {
  tag: LangTag;
  name: string; // in its own words: 한국어
  en: string; // in English: Korean
  common?: boolean; // first in the reply-language list
  hasUI?: boolean; // the interface has a complete table
}

export const LANGUAGES: readonly LanguageInfo[] = table.languages;
const BY_TAG = new Map(LANGUAGES.map((l) => [l.tag, l]));

/**
 * D445: the partner's one-line reply in a common language (Look and sound's preview answer), shown under
 * Replies in so the person sees the voice they pick; undefined for a language without one.
 */
export function replySample(tag: LangTag): string | undefined {
  return (table.samples as Record<string, string>)[tag];
}

/** The interface languages with complete tables. The rest fall back (fallbackChain). */
export const UI_LANGS: readonly LangTag[] = LANGUAGES.filter((l) => l.hasUI).map((l) => l.tag);

// ---------- Tags ----------

/**
 * A tag in its canonical case ("ZH_tw" → "zh-TW"), or undefined when it isn't one. Chinese by
 * region becomes its script: zh-TW / zh-HK / zh-MO → zh-Hant, zh-CN / zh-SG / zh-Hans → zh.
 */
export function normalizeTag(raw: string | undefined | null): LangTag | undefined {
  const s = (raw ?? "").trim().replace(/\..*$/, "").replace(/@.*$/, ""); // "ko_KR.UTF-8"
  if (!s) return undefined;
  const parts = s.split(/[-_]/).filter(Boolean);
  const head = parts[0]!.toLowerCase();
  if (!/^[a-z]{2,3}$/.test(head)) return undefined;
  const out = [head];
  for (const p of parts.slice(1)) {
    if (/^[a-z]{4}$/i.test(p)) out.push(p[0]!.toUpperCase() + p.slice(1).toLowerCase());
    else if (/^[a-z]{2}$/i.test(p) || /^\d{3}$/.test(p)) out.push(p.toUpperCase());
    else if (/^[a-z0-9]{5,8}$/i.test(p)) out.push(p.toLowerCase());
    else return undefined;
  }
  if (head === "zh") {
    const script = out.find((p) => p === "Hant" || p === "Hans");
    const region = out.find((p) => /^[A-Z]{2}$/.test(p));
    if (script === "Hant" || (!script && (region === "TW" || region === "HK" || region === "MO"))) return "zh-Hant";
    return "zh";
  }
  if (head === "no") out[0] = "nb";
  return out.join("-");
}

/** The language without region or variant: "pt-BR" → "pt", "zh-Hant-TW" → "zh-Hant". */
export function baseTag(tag: LangTag): LangTag {
  const t = normalizeTag(tag) ?? tag;
  const [head, second] = t.split("-");
  return second && /^[A-Z][a-z]{3}$/.test(second) ? `${head}-${second}` : head!;
}

/** Where a tag looks for words: itself, then shorter, then English. "zh-Hant" → zh-Hant, zh, en. */
export function fallbackChain(tag: LangTag | undefined): LangTag[] {
  const t = normalizeTag(tag);
  const chain: LangTag[] = [];
  if (t) {
    const parts = t.split("-");
    for (let n = parts.length; n > 0; n--) chain.push(parts.slice(0, n).join("-"));
    if (t.startsWith("zh-Hant") && !chain.includes("zh")) chain.push("zh");
  }
  if (!chain.includes("en")) chain.push("en");
  return [...new Set(chain)];
}

/** The first of `available` on the tag's fallback chain. */
export function pickTag<T extends LangTag>(tag: LangTag | undefined, available: readonly T[]): T {
  for (const c of fallbackChain(tag)) {
    const hit = available.find((a) => a === c);
    if (hit) return hit;
  }
  return (available.includes("en" as T) ? "en" : available[0]) as T;
}

/**
 * The interface language for a list of preferred ones (a browser's navigator.languages, the
 * Mac's): the first that has a table on its own chain, before falling back to English.
 * ["ko", "zh-CN"] → zh; ["ko"] → en.
 */
export function negotiate<T extends LangTag>(preferred: readonly string[], available: readonly T[]): T {
  for (const p of preferred) {
    const chain = fallbackChain(p);
    if (normalizeTag(p)?.split("-")[0] !== "en") chain.pop(); // the trailing English is the last resort, not a match
    for (const c of chain) {
      const hit = available.find((a) => a === c);
      if (hit) return hit;
    }
  }
  return pickTag(undefined, available);
}

/** One table per language, picked by the fallback chain: words({ zh, en }, "zh-Hant") → zh. */
export function words<T>(tables: { en: T } & Partial<Record<LangTag, T>>, tag: LangTag | undefined): T {
  for (const c of fallbackChain(tag)) {
    const w = tables[c];
    if (w) return w;
  }
  return tables.en;
}

/** ICU-like placeholders: fill("接了：「{title}」", { title }) . A missing one stays visible. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** The plural category of n in a language (CLDR, by Intl): "one" | "other" | "few" | … */
export function plural(tag: LangTag | undefined, n: number): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(normalizeTag(tag) ?? "en").select(n);
  } catch {
    return n === 1 ? "one" : "other";
  }
}

/** The language's own name (한국어), else its English one, else the tag. */
export function autonym(tag: LangTag): string {
  const info = BY_TAG.get(normalizeTag(tag) ?? tag) ?? BY_TAG.get(baseTag(tag)) ?? BY_TAG.get(tag.split("-")[0]!);
  if (info) return info.name;
  try {
    const t = normalizeTag(tag) ?? tag;
    return new Intl.DisplayNames([t], { type: "language" }).of(t) ?? tag;
  } catch {
    return tag;
  }
}

/** How a model is told the language: "Korean (한국어)", "English". */
export function langName(tag: LangTag): string {
  const t = normalizeTag(tag) ?? tag;
  const info = BY_TAG.get(t) ?? BY_TAG.get(baseTag(t)) ?? BY_TAG.get(t.split("-")[0]!);
  let en = info?.en;
  if (!en)
    try {
      en = new Intl.DisplayNames(["en"], { type: "language" }).of(t);
    } catch {}
  const own = autonym(t);
  if (!en || en === t) return own === t ? t : own;
  return en === own ? en : `${en} (${own})`;
}

const RTL = new Set(["ar", "he", "fa", "ur", "yi", "ps", "sd", "ug", "dv", "ckb"]);
/** Whether a language writes right to left. */
export function isRtl(tag: LangTag | undefined): boolean {
  return !!tag && RTL.has((normalizeTag(tag) ?? tag).split("-")[0]!);
}

// ---------- Scripts ----------

export type Script =
  | "Latn" | "Hani" | "Hang" | "Kana" | "Cyrl" | "Arab" | "Hebr" | "Grek" | "Thai" | "Deva" | "Beng" | "Taml" | "Telu" | "Geor"
  | "Armn" | "Ethi" | "Khmr" | "Laoo" | "Mymr" | "Gujr" | "Guru" | "Knda" | "Mlym" | "Sinh";

// The scripts counted in words (alphabets) and the language each means when nothing else says.
const ALPHABETS: [Script, RegExp, LangTag][] = [
  ["Cyrl", /\p{Script=Cyrillic}/u, "ru"],
  ["Arab", /\p{Script=Arabic}/u, "ar"],
  ["Hebr", /\p{Script=Hebrew}/u, "he"],
  ["Grek", /\p{Script=Greek}/u, "el"],
  ["Thai", /\p{Script=Thai}/u, "th"],
  ["Deva", /\p{Script=Devanagari}/u, "hi"],
  ["Beng", /\p{Script=Bengali}/u, "bn"],
  ["Taml", /\p{Script=Tamil}/u, "ta"],
  ["Telu", /\p{Script=Telugu}/u, "te"],
  ["Geor", /\p{Script=Georgian}/u, "ka"],
  ["Armn", /\p{Script=Armenian}/u, "hy"],
  ["Ethi", /\p{Script=Ethiopic}/u, "am"],
  ["Khmr", /\p{Script=Khmer}/u, "km"],
  ["Laoo", /\p{Script=Lao}/u, "lo"],
  ["Mymr", /\p{Script=Myanmar}/u, "my"],
  ["Gujr", /\p{Script=Gujarati}/u, "gu"],
  ["Guru", /\p{Script=Gurmukhi}/u, "pa"],
  ["Knda", /\p{Script=Kannada}/u, "kn"],
  ["Mlym", /\p{Script=Malayalam}/u, "ml"],
  ["Sinh", /\p{Script=Sinhala}/u, "si"],
];

const SCRIPT_OF_LANG: Record<string, Script> = {
  zh: "Hani", ja: "Kana", ko: "Hang", ru: "Cyrl", uk: "Cyrl", bg: "Cyrl", sr: "Cyrl", be: "Cyrl", mk: "Cyrl", kk: "Cyrl", ky: "Cyrl", mn: "Cyrl", tg: "Cyrl",
  ar: "Arab", fa: "Arab", ur: "Arab", ps: "Arab", sd: "Arab", ug: "Arab", ckb: "Arab", he: "Hebr", yi: "Hebr", el: "Grek", th: "Thai", hi: "Deva", mr: "Deva", ne: "Deva",
  bn: "Beng", ta: "Taml", te: "Telu", ka: "Geor", hy: "Armn", am: "Ethi", ti: "Ethi", km: "Khmr", lo: "Laoo", my: "Mymr", gu: "Gujr", pa: "Guru", kn: "Knda", ml: "Mlym", si: "Sinh",
};

/** The script a language is written in ("ko" → Hang, "sr-Latn" → Latn, "es" → Latn). */
export function scriptOfLang(tag: LangTag): Script {
  const t = normalizeTag(tag) ?? tag;
  const parts = t.split("-");
  if (parts.includes("Latn")) return "Latn";
  if (parts.includes("Cyrl")) return "Cyrl";
  return SCRIPT_OF_LANG[parts[0]!] ?? "Latn";
}

// What isn't language: code blocks, inline code, links, paths, identifiers, numbers. ASCII only,
// so a Chinese or Korean word beside a path is kept.
const NOT_WORDS: RegExp[] = [
  /```[\s\S]*?(```|$)/g,
  /`[^`\n]*`/g,
  /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>"'）)\]]*/g,
  /[\w.@+-]+@[\w-]+\.[\w.-]+/g,
  /[A-Za-z0-9_.~+-]*[/\\][A-Za-z0-9_.~/\\+-]*/g,
  /[A-Za-z0-9]*_[A-Za-z0-9_]*/g,
  /[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g,
  /[a-z]+[A-Z][A-Za-z0-9]*/g,
  /[A-Za-z]*\d[A-Za-z0-9]*/g,
  /(^|\s)--?[a-z][a-z-]*/g,
];

/** The text without code, links, paths and numbers (what a language detector should read). */
export function proseOf(text: string): string {
  let s = text;
  for (const re of NOT_WORDS) s = s.replace(re, " ");
  return s;
}

// Han that only Simplified or only Traditional Chinese write, and not Japanese either.
const SIMP = new Set([..."们这说对还过么为吗让给发识话语读应样实带务热边个时问题车长见认门间现书买卖电场动东开"]);
const TRAD = new Set([..."們這說對還過麼為嗎讓給發識話語讀寫應樣實點帶務熱邊會來學國與裡"]);
// Chinese function words: in a Han-only message they say it is Chinese, not Japanese kanji.
const ZH_FUNC = new Set([..."的了吗嗎呢吧啊你我他她们們这這是在有和不没沒就都也要会會说說给給把被让讓帮幫么麼什"]);

interface Counts {
  han: number;
  hangul: number;
  kana: number;
  simp: number;
  trad: number;
  zhFunc: number;
  latin: string[]; // Latin words, lower case
  alpha: Map<Script, string[]>; // words in each other alphabet
}

const IS = {
  han: /\p{Script=Han}/u,
  hangul: /\p{Script=Hangul}/u,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  latin: /\p{Script=Latin}/u,
  mark: /\p{M}/u,
};

function count(text: string): Counts {
  const c: Counts = { han: 0, hangul: 0, kana: 0, simp: 0, trad: 0, zhFunc: 0, latin: [], alpha: new Map() };
  let word = "";
  let wordScript: Script | null = null;
  const end = () => {
    if (word && wordScript === "Latn") c.latin.push(word.toLowerCase());
    else if (word && wordScript) {
      const list = c.alpha.get(wordScript) ?? [];
      list.push(word.toLowerCase());
      c.alpha.set(wordScript, list);
    }
    word = "";
    wordScript = null;
  };
  for (const ch of proseOf(text)) {
    if (IS.han.test(ch)) {
      end();
      c.han++;
      if (SIMP.has(ch)) c.simp++;
      if (TRAD.has(ch)) c.trad++;
      if (ZH_FUNC.has(ch)) c.zhFunc++;
      continue;
    }
    if (IS.hangul.test(ch)) {
      end();
      c.hangul++;
      continue;
    }
    if (IS.kana.test(ch)) {
      end();
      c.kana++;
      continue;
    }
    let s: Script | null = IS.latin.test(ch) ? "Latn" : null;
    if (!s) for (const [name, re] of ALPHABETS) if (re.test(ch)) (s = name);
    if (s) {
      if (wordScript && wordScript !== s) end();
      wordScript = s;
      word += ch;
    } else if (word && (IS.mark.test(ch) || ((ch === "'" || ch === "’") && wordScript === "Latn"))) word += ch;
    else end();
  }
  end();
  return c;
}

// Inside the Latin script: words that say which language, and letters only one of them writes.
const STOP: Record<string, string> = {
  en: "the and is are you this that what with for please can how it of my have hello thanks thank hi will would could should was be from does did why when where there just about need want help make check fix today i'm it's don't can't let's",
  es: "el los las que por para con una es está esto este esta cómo qué cuándo dónde cuál hola gracias puedes puedo quiero necesito debo tengo hacer hay vez dos ahora hoy pero muy también del al y yo tú usted",
  pt: "não você isso isto obrigado obrigada olá também uma um os ao pelo pela hoje quero preciso fazer então mas eu",
  fr: "le les des est une et pour avec vous je ce cette pas bonjour merci qui dans sur il elle nous c'est j'ai aujourd'hui peux veux tu",
  de: "der die das und ist nicht ich du mit für ein eine auf zu bitte danke hallo heute kannst wie mir mich sie es auch noch",
  it: "il lo gli che è per con non sono una ciao grazie questo questa oggi puoi voglio della perché anche",
  nl: "het een niet ik je dat van voor met bedankt dank vandaag kun wil ook maar zijn wat hoe mijn",
  sv: "och är det att inte jag du för med hej tack idag kan vill också",
  pl: "nie się jest na że co jak proszę dziękuję cześć dzisiaj czy",
  tr: "ve bir bu için ne mi değil ben sen merhaba teşekkür lütfen bugün",
  id: "dan yang ini itu untuk dengan saya tidak bisa apa ada terima kasih tolong hari",
  vi: "và của là không tôi bạn có được này cho với xin chào cảm ơn",
};
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(" "))]));
const MARKS: [string, RegExp][] = [
  ["es", /[ñ¿¡]/],
  ["pt", /[ãõ]/],
  ["fr", /[œèëîû]/],
  ["de", /ß/],
  ["pl", /[ąęłńśźż]/],
  ["tr", /[ğış]/],
  ["vi", /[ơưđăạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/],
  ["sv", /å/],
];
/** The Latin languages the score can tell apart; another Latin language is never rejected. */
export const LATIN_KNOWN: readonly LangTag[] = Object.keys(STOP);

function latinScore(words: string[]): { lang: LangTag; sure: boolean } {
  const score: Record<string, number> = {};
  for (const w of words)
    for (const [lang, set] of Object.entries(STOP_SETS))
      if (set.has(w.replace(/’/g, "'"))) score[lang] = (score[lang] ?? 0) + 1;
  const joined = words.join(" ");
  for (const [lang, re] of MARKS) if (re.test(joined)) score[lang] = (score[lang] ?? 0) + 2;
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [top, second] = [ranked[0], ranked[1]];
  if (!top) return { lang: "en", sure: false };
  const lead = top[1] - (second?.[1] ?? 0);
  const sure = lead > 0 && (top[1] >= 2 || words.length <= 3) && (!second || lead >= 1);
  return { lang: top[0], sure };
}

export interface Detected {
  lang: LangTag;
  script: Script;
  /** The language itself is clear (not only its script): ko from Hangul, es from its words. */
  sure: boolean;
}

/**
 * The language a message is written in, or undefined when it has none of its own (OK, 123, an
 * emoji, a command or a code block). Mixed text goes to the larger part, counting each Han,
 * Hangul or kana character as one word, so a Korean sentence with an English term is Korean
 * and an English sentence quoting one Chinese word is English.
 */
export function detect(text: string): Detected | undefined {
  const c = count(text);
  const cand: { lang: LangTag; script: Script; units: number; sure: boolean }[] = [];
  if (c.hangul) cand.push({ lang: "ko", script: "Hang", units: c.hangul + c.han, sure: true });
  if (c.kana) cand.push({ lang: "ja", script: "Kana", units: c.kana + c.han, sure: true });
  if (c.han && !c.hangul && !c.kana) {
    const lang = c.trad > c.simp ? "zh-Hant" : "zh";
    const sure = c.simp + c.trad > 0 || c.zhFunc >= 2 || (c.zhFunc >= 1 && c.han >= 4);
    cand.push({ lang, script: "Hani", units: c.han, sure });
  }
  for (const [script, ws] of c.alpha) {
    const fallback = ALPHABETS.find((a) => a[0] === script)![2];
    const joined = ws.join(" ");
    let lang = fallback;
    let sure = script !== "Cyrl" && script !== "Arab";
    if (script === "Cyrl") {
      if (/[ієїґ]/.test(joined)) (lang = "uk"), (sure = true);
      else if (/[ђјљњћџ]/.test(joined)) (lang = "sr"), (sure = true);
      else if (/[ыэё]/.test(joined)) sure = true;
    } else if (script === "Arab") {
      if (/[ٹڈڑںے]/.test(joined)) (lang = "ur"), (sure = true);
      else if (/[پچژگ]/.test(joined)) (lang = "fa"), (sure = true);
      else if (/[ةى]/.test(joined) || ws.some((w) => w.startsWith("ال"))) sure = true;
    }
    cand.push({ lang, script, units: ws.length, sure });
  }
  const letters = c.latin.join("").replace(/['’]/g, "").length;
  if (c.latin.length && letters >= 3) {
    const { lang, sure } = latinScore(c.latin);
    cand.push({ lang, script: "Latn", units: c.latin.length, sure });
  }
  if (!cand.length) return undefined;
  // The larger part wins; on a tie, not the Latin one (people put English terms in their own
  // language far more often than the other way round).
  cand.sort((a, b) => b.units - a.units || (a.script === "Latn" ? 1 : 0) - (b.script === "Latn" ? 1 : 0));
  const top = cand[0]!;
  return { lang: top.lang, script: top.script, sure: top.sure };
}

/**
 * The conversation's language after this message, given the one before it. A message with no
 * language keeps it; one that only shows its script (a short Han line, Cyrillic without a
 * telling letter) keeps it when it is the same script; Latin with no telling word (a command,
 * "okay", a name) never moves it off another script. Otherwise the message's language.
 */
export function resolveLanguage(text: string, prev: LangTag | undefined): LangTag | undefined {
  const d = detect(text);
  if (!d) return prev;
  if (d.sure || !prev) return d.lang;
  const ps = scriptOfLang(prev);
  if (ps === d.script || (ps === "Kana" && d.script === "Hani")) return prev;
  if (d.script === "Latn") return prev;
  return d.lang;
}

/** The language of a conversation from its messages, oldest first (the Log after a restart). */
export function languageOfTexts(texts: readonly string[], start?: LangTag): LangTag | undefined {
  let lang = start;
  for (const t of texts) lang = resolveLanguage(t, lang);
  return lang;
}

/**
 * Is this text in that language, for showing it as is (a task's report, a card's question)?
 * By script, where scripts tell: Chinese has Han and no Hangul or kana; Korean has Hangul;
 * Japanese has kana, or Han without Hangul; other alphabets have words of their own. A Latin
 * language needs no other script and is turned down only when its words say clearly that it is
 * another Latin language the detector knows; anything else is let through rather than wrongly
 * held back. Text with no language (a number, a name) is in every language.
 */
export function inLanguage(text: string, tag: LangTag): boolean {
  const c = count(text);
  const script = scriptOfLang(tag);
  const otherAlpha = (s: Script) => [...c.alpha.entries()].filter(([k]) => k !== s).reduce((n, [, ws]) => n + ws.length, 0);
  const cjk = c.han + c.hangul + c.kana;
  const any = cjk + c.latin.length + otherAlpha("Latn");
  if (!any) return script === "Latn";
  switch (script) {
    case "Hani":
      return c.han > 0 && !c.hangul && !c.kana;
    case "Hang":
      return c.hangul > 0;
    case "Kana":
      return (c.kana > 0 || c.han > 0) && !c.hangul;
    case "Latn": {
      if (cjk || otherAlpha("Latn") >= Math.max(1, c.latin.length)) return false;
      const base = baseTag(tag).split("-")[0]!;
      if (!LATIN_KNOWN.includes(base) || c.latin.length < 4) return true;
      const { lang, sure } = latinScore(c.latin);
      return !sure || lang === base;
    }
    default: {
      const own = c.alpha.get(script)?.length ?? 0;
      return own > 0 && own >= c.latin.length / 2 && !cjk;
    }
  }
}
