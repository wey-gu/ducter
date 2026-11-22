// D478: each agent's usage limit per computer, as facts for the partner's world line: the runner's
// hits, the armed limit waits and the home's account reads; a hit on the home asks the others once.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { createAccountUsage, type UsageAnswer } from "../src/account-usage.ts";
import { createAgentLimits } from "../src/agent-limits.ts";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { openTask, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

const START = Date.parse("2026-11-22T12:00:00Z");

function setup(reads: Record<string, UsageAnswer> = {}) {
  const t = tempDir();
  cleanup = t.cleanup;
  const clock = new FakeClock(START);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const asked: string[] = [];
  const usage = createAccountUsage({ read: async (h) => (asked.push(h), reads[h] ?? { why: "unsupported" }), now: () => clock.now() });
  const waiters: Bodies["waiter"][] = [];
  const limits = createAgentLimits({ log, tasks, waiters: () => waiters, usage, home: () => [{ harness: "claude-code", loggedIn: true }, { harness: "codex", loggedIn: true }], clock });
  const hit = (taskId: string, harness: string, resetsAt?: string) =>
    log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "system", from: "runner", text: "usage limit", raw: { limit: { harness, failure: "quota", ...(resetsAt ? { resetsAt } : {}) } } } });
  return { log, clock, limits, waiters, asked, hit };
}

test("a hit on the home: used up until its reset, and the other agents' accounts read once", async () => {
  const s = setup({ codex: { usage: { harness: "codex", windows: [{ label: "5h", used: 0.2 }], at: "" } } });
  openTask(s.log, "t1");
  const reset = new Date(START + 3 * 3600_000).toISOString();
  s.hit("t1", "claude-code", reset);
  for (let i = 0; i < 10; i++) await tick();
  expect(s.asked).toEqual(["codex"]);
  expect(s.limits.now()).toEqual([
    { device: "local", harness: "claude-code", state: "used_up", until: reset },
    { device: "local", harness: "codex", state: "room" },
  ]);
  // After the reset the hit no longer stands.
  s.clock.advance(4 * 3600_000);
  expect(s.limits.now().find((l) => l.harness === "claude-code")).toBeUndefined();
  s.limits.stop();
});

test("a hit with no reset stands only while a task rests on it; the resting tasks are named", () => {
  const s = setup();
  openTask(s.log, "t1");
  s.hit("t1", "codex");
  expect(s.limits.now()).toEqual([]);
  s.waiters.push({ waiterId: "w1", reason: "codex's limit resets", taskId: "t1", wakes: "task", state: "armed", at: new Date(START + 3600_000).toISOString(), limit: { harness: "codex", resetKnown: false } });
  expect(s.limits.now()).toEqual([{ device: "local", harness: "codex", state: "used_up", waiting: ["t1"] }]);
  // A known reset: the reset itself, not the wait's wake a minute after it.
  s.waiters[0] = { ...s.waiters[0]!, at: new Date(START + 3600_000 + 60_000).toISOString(), limit: { harness: "codex", resetKnown: true } };
  expect(s.limits.now()).toEqual([{ device: "local", harness: "codex", state: "used_up", until: new Date(START + 3600_000).toISOString(), waiting: ["t1"] }]);
  s.limits.stop();
});
