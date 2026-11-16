// D285: 一直在跑的 / Ongoing: a routine and a task that looks again on its own, as cards with
// their runs; pause (until a time, or until resumed), resume, run now, change when, end.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, OngoingItem, ServerFrame, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir?: string) {
  const t = dir ? { dir, cleanup: () => {} } : tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  let n = 0;
  const opened: string[] = [];
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `run${++n}`;
      opened.push(taskId);
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: { kind: "none" }, harness: "claude-code", brief: input.brief } });
      core.tasks.setState(taskId, "working", "hot");
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return { core, dir: t.dir, opened };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 3000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  let k = 0;
  const ask = async (f: object): Promise<OngoingItem[]> => {
    const id = `q${++k}`;
    ws.send(JSON.stringify(f));
    ws.send(JSON.stringify({ t: "ongoing", id }));
    return (await until<Extract<ServerFrame, { t: "ongoing_result" }>>((x) => x.t === "ongoing_result" && x.id === id)).items;
  };
  const result = async (id: string, action: string) => until<Extract<ServerFrame, { t: "action_result" }>>((f) => f.t === "action_result" && f.taskId === id && f.action === action);
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames, ask, result };
}

/** A task resting on its own wait: looks every 45 minutes. */
function resting(core: Core, id: string) {
  core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: "Watch nowledge-co reviews", project: "mem", place: { kind: "none" }, harness: "codex", brief: "x" } });
  core.tasks.setState(id, "blocked", "parked");
  core.log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId: `w_${id}`, taskId: id, wakes: "task", reason: "a new review request", state: "armed", kind: "timer", at: new Date(Date.now() + 45 * 60_000).toISOString(), everyMs: 45 * 60_000 } as Bodies["waiter"] });
  core.log.append({ stream: `task:${id}`, origin: "waiter", kind: "waiter_look", body: { waiterId: `w_${id}`, taskId: id, ok: true, met: false, summary: "No new requests." } });
}

test("a routine: listed with its schedule; pause until a time, resume, run now, change when, end", async () => {
  const { core, opened } = boot();
  const c = await client(core);
  c.send({ t: "task_new", words: "每天早上看一眼 hawdb 的 CI", when: { kind: "every", every: "day", time: "09:00", tz: "Asia/Shanghai" }, clientId: "r1" });
  const made = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result");
  const rid = made.routineId!;
  let items = await c.ask({ t: "hello" });
  expect(items.find((i) => i.id === rid)).toMatchObject({ kind: "routine", state: "resting", trigger: { kind: "time", every: "day", time: "09:00" } });
  expect(items.find((i) => i.id === rid)!.nextAt).toBeTruthy();
  // Paused until tomorrow: it says so.
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
  items = await c.ask({ t: "ongoing_action", kind: "routine", id: rid, action: "pause", until: tomorrow });
  expect((await c.result(rid, "pause")).ok).toBe(true);
  expect(items.find((i) => i.id === rid)).toMatchObject({ state: "paused", pausedBy: "user", pausedUntil: tomorrow });
  // Run now while paused: one run, still paused.
  items = await c.ask({ t: "ongoing_action", kind: "routine", id: rid, action: "run_now" });
  expect((await c.result(rid, "run_now")).ok).toBe(true);
  await Bun.sleep(50);
  items = await c.ask({ t: "hello" });
  expect(opened.length).toBe(1);
  const it = items.find((i) => i.id === rid)!;
  expect(it.state).toBe("paused");
  expect(it.runs.at(-1)).toMatchObject({ state: "running", taskId: "run1" });
  items = await c.ask({ t: "ongoing_action", kind: "routine", id: rid, action: "resume" });
  expect(items.find((i) => i.id === rid)!.state).not.toBe("paused");
  expect(items.find((i) => i.id === rid)!.pausedUntil).toBeUndefined();
  items = await c.ask({ t: "ongoing_action", kind: "routine", id: rid, action: "retime", trigger: { kind: "time", every: "weekday", time: "08:30", zone: "personal", tz: "Asia/Shanghai" } });
  expect(items.find((i) => i.id === rid)!.trigger).toMatchObject({ every: "weekday", time: "08:30" });
  expect(items.find((i) => i.id === rid)!.cadence).toBe("工作日 8:30（跟着你的时区）");
  items = await c.ask({ t: "ongoing_action", kind: "routine", id: rid, action: "end" });
  expect(items.find((i) => i.id === rid)).toBeUndefined();
});

test("a task resting on its wait: its looks as runs; pause keeps the wait, resume brings it back as it was, also after a restart", async () => {
  const { core, dir } = boot();
  resting(core, "loop1");
  const c = await client(core);
  let items = await c.ask({ t: "hello" });
  expect(items.find((i) => i.id === "loop1")).toMatchObject({ kind: "task", state: "resting", everyMs: 45 * 60_000, reason: "a new review request", runs: [{ state: "looked", line: "No new requests." }] });
  items = await c.ask({ t: "ongoing_action", kind: "task", id: "loop1", action: "pause" });
  expect(items.find((i) => i.id === "loop1")).toMatchObject({ state: "paused", reason: "a new review request" });
  expect(items.find((i) => i.id === "loop1")!.nextAt).toBeUndefined();
  // Nothing armed while paused.
  const armed = () => core.tasks.onHand().waiters.filter((w) => w.taskId === "loop1");
  expect(armed()).toEqual([]);
  // Kept across a restart.
  await core.stop();
  const again = boot(dir);
  const c2 = await client(again.core);
  items = await c2.ask({ t: "hello" });
  expect(items.find((i) => i.id === "loop1")!.state).toBe("paused");
  items = await c2.ask({ t: "ongoing_action", kind: "task", id: "loop1", action: "resume" });
  expect(items.find((i) => i.id === "loop1")!.state).toBe("resting");
  expect(again.core.tasks.onHand().waiters.find((w) => w.taskId === "loop1")).toMatchObject({ waiterId: "w_loop1", state: "armed", everyMs: 45 * 60_000 });
  // Pausing a task with nothing to wait on says so.
  c2.send({ t: "ongoing_action", kind: "task", id: "nope", action: "pause" });
  expect((await c2.result("nope", "pause")).ok).toBe(false);
});

test("paused until a time comes back by itself", async () => {
  const { core } = boot();
  resting(core, "loop2");
  const c = await client(core);
  await c.ask({ t: "ongoing_action", kind: "task", id: "loop2", action: "pause", until: new Date(Date.now() + 150).toISOString() });
  expect(core.tasks.onHand().waiters.some((w) => w.taskId === "loop2")).toBe(false);
  await Bun.sleep(400);
  expect(core.tasks.onHand().waiters.some((w) => w.taskId === "loop2" && w.state === "armed")).toBe(true);
  const fresh = c.frames.filter((f) => f.t === "ongoing_result" && !("id" in f && f.id));
  expect(fresh.length).toBeGreaterThan(0);
});
