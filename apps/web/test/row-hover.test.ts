// D527: the one row hover. Hovering a row or a card never reflows it: its size, line breaks and
// positions stay, and what it reveals keeps its room or comes in over the time in a fixed slot. On
// the web that is the stylesheet's to keep: a :hover or :focus-within rule on a row changes paint
// only (fill, shadow, ink, opacity), never display, size, spacing or a transform that moves it.
// The browser walk at 390 and 1400 (every row hovered, every box measured) is in .shots/hover.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ROWS = /\.(ocard|trow|pcard|tcard|tcompact|bcard)\b/;
const PAINT = new Set([
  "background", "background-color", "box-shadow", "color", "opacity", "visibility", "text-decoration", "text-decoration-color",
  "text-decoration-thickness", "text-underline-offset", "outline", "outline-color", "outline-offset", "border-color", "filter",
  "cursor", "transition", "transition-delay", "fill", "stroke", "z-index", "pointer-events",
]);

/** Every rule (selector list, declarations), media blocks flattened. */
function rules(): { sel: string; body: string }[] {
  const out: { sel: string; body: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ sel: m[1]!.replace(/\s+/g, " ").trim(), body: m[2]! });
  return out;
}

describe("a row's hover never reflows (D527)", () => {
  const hovered = rules().filter((r) => /:hover|:focus-within|\.pcard\.on\b/.test(r.sel) && ROWS.test(r.sel));
  test("there are row hover rules to check", () => expect(hovered.length).toBeGreaterThan(10));
  for (const r of hovered) {
    test(r.sel.slice(0, 90), () => {
      for (const d of r.body.matchAll(/([-a-z]+)\s*:\s*([^;]+)/g)) {
        const [prop, value] = [d[1]!, d[2]!.trim()];
        if (prop === "transform") expect(`${prop}: ${value}`).toBe("transform: none");
        else expect(PAINT.has(prop) ? prop : `${prop} (changes layout on hover)`).toBe(prop);
      }
    });
  }
});

describe("what a row reveals is there for Tab too (D527)", () => {
  test("revealed controls fade by opacity, never display or visibility", () => {
    const reveal = rules().filter((r) => /(\.tacts|\.fin-acts)\b/.test(r.sel) && /:hover|:focus-within/.test(r.sel) && ROWS.test(r.sel));
    expect(reveal.length).toBeGreaterThan(0);
    for (const r of reveal) expect(r.body).not.toMatch(/\b(display|visibility)\s*:/);
  });
  test("the fill warms within its ground: tokens, never ink over the row", () => {
    expect(css).toMatch(/--row-hover:\s*color-mix\(in srgb, var\(--surface\) 45%, var\(--surface-sunken\)\)/);
    expect(css).toMatch(/--row-hover-needs:/);
    for (const r of rules().filter((x) => /\.(ocard|trow)\b[^,]*:hover/.test(x.sel)))
      expect(r.body).not.toMatch(/background:\s*color-mix\(in srgb, var\(--ink\)/);
  });
  test("the motion is the hover token, none under reduced motion", () => {
    expect(css).toMatch(/--t-hover:\s*140ms/);
    expect(css).toMatch(/transition: opacity var\(--t-hover\)/);
  });
});
