// D310: one Done today on every surface. The conversation's header and On hand's sentence and strip
// count the same tasks: finished well, today. A failed task, one done yesterday, a done the agent
// only claims and a missed wait are not in it (research/109 saw 26 beside 32).
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const startOfDay = new Date(new Date(now).toDateString()).getTime();
const card = (id: string, attention: string, at: string) => ({
  taskId: id,
  persona: "default",
  title: `Invoices ${id}`,
  place: { kind: "none" },
  harness: "claude-code",
  attention,
  residency: "hot",
  openedAt: at,
  updatedAt: at,
});

describe("Done today (D310)", () => {
  test("the header and On hand say one number", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    A.L = strings("en");
    A.send = () => {};
    A.S.welcomed = true;
    A.S.tasks.clear(); // only this file's tasks, whatever an earlier file left
    const today = Math.max(startOfDay + 1000, now - 60_000) - now; // a moment earlier today
    A.receive({
      t: "on_hand",
      onHand: {
        tasks: [card("a", "done", iso(today)), card("b", "done", iso(today)), card("c", "failed", iso(today)), card("d", "done", new Date(startOfDay - 3_600_000).toISOString()), card("e", "done_claimed", iso(today))],
        counts: { needs_you: 0, working: 0, waiting: 0, done_today: 3 },
        waiters: [],
        missed: [{ waiterId: "w1", reason: "CI green", state: "missed", endedAt: iso(today) }],
      },
    } as any);
    // D467: a done whose check is still to come is listed as done, so every surface counts it;
    // the failed one stands in 等你, yesterday's folds away.
    expect(A.doneToday()).toBe(3);
    expect(A.S.board().counts.done_today).toBe(3);
    expect(A.summaryParts().words).toContain(A.L.t("header.done", 3));
    expect(o.headSay("")).toContain(A.L.t("onhand.say.done", 3));
    expect(o.stateCounts("")[0]).toBe(1);
  });
});
