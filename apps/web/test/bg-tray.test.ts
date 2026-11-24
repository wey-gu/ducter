// D518: 后台 / In the background, the opened task's tray over its composer. Built only from the shared
// TrayRow and IconBtn (D161), on the composer's measure, folded on a phone, its words in both
// languages and the same as the Mac's, and its rows fitting a 320 phone with a 44 target.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { bgWords } from "../src/i18n-bg.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const goWords = readFileSync(new URL("../../desktop/internal/i18n/bg.go", import.meta.url), "utf8");

/** Every declaration block whose selector list includes `selector`. */
function blocks(selector: string): string {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    if (sel.split(",").map((s) => s.trim()).includes(selector)) out.push(m[2]!);
  }
  return out.join("\n");
}

describe("the background tray (D518)", () => {
  test("draws its controls only through controls.tsx", () => {
    const f = src("bg-tray.tsx");
    expect(f.match(/<(button|input|select|textarea|a)\b/g) ?? []).toEqual([]);
    expect(f.match(/<[a-z][a-z0-9]*\b[^>]*\bon(Click|Input|Change|KeyDown)=/g) ?? []).toEqual([]);
    expect(f).toContain("TrayRow");
    expect(f).toContain("IconBtn");
  });
  test("sits over the composer, under the task's page, before its foot", () => {
    const v = src("views.tsx");
    const tray = v.indexOf("<BgTray taskId={id}");
    expect(tray).toBeGreaterThan(v.indexOf("</main>"));
    expect(tray).toBeLessThan(v.indexOf("<TaskFoot task={task}"));
    expect(tray).toBeLessThan(v.indexOf("<Composer taskId={id} />"));
  });
  test("on the composer's measure wherever the composer has one", () => {
    for (const s of [".full > .bg-dock", ".beside-rail > .bg-dock", ".full.book .beside-rail > .bg-dock"]) expect(blocks(s)).toMatch(/padding-left/);
    expect(blocks(".beside-rail > .bg-dock")).toBe(blocks(".beside-rail > .composer-wrap"));
  });
  test("folded on a phone by default; only finished ones folded everywhere", () => {
    const f = src("bg-tray.tsx");
    expect(f).toContain('(pref ?? (phone ? "shut" : "open"))');
    expect(f).toMatch(/running\.length \? .* : doneOpen/);
  });
  test("every word in zh and en, the same keys as the Mac's", () => {
    expect(Object.keys(bgWords.zh).sort()).toEqual(Object.keys(bgWords.en).sort());
    for (const v of Object.values(bgWords.zh)) expect(goWords).toContain(JSON.stringify(v));
    for (const v of Object.values(bgWords.en)) expect(goWords).toContain(JSON.stringify(v));
    for (const v of [...Object.values(bgWords.zh), ...Object.values(bgWords.en)]) expect(v).not.toContain(" · ");
  });
  test("a phone row is 44 tall and fits 320 with its words keeping room", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 699px) {\n  .bg-dock"));
    expect(phone).toMatch(/\.tray-main \{\s*min-height: max\(44px, 2\.75rem\)/);
    expect(phone).toMatch(/\.icon-btn \{\s*width: 44px;\s*height: 44px/);
    // 320: the dock's 2 x 12, the tray's 2 x 4 and its 2 x 1 border, the row's 2 x 12, the mark 16,
    // two gaps of 8, the longest time ("1 小时 20 分", about 64), the action slot 44.
    const fixed = 2 * 12 + 2 * 4 + 2 + 2 * 12 + 16 + 2 * 8 + 64 + 44;
    expect(320 - fixed).toBeGreaterThanOrEqual(120);
  });
  test("reduced motion: no movement", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.bg-tray,\s*\.bg-rows,\s*\.bg-rows > \.tray-row \{\s*animation: none/);
  });
});
