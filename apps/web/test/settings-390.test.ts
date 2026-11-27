// Regression checks for Settings at phone width (390px):
// - Overview's agent line never starts with a leading comma when chat apps are also linked
// - keepClauses glues CJK punctuation to preceding Latin/digits/brackets, not only Han
// - BrandMark has a global base rule so icons inside .map-mark (OOMOL card) stay centred and never overflow
// - Update-all list resets default ul padding; CopyLine aligns $ with its command
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keepClauses } from "../src/format.ts";
import { settingsHome } from "../src/i18n-settings.ts";
import { partnersWords } from "../src/i18n-partners.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const settingsHomeSrc = readFileSync(join(import.meta.dir, "../src/settings-home.tsx"), "utf8");

describe("Settings at 390px phone width", () => {
  test("no Overview string starts with leading punctuation, and PhoneBrief uses standalone agent words", () => {
    for (const lang of ["zh", "en"] as const) {
      for (const [k, v] of Object.entries(settingsHome[lang])) {
        expect(v, `${lang} ${k}`).not.toMatch(/^[，。、；：！？,.;:]/);
      }
    }
    expect(settingsHomeSrc).not.toContain('t(chats ? "home.reach.and"');
    expect(settingsHomeSrc).toContain('t("home.reach.agents"');
  });

  test("keepClauses glues CJK punctuation after Latin, digits and closing brackets", () => {
    expect(keepClauses("Hetzner Server，一直开着")).toContain("Server\u2060，");
    expect(keepClauses("Nowledge Mem 0.7.34，可更新到 0.7.37")).toContain("0.7.34\u2060，");
    expect(keepClauses("叫「Ducter」，我记下的都用这个名字")).toContain("」\u2060，");
    expect(keepClauses("免打扰时段（23:00 到 08:00）里，空闲时依次更新。")).toContain("08:00\u2060）");
  });

  test("BrandMark has a global base rule so OOMOL card marks align and never overflow vertically", () => {
    expect(css).toMatch(/^\.brand-mark \{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*line-height:\s*0;/m);
    expect(css).toMatch(/^\.brand-mark > svg \{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;/m);
    expect(css).toMatch(/^\.ua-list \{[^}]*list-style:\s*none;[^}]*padding:\s*0;/m);
    expect(css).toMatch(/^\.ua-row\.queued \{[^}]*align-self:\s*stretch;/m);
    expect(css).toMatch(/^\.lend-copy \.lend-cmd \{[^}]*display:\s*flex;/m);
  });

  test("Partner default note names the actual button (修改)", () => {
    expect(partnersWords.zh["loadout.brain.default.note"]).toContain(`「${partnersWords.zh["partners.change"]}」`);
  });
});
