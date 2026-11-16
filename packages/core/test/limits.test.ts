// D297: a task whose agent hits its usage limit waits for the reset and carries on in the same
// session (a home restart included), or goes to another signed-in agent; every task on the same
// account shares the one reset; the partner hears of it only when it matters. A fake clock, a fake
// runner, fake candidates and a fake account-usage book.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Candidate, Settings } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { FakeClock } from "../src/clock.ts";
import { triggersPartner } from "../src/core.ts";
import { createLimitWaits, MAX_UNKNOWN_TRIES, RESET_GRACE_MS, THROTTLE_RETRY_MS, UNKNOWN_RETRY_MS } from "../src/limits.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { createWork } from "../src/work.ts";
import type { AccountUsageBook, UsageAnswer } from "../src/account-usage.ts";
import { openTask, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());
const flush = async () => {
  for (let i = 0; i < 30; i++) await tick();
};

const START = Date.parse("2026-11-17T17:40:00Z"); // 01:40 in Shanghai

function setup(o: { dir?: string; start?: number; handoff?: boolean; candidates?: Candidate[]; usage?: Record<string, UsageAnswer> } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const clock = new FakeClock(o.start ?? START);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const mcp = createMcpHub({ secret: "s" });
  const sent: { taskId: string; text: string }[] = [];
  const switched: { taskId: string; harness: string; model?: string }[] = [];
  const runner = {
    async send(taskId: string, text: string) {
      sent.push({ taskId, text });
      return { delivered: "prompted" as const };
    },
  } as unknown as Runner;
  const work = createWork({ log, tasks, mcp, runner: () => runner, clock, persona: "default", minEveryMs: 1000, restartLookMs: 10 });
  let settings: Partial<Settings> = { limitHandoff: o.handoff ?? false };
  const loadout = {
    candidates: async () => o.candidates ?? [],
    async switchTask(taskId: string, harness: string, model?: string) {
      switched.push({ taskId, harness, ...(model ? { model } : {}) });
      tasks.setState(taskId, "working", "hot");
      return { ok: true };
    },
  };
  const usage: AccountUsageBook = { get: async (h) => o.usage?.[h] ?? { why: "unsupported" }, seen: () => {} };
  const limits = createLimitWaits({ log, tasks, waiters: work.waiters, loadout, settings: { get: () => settings as Settings }, usage, runner: () => runner, clock });
  tasks.setDecorator((x) => ({ ...work.decorate(x), waiters: work.decorate(x).waiters.map((w) => limits.decorate(w)) }));
  const prev = cleanup;
  cleanup = () => {
    limits.stop();
    work.stop();
    log.close();
    t.cleanup();
    prev();
  };
  const stop = () => {
    limits.stop();
    work.stop();
    log.close();
  };
  /** What the runner logs when a turn failed on the limit (runner/src/limit-hit.ts). */
  const hit = (taskId: string, l: { harness: string; failure?: "quota" | "rate_limited"; resetsAt?: string }) =>
    log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "system", from: "runner", text: "usage limit", raw: { limit: { failure: "quota", source: l.resetsAt ? "event" : "none", ...l } } } });
  const limitWaits = () => log.read({ kinds: ["waiter"], limit: 1000 }).filter((e) => (e.body as Bodies["waiter"]).limit);
  return { dir: t.dir, clock, log, tasks, work, limits, sent, switched, hit, limitWaits, stop, set: (s: Partial<Settings>) => (settings = { ...settings, ...s }) };
}

const working = (s: ReturnType<typeof setup>, id: string, title = "跑完 WAL 基准测试") => {
  openTask(s.log, id, title);
  s.tasks.setState(id, "working", "hot");
};
const CODEX: Candidate = { harness: "codex", reason: { kind: "fit" }, billing: "plan" };
const CLAUDE_NOW: Candidate = { harness: "claude-code", model: "opus", reason: { kind: "current" }, current: true };

test("Claude Code's limit with its reset: the task rests until then, carries on in the same task, the partner stays quiet", async () => {
  const s = setup();
  working(s, "t1");
  const reset = new Date(START + 92 * 60_000).toISOString(); // 03:12 Shanghai
  s.hit("t1", { harness: "claude-code", resetsAt: reset });
  await flush();
  const armed = s.limitWaits().at(-1)!;
  const w = armed.body as Bodies["waiter"];
  expect(w).toMatchObject({ taskId: "t1", wakes: "task", state: "armed", limit: { harness: "claude-code", resetKnown: true } });
  expect(Date.parse(w.at!)).toBe(Date.parse(reset) + RESET_GRACE_MS);
  expect(w.limit!.tell).toBeUndefined();
  expect(triggersPartner(armed)).toBe(false);
  expect(s.tasks.get("t1")!.attention).toBe("blocked");
  expect(s.tasks.onHand().waiters.find((x) => x.taskId === "t1")?.limit?.harness).toBe("claude-code");
  s.clock.advance(92 * 60_000);
  await flush();
  expect(s.sent).toEqual([]);
  s.clock.advance(RESET_GRACE_MS);
  await flush();
  const fired = s.limitWaits().at(-1)!;
  expect((fired.body as Bodies["waiter"]).state).toBe("fired");
  expect(triggersPartner(fired)).toBe(false);
  expect(s.tasks.get("t1")!.attention).toBe("working");
  expect(s.sent).toEqual([{ taskId: "t1", text: "Claude Code 的额度恢复了，接着做刚才没做完的。" }]);
});

