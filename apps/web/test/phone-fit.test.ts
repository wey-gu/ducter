// research/110: what the iOS Simulator walk found in the stylesheet, kept from coming back.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

/** Every declaration block whose selector list is exactly `selector` (whitespace-normalised). */
function blocks(selector: string): string[] {
  const want = selector.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    if (sel === want) out.push(m[2]!);
  }
  return out;
}

describe("sentences fill the measure (D78)", () => {
  // Balance cuts a long CJK sentence into short ragged lines and splits words ("信 / 号");
  // it is for short headings only.
  for (const sel of [".partner > .bubble", ".decision .q, .ask .q, .task-head .headline", ".hello p", ".mem-hero p"]) {
    test(`${sel} is pretty, never balanced`, () => {
      const b = blocks(sel);
      expect(b.length).toBeGreaterThan(0);
      for (const body of b) expect(body).not.toMatch(/text-wrap:\s*balance/);
      expect(b.some((body) => /text-wrap:\s*pretty/.test(body))).toBe(true);
    });
  }
});

describe("marks a finger can hit (44 pt)", () => {
  test("the sheets' close mark reaches 44 around its 34", () => {
    expect(blocks(".past-x::after").join("")).toMatch(/inset:\s*-5px/);
    expect(blocks(".past-x").join("")).toMatch(/position:\s*relative/);
  });
  test("the places reach 44 tall around their 28", () => {
    expect(blocks(".places .place::after").join("")).toMatch(/inset:\s*-8px 0/);
  });
});

test("a tile of agent coins keeps each coin's size", () => {
  // `.g-tile img` sizes a single tile image to 40; two 24-pt coins must not grow to 40 each.
  expect(blocks(".g-tile .coin-art img").join("")).toMatch(/width:\s*100%/);
});
