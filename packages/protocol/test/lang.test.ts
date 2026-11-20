// D292: the language of a message, a conversation and an interface (fixtures/lang.json, shared
// with the Go port in apps/desktop/internal/lang).
import { describe, expect, test } from "bun:test";
import cases from "../fixtures/lang.json" with { type: "json" };
import { autonym, detect, fallbackChain, fill, inLanguage, isRtl, LANGUAGES, langName, languageOfTexts, negotiate, normalizeTag, plural, resolveLanguage, UI_LANGS, words } from "../src/lang.ts";

describe("lang", () => {
  test("detect", () => {
    for (const c of cases.detect) {
      const d = detect(c.text);
      if (c.lang === null) expect(d, c.text).toBeUndefined();
      else expect({ text: c.text, lang: d?.lang, sure: d?.sure }).toEqual({ text: c.text, lang: c.lang, sure: (c as { sure?: boolean }).sure });
    }
  });

  test("a conversation keeps its language through words with none", () => {
    for (const c of cases.conversation) {
      let lang: string | undefined;
      const got = c.texts.map((t) => (lang = resolveLanguage(t, lang)) ?? null);
      expect({ case: c._, got }).toEqual({ case: c._, got: c.want });
      expect(languageOfTexts(c.texts) ?? null).toBe(c.want[c.want.length - 1]!);
    }
  });

  test("inLanguage", () => {
    for (const c of cases.inLanguage) expect({ text: c.text, lang: c.lang, ok: inLanguage(c.text, c.lang) }).toEqual({ text: c.text, lang: c.lang, ok: c.want });
  });

  test("tags, fallback and negotiation", () => {
    for (const [raw, want] of cases.normalize) expect(normalizeTag(raw as string) ?? null).toBe(want as string | null);
    for (const [tag, want] of cases.chain) expect(fallbackChain(tag as string)).toEqual(want as string[]);
    for (const [pref, want] of cases.negotiate) expect(negotiate(pref as string[], UI_LANGS)).toBe(want as string);
  });

  test("names, words, plurals, direction", () => {
    expect(langName("ko")).toBe("Korean (한국어)");
    expect(langName("en")).toBe("English");
    expect(langName("zh")).toBe("Chinese (简体中文)");
    expect(langName("pt-BR")).toBe("Portuguese (Português)");
    expect(autonym("ja")).toBe("日本語");
    expect(words({ zh: { a: "好" }, en: { a: "OK" } }, "zh-TW").a).toBe("好");
    expect(words({ zh: { a: "好" }, en: { a: "OK" } }, "ko").a).toBe("OK");
    expect(fill("接了：「{title}」，{n} 个", { title: "周报", n: 2 })).toBe("接了：「周报」，2 个");
    expect(fill("{missing}", {})).toBe("{missing}");
    expect(plural("en", 1)).toBe("one");
    expect(plural("en", 2)).toBe("other");
    expect(plural("ru", 3)).toBe("few");
    expect(plural("zh", 1)).toBe("other");
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he-IL")).toBe(true);
    expect(isRtl("ko")).toBe(false);
    expect(UI_LANGS).toEqual(["zh", "en"]);
    expect(new Set(LANGUAGES.map((l) => l.tag)).size).toBe(LANGUAGES.length);
  });
});
