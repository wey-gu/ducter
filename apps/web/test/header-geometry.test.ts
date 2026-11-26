// The iPad's full-screen task: the On hand rail and the task's own header had two heights. The
// rail's one line of words plus the safe area ended at 62.7, the task's 44-pt controls plus the
// same inset took it to 85, so their two hairlines met nowhere (seen at 768, 820, 1024, 1180 and
// 1366 on an iPad, and at 1150 and 1400 in a browser). One token, --bar-h, now sizes every bar,
// and the safe area is added once by the shared rule; this pins both bottoms to the same number,
// and the conversation's partner list to its conversation's bar across the same widths.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const rem = 16;
const barRem = Number(/--bar-h:\s*min\(([\d.]+)rem,\s*90px\)/.exec(css)?.[1]);
const barCap = Number(/--bar-h:\s*min\([\d.]+rem,\s*(\d+)px\)/.exec(css)?.[1]);
const barH = (textScale = 1) => Math.min(barRem * rem * textScale, barCap);
/** A header's bottom from the rules that apply to it: the shared bar height, plus the inset once. */
const bottom = (rules: string[], safeTop: number) => {
  const takesTheBar = rules.some((r) => /height:\s*calc\(var\(--safe-top\) \+ var\(--bar-h\)\)/.test(r));
  return takesTheBar ? safeTop + barH() : Number.NaN;
};
/** A rule of its own, not the second selector of a list (the shared `.top, .rail-head`). */
const block = (selector: string) => {
  let from = 0;
  for (;;) {
    const i = css.indexOf(`\n${selector} {`, from);
    if (i < 0) return "";
    const before = (css.slice(0, i).split("\n").at(-1) ?? "").trim();
    if (!before.endsWith(",")) return css.slice(i + selector.length + 2, css.indexOf("}", i));
    from = i + 1;
  }
};
const shared = /\.top,\s*\.rail-head\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
const top = block(".top");
const crumbs = block(".top.crumbs");
const rail = block(".rail-head");
const partners = block(".pane.partners > .top");
const bench = block(".bench.as-column .bench-head");
const iPads = [768, 820, 1024, 1180, 1366];
const macLike = [1150, 1400];
const widths = [...iPads, ...macLike];

describe("one bar height for the Tasks rail and its task", () => {
  test("one token sizes every header, and no header adds the safe area a second time", () => {
    expect(barRem).toBe(3.75); // 60 at the default 16px root
    expect(barCap).toBe(90); // and it stops at 1.5x, as the bar's words do (D452)
    expect(shared).toMatch(/height:\s*calc\(var\(--safe-top\) \+ var\(--bar-h\)\)/);
    expect(shared).toMatch(/box-sizing:\s*border-box/);
    // The bars that used to choose their own height (60, 61 by its border, 64) now take the token.
    expect(top).not.toContain("min-height");
    expect(crumbs).not.toContain("min-height");
    expect(rail).not.toContain("min-height");
    expect(partners).not.toContain("min-height");
    expect(crumbs).toMatch(/padding:\s*calc\(var\(--safe-top\) \+ var\(--s2\)\) 24px calc\(var\(--s2\) - 1px\)/);
    expect(rail).toMatch(/padding:\s*calc\(var\(--safe-top\) \+ var\(--s2\)\) 20px calc\(var\(--s2\) - 1px\)/);
    expect(top).toMatch(/padding:\s*calc\(var\(--safe-top\) \+ var\(--s2\)\) 16px var\(--s2\)/);
    // The workbench, when it stands beside them, is a third bar on the same line.
    expect(bench).toMatch(/height:\s*calc\(var\(--safe-top\) \+ var\(--bar-h\)\)/);
  });

  test("the tallest control still fits, at the default size and at the 1.5x cap", () => {
    // 44: every bar control (the face, .plus, .back, a place's button). A bordered bar spends
    // 8 top + 7 bottom + 1 rule; the conversation's bar spends 8 + 8 and no rule.
    for (const scale of [1, 1.5, 3.12]) {
      const inner = barH(scale) - 16;
      expect({ scale, fits: inner >= 44 }).toEqual({ scale, fits: true });
      // The conversation's name and counts line at the 1.5x cap: 21 * 1.25 + 18 * 1.4.
      const twoLines = Math.min(0.875 * 16 * scale, 21) * 1.25 + Math.min(0.75 * 16 * scale, 18) * 1.4;
      expect(twoLines).toBeLessThanOrEqual(inner);
    }
  });

  test("the task's header and the rail's header end on one line at every width", () => {
    for (const safeTop of [0, 24, 59]) {
      for (const width of widths) {
        const taskBottom = bottom([shared, crumbs], safeTop);
        const railBottom = bottom([shared, rail], safeTop);
        expect({ width, safeTop, same: taskBottom === railBottom }).toEqual({ width, safeTop, same: true });
        expect(taskBottom - safeTop).toBe(60);
      }
    }
  });

  test("the conversation's partner list and its bar end on one line at the same widths", () => {
    for (const safeTop of [0, 24, 59]) {
      for (const width of widths) {
        // Both are .top: one rule, so one bottom (D513, D541, D545). The list's own 64 only
        // ever held when it was taller than the bar; it now takes the bar's height.
        const convBottom = bottom([shared, top], safeTop);
        const listBottom = bottom([shared, partners], safeTop);
        expect({ width, safeTop, same: convBottom === listBottom }).toEqual({ width, safeTop, same: true });
        expect(convBottom - safeTop).toBe(60);
      }
    }
  });
});
