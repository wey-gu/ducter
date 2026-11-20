// D426: a task in rounds is a promise Ducter keeps (research/177). On a fake clock with a stub
// runner (no model, no network): hel's round 185 replayed (a round's "done" with its next timer
// armed right after), a round that forgets to re-arm, failed rounds, a crashed harness, a restart
// mid-round, an upgrade that finds a loop already stopped by mistake, a quota wait, a computer
// asleep, the person's rhythm, an end condition, and only the person's word ending it.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, OngoingItem, Runner, TaskCard } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import { repeatsIn, saysStop, SETTLE_MS, SWEEP_MS, untilIn } from "../src/loops.ts";
import { join } from "node:path";
import { openLog } from "../src/log.ts";
import { tempDir, tick } from "./helpers.ts";

const MIN = 60_000;
const START = Date.parse("2026-11-20T05:12:00Z");
const BRIEF = "你能帮我准备好能 review nowledge-co 这个 org 下的 repo 么？你大概每 45 分钟查看一轮就好，每一轮仔细 review，结束之前，要再看一次有没有新的请求";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const flush = async () => {
  for (let i = 0; i < 30; i++) await tick();
};

function boot(o: { dir?: string; clock?: FakeClock; sendFails?: () => string | undefined } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const clock = o.clock ?? new FakeClock(START);
  const core: Core = startCore({ dataDir: t.dir, port: 0, push: false, clock, defaultDelayMs: 60_000 });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger: () => {} });
  const woke: { taskId: string; text: string }[] = [];
  const runner = {
    async openTask(): Promise<TaskCard> {
      throw new Error("no");
    },
    send: async (taskId: string, text: string) => {
      const err = o.sendFails?.();
      if (err) throw new Error(err);
      woke.push({ taskId, text });
      core.tasks.setState(taskId, "working", "hot"); // its turn starts
      core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "user", from: "partner", text } });
      return { delivered: "prompted" as const };
    },
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner as unknown as Runner);
  return { core, clock, woke, dir: t.dir };
}

type Boot = ReturnType<typeof boot>;
const open = (b: Boot, taskId = "swj3zc4w", brief = BRIEF, title = "review nowledge-co") => {
  b.core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none", device: "local" }, harness: "codex", brief } });
  b.core.tasks.setState(taskId, "working", "hot");
};
const waitFor = (b: Boot, taskId: string, minutes = 45) => b.core.mcp.call({ role: "task", taskId } as never, "wait_for", { reason: "约 45 分钟后继续检查 nowledge-co 的审查请求与提及", afterMinutes: minutes }) as Promise<{ ok: boolean; at?: string; note?: string }>;
const report = (b: Boot, taskId: string, state: Bodies["report"]["state"], summary = "队列现有 9 个 PR。") =>
  b.core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, questions: [], evidence: [] } });
const turnEnd = (b: Boot, taskId: string) => b.core.tasks.setState(taskId, b.core.tasks.get(taskId)!.attention, "warm");
const armed = (b: Boot, taskId: string) => b.core.work.waiters.views().filter((w) => w.taskId === taskId && w.state === "armed");
const loop = (b: Boot, taskId = "swj3zc4w") => b.core.work.loops.get(taskId);
const cards = (b: Boot) => b.core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]).filter((d) => d.loop);
const og = (b: Boot, id = "swj3zc4w") => b.core.ongoing.list(b.core.persona.id).find((i) => i.id === id) as OngoingItem | undefined;
/** One round: woken by its timer, it works, reports, re-arms (or not), its turn ends. */
async function round(b: Boot, taskId: string, o: { state?: Bodies["report"]["state"]; rearm?: boolean; reportFirst?: boolean } = {}) {
  b.core.tasks.setState(taskId, b.core.tasks.get(taskId)!.attention, "hot");
  if (o.reportFirst !== false) report(b, taskId, o.state ?? "progress");
  await flush();
  if (o.rearm !== false) await waitFor(b, taskId);
  await flush();
  if (o.reportFirst === false) report(b, taskId, o.state ?? "progress"), await flush();
  turnEnd(b, taskId);
  await flush();
}

