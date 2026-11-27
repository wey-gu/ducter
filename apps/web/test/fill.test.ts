// D184: wide, the two panes stay the default; On hand and an opened task can each take the whole
// screen as the Mac app shows them, and come back in one move.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeHash, type Route } from "../src/app.ts";
import { canFill, type Split } from "../src/fold.ts";
import { upFrom } from "../src/wide.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const book: Split = { kind: "book", a: 421, gap: 0 };
const flat: Split = { kind: "book", a: 421, gap: 0, flat: true };
const hinge: Split = { kind: "book", a: 540, gap: 34, flat: true };
const table: Split = { kind: "table", a: 350, gap: 0 };

describe("taking the whole screen", () => {
  test("wide without a fold both fill; on a half-open book only an opened task; flat and seamless both (D635); a hinge never; a tabletop neither", () => {
    expect(canFill("onhand", false)).toBe(false);
    expect(canFill("task", false)).toBe(false);
    expect(canFill("onhand", true)).toBe(true);
    expect(canFill("task", true)).toBe(true);
    expect(canFill("onhand", true, book)).toBe(false); // D252: a one-column list would lie across the crease
    expect(canFill("task", true, book)).toBe(true); // D244: the rail in the first half, the task in the second
    // D635: unfolded flat is a plain wide screen (no angle, no hinge), so the same button shows.
    expect(canFill("onhand", true, flat)).toBe(true);
    expect(canFill("task", true, flat)).toBe(true);
    // A real hinge (a gap between two screens) still keeps D252.
    expect(canFill("onhand", true, hinge)).toBe(false);
    expect(canFill("task", true, hinge)).toBe(true);
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

  test("nothing at the whole screen lies across a book fold", () => {
    // D252: D184 (5)'s lanes went with D216, and their book rules with them.
    expect(css).not.toContain(".full.book .lanes");
    expect(css).toContain(".full.book .with-rail {\n  grid-template-columns: var(--fold-a) minmax(0, 1fr);");
    // The side pane and the whole-screen page are one shape that grows and shrinks.
    expect(css).toMatch(/\.full \{[^}]*view-transition-name: level;/);
    expect(css).toMatch(/\.pane\.side \{\s*view-transition-name: level;/);
  });
});
