// research/248 phase 1 (D673): the one token file (themes/pebble.json) stays the same object
// as PEBBLE_TOKENS, and Pebble's own papers pass the contrast floors the check enforces. A theme
// that fails these is what `ducter plugin check` refuses.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, contrastPairs, MODE_KEYS, PEBBLE_TOKENS, STATE_KEYS } from "../src/theme.ts";

const pebble = JSON.parse(readFileSync(join(import.meta.dir, "..", "themes", "pebble.json"), "utf8")) as { tokens: typeof PEBBLE_TOKENS };

test("themes/pebble.json is the same token set as PEBBLE_TOKENS", () => {
  for (const mode of ["light", "dark"] as const) {
    for (const k of MODE_KEYS) {
      expect(pebble.tokens[mode][k].toLowerCase()).toBe(PEBBLE_TOKENS[mode][k].toLowerCase());
    }
    for (const s of STATE_KEYS) {
      for (const f of ["dot", "surface", "ink"] as const) {
        expect(pebble.tokens[mode][s][f].toLowerCase()).toBe(PEBBLE_TOKENS[mode][s][f].toLowerCase());
      }
    }
  }
});

test("Pebble passes the contrast floors on both papers", () => {
  for (const mode of ["light", "dark"] as const) {
    for (const p of contrastPairs(PEBBLE_TOKENS[mode])) {
      expect(contrast(p.fg, p.bg), `${mode}: ${p.name}`).toBeGreaterThanOrEqual(p.min);
    }
  }
});

test("a 2.9:1 pair is a check failure", () => {
  // Ink on surface at 2.9:1 (grey on grey) must fail the 4.5 floor.
  expect(contrast("#767676", "#949494")).toBeLessThan(3);
});