test("the words: a rhythm or 一直 in the brief repeats; 直到 is an end condition; 别跑了 is a stop", () => {
  expect(repeatsIn(BRIEF)).toBe(true);
  expect(repeatsIn("每天早上 9 点看一下机票价格")).toBe(true);
  expect(repeatsIn("keep an eye on the fare every morning")).toBe(true);
  expect(repeatsIn("Fix the flaky test in auth.")).toBe(false);
  expect(untilIn("每 30 分钟看一次 CI，直到 #10473 合并为止")).toBe("#10473 合并");
  expect(untilIn("check the deploy every 10 minutes until it is green.")).toBe("it is green");
  expect(untilIn(BRIEF)).toBeUndefined();
  expect(saysStop("别跑了")).toBe(true);
  expect(saysStop("这个循环先停掉吧")).toBe(true);
  expect(saysStop("stop the loop")).toBe(true);
  expect(saysStop("到时间了：「约 45 分钟后继续检查」。接着做。")).toBe(false);
});

test("hel's round 185: a round's done with its next timer armed after it never ends the loop", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  await flush();
  expect(loop(b)).toMatchObject({ state: "on", by: "brief", everyMs: 45 * MIN });
  b.clock.advance(45 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
  // 06:01:13 report done, 06:01:17 wait_for 45, 06:01:21 the turn ends (warm).
  await round(b, "swj3zc4w", { state: "done" });
  expect(b.core.tasks.get("swj3zc4w")!.attention).toBe("blocked");
  expect(armed(b, "swj3zc4w")).toHaveLength(1);
  b.clock.advance(SETTLE_MS + 46 * MIN);
  await flush();
  expect(b.woke).toHaveLength(2); // round 186 came, on time
  expect(b.core.log.read({ kinds: ["waiter"], limit: 100 }).some((e) => (e.body as Bodies["waiter"]).state === "cancelled" && !(e.body as Bodies["waiter"]).replacedBy)).toBe(false);
});

test("the very first round reporting done before its first timer: the arm brings it back to its rounds", async () => {
  const b = boot();
  open(b);
  report(b, "swj3zc4w", "done");
  await flush();
  expect(b.core.tasks.get("swj3zc4w")!.attention).toMatch(/^done/);
  await waitFor(b, "swj3zc4w");
  await flush();
  turnEnd(b, "swj3zc4w");
  await flush();
  expect(b.core.tasks.get("swj3zc4w")!.attention).toBe("blocked");
  expect(armed(b, "swj3zc4w")).toHaveLength(1);
  b.clock.advance(46 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
});

test("a round that forgets to re-arm: Ducter arms the next one at its rhythm, from its last wake", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  await round(b, "swj3zc4w", { rearm: false });
  b.clock.advance(SETTLE_MS);
  await flush();
  const w = armed(b, "swj3zc4w");
  expect(w).toHaveLength(1);
  expect(w[0]!.at).toBe(new Date(START + 90 * MIN).toISOString());
  b.clock.advance(45 * MIN);
  await flush();
  expect(b.woke).toHaveLength(2);
});

test("failed rounds keep the loop; the third in a row is said once, and Go runs a round now", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  for (let i = 0; i < 3; i++) {
    b.clock.advance(45 * MIN);
    await flush();
    await round(b, "swj3zc4w", { state: "failed" });
    expect(b.core.tasks.get("swj3zc4w")!.attention).toBe("blocked");
  }
  b.clock.advance(SWEEP_MS + SETTLE_MS);
  await flush();
  expect(og(b)?.health).toMatchObject({ state: "failing", fails: 3, fix: "run_now" });
  expect(cards(b)).toHaveLength(1);
  expect(cards(b)[0]!.question).toContain("最近 3 轮都没做成");
  b.clock.advance(5 * SWEEP_MS);
  await flush();
  expect(cards(b)).toHaveLength(1); // once
  const before = b.woke.length;
  b.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: cards(b)[0]!.decisionId, option: "go", by: "user" } });
  await flush();
  b.clock.advance(2000);
  await flush();
  expect(b.woke.length).toBe(before + 1);
});

test("a crashed harness (the card goes failed): its waits end with it, and the next round comes back", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  b.core.tasks.setState("swj3zc4w", "failed", "warm", "codex exited 1");
  await flush();
  expect(b.core.tasks.get("swj3zc4w")!.attention).toBe("blocked");
  expect(armed(b, "swj3zc4w")).toHaveLength(1);
  expect(loop(b)?.back).toMatchObject({ from: "failed" });
});

