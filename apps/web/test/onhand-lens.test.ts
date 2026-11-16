// D261: On hand as a conductor. The project lens stands beside the board from the rail's own
// width (ROOMY), else a row of names that never widens the page; its words are the Mac's.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";
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

test("the strip, the folds and the waits speak in both languages", () => {
  for (const lang of ["zh", "en"] as const) {
    const L = strings(lang);
    for (const k of ["onhand.lens", "onhand.lens.all", "onhand.strip", "onhand.wait.next", "onhand.wait.at", "onhand.wait.unsaid", "onhand.wait.quiet", "onhand.wait.since", "onhand.done.seen", "onhand.walk.next", "onhand.walk.prev"]) expect(L.t(k)).not.toBe(k);
  }
  // The forecast's label is its own again: the menu's 下一件事 no longer overwrites 接下来.
  expect(strings("zh").t("onhand.next")).toBe("接下来");
  expect(strings("zh").t("onhand.wait.quiet", 3)).toBe("还有 3 件，一天多没有动静");
  expect(strings("en").t("onhand.done.seen", 9)).toBe("9 more you've seen");
});
