// D627: a home frozen for a move holds its routines and refuses a new task; unfreezing
// restores both. The work's clock is held (never a running turn's own timers), Keeps hold their
// sweeps, and the chat apps stop polling.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

function boot() {
  const t = tempDir();
  stops.push(t.cleanup);
  const clock = new FakeClock(Date.parse("2026-11-09T02:00:00Z")); // 10:00 in Shanghai
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    clock,
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" },
  });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  let n = 0;
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `run${++n}`;
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: "", place: { kind: "none" }, harness: "claude-code", brief: input.brief } });
      core.tasks.setState(taskId, "working", "hot");
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return { core, clock, dir: t.dir };
}

const started = (core: Core) => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["routine_run"] }).map((e) => e.body as Bodies["routine_run"]).filter((r) => r.state === "started");

test("freeze holds a routine and refuses a new task; unfreeze restores both", async () => {
  const { core, clock } = boot();
  core.work.routines.yours({ name: "早报", trigger: { kind: "time", every: "day", time: "09:00", zone: "world", tz: "Asia/Shanghai" }, brief: "给我今天的安排。" });
  expect(core.move.status().frozen).toBe(false);
  const frozen = core.move.freeze();
  expect(frozen.frozen).toBe(true);
  expect(core.move.status().frozen).toBe(true);

  clock.advance(24 * 60 * 60_000); // past the next 09:00
  await flush();
  expect(started(core)).toHaveLength(0);

  const refused = await core.newTask.open({ words: "a new task while moving", language: "en" });
  expect(refused.ok).toBe(false);
  if (!refused.ok) expect(refused.message).toContain("moving to another computer");

  const lifted = core.move.unfreeze();
  expect(lifted.frozen).toBe(false);
  await flush();
  expect(started(core).length).toBeGreaterThan(0);

  const allowed = await core.newTask.open({ words: "a new task after unfreezing", language: "en" });
  expect(allowed.ok).toBe(true);
});

test("a freeze survives a restart until --unfreeze", async () => {
  const { core, clock, dir } = boot();
  core.move.freeze();
  await core.stop();
  const again = startCore({ dataDir: dir, port: 0, clock, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "laptop" } });
  stops.push(() => again.stop());
  expect(again.move.frozen()).toBe(true);
  const refused = await again.newTask.open({ words: "after a restart", language: "en" });
  expect(refused.ok).toBe(false);
  again.move.unfreeze();
  expect(again.move.frozen()).toBe(false);
});

test("the running list is what the freeze reports, never killed by it", async () => {
  const { core } = boot();
  const opened = await core.newTask.open({ words: "a task already at work", language: "en" });
  expect(opened.ok).toBe(true);
  const id = opened.ok && "card" in opened ? opened.card.taskId : "";
  const s = core.move.freeze();
  expect(s.running.map((r) => r.taskId)).toContain(id);
  expect(core.tasks.get(id)?.attention).toBe("working");
  core.move.unfreeze();
});