test("a restart mid-round, and one far past its time: one catch-up round, never a burst", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  b.core.tasks.setState("swj3zc4w", "working", "hot");
  await flush();
  await b.core.stop();
  // Down for five hours (an upgrade that took long): the round in flight never re-armed.
  const clock = new FakeClock(START + 45 * MIN + 5 * 60 * MIN);
  const b2 = boot({ dir: b.dir, clock });
  b2.core.tasks.setState("swj3zc4w", "blocked", "parked");
  await flush();
  clock.advance(SETTLE_MS + 1000);
  await flush();
  expect(armed(b2, "swj3zc4w")).toHaveLength(1);
  clock.advance(2 * MIN);
  await flush();
  expect(b2.woke).toHaveLength(1);
  clock.advance(10 * MIN);
  await flush();
  expect(b2.woke).toHaveLength(1);
});

test("upgrading onto a loop a round's done already stopped (hel at 14:01): brought back, said once", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  // Before D426: 184 rounds the old way, then round 185's done; no task_loop record.
  {
    const clock = new FakeClock(START);
    const core = { log: openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock }) }; // a Log written before D426: no keeper
    core.log.append({ stream: "task:swj3zc4w", origin: "partner", kind: "task_open", body: { taskId: "swj3zc4w", title: "review nowledge-co", project: "", place: { kind: "none" }, harness: "codex", brief: BRIEF } });
    for (let i = 0; i < 3; i++) {
      core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w${i}`, reason: "约 45 分钟后继续检查", state: "armed", taskId: "swj3zc4w", wakes: "task", at: new Date(START + i * 45 * MIN).toISOString() } });
      core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w${i}`, reason: "约 45 分钟后继续检查", state: "fired", taskId: "swj3zc4w", wakes: "task", at: new Date(START + i * 45 * MIN).toISOString() } });
    }
    core.log.append({ stream: "task:swj3zc4w", origin: "system", kind: "task_state", body: { taskId: "swj3zc4w", attention: "done", residency: "hot" } });
    core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w9", reason: "约 45 分钟后继续检查", state: "cancelled", taskId: "swj3zc4w", wakes: "task", at: new Date(START + 4 * 45 * MIN).toISOString() } });
    core.log.close();
  }
  const clock = new FakeClock(START + 4 * 60 * MIN);
  const b = boot({ dir: t.dir, clock });
  clock.advance(SETTLE_MS + 1000);
  await flush();
  expect(loop(b)).toMatchObject({ state: "on", by: "rounds" });
  expect(loop(b)?.back).toMatchObject({ from: "restart" });
  expect(b.core.tasks.get("swj3zc4w")!.attention).toBe("blocked");
  expect(armed(b, "swj3zc4w")).toHaveLength(1);
  const said = b.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 20 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said.filter((s) => s.includes("被误停了"))).toHaveLength(1);
  expect(og(b)?.health?.state).toBe("back");
  // Another restart: said nothing again.
  await b.core.stop();
  const b2 = boot({ dir: t.dir, clock });
  clock.advance(SETTLE_MS + 1000);
  await flush();
  const said2 = b2.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 20 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  expect(said2.filter((s) => s.includes("被误停了"))).toHaveLength(1);
});

test("a computer asleep: the round is tried again, and once late past its grace it is said once with Run now", async () => {
  let asleep = false;
  const b = boot({ sendFails: () => (asleep ? "MacBook is asleep" : undefined) });
  open(b);
  await waitFor(b, "swj3zc4w");
  asleep = true;
  b.clock.advance(45 * MIN);
  await flush();
  expect(armed(b, "swj3zc4w")).toHaveLength(1); // the retry
  b.clock.advance(25 * MIN);
  await flush();
  expect(og(b)?.health).toMatchObject({ state: "late", why: "asleep", fix: "run_now" });
  expect(cards(b)).toHaveLength(1);
  expect(cards(b)[0]!.question).toContain("晚了");
  asleep = false;
  b.clock.advance(10 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1); // one catch-up once it can
  expect(og(b)?.health).toBeUndefined();
});

