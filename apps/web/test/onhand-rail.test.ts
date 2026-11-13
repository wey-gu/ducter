// D244: On hand beside the opened task wherever there is room. A rail row has one status place (the
// partner's face: needs you > working > new result); a finished task stays a new result until this
// device opens it; a folded group keeps its most urgent face; the thresholds are the Mac's.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";
import { handover, isNewResult, markSeen, readSeen, resetSeen, statusOf, urgentOf, HANDOVER_MS } from "../src/seen.ts";
import { ROOMY, ROOMY_BENCH } from "../src/wide.ts";
import { workbench } from "../src/i18n-workbench.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const mem = () => {
  let v: string | null = null;
  return { get: () => v, set: (x: string) => void (v = x), peek: () => v };
};
const T0 = "2026-11-13T08:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

describe("new result (seen.ts)", () => {
  beforeEach(() => resetSeen(mem(), T0));

  test("a finish after this device started keeping track is new until opened", () => {
    expect(isNewResult("t1", "done", at(5))).toBe(true);
    expect(isNewResult("t1", "failed", at(5))).toBe(true);
    expect(isNewResult("t1", "working", at(5))).toBe(false);
    markSeen("t1", at(5));
    expect(isNewResult("t1", "done", at(5))).toBe(false);
    // It changes again (a new turn finished): new again.
    expect(isNewResult("t1", "done", at(9))).toBe(true);
  });

  test("what finished before tracking began is never new: a fresh install shows none", () => {
    expect(isNewResult("old", "done", at(-60))).toBe(false);
  });

  test("a first read starts the clock now and keeps it", () => {
    const s = mem();
    const a = readSeen(s, () => T0);
    expect(a.since).toBe(T0);
    expect(readSeen(s, () => at(99)).since).toBe(T0);
  });

  test("the status place: needs you > working > new result", () => {
    expect(statusOf("x", "needs_you", at(5))).toBe("needs");
    expect(statusOf("x", "working", at(5))).toBe("working");
    expect(statusOf("x", "queued", at(5))).toBe("working");
    expect(statusOf("x", "done", at(5))).toBe("new");
    expect(statusOf("x", "blocked", at(5))).toBe("");
    expect(urgentOf(["new", "working", ""])).toBe("working");
    expect(urgentOf(["new", "needs"])).toBe("needs");
    expect(urgentOf(["", ""])).toBe("");
  });

  test("the handover plays once, only for a row this page saw working", () => {
    const now = Date.parse(T0);
    expect(handover("h", "new", now)).toBe(false); // never seen working
    expect(handover("w", "working", now)).toBe(false);
    expect(handover("w", "new", now + 10)).toBe(true);
    expect(handover("w", "new", now + 20)).toBe(true);
    expect(handover("w", "new", now + 20 + HANDOVER_MS)).toBe(false);
    expect(handover("w", "new", now + 40 + HANDOVER_MS)).toBe(false);
  });
});

describe("folded groups (D244)", () => {
  test("a folded group's counts say only what is there, in both languages", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    A.L = strings("en");
    expect(o.foldCounts(["needs", "working", "working", "new"])).toBe("1 needs you · 2 working · 1 new result");
    expect(o.foldCounts(["new", "new", ""])).toBe("2 new results");
    expect(o.foldCounts(["", ""])).toBe("");
    A.L = strings("zh");
    expect(o.foldCounts(["needs", "new", "new"])).toBe("1 件等你 · 2 个新结果");
  });
});

describe("room (D244)", () => {
  test("the rail from 1120, all three from 1560; the rail follows the window, 300 to 340", () => {
    expect(ROOMY).toBe("(min-width: 1120px)");
    expect(ROOMY_BENCH).toBe("(min-width: 1560px)");
    expect(css).toContain("grid-template-columns: clamp(300px, 22vw, 340px) minmax(0, 1fr);");
  });
  test("the workbench's edge paints nothing at rest; its grip shows on hover and darkens while dragged", () => {
    const col = css.slice(css.indexOf(".bench.as-column {"), css.indexOf("}", css.indexOf(".bench.as-column {")));
    expect(col).not.toContain("border-left");
    expect(css).toContain(".bench-resize.dragging::after");
  });
  test("the launcher's and side by side's words, zh and en together", () => {
    for (const k of ["wb.launcher", "wb.launcher.files", "wb.launcher.preview", "wb.launcher.browser", "wb.launcher.phone", "wb.launcher.made", "wb.screens.both"]) {
      expect(workbench.zh[k]).toBeTruthy();
      expect(workbench.en[k]).toBeTruthy();
    }
    expect(workbench.zh["wb.screens.both"]).toBe("并排");
    expect(workbench.en["wb.screens.both"]).toBe("Side by side");
  });
});
