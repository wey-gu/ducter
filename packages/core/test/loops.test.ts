// D427: a task in rounds is a promise Ducter keeps (research/177). On a fake clock with a stub
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

function boot(o: { dir?: string; clock?: FakeClock; sendFails?: () => string | undefined; core?: Partial<Parameters<typeof startCore>[0]> } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const clock = o.clock ?? new FakeClock(START);
  const core: Core = startCore({ dataDir: t.dir, port: 0, push: false, clock, defaultDelayMs: 60_000, ...o.core });
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
  // D498: its On hand card carries its rhythm and its last round (On hand says 一直在跑的, never
  // "at work for 182 hours"); a round at work says when this turn began.
  const card = () => b.core.tasks.onHand().tasks.find((c) => c.taskId === "swj3zc4w")!;
  expect(card().rounds).toMatchObject({ everyMs: 45 * MIN, last: { state: "done" } });
  b.core.tasks.setState("swj3zc4w", "working", "hot");
  const turnAt = card().turnAt!;
  // round 186's wake set it working; setting it working again is the same turn
  expect(Date.parse(turnAt)).toBeLessThan(Date.parse(b.core.log.read({ stream: "task:swj3zc4w", kinds: ["task_state"], limit: 1 })[0]!.ts));
  b.core.tasks.setState("swj3zc4w", "blocked", "parked");
  expect(card().turnAt).toBeUndefined();
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
  // Before D427: 184 rounds the old way, then round 185's done; no task_loop record.
  {
    const clock = new FakeClock(START);
    const core = { log: openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock }) }; // a Log written before D427: no keeper
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
  // D481: its card closes by itself once its moment passed, on every window (openAsks).
  b.clock.advance(SWEEP_MS);
  await flush();
  const id = cards(b)[0]!.decisionId;
  expect(b.core.decisions.resolution(id)).toMatchObject({ by: "ended", settled: true });
  expect(b.core.tasks.onHand().openAsks?.ids).not.toContain(id);
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
  const r = await b.core.mcp.call({ role: "partner" } as never, "keep_change", { id: "swj3zc4w", action: "every", minutes: 60 });
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