test("a quota wait: late with when it resets, and no card (the limit's own line says it)", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  b.core.work.waiters.arm({ reason: "等 Codex 额度恢复", taskId: "swj3zc4w", at: new Date(b.clock.now() + 3 * 60 * MIN).toISOString(), wakes: "task", limit: { harness: "codex" } as never });
  await flush();
  turnEnd(b, "swj3zc4w");
  b.clock.advance(SETTLE_MS + SWEEP_MS);
  await flush();
  expect(og(b)?.health).toMatchObject({ state: "late", why: "quota" });
  expect(cards(b)).toHaveLength(0);
});

test("the person's rhythm: 改成每小时 moves the waiting round, and the task's own 45 follows it", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  turnEnd(b, "swj3zc4w");
  await flush();
  const r = await b.core.mcp.call({ role: "partner" } as never, "routine_change", { id: "swj3zc4w", action: "every", minutes: 60 });
  expect(r).toMatchObject({ ok: true });
  expect(armed(b, "swj3zc4w").map((w) => w.at)).toEqual([new Date(START + 60 * MIN).toISOString()]);
  b.clock.advance(60 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
  const w = await waitFor(b, "swj3zc4w", 45);
  expect(w.at).toBe(new Date(START + 120 * MIN).toISOString());
  expect(og(b)?.everyMs).toBe(60 * MIN);
});

test("only the person ends it: End on its card, or 别跑了 said to the task, then its done is the end", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  turnEnd(b, "swj3zc4w");
  await flush();
  expect((await b.core.ongoing.act("task", "swj3zc4w", { action: "end" })).ok).toBe(true);
  b.clock.advance(SETTLE_MS + 2 * SWEEP_MS + 60 * MIN);
  await flush();
  expect(loop(b)).toMatchObject({ state: "ended", endedBy: "user" });
  expect(armed(b, "swj3zc4w")).toHaveLength(0);
  expect(b.woke).toHaveLength(0);

  open(b, "t2");
  await waitFor(b, "t2");
  b.clock.advance(45 * MIN);
  await flush();
  b.core.log.append({ stream: "task:t2", origin: "user", kind: "task_event", body: { taskId: "t2", role: "user", from: "user", text: "别跑了，这个循环停掉" } });
  report(b, "t2", "done", "好，停了。");
  await flush();
  turnEnd(b, "t2");
  b.clock.advance(SETTLE_MS + SWEEP_MS);
  await flush();
  expect(loop(b, "t2")).toMatchObject({ state: "ended", endedBy: "user" });
  expect(b.core.tasks.get("t2")!.attention).toMatch(/^done/);
  expect(armed(b, "t2")).toHaveLength(0);
});

test("an end condition the person gave: the round that says it holds ends it", async () => {
  const b = boot();
  open(b, "ci", "每 30 分钟看一下 #10473 的 CI，直到它合并为止。", "盯 #10473");
  await waitFor(b, "ci", 30);
  b.clock.advance(30 * MIN);
  await flush();
  report(b, "ci", "done", "#10473 合并了。");
  await flush();
  expect(loop(b, "ci")).toMatchObject({ state: "ended", endedBy: "condition" });
  expect(b.core.tasks.get("ci")!.attention).toMatch(/^done/);
});

test("routine_list: a task in rounds with its rhythm, next, last line and where; pause and resume", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  await round(b, "swj3zc4w", { state: "progress" });
  const l = (await b.core.mcp.call({ role: "partner" } as never, "routine_list", {})) as { id: string; kind: string; rhythm?: string; health: unknown; last?: { line?: string }; where?: { harness?: string } }[];
  expect(l[0]).toMatchObject({ id: "swj3zc4w", kind: "task in rounds", rhythm: "every 45 min", health: "on time", last: { line: "队列现有 9 个 PR。" }, where: { harness: "codex" } });
  expect((await b.core.mcp.call({ role: "partner" } as never, "routine_change", { id: "swj3zc4w", action: "pause" })) as { ok: boolean }).toMatchObject({ ok: true });
  b.clock.advance(3 * 60 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
  expect(og(b)?.state).toBe("paused");
  await b.core.mcp.call({ role: "partner" } as never, "routine_change", { id: "swj3zc4w", action: "resume" });
  b.clock.advance(SETTLE_MS + 2 * MIN);
  await flush();
  expect(b.woke).toHaveLength(2); // the paused round, once
});
