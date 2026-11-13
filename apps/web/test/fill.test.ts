// D184: wide, the two panes stay the default; On hand and an opened task can each take the whole
// screen as the Mac app shows them, and come back in one move.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeHash, type Route } from "../src/app.ts";
import { canFill, type Split } from "../src/fold.ts";
import { strings } from "../src/i18n.ts";
import { upFrom } from "../src/wide.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const book: Split = { kind: "book", a: 421, gap: 0 };
const table: Split = { kind: "table", a: 350, gap: 0 };

describe("taking the whole screen", () => {
  test("only wide; on a book fold On hand only; on a tabletop neither", () => {
    expect(canFill("onhand", false)).toBe(false);
    expect(canFill("task", false)).toBe(false);
    expect(canFill("onhand", true)).toBe(true);
    expect(canFill("task", true)).toBe(true);
    expect(canFill("onhand", true, book)).toBe(true);
    expect(canFill("task", true, book)).toBe(true); // D244: the rail in the first half, the task in the second
    expect(canFill("onhand", true, table)).toBe(false);
    expect(canFill("task", true, table)).toBe(false);
  });

  test("the address keeps it, so a reload or Back lands where you were", () => {
    expect(routeHash({ name: "conv" })).toBe("");
    expect(routeHash({ name: "onhand" })).toBe("#onhand");
    expect(routeHash({ name: "onhand", full: true })).toBe("#onhand/full");
    expect(routeHash({ name: "task", id: "t/1" })).toBe("#task=t%2F1");
    expect(routeHash({ name: "task", id: "t/1", full: true })).toBe("#task=t%2F1/full");
  });

  test("Esc goes up one level and keeps the whole screen until the top", () => {
    const up = (r: Route) => upFrom(r);
    expect(up({ name: "task", id: "a", full: true })).toEqual({ name: "onhand", full: true });
    expect(up({ name: "onhand", full: true })).toEqual({ name: "conv" });
    expect(up({ name: "task", id: "a" })).toEqual({ name: "onhand" });
    expect(up({ name: "conv" })).toBeUndefined();
  });

  test("⌘2 toggles: On hand at the whole screen, and again back to the two panes", () => {
    const app = src("app.ts");
    expect(app).toContain('return this.go(r.name === "onhand" && r.full ? { name: "conv" } : { name: "onhand", full: true });');
    // A task opened from the whole-screen On hand opens at the whole screen too.
    expect(app).toContain('if (r.name === "task" && r.full === undefined && this.route.name !== "conv" && this.route.full) r = { ...r, full: true };');
  });

  test("the Mac's words, in both languages", () => {
    for (const lang of ["zh", "en"] as const) {
      const L = strings(lang);
      for (const k of ["pane.fill", "pane.beside", "onhand.by", "onhand.by.state", "onhand.by.project", "onhand.other", "onhand.newhere", "onhand.next"]) expect(L.t(k)).not.toBe(k);
    }
    expect(strings("zh").t("onhand.by.project")).toBe("按项目");
    expect(strings("en").t("onhand.waiting.for", "CI")).toBe("Waiting · CI");
  });

  test("the lanes meet at a book fold, never across it", () => {
    expect(css).toContain(".full.book .lanes > .col:first-child {\n  flex: 0 0 var(--fold-a);");
    expect(css).toContain("margin-left: var(--fold-gap);");
    // The side pane and the whole-screen page are one shape that grows and shrinks.
    expect(css).toMatch(/\.full \{[^}]*view-transition-name: level;/);
    expect(css).toMatch(/\.pane\.side \{\s*view-transition-name: level;/);
  });
});