test("keep_list: a task in rounds with its rhythm, next, last line and where; pause and resume", async () => {
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  await round(b, "swj3zc4w", { state: "progress" });
  const l = (await b.core.mcp.call({ role: "partner" } as never, "keep_list", {})) as { from: string; kind: string; say: string; health: unknown; lastRound?: string }[];
  // D429: its ready line in the person's language: the rhythm, the next round, on time.
  expect(l[0]).toMatchObject({ from: "swj3zc4w", kind: "task in rounds", health: "on time", lastRound: "队列现有 9 个 PR。" });
  expect(l[0]!.say).toMatch(/^「review nowledge-co」在跑，每 45 分钟一轮，下一轮 \d\d:\d\d，按时。$/);
  expect((await b.core.mcp.call({ role: "partner" } as never, "keep_change", { id: "swj3zc4w", action: "pause" })) as { ok: boolean }).toMatchObject({ ok: true });
  b.clock.advance(3 * 60 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
  expect(og(b)?.state).toBe("paused");
  await b.core.mcp.call({ role: "partner" } as never, "keep_change", { id: "swj3zc4w", action: "resume" });
  b.clock.advance(SETTLE_MS + 2 * MIN);
  await flush();
  expect(b.woke).toHaveLength(2); // the paused round, once
});

// ---------- D429: the wake says a round ends with progress; the late line names the computer and offers an awake one ----------

test("D429: a round's wake says it ends with progress, never done (or done only once the person's until holds); the transcript still reads it as a wake", async () => {
  const { wakeOf } = await import("@ducter/protocol/src/transcript.ts");
  const b = boot();
  open(b);
  await waitFor(b, "swj3zc4w");
  b.clock.advance(45 * MIN);
  await flush();
  const text = b.woke[0]!.text;
  expect(text).toStartWith("到时间了：「约 45 分钟后继续检查 nowledge-co 的审查请求与提及」。接着做。\n\n这是循环里的一轮");
  expect(text).toContain("report_to_main 报 progress，不要报 done");
  expect(wakeOf(text)).toMatchObject({ reason: "约 45 分钟后继续检查 nowledge-co 的审查请求与提及", timer: true });
  // With the person's end condition: done only once it holds.
  open(b, "ci_w", "每 30 分钟看一次 CI，直到 #10473 合并为止", "CI");
  await waitFor(b, "ci_w", 30);
  b.clock.advance(30 * MIN);
  await flush();
  expect(b.woke.find((w) => w.taskId === "ci_w")!.text).toContain("只有「#10473 合并」已经成立时才报 done");
  // A one-off wait (no rounds) hears the wake alone.
  open(b, "once", "PR 合并了告诉我", "once");
  await waitFor(b, "once", 10);
  b.clock.advance(10 * MIN);
  await flush();
  expect(b.woke.find((w) => w.taskId === "once")!.text).toBe("到时间了：「约 45 分钟后继续检查 nowledge-co 的审查请求与提及」。接着做。");
});

test("D429: asleep on a worker: the late line names it, offers the awake home, and the tap moves it and runs a round there", async () => {
  let asleep = false;
  const moved: { taskId: string; device: string }[] = [];
  const b = boot({
    sendFails: () => (asleep ? "Ada's MacBook Pro is asleep" : undefined),
    core: {
      newTaskComputers: { nameOf: (d: string) => (d === "mbp" ? "Ada's MacBook Pro" : undefined), homeName: () => "Mac mini", folderInfo: async () => "offline" as const },
      work: { loopsMove: async (taskId: string, device: string) => (moved.push({ taskId, device }), { ok: true }) },
    },
  });
  b.core.log.append({ stream: "task:fare", origin: "partner", kind: "task_open", body: { taskId: "fare", title: "盯北京往返机票", project: "", place: { kind: "none", device: "mbp" }, harness: "claude-code", brief: "每天早上看一下上海到北京往返的机票价格" } });
  b.core.tasks.setState("fare", "working", "hot");
  await waitFor(b, "fare", 60);
  asleep = true;
  b.clock.advance(60 * MIN);
  await flush();
  b.clock.advance(35 * MIN);
  await flush();
  const h = og(b, "fare")?.health;
  expect(h).toMatchObject({ state: "late", why: "asleep", detail: "Ada's MacBook Pro", fix: "move", moveTo: { device: "local", name: "Mac mini" } });
  const card = cards(b).find((d) => d.loop?.taskId === "fare")!;
  expect(card.question).toContain("Ada's MacBook Pro 睡着了或连不上。Mac mini 醒着");
  expect(card.goLabel).toBe("换到醒着的电脑上跑");
  expect(card.loop).toMatchObject({ taskId: "fare", move: "local" });
  // The keep_list line says it too.
  const l = (await b.core.mcp.call({ role: "partner" } as never, "keep_list", {})) as { from: string; say: string; fix?: string }[];
  expect(l.find((x) => x.from === "fare")).toMatchObject({ fix: "move" });
  expect(l.find((x) => x.from === "fare")!.say).toContain("Ada's MacBook Pro 睡着了，醒了马上补一轮；Mac mini 醒着，可以换到它上面跑");
  // The person's tap: moved there, and a round runs now (on the home, awake).
  asleep = false;
  const before = b.woke.length;
  b.core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card.decisionId, option: "go", by: "user" } });
  await flush();
  expect(moved).toEqual([{ taskId: "fare", device: "local" }]);
  b.clock.advance(2000);
  await flush();
  expect(b.woke.length).toBe(before + 1);
  expect(og(b, "fare")?.health).toBeUndefined();
});

test("D429: 换到醒着的电脑上跑 is an ongoing action too; a home task asleep with no other computer keeps Run now", async () => {
  let asleep = false;
  const moved: string[] = [];
  const b = boot({ sendFails: () => (asleep ? "MacBook is asleep" : undefined), core: { work: { loopsMove: async (_t: string, d: string) => (moved.push(d), { ok: true }) } } });
  open(b);
  await waitFor(b, "swj3zc4w");
  asleep = true;
  b.clock.advance(70 * MIN);
  await flush();
  const h = og(b)?.health;
  expect(h).toMatchObject({ state: "late", why: "asleep", fix: "run_now" });
  expect(h?.detail).toBeTruthy(); // the home's own name
  expect(h?.moveTo).toBeUndefined();
  expect(await b.core.ongoing.act("task", "swj3zc4w", { action: "move", device: "w1" })).toMatchObject({ ok: true });
  expect(moved).toEqual(["w1"]);
});

