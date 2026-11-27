// D452: the type scale is in rem, so the root (the browser's font size, the phone app's
// --text-scale from iOS's text size) drives every word; rows that hold words grow with them.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scaledRow } from "../src/text-scale.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const swift = readFileSync(join(import.meta.dir, "../../ios/Ducter/WebShell.swift"), "utf8");

// Pictures drawn with letters in them (the clay phone miniature, the calendar badge, a glyph in a
// fixed circle, the hidden key field) keep px: they are art, not words.
const ART = /^\s*(\.hs-|\.cal-badge|\.cal-leaf|\.chip-i|\.live-keys|\.own-mark|\.clockface|\.past-x|\.ho-words-x)/;

function rules(): { sel: string; body: string }[] {
  const out: { sel: string; body: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

describe("D452 type scale", () => {
  test("the tokens are rem over a 16px root", () => {
    for (const [k, rem] of [["xs", "0.75rem"], ["sm", "0.8125rem"], ["md", "0.9375rem"], ["body", "1rem"], ["lg", "1.125rem"], ["t20", "1.25rem"], ["t28", "1.75rem"], ["t34", "2.125rem"]])
      expect(css).toMatch(new RegExp(`--${k}: ${rem.replace(".", "\\.")};`));
    expect(css).toContain("--bar-text: min(0.875rem, 21px);");
  });

  test("the root is the person's text size; text-size-adjust stays 100%", () => {
    expect(css).toMatch(/html \{\s*font-size: calc\(100% \* var\(--text-scale, 1\)\);/);
    expect(css).toMatch(/body \{\s*font-size: var\(--md\);/);
    expect(css).not.toContain("--text-adjust");
  });

  test("no word is sized in px outside the drawn pictures", () => {
    const bad = rules().filter((r) => !ART.test(r.sel) && /(font-size|line-height):\s*\d+(\.\d+)?px|font:[^;]*\dpx/.test(r.body)).map((r) => r.sel);
    expect(bad).toEqual([]);
  });

  test("buttons, pills, chips and fields that hold words grow with the root: height: max(px, rem)", () => {
    for (const sel of [".btn", ".btn.sm", ".btn.lg", ".btn.text", ".pill", ".pchip", ".ptag", ".k-act", ".rich-choices .rich-chip", ".todo-chips .todo-chip", ".acct-field input", ".nt-field", ".pin-app", ".code-copy", ".info-btn"]) {
      const r = rules().filter((x) => x.sel === sel);
      expect(r.length).toBeGreaterThan(0);
      for (const { body } of r) if (/(^|[^-\w])height:/.test(body)) expect(body).toMatch(/(^|[^-\w])height: max\(\d+px, (calc\(\(1\.2em \+ \d+px\) \* var\(--grow, 1\)\)|[\d.]+rem)\)/);
    }
  });

  test("a row height written at 16px is unchanged at the default size", () => {
    expect(scaledRow(28)).toBe(28);
    expect(scaledRow(30)).toBe(30);
  });

  test("the iPhone app follows the whole Dynamic Type range through --text-scale", () => {
    expect(swift).toContain("--text-scale");
    expect(swift).not.toMatch(/min\(max\(want, 1\), 1\.35\)/);
    expect(swift).toMatch(/\.accessibilityExtraExtraExtraLarge: 53/);
  });
});
