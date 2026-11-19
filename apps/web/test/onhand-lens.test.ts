// D261: On hand as a conductor. The project lens stands beside the board from the rail's own
// width (ROOMY), else a row of names that never widens the page; its words are the Mac's.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOMY } from "../src/wide.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

test("the column comes at the rail's width; the row of names scrolls inside the page", () => {
  expect(ROOMY).toContain("1120px");
  const block = css.slice(css.indexOf("@media (min-width: 1120px) {\n  .lens-col"));
  expect(block.startsWith("@media (min-width: 1120px)")).toBe(true);
  expect(block).toContain(".lens-tabs.in-board");
  const tabs = css.slice(css.indexOf(".lens-tabs {"), css.indexOf("}", css.indexOf(".lens-tabs {")));
  expect(tabs).toContain("contain: inline-size");
  expect(tabs).toContain("overflow-x: auto");
});

