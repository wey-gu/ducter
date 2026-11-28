// research/248 phase 1 (D673): the web applies a theme as CSS variables. These tests hold
// the theme's tokens to the variables `app.css` actually reads (a token reaches a drawn element),
// and that 换回 Pebble / Back to Pebble removes the injected style so Pebble's own values return.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PEBBLE_TOKENS } from "@ducter/protocol";
import { modeToCss, themeCss } from "../src/theme.ts";

const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");

test("a theme token maps to a variable app.css reads", () => {
  const vars = modeToCss(PEBBLE_TOKENS.dark);
  expect(vars["--bg"]).toBe("#17120E");
  expect(vars["--ink"]).toBe("#F6EBDD");
  expect(vars["--accent"]).toBe("#FF8A3D");
  expect(vars["--done-ink"]).toBe("#A6ECBB");
  // Every variable the theme sets is one app.css already reads (the chain reaches a drawn element).
  for (const k of Object.keys(vars)) {
    expect(css).toContain(`${k}:`);
  }
});

test("the injected style carries both papers and the forced-dark override", () => {
  const s = themeCss(PEBBLE_TOKENS);
  expect(s).toContain(":root{--bg: #FFF6EA;");
  expect(s).toContain("@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){--bg: #17120E;");
  expect(s).toContain(":root[data-theme=\"dark\"]{--bg: #17120E;");
});

test("Back to Pebble removes the injected style", () => {
  const src = readFileSync(new URL("../src/theme.ts", import.meta.url), "utf8");
  expect(src).toContain("old?.remove()");
  expect(src).toContain('id = STYLE_ID');
});

// The real Midnight theme (the plugin repository's theme.json): every surface follows it, the clay
// included, and both papers set the same keys so no light value leaks into dark.
const midnight = JSON.parse(readFileSync(new URL("../../../.plugins-repo/repo/plugins/midnight/theme.json", import.meta.url), "utf8"));

test("both papers set the same variables (no light value leaks into dark)", () => {
  expect(Object.keys(modeToCss(midnight.tokens.dark, true)).sort()).toEqual(Object.keys(modeToCss(midnight.tokens.light)).sort());
});

test("the clay follows the theme: no Pebble tan ledge under a cool paper, a dark ledge below its card", () => {
  const light = modeToCss(midnight.tokens.light);
  expect(light["--press-quiet"]).not.toBe("#cdae8c");
  expect(light["--press-accent"]).not.toBe("#c9642a");
  expect(light["--base"]).toContain(midnight.tokens.light.line);
  const dark = modeToCss(midnight.tokens.dark, true);
  const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  expect(lum(dark["--press-quiet"]!)).toBeLessThan(lum(midnight.tokens.dark.surface));
  expect(lum(dark["--needs-ledge"]!)).toBeLessThan(lum(midnight.tokens.dark.decide.surface));
  expect(dark["--drop"]).toContain("rgba(0, 0, 0");
});