test("the wait survives a home restart: overdue, it carries on as soon as the home is back", async () => {
  const a = setup();
  working(a, "t1", "Run the WAL bench");
  a.hit("t1", { harness: "claude-code", resetsAt: new Date(START + 60 * 60_000).toISOString() });
  await flush();
  expect(a.tasks.get("t1")!.attention).toBe("blocked");
  a.stop();
  // The home comes back after the reset.
  const b = setup({ dir: a.dir, start: START + 3 * 3_600_000 });
  await flush();
  b.clock.advance(1);
  await flush();
  expect(b.sent).toEqual([{ taskId: "t1", text: "Claude Code's usage limit has reset. Carry on where you left off." }]);
  expect(b.tasks.get("t1")!.attention).toBe("working");
});

test("Codex says no time in its failure: the reset comes from the account's own limits", async () => {
  const resets = new Date(START + 5 * 3_600_000).toISOString();
  const s = setup({ usage: { codex: { usage: { harness: "codex", limited: true, windows: [{ id: "codex:primary", label: "Codex", used: 1, resetsAt: resets, durationMs: 5 * 3_600_000 }, { id: "codex:secondary", label: "Codex", used: 0.4, resetsAt: new Date(START + 90 * 3_600_000).toISOString() }], at: new Date(START).toISOString() } } } });
  working(s, "t1");
  s.hit("t1", { harness: "codex" });
  await flush();
  const w = s.limitWaits().at(-1)!.body as Bodies["waiter"];
  expect(w.limit).toMatchObject({ harness: "codex", resetKnown: true });
  expect(Date.parse(w.at!)).toBe(Date.parse(resets) + RESET_GRACE_MS);
});

test("several tasks on one account share one reset: a task with no time takes another's, and a later time moves the rest", async () => {
  const s = setup();
  const reset = new Date(START + 92 * 60_000).toISOString();
  working(s, "t1");
  working(s, "t2", "整理评审意见");
  working(s, "t3", "Update the changelog");
  // t3 first, with no time (yet).
  s.hit("t3", { harness: "claude-code" });
  await flush();
  expect((s.limitWaits().at(-1)!.body as Bodies["waiter"]).limit!.resetKnown).toBe(false);
  s.hit("t1", { harness: "claude-code", resetsAt: reset });
  await flush();
  s.hit("t2", { harness: "claude-code" });
  await flush();
  const armed = s.tasks.onHand().waiters.filter((w) => w.limit && w.state === "armed");
  expect(armed.map((w) => w.taskId).sort()).toEqual(["t1", "t2", "t3"]);
  expect(new Set(armed.map((w) => w.at)).size).toBe(1);
  expect(armed.every((w) => w.limit!.resetKnown)).toBe(true);
  s.clock.advance(92 * 60_000 + RESET_GRACE_MS);
  await flush();
  expect(s.sent.map((x) => x.taskId).sort()).toEqual(["t1", "t2", "t3"]);
  expect(s.sent.find((x) => x.taskId === "t3")!.text).toBe("Claude Code's usage limit has reset. Carry on where you left off.");
});

test("no reset said and nobody else to take it: it tries again in an hour, and the partner says it once", async () => {
  const s = setup();
  working(s, "t1");
  s.hit("t1", { harness: "pi" });
  await flush();
  const armed = s.limitWaits().at(-1)!;
  const w = armed.body as Bodies["waiter"];
  expect(w.limit).toMatchObject({ harness: "pi", resetKnown: false, tell: true });
  expect(Date.parse(w.at!)).toBe(START + UNKNOWN_RETRY_MS);
  expect(triggersPartner(armed)).toBe(true);
  s.clock.advance(UNKNOWN_RETRY_MS);
  await flush();
  expect(s.sent).toHaveLength(1);
  // Still limited: one more try, said to nobody this time.
  s.hit("t1", { harness: "pi" });
  await flush();
  const again = s.limitWaits().at(-1)!;
  expect((again.body as Bodies["waiter"]).limit).toMatchObject({ tries: 2 });
  expect((again.body as Bodies["waiter"]).limit!.tell).toBeUndefined();
  expect(triggersPartner(again)).toBe(false);
});

