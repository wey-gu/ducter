// D309: 伙伴们 / Your partners on the web: every word in both languages with the Mac's keys and
// words, no " · " joins (D291), looks as theme tokens light and dark, and the bar's count across partners.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PARTNER_LOOKS } from "@ducter/protocol";
import { LOOK_CLAY } from "@ducter/protocol/src/partners.ts";
import { strings } from "../src/i18n.ts";
import { partnersWords } from "../src/i18n-partners.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("one name per look", () => {
  for (const l of PARTNER_LOOKS) expect(partnersWords.zh[`partners.look.${l}`]).toBeTruthy();
});

// The words equal the Mac's, key for key: words.test.ts checks every mirrored table (D488).

test("D497: each look recolours the clay figure by the protocol's one table, and components never hold a colour", () => {
  const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
  for (const l of PARTNER_LOOKS) {
    const c = LOOK_CLAY[l];
    if (c.hue === 0 && c.sat === 1) continue;
    expect(css).toContain(`[data-look="${l}"], :root[data-clay="${l}"] { --clay: hue-rotate(${c.hue}deg) saturate(${c.sat}); }`);
  }
  expect(src("partners.tsx")).not.toMatch(/#[0-9a-f]{6}/i);
});

test("the bar's line speaks for the partner it sits under; each other partner's face carries its own number", () => {
  const app = src("app.ts");
  expect(app).toContain("needsCount("); // D517: one source, needsYouItems (onhand.tsx)
  expect(app).toContain("barBoard()");
  expect(app).toMatch(/partnerNeeds\(p: PartnerInfo\)/);
  expect(src("partners.tsx")).toContain("A.partnerNeeds(p)");
  expect(app).toMatch(/persona: this\.partnerShown/);
  // The last screen of another partner is never painted as this one's.
  expect(app).toContain("g.persona !== this.partnerShown");
});

test("D497: a push about another partner's question shows that partner first (#p=<id>/d=<id>)", () => {
  expect(src("app.ts")).toContain("^#p=([^/]{1,64})\\/(.+)$");
});
