// D343: one task to the next at the same level is not a move in depth. No card flies into the
// task's head (no "hero" name), and the task cross-fades in place, quickly, with no travel; the
// level moves (deeper, back) keep D290's hero.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { navMove } from "../src/nav.ts";

const g = globalThis as Record<string, unknown>;
const saved = g.document;
afterEach(() => {
  g.document = saved;
});

/** A document with one row and one head for the task, recording each name it is given. */
function fakeDoc() {
  const names: string[] = [];
  const el = () => ({ style: { setProperty: (_: string, v: string) => names.push(v), removeProperty: () => {} } });
  const one = [el()];
  g.document = {
    visibilityState: "visible",
    documentElement: { dataset: {} as Record<string, string> },
    querySelectorAll: () => one,
    startViewTransition: (cb: () => Promise<void> | void) => {
      const done = Promise.resolve(cb());
      return { finished: done.then(() => {}) };
    },
  };
  return names;
}

describe("one task to the next (D343)", () => {
  test("no card flies into the head; a level move keeps its hero", async () => {
    let names = fakeDoc();
    let applied = 0;
    navMove("task", () => applied++, "t_keys");
    await new Promise((r) => setTimeout(r, 5));
    expect(applied).toBe(1);
    expect(names).not.toContain("hero");
    expect(names).toContain("bar");

    names = fakeDoc();
    navMove("deeper", () => applied++, "t_keys");
    await new Promise((r) => setTimeout(r, 5));
    expect(names).toContain("hero");
  });

  test("the task cross-fades in place on --t-switch, nothing travels", () => {
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
    expect(css).toMatch(/--t-switch:\s*140ms;/);
    const rules = [...css.matchAll(/:root\[data-nav="task"\][^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r).not.toMatch(/translate|nav-rise|nav-in/);
      expect(r).toContain("var(--t-switch)");
    }
    expect(css).not.toContain("nav-rise-in");
  });
});