test("D429: routine_list's ready lines, zh and en", async () => {
  const { sayOngoing } = await import("../src/ongoing.ts");
  const now = Date.parse("2026-11-20T06:00:00Z");
  const base: OngoingItem = { kind: "task", id: "r", title: "Review requests on nowledge-co", state: "resting", loop: true, everyMs: 45 * MIN, nextAt: "2026-11-20T06:44:00Z", runs: [], startedAt: "2026-11-20T00:00:00Z" };
  expect(sayOngoing(base, "en", now, "UTC")).toBe("“Review requests on nowledge-co” is running, a round every 45 minutes; the next is at 06:44, on time.");
  expect(sayOngoing({ ...base, title: "看评审请求" }, "zh", now, "UTC")).toBe("「看评审请求」在跑，每 45 分钟一轮，下一轮 06:44，按时。");
  expect(sayOngoing({ ...base, everyMs: 60 * MIN, nextAt: "2026-11-21T01:00:00Z" }, "en", now, "UTC")).toBe("“Review requests on nowledge-co” is running, a round every hour; the next is tomorrow at 01:00, on time.");
  expect(sayOngoing({ ...base, health: { state: "failing", why: "failed", fails: 3, detail: "gh can't read the repo." } }, "en", now, "UTC")).toBe("“Review requests on nowledge-co” (a round every 45 minutes) hasn't worked for its last 3 rounds: gh can't read the repo.");
  expect(sayOngoing({ ...base, title: "盯机票", health: { state: "late", why: "asleep", lateMin: 75, detail: "Ada's MacBook Pro" } }, "zh", now, "UTC")).toBe("「盯机票」每 45 分钟一轮，这一轮晚了 1 小时 15 分钟：Ada's MacBook Pro 睡着了，醒了马上补一轮。");
  expect(sayOngoing({ ...base, health: { state: "late", why: "quota", resetsAt: "2026-11-20T07:35:00Z" } }, "en", now, "UTC")).toBe("“Review requests on nowledge-co” (a round every 45 minutes) is out of allowance and carries on at 07:35.");
  expect(sayOngoing({ ...base, state: "paused" }, "zh", now, "UTC")).toBe("「Review requests on nowledge-co」暂停了。");
  expect(sayOngoing({ kind: "routine", id: "w", title: "整理上周的周报", state: "resting", cadence: "每周一 10:00（跟着你的时区）", nextAt: "2026-11-23T02:00:00Z", runs: [], startedAt: "2026-11-01T00:00:00Z" }, "zh", now, "Asia/Shanghai")).toBe("「整理上周的周报」在跑，每周一 10:00，下次 周一 10:00，按时。");
});

// D481: hel, 2026-11-23: a healthy loop waiting on Prow CI was asked about as "比平时久太多，可能卡住了"
// from the time alone. Now a long round is never a card or a health of its own: the partner gets its facts.
test("D481: a round that runs long is handed to the partner with its facts (a mend of class round), never a card", async () => {
  const b = boot();
  const woke: string[] = [];
  b.core.setPartner({ onTrigger: (e) => void woke.push(e.kind) });
  open(b);
  await waitFor(b, "swj3zc4w");
  await flush();
  b.clock.advance(45 * MIN);
  await flush();
  expect(b.woke).toHaveLength(1);
  // The round goes on for hours, working and waiting on CI, with steps all along.
  for (let i = 0; i < 8; i++) {
    b.core.tasks.setState("swj3zc4w", "working", "hot", "PR #10932 最新提交的三项 Prow CI 检查还在跑");
    b.core.log.append({ stream: "task:swj3zc4w", origin: "task", kind: "task_event", body: { taskId: "swj3zc4w", role: "assistant", text: `CI 第 ${i + 1} 次查看：还在跑` } });
    b.clock.advance(30 * MIN);
    await flush();
  }
  expect(cards(b)).toHaveLength(0); // never "可能卡住了" from the time alone
  expect(og(b)?.health).toBeUndefined(); // nor "这一轮跑得太久了" on its Ongoing card
  const looks = b.core.log.read({ stream: "task:swj3zc4w", kinds: ["mend"], limit: 10 }).map((e) => e.body as Bodies["mend"]);
  expect(looks).toHaveLength(1); // once a round
  expect(looks[0]).toMatchObject({ cls: "round", rung: "rethink", round: { everyMs: 45 * MIN } });
  expect(looks[0]!.round!.steps.some((s) => s.text.includes("Prow CI"))).toBe(true);
  expect(looks[0]!.round!.steps.some((s) => s.text.startsWith("said: CI"))).toBe(true);
  expect(woke).toContain("mend"); // the partner looks
  expect(b.core.tasks.onHand().tasks.find((c) => c.taskId === "swj3zc4w")?.mending).toBeUndefined();
});

