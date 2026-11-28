// D261: On hand as a conductor. The project lens stands beside the board from the rail's own
// width (ROOMY), else a row of names that never widens the page; its words are the Mac's.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOMY } from "../src/wide.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

test("the column comes at the rail's width; the row of names never wraps (D654)", () => {
  expect(ROOMY).toContain("1120px");
  const block = css.slice(css.indexOf("@media (min-width: 1120px) {\n  .lens-col"));
  expect(block.startsWith("@media (min-width: 1120px)")).toBe(true);
  expect(block).toContain(".lens-tabs.in-board");
  const tabs = css.slice(css.indexOf(".lens-tabs {"), css.indexOf("}", css.indexOf(".lens-tabs {")));
  expect(tabs).toContain("contain: inline-size");
  expect(tabs).toContain("flex-wrap: nowrap");
  expect(tabs).toContain("overflow: hidden");
  expect(tabs).not.toContain("overflow-x: auto");
  // D654: a project name is one line (middle ellipsis), never a two-line clamp; its
  // computers are one line with +N, never a wrapped or cut line.
  const name = css.slice(css.indexOf(".lens-col .lens-row .nm b"), css.indexOf("}", css.indexOf(".lens-col .lens-row .nm b")));
  expect(name).toContain("white-space: nowrap");
  expect(name).not.toContain("-webkit-line-clamp");
  const where = css.slice(css.indexOf(".lens-row .where {"), css.indexOf("}", css.indexOf(".lens-row .where {")));
  expect(where).toContain("flex-wrap: nowrap");
  expect(css).not.toContain("max-height: 2.9em");

  // Overflow goes into one 更多 / More menu, not a scroll and not a second row.
  const src = readFileSync(join(import.meta.dir, "../src/onhand.tsx"), "utf8");
  expect(src).toContain("const folded: LensGroup[] = []");
  expect(src).toContain('label={t("onhand.more")}');
});

