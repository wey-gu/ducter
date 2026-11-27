// D645 (research/245 §3.7, phase 1): the head and the counts read the same state as the rows.
// A task told to wait for the person is needs_you in the count and in the head line (never 没有待你
// 处理的，我在做); a GitHub-blind card says so after its 30 minutes, with the fix.
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const card = (id: string, attention: string, o: Record<string, unknown> = {}) => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  place: { kind: "none" },
  harness: "codex",
  attention,
  residency: "warm",
  openedAt: iso(-60 * 60_000),
  updatedAt: iso(-5 * 60_000),
  ...o,
});

async function board(tasks: unknown[]) {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({ t: "on_hand", onHand: { tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], missed: [] } } as never);
  return { A, o };
}

describe("D645: the head counts what waits on the person", () => {
  test("a task told to wait is needs_you: the count and the head say so, not 我在做", async () => {
    // Before: the only live task is in a turn.
    const first = await board([card("zqcpawnf", "working")]);
    expect(first.o.stateCounts("")).toEqual([0, 1, 0, 0]);
    expect(first.o.headLine("")).toBe(first.A.L.t("onhand.line.working"));

    // The same task's turn ended with an open question: 在做 is over, and the person is owed it.
    const second = await board([card("zqcpawnf", "needs_you", { waitsFor: "这个任务停下吗？" })]);
    expect(second.o.stateCounts("")).toEqual([1, 0, 0, 0]);
    expect(second.o.headLine("")).toBe(second.A.L.t("onhand.say.needs.one"));
    expect(second.o.headLine("")).not.toContain("我在做");
  });

  test("both languages say the needs-you count first when anything waits on the person", async () => {
    const { A, o } = await board([card("zqcpawnf", "needs_you", { waitsFor: "这个任务停下吗？" }), card("ci", "blocked")]);
    expect(o.headLine("")).toBe(A.L.t("onhand.say.needs.one"));
    A.L = strings("en");
    expect(o.headLine("")).toBe("One thing needs you.");
    expect(o.stateCounts("")).toEqual([1, 0, 1, 0]);
  });

  test("a GitHub-blind task's row says so after its quiet, with the fix", async () => {
    const { A, o } = await board([card("loop", "blocked", { githubBlind: { since: iso(-31 * 60_000), device: "haswell", home: "hel" } })]);
    const t = A.S.tasks.get("loop")!;
    expect(o.storyOf(t).words).toContain("看不到 GitHub");
    expect(o.storyOf(t).words).toContain("haswell");
    // Inside the 30 minutes it is still the task's own line.
    const fresh = await board([card("loop2", "blocked", { githubBlind: { since: iso(-5 * 60_000), device: "haswell", home: "hel" } })]);
    expect(fresh.o.storyOf(fresh.A.S.tasks.get("loop2")!).words).not.toContain("看不到 GitHub");
  });
});
