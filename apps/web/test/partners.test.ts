// D309: 伙伴们 / Your partners on the web: every word in both languages with the Mac's keys and
// words, no " · " joins (D291), looks as theme tokens light and dark, and the bar's count across partners.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PARTNER_LOOKS } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { partnersWords } from "../src/i18n-partners.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("every word in zh and en, the same keys, never a dot join, one name per look", () => {
  expect(Object.keys(partnersWords.zh).sort()).toEqual(Object.keys(partnersWords.en).sort());
  for (const v of [...Object.values(partnersWords.zh), ...Object.values(partnersWords.en)]) expect(v).not.toContain(" · ");
  for (const l of PARTNER_LOOKS) expect(partnersWords.zh[`partners.look.${l}`]).toBeTruthy();
  expect(strings("zh").t("partners.switch.asks", "小家", 1)).toBe("换到小家，有 1 件等你");
  expect(strings("en").t("partners.switch", "Home")).toBe("Switch to Home");
});

test("the Mac says the same words under the same keys", () => {
  const mac = readFileSync(new URL("../../desktop/internal/i18n/partners.go", import.meta.url), "utf8");
  for (const lang of ["zh", "en"] as const)
    for (const [k, v] of Object.entries(partnersWords[lang])) {
      expect(mac).toContain(`"${k}":`);
      expect(mac).toContain(JSON.stringify(v));
    }
});

test("each look is a token in light and dark, and components never hold a colour", () => {
  const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
  const tail = css.slice(css.indexOf("/* D309"));
  for (const l of PARTNER_LOOKS) expect(tail.match(new RegExp(`--look-${l}:`, "g"))?.length).toBe(3); // light, dark media, data-theme dark
  expect(src("partners.tsx")).not.toMatch(/#[0-9a-f]{6}/i);
});

test("the bar's count is one across partners, and a page asks the home for the partner it shows", () => {
  const app = src("app.ts");
  expect(app).toContain("needsAcross(");
  expect(app).toMatch(/persona: this\.partnerShown/);
  // The last screen of another partner is never painted as this one's.
  expect(app).toContain("g.persona !== this.partnerShown");
});