// D483: hel, 2026-11-22 19:30. A task in rounds whose round is a look (check-runs at its head),
// armed with an until; the look ran out at 19:30:00, and 20 s later the keeper armed the same look
// again with no until, which idled 5.5 h. Now the task is told what its looks saw and decides; the
// keeper never arms that look again by itself; a round at its rhythm wakes the task.
test("D483: a look that ran out goes to the task with its facts; the keeper never re-arms it blindly", async () => {
  const pending = JSON.stringify({ total_count: 3, check_runs: [{ name: "ci/mem-bazel", status: "in_progress" }] });
  const b = boot({ core: { work: { exec: async () => ({ exitCode: 0, stdout: pending }), minEveryMs: 1000, restartLookMs: 10 } } });
  const id = "pr10932";
  open(b, id, "在 hel 上审改 mem 长文案并开 PR，CI 过了再告诉我");
  const look = { argv: ["gh", "api", "repos/o/r/commits/e2b8b625ff/check-runs"], succeedWhen: { path: "check_runs[].status", equals: "completed" } };
  const call = (until?: string) => b.core.mcp.call({ role: "task", taskId: id } as never, "wait_for", { reason: "PR #10932 最新提交的三项 CI 检查全部完成", check: look, everyMinutes: 3, ...(until ? { untilISO: until } : {}) }) as Promise<{ ok: boolean }>;
  // Rounds: it rests on its look, is woken once, and arms it again (a loop from its rounds).
  expect((await call()).ok).toBe(true);
  turnEnd(b, id);
  await flush();
  const first = armed(b, id)[0]!;
  b.core.work.waiters.cancel(first.waiterId, { by: "system" });
  b.core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { ...first, state: "fired" } });
  await flush();
  b.core.tasks.setState(id, "working", "hot");
  expect((await call(new Date(b.clock.now() + 50 * MIN).toISOString())).ok).toBe(true);
  turnEnd(b, id);
  await flush();
  expect(loop(b, id)?.look?.check?.argv).toEqual(look.argv);
  const before = b.woke.length;
  for (let i = 0; i < 50; i++) {
    b.clock.advance(MIN);
    await flush();
  }
  const told = b.woke.slice(before).at(-1);
  expect(told?.text).toStartWith("没等到：「PR #10932 最新提交的三项 CI 检查全部完成」到 ");
  expect(told?.text).toContain("0 of 1 match (1 in_progress)");
  expect(b.core.tasks.get(id)!.attention).not.toBe("needs_you");
  // Its turn ends without arming anything: the keeper brings a round at its rhythm, never the look.
  turnEnd(b, id);
  b.clock.advance(SETTLE_MS + 1000);
  await flush();
  const next = armed(b, id);
  expect(next.length).toBe(1);
  expect(next[0]!.check).toBeUndefined();
  expect(next[0]!.at).toBeDefined();
  // The task arms a new look of its own: its choice, and it carries an until.
  b.core.tasks.setState(id, "working", "hot");
  expect((await call()).ok).toBe(true);
  expect(armed(b, id).find((w) => w.check)?.until).toBeDefined();
});

// ---------- D524: a round's times are the person's, never the server's UTC ----------

test("D524: wait_for gives the next round in the person's time and a round's wake says their clock, on a home whose clock is UTC", async () => {
  const b = boot({ core: { proactive: { zone: "Asia/Shanghai" } } });
  open(b);
  const a = (await waitFor(b, "swj3zc4w")) as { ok: boolean; at?: string; atLocal?: string; note?: string };
  const local = (ms: number) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai" }).format(new Date(ms));
  expect(a.atLocal).toBe(`${local(Date.parse(a.at!))} (Asia/Shanghai)`);
  expect(a.note).toContain("say atLocal (their time)");
  b.clock.advance(45 * MIN);
  await flush();
  expect(b.woke[0]!.text).toContain(`对方那里现在是 ${local(b.clock.now())}。`);
});
