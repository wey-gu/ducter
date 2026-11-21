// D467: On hand in one grammar, by attention. A wait nothing will bring back (no waiter, nothing
// asked for later, not a computer that will wake) and a task that didn't work out stand in 等你 and
// the head line says so; 今天做完 is today's, yesterday's folds away; the to-dos' summary says facts
// that add up to the open count; the day column beside the board is gone. The Mac's d467_test.go
// checks the same.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const startOfDay = new Date(new Date(now).toDateString()).getTime();
const DAY = 86_400_000;
const card = (id: string, attention: string, at: string, reason = "") => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  place: { kind: "none" },
  harness: "codex",
  attention,
  residency: "hot",
  openedAt: at,
  updatedAt: at,
  ...(reason ? { reason } : {}),
});
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

async function board(tasks: unknown[], waiters: unknown[] = []) {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.S.tasks.clear();
  A.receive({ t: "on_hand", onHand: { tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters, missed: [] } } as any);
  return { A, o };
}

describe("On hand by attention (D467)", () => {
  test("a wait with nothing to bring it back stands in 等你; one with a waiter, a fresh one or a sleeping computer stays in 在等", async () => {
    const today = Math.max(startOfDay + 1000, now - 60_000) - now;
    const { A, o } = await board(
      [
        card("phone", "blocked", iso(-8 * DAY)),
        card("ci", "blocked", iso(-48 * 60_000)),
        card("fresh", "blocked", iso(-5 * 60_000)),
        card("asleep", "blocked", iso(-3 * DAY), "device:asleep:Mac mini"),
        card("work", "working", iso(-23 * 60_000)),
        card("typo", "done", iso(today)),
        card("flaky", "done", new Date(startOfDay - 3_600_000).toISOString()),
        card("broke", "failed", iso(today)),
      ],
      [{ waiterId: "w1", taskId: "ci", reason: "the pipeline finishes", state: "armed", at: iso(37 * 60_000), armedAt: iso(-48 * 60_000) }],
    );
    const parts = o.boardParts(o.lensLanes(""));
    expect(parts.stopped.map((x) => x.id)).toEqual(["phone"]);
    expect(parts.failed.map((x) => x.id)).toEqual(["broke"]);
    expect(parts.waiting.map((x) => x.id).sort()).toEqual(["asleep", "ci", "fresh"]);
    expect(parts.today.map((x) => x.id)).toEqual(["typo"]);
    expect(parts.earlier.map((x) => x.id)).toEqual(["flaky"]);
    // The strip: 等你 counts the stopped and the failed; 今天做完 counts what it lists.
    expect(o.stateCounts("")).toEqual([2, 1, 3, 1]);
    // The head is true to the body: nothing to decide, two stopped.
    expect(o.headLine("")).toBe(A.L.t("onhand.line.stopped", 2));
    A.S.tasks.clear();
  });

  test("the head line: a question outranks a stop; one stop alone is said as one", async () => {
    const { A, o } = await board([card("phone", "blocked", iso(-8 * DAY))]);
    expect(o.stateCounts("")[0]).toBe(1);
    expect(o.headLine("")).toBe(A.L.t("onhand.line.stopped.one"));
    // With something to decide too, the count of all that needs the person.
    expect(o.headLine("", [2, 0, 0, 0])).toBe(A.L.t("onhand.say.needs", 2));
    A.L = strings("en");
    expect(o.headLine("")).toBe("One has stopped and needs a look.");
    A.S.tasks.clear();
  });

  test("the to-dos' summary: facts that add up to the open count, the rest said as already under way", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    const { pileTaken } = await import("../src/pile.tsx");
    A.L = strings("zh");
    const pile = { open: 555, clearedToday: 0, sortedAt: iso(-19 * 3600_000), read: 553, unread: 16, groups: { do: 236, decide: 104, close: 0, later: 197 }, queue: { running: 0, waiting: 0, cap: 6 } } as any;
    expect(pileTaken(pile)).toBe(2);
    const f = o.sourceFacts(pile, "Ducter");
    expect(f.leadGroup).toBe("do");
    expect(f.lead).toBe("236 个可以交给 Ducter 做");
    expect(f.facts).toEqual(["104 个要你拿主意", "197 个可以先放着", "16 个还没细看", "2 个已经在做"]);
    const sum = [f.lead, ...f.facts].map((x) => Number(/^\d+/.exec(x)![0])).reduce((a, b) => a + b, 0);
    expect(sum).toBe(555);
    // Not sorted yet: the one way to start it.
    expect(o.sourceFacts({ ...pile, sortedAt: undefined, read: 0 }, "Ducter").leadGroup).toBe("first");
  });

  test("one card shape, one to a row; no day column; the summary card has no art", () => {
    const onhand = src("onhand.tsx");
    const board = src("board.tsx");
    expect(board).not.toContain("DayColumn");
    expect(board).not.toContain("day-col");
    expect(onhand).not.toContain("CompactCard");
    expect(onhand).not.toContain('class="tcards"');
    expect(onhand).not.toContain("<Coin ");
    const sum = onhand.slice(onhand.indexOf("function SourceSummary"), onhand.indexOf("/** D285: On hand's one quiet way"));
    expect(sum).not.toContain("Art");
    expect(sum).not.toContain("pile-n");
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    const block = css.slice(css.indexOf("/* D467: On hand's one card."));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(block).toMatch(/\.ocards \{\s*display: flex;\s*flex-direction: column;/);
    expect(block).not.toMatch(/border-left:/);
  });

  test("zh and en together", async () => {
    const { onhandWords } = await import("../src/i18n-onhand.ts");
    for (const k of ["onhand.line.stopped.one", "onhand.line.stopped", "onhand.done.yesterday", "onhand.src.do", "onhand.src.decide", "onhand.src.close", "onhand.src.later", "onhand.src.unread", "onhand.src.taken", "onhand.src.taken.row", "onhand.src.review", "onhand.src.all", "onhand.src.hide"]) {
      expect(onhandWords.zh[k], k).toBeTruthy();
      expect(onhandWords.en[k], k).toBeTruthy();
      expect(onhandWords.zh[k]).not.toContain("件");
    }
  });
});
