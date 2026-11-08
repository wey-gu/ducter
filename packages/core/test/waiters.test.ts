// Waiters (wait_until timers) and the v2 card fields (openedAt, pendingDecision), on a fake clock.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { triggersPartner } from "../src/core.ts";
import { createDecisions } from "../src/decisions.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { createWaiters } from "../src/waiters.ts";
import { openTask, report, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

function setup() {
  const t = tempDir();
  cleanup = t.cleanup;
  const clock = new FakeClock();
  const path = join(t.dir, "ducter.db");
  const log = openLog({ path, persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const waiters = createWaiters({ log, clock });
  return { path, clock, log, tasks, waiters };
}

const states = (log: ReturnType<typeof openLog>) =>
  log.read({ kinds: ["waiter"] }).map((e) => `${(e.body as Bodies["waiter"]).reason}:${(e.body as Bodies["waiter"]).state}`);

test("armed waiter shows on On hand, fires when due, and the fired event wakes the partner", () => {
  const { clock, log, tasks, waiters } = setup();
  waiters.arm({ at: new Date(clock.now() + 60_000).toISOString(), reason: "reply to Alice" });
  expect(tasks.onHand().waiters.map((w) => w.reason)).toEqual(["reply to Alice"]);
  clock.advance(59_000);
  expect(states(log)).toEqual(["reply to Alice:armed"]);
  clock.advance(1_000);
  expect(states(log)).toEqual(["reply to Alice:armed", "reply to Alice:fired"]);
  const fired = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(fired).toMatchObject({ stream: "channel", origin: "waiter" });
  expect(triggersPartner(fired)).toBe(true);
  expect(triggersPartner(log.read({ kinds: ["waiter"] })[0]!)).toBe(false);
  expect(tasks.onHand().waiters).toEqual([]);
  expect(() => waiters.arm({ reason: "no time" })).toThrow(/ISO time/);
});

test("a task-bound waiter is cancelled when the task finishes first", () => {
  const { clock, log, tasks, waiters } = setup();
  openTask(log, "t1");
  waiters.arm({ at: new Date(clock.now() + 3600_000).toISOString(), taskId: "t1", reason: "check CI" });
  tasks.setState("t1", "working", "hot");
  expect(states(log)).toEqual(["check CI:armed"]);
  tasks.setState("t1", "done", "warm");
  expect(states(log)).toEqual(["check CI:armed", "check CI:cancelled"]);
  clock.advance(2 * 3600_000);
  expect(states(log)).toEqual(["check CI:armed", "check CI:cancelled"]);
});

test("armed waiters survive a restart; overdue ones fire at once", async () => {
  const { path, clock, log, waiters } = setup();
  waiters.arm({ at: new Date(clock.now() + 60_000).toISOString(), reason: "soon" });
  waiters.arm({ at: new Date(clock.now() + 3600_000).toISOString(), reason: "later" });
  waiters.stop();
  log.close();
  clock.advance(5 * 60_000); // down for five minutes
  const log2 = openLog({ path, persona: "default", clock });
  const tasks2 = createRegistry(log2, clock);
  createWaiters({ log: log2, clock });
  expect(tasks2.onHand().waiters.map((w) => w.reason)).toEqual(["soon", "later"]);
  clock.advance(0);
  expect(states(log2)).toEqual(["soon:armed", "later:armed", "soon:fired"]);
  clock.advance(3600_000);
  expect(states(log2)).toEqual(["soon:armed", "later:armed", "soon:fired", "later:fired"]);
});

test("card carries openedAt and the open decision with askedAt; cleared on resolve", async () => {
  const { clock, log, tasks } = setup();
  const decisions = createDecisions({ log, tasks, clock });
  const opened = openTask(log, "t1");
  clock.advance(1000);
  report(log, "t1", { state: "needs_input", summary: "?", questions: [{ id: "q", text: "Rebase?", blocking: true, default: "Rebase", reversible: false }] });
  await tick();
  const c = tasks.get("t1")!;
  expect(c.openedAt).toBe(opened.ts);
  const d = log.read({ kinds: ["decision"] })[0]!;
  expect(c.pendingDecision).toMatchObject({ decisionId: c.pendingDecisionId, question: "Rebase?", goLabel: "Rebase", askedAt: d.ts });
  decisions.decide(c.pendingDecisionId!, "go");
  expect(tasks.get("t1")!.pendingDecision).toBeUndefined();
  expect(tasks.get("t1")!.pendingDecisionId).toBeUndefined();
  expect(tasks.get("t1")!.openedAt).toBe(opened.ts);
});

test("a waiter tied to a question is cancelled when the question is answered, also across a restart", () => {
  const { path, clock, log, waiters } = setup();
  const at = new Date(clock.now() + 3600_000).toISOString();
  const arm = (reason: string, decisionId?: string) =>
    log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_${reason}`, at, reason, state: "armed", ...(decisionId ? { decisionId } : {}) } });
  arm("chase-d1", "d1");
  arm("chase-d2", "d2");
  arm("plain");
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d1", option: "go", by: "user" } });
  expect(states(log)).toEqual(["chase-d1:armed", "chase-d2:armed", "plain:armed", "chase-d1:cancelled"]);
  waiters.stop();
  // d2 is answered while core is down: the rebuilt waiters cancel it at start.
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d2", option: "hold", by: "user" } });
  log.close();
  const log2 = openLog({ path, persona: "default", clock });
  createWaiters({ log: log2, clock });
  expect(states(log2).slice(-1)).toEqual(["chase-d2:cancelled"]);
  clock.advance(3600_000);
  expect(states(log2).filter((s) => s.endsWith("fired"))).toEqual(["plain:fired"]);
});