test("a throttle that outlived the agent's own retries: it tries again in 10 minutes, quietly", async () => {
  const s = setup();
  working(s, "t1");
  s.hit("t1", { harness: "claude-code", failure: "rate_limited" });
  await flush();
  const armed = s.limitWaits().at(-1)!;
  expect(Date.parse((armed.body as Bodies["waiter"]).at!)).toBe(START + THROTTLE_RETRY_MS);
  expect(triggersPartner(armed)).toBe(false);
});

test("after a day of tries with no reset, it stops and waits for the person", async () => {
  const s = setup();
  working(s, "t1");
  for (let i = 0; i <= MAX_UNKNOWN_TRIES; i++) {
    s.hit("t1", { harness: "deepseek-harness" });
    await flush();
    s.clock.advance(UNKNOWN_RETRY_MS);
    await flush();
  }
  s.hit("t1", { harness: "deepseek-harness" });
  await flush();
  expect(s.tasks.get("t1")).toMatchObject({ attention: "needs_you" });
});

test("another signed-in agent is offered; one paid per use, limited, or the same agent is not", async () => {
  const s = setup({
    candidates: [CLAUDE_NOW, { harness: "claude-code", model: "sonnet", reason: { kind: "fast" } }, { harness: "pi", reason: { kind: "fast" }, billing: "usage" }, CODEX],
    usage: { codex: { usage: { harness: "codex", windows: [], at: new Date(START).toISOString() } } },
  });
  working(s, "t1");
  s.hit("t1", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  expect((s.limitWaits().at(-1)!.body as Bodies["waiter"]).limit!.handTo).toEqual({ harness: "codex" });
  // Codex limited too: nobody to hand it to.
  const t = setup({ candidates: [CLAUDE_NOW, CODEX], usage: { codex: { usage: { harness: "codex", limited: true, windows: [], at: new Date(START).toISOString() } } } });
  working(t, "t2");
  t.hit("t2", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  expect((t.limitWaits().at(-1)!.body as Bodies["waiter"]).limit!.handTo).toBeUndefined();
});

test("Hand it to Codex now: the wait ends and the task carries on with Codex (D282's switch)", async () => {
  const s = setup({ candidates: [CLAUDE_NOW, CODEX] });
  working(s, "t1");
  s.hit("t1", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  const w = s.tasks.onHand().waiters.find((x) => x.limit)!;
  expect(await s.limits.act(w.waiterId, "handoff")).toBe(true);
  await flush();
  expect(s.switched).toEqual([{ taskId: "t1", harness: "codex" }]);
  expect(s.tasks.get("t1")!.attention).toBe("working");
  expect((s.limitWaits().at(-1)!.body as Bodies["waiter"]).state).toBe("cancelled");
  expect(s.sent).toEqual([]);
  // Not a limit wait: the action isn't this module's.
  expect(s.limits.act("w_nope", "handoff")).toBeUndefined();
});

test("Stop waiting: the wait ends and the task stops where it is, the person's turn", async () => {
  const s = setup();
  working(s, "t1");
  s.hit("t1", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  const w = s.tasks.onHand().waiters.find((x) => x.limit)!;
  expect(await s.limits.act(w.waiterId, "cancel")).toBe(true);
  await flush();
  expect(s.tasks.get("t1")).toMatchObject({ attention: "needs_you" });
  s.clock.advance(2 * 3_600_000);
  await flush();
  expect(s.sent).toEqual([]);
});

test("hand off automatically (chosen on the card): no wait at all, the task goes on with Codex", async () => {
  const s = setup({ handoff: true, candidates: [CLAUDE_NOW, CODEX] });
  working(s, "t1");
  s.hit("t1", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  expect(s.switched).toEqual([{ taskId: "t1", harness: "codex" }]);
  expect(s.limitWaits()).toEqual([]);
  const handed = s.log.read({ stream: "task:t1", kinds: ["task_event"] }).at(-1)!.body as Bodies["task_event"];
  expect(handed.raw).toMatchObject({ limitHanded: { from: "claude-code", to: "codex", auto: true } });
  // Chosen, but nobody to take it: it waits as usual, and the card says the choice is on.
  const t = setup({ handoff: true, candidates: [CLAUDE_NOW] });
  working(t, "t2");
  t.hit("t2", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  expect(t.tasks.onHand().waiters.find((x) => x.limit)?.limitAuto).toBe(true);
});

test("a task already done or waiting on the person doesn't start a wait", async () => {
  const s = setup();
  openTask(s.log, "t1");
  s.tasks.setState("t1", "needs_you", "warm");
  s.hit("t1", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  openTask(s.log, "t2");
  s.tasks.setState("t2", "done", "parked");
  s.hit("t2", { harness: "claude-code", resetsAt: new Date(START + 3_600_000).toISOString() });
  await flush();
  expect(s.limitWaits()).toEqual([]);
});
