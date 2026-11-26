// Work over time (D112–D114) on a fake clock with fake commands, a fake judge and a fake runner:
// checks, condition waiters, events, deadlines, restarts, `until` loops and routines.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, RoutineTrigger, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { describeCheck, evaluate, validateCheck } from "@ducter/protocol/src/checks.ts";
import { runCheck, type Exec } from "@ducter/protocol/src/checks-run.ts";
import { FakeClock } from "../src/clock.ts";
import { triggersPartner } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { describeTrigger, nextFirings } from "../src/schedule.ts";
import { createWork, cwdOfCheck } from "../src/work.ts";
import { OO_NOT_WATCHABLE } from "../src/connections.ts";
import { parseVerdict } from "../src/judge.ts";
import type { Judge } from "../src/waiters.ts";
import { openTask, report, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());
const flush = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

const PR_CHECKS = ["gh", "pr", "checks", "1592", "--repo", "nowledge-co/hawdb", "--json", "state"];
const prCheck = { argv: PR_CHECKS, succeedWhen: { path: "[].state", equals: "SUCCESS" } };
const checksJson = (states: string[]) => JSON.stringify(states.map((state, i) => ({ name: `job${i}`, state })));

function setup(o: { exec?: Exec; judge?: Judge; readEvent?: boolean; start?: number; dir?: string } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  if (!o.dir) cleanup = t.cleanup;
  const clock = new FakeClock(o.start);
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const mcp = createMcpHub({ secret: "s" });
  const sent: { taskId: string; text: string }[] = [];
  const opened: string[] = [];
  let n = 0;
  const runner = {
    async openTask(input: { title: string; brief: string }) {
      const taskId = `run${++n}`;
      openTask(log, taskId, input.title);
      tasks.setState(taskId, "working", "hot");
      opened.push(input.brief);
      return tasks.get(taskId) as TaskCard;
    },
    async send(taskId: string, text: string) {
      sent.push({ taskId, text });
      return { delivered: "prompted" as const };
    },
    async interrupt() {},
  } as unknown as Runner;
  const events: { items: { id: string; text: string }[]; checkpoint: unknown }[] = [];
  const connections = o.readEvent
    ? ({
        readTrigger: async (_k: string, _s: string, _t: string, _c: unknown, cp: unknown) => events.shift() ?? { ok: true, items: [], checkpoint: cp },
        watchable: (k: string) => (k === "oo" ? { ok: false, error: OO_NOT_WATCHABLE } : { ok: true }),
      } as never)
    : undefined;
  const work = createWork({ log, tasks, mcp, runner: () => runner, clock, persona: "default", exec: o.exec, minEveryMs: 1000, judgeMinMs: 60_000, restartLookMs: 10, defaultZone: "Asia/Shanghai", connections });
  if (o.judge) work.setJudge(o.judge);
  tasks.setDecorator((x) => work.decorate(x));
  cleanup = (() => {
    const c = cleanup;
    return () => {
      work.stop();
      log.close();
      c();
    };
  })();
  return { dir: t.dir, clock, log, tasks, work, mcp, sent, opened, events: (e: (typeof events)[number]) => events.push({ ...e, ok: true } as never) };
}

const kinds = (log: ReturnType<typeof openLog>, k: "waiter" | "waiter_look" | "until" | "until_try" | "routine" | "routine_run") => log.read({ kinds: [k], limit: 1000 }).map((e) => e.body);

/** D308: the turn's end, after its report (the order on Claude Code); a run closes on it. */
const turnEnd = (log: ReturnType<typeof openLog>, taskId: string, usage?: { inputTokens: number; outputTokens: number }) =>
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "system", ...(usage ? { usage } : {}), raw: { turnEnd: true } } });
// ---------- checks ----------

test("checks: only reading commands, as argv, never key files", () => {
  expect(validateCheck(prCheck)).toEqual({ ok: true });
  expect(validateCheck({ argv: ["gh", "pr", "merge", "1592"], succeedWhen: {} }).ok).toBe(false);
  expect(validateCheck({ argv: ["gh", "api", "-X", "POST", "repos/x/y/issues"], succeedWhen: {} }).ok).toBe(false);
  expect(validateCheck({ argv: ["gh", "api", "repos/x/y/pulls/1"], succeedWhen: { path: "merged", equals: true } }).ok).toBe(true);
  expect(validateCheck({ argv: ["curl", "-s", "-d", "x=1", "https://a"], succeedWhen: {} }).ok).toBe(false);
  expect(validateCheck({ argv: ["curl", "-sI", "https://ducter.dev"], succeedWhen: { matches: "200" } }).ok).toBe(true);
  expect(validateCheck({ argv: ["rm", "-rf", "/"], succeedWhen: {} }).ok).toBe(false);
  expect(validateCheck({ argv: ["cat", "/Users/me/.ducter/keys.env"], succeedWhen: {} }).ok).toBe(false);
  expect(validateCheck({ argv: ["test", "-f", "a; rm x"], succeedWhen: {} }).ok).toBe(false);
  expect(validateCheck({ argv: ["nc", "localhost", "5432"], succeedWhen: {} }).ok).toBe(false);
  expect(describeCheck(prCheck)).toBe("gh pr checks 1592 --repo nowledge-co/hawdb --json state");
});

test("checks: the model's cwd stays inside the task's place", () => {
  expect(cwdOfCheck("/w/app", undefined)).toEqual({ cwd: "/w/app" });
  expect(cwdOfCheck("/w/app", "web")).toEqual({ cwd: "/w/app/web" });
  expect(cwdOfCheck("/w/app", "/w/app/web")).toEqual({ cwd: "/w/app/web" });
  expect(cwdOfCheck("/w/app", "..")).toHaveProperty("error");
  expect(cwdOfCheck("/w/app", "/w/app-other")).toHaveProperty("error");
  expect(cwdOfCheck("/w/app", "~/.ducter")).toHaveProperty("error");
  expect(cwdOfCheck(undefined, "/w/x")).toEqual({ cwd: "/w/x" });
});

test("checks: the predicate reads JSON arrays, values, text and exit codes", () => {
  expect(evaluate(prCheck.succeedWhen, 8, checksJson(["SUCCESS", "PENDING", "SUCCESS"]))).toEqual({ met: false, summary: "2 of 3 match (2 SUCCESS, 1 PENDING)" });
  expect(evaluate(prCheck.succeedWhen, 0, checksJson(["SUCCESS", "SUCCESS"])).met).toBe(true);
  expect(evaluate({ path: "state", equals: "MERGED" }, 0, '{"state":"OPEN"}')).toEqual({ met: false, summary: "state: OPEN" });
  expect(evaluate({ exitCode: 0 }, 1, "").met).toBe(false);
  expect(evaluate({ matches: "^HTTP/\\S+ 200" }, 0, "HTTP/2 200\nserver: x").met).toBe(true);
  // D483: an answer that can't be evaluated says so (a fact for whoever waits), and a large one is read whole.
  expect(evaluate({ path: "state", equals: "x" }, 0, "not json")).toMatchObject({ met: false, unreadable: expect.stringContaining("isn't JSON") });
  expect(evaluate({ path: "state", equals: "x" }, 0, '{"state":', true).unreadable).toContain("larger than 16 MB");
});

test("D483: hel's check-runs answer (80 KB once a check failed) is evaluated whole; only what is passed on is cut", async () => {
  const run = (name: string, conclusion: string, text = "") => ({ id: 1, name, status: "completed", conclusion, output: { title: name, summary: "", text } });
  const big = JSON.stringify({ total_count: 3, check_runs: [run("ci/mem-bazel", "success"), run("ci/mem-cloud-browser-postgres", "success"), run("ci/mem-playwright-e2e", "failure", "x".repeat(43_600) + "\n".repeat(36_000))] });
  expect(big.length).toBeGreaterThan(80_000);
  const r = await runCheck({ argv: ["gh", "api", "repos/o/r/commits/abc/check-runs"], succeedWhen: { path: "check_runs[].status", equals: "completed" } }, { exec: async () => ({ exitCode: 0, stdout: big }) });
  expect(r).toMatchObject({ ok: true, met: true, summary: "3 of 3 match (3 completed)" });
  expect(r.unreadable).toBeUndefined();
  expect(r.output!.length).toBe(4096);
});

test("checks: a refused command never runs", async () => {
  let ran = false;
  const r = await runCheck({ argv: ["rm", "x"], succeedWhen: {} }, { exec: async () => ((ran = true), { exitCode: 0, stdout: "" }) });
  expect(r.ok).toBe(false);
  expect(ran).toBe(false);
});

// ---------- condition waiters ----------

test("a check waiter looks on its schedule with no model, logs only changes, and fires once it holds", async () => {
  const out = [checksJson(["PENDING", "PENDING"]), checksJson(["PENDING", "PENDING"]), checksJson(["SUCCESS", "PENDING"]), checksJson(["SUCCESS", "SUCCESS"])];
  const calls: string[][] = [];
  const { clock, log, tasks, work } = setup({ exec: async (argv) => (calls.push(argv), { exitCode: 0, stdout: out.shift()! }) });
  work.waiters.arm({ reason: "PR #1592 的 CI 通过", check: prCheck, everyMs: 5 * 60_000 });
  await flush();
  expect(calls.length).toBe(0); // whoever armed it just looked: the first look is one period out
  clock.advance(5 * 60_000);
  await flush();
  expect(calls.length).toBe(1);
  const view = tasks.onHand().waiters[0]!;
  expect(view).toMatchObject({ kind: "check", reason: "PR #1592 的 CI 通过", lastSummary: "0 of 2 match (2 PENDING)", looks: 1 });
  clock.advance(5 * 60_000);
  await flush();
  expect(kinds(log, "waiter_look").length).toBe(1); // the same thing again: not logged
  clock.advance(5 * 60_000);
  await flush();
  expect(kinds(log, "waiter_look").length).toBe(2);
  clock.advance(5 * 60_000);
  await flush();
  const fired = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(fired.body).toMatchObject({ state: "fired", observed: "2 of 2 match (2 SUCCESS)" });
  expect(triggersPartner(fired)).toBe(true);
  expect(calls.length).toBe(4);
  expect(tasks.onHand().waiters).toEqual([]);
});

test("D267: a task's own timer: Waiting until then, wakes the task (not the partner), survives a restart", async () => {
  const s = setup();
  openTask(s.log, "t1");
  s.tasks.setState("t1", "working", "hot");
  const T = { role: "task", taskId: "t1" } as const;
  const bad = (await s.mcp.call(T, "wait_for", { reason: "再看一轮评审" })) as { ok: boolean; error?: string };
  expect(bad.ok).toBe(false);
  expect(bad.error).toContain("afterMinutes");
  const r = (await s.mcp.call(T, "wait_for", { reason: "再看一轮评审", afterMinutes: 45 })) as { ok: boolean; at?: string };
  expect(r.ok).toBe(true);
  await flush();
  expect(s.tasks.get("t1")).toMatchObject({ attention: "blocked", reason: "再看一轮评审" });
  const armed = s.log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(armed.body).toMatchObject({ wakes: "task", taskId: "t1", state: "armed" });
  s.clock.advance(44 * 60_000);
  await flush();
  expect(s.sent).toEqual([]);
  s.clock.advance(60_000);
  await flush();
  const fired = s.log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(fired.body).toMatchObject({ state: "fired", wakes: "task" });
  expect(triggersPartner(fired)).toBe(false);
  expect(s.tasks.get("t1")!.attention).toBe("working");
  expect(s.sent[0]).toMatchObject({ taskId: "t1" });
  expect(s.sent[0]!.text).toContain("到时间了");
  // Only for a task: the partner keeps wait_until for its own timers.
  const p = (await s.mcp.call({ role: "partner" }, "wait_for", { reason: "再看看", afterMinutes: 5 })) as { ok: boolean };
  expect(p.ok).toBe(false);
});

test("D394: a task has one timer of its own: re-arming replaces it, so stacked rounds never run (seen live: 05:37, 05:40, 05:52)", async () => {
  const s = setup({ start: Date.parse("2026-11-18T04:52:00Z") });
  openTask(s.log, "t1");
  s.tasks.setState("t1", "working", "hot");
  const T = { role: "task", taskId: "t1" } as const;
  // The live sequence: a round at 04:52 arms 45 min; a nudge's round at 04:55 and a compaction's
  // round at 05:07 each arm again.
  const r1 = (await s.mcp.call(T, "wait_for", { reason: "再看一轮评审", afterMinutes: 45 })) as { ok: boolean; replaced?: string[] };
  expect(r1.replaced).toBeUndefined();
  await flush();
  s.clock.advance(3 * 60_000);
  s.tasks.setState("t1", "working", "hot");
  const r2 = (await s.mcp.call(T, "wait_for", { reason: "再看一轮评审", afterMinutes: 45 })) as { ok: boolean; replaced?: string[] };
  expect(r2.replaced).toEqual(["2026-11-18T05:37:00.000Z"]);
  await flush();
  // Replaced, it doesn't wake the task out of Waiting.
  expect(s.tasks.get("t1")).toMatchObject({ attention: "blocked" });
  s.clock.advance(12 * 60_000);
  await (s.mcp.call(T, "wait_for", { reason: "再看一轮评审", afterMinutes: 45 }) as Promise<unknown>);
  await flush();
  expect(s.tasks.get("t1")).toMatchObject({ attention: "blocked" });
  const armedNow = s.work.waiters.views().filter((v) => v.taskId === "t1");
  expect(armedNow.map((v) => v.at)).toEqual(["2026-11-18T05:52:00.000Z"]);
  const cancelled = kinds(s.log, "waiter").filter((b) => (b as Bodies["waiter"]).state === "cancelled") as Bodies["waiter"][];
  expect(cancelled).toHaveLength(2);
  expect(cancelled.every((b) => b.replacedBy)).toBe(true);
  // 05:37 and 05:40 pass: nothing wakes it. 05:52: one wake.
  s.clock.advance(44 * 60_000);
  await flush();
  expect(s.sent).toEqual([]);
  s.clock.advance(2 * 60_000);
  await flush();
  expect(s.sent).toHaveLength(1);
  expect(s.sent[0]!.text).toContain("到时间了");
  s.clock.advance(60 * 60_000);
  await flush();
  expect(s.sent).toHaveLength(1);
});

test("D394: a restart rebuilds one timer, never the replaced ones", async () => {
  const s = setup({ start: Date.parse("2026-11-18T04:52:00Z") });
  openTask(s.log, "t1");
  s.tasks.setState("t1", "working", "hot");
  const T = { role: "task", taskId: "t1" } as const;
  await s.mcp.call(T, "wait_for", { reason: "再看一轮评审", afterMinutes: 45 });
  s.clock.advance(3 * 60_000);
  await s.mcp.call(T, "wait_for", { reason: "再看一轮评审", afterMinutes: 45 });
  await flush();
  s.work.stop();
  const s2 = setup({ dir: s.dir, start: s.clock.now() });
  await flush();
  expect(s2.work.waiters.views().filter((v) => v.taskId === "t1").map((v) => v.at)).toEqual(["2026-11-18T05:40:00.000Z"]);
  s2.clock.advance(60 * 60_000);
  await flush();
  expect(s2.sent).toHaveLength(1);
});

test("a task's own check: it rests on Waiting, wakes the task (not the partner) when it holds", async () => {
  let ok = false;
  const { clock, log, tasks, work, sent } = setup({ exec: async () => ({ exitCode: 0, stdout: checksJson([ok ? "SUCCESS" : "PENDING"]) }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.waiters.arm({ reason: "CI 通过", taskId: "t1", check: prCheck, everyMs: 60_000 });
  await flush();
  expect(tasks.get("t1")).toMatchObject({ attention: "blocked", reason: "CI 通过" });
  ok = true;
  clock.advance(60_000);
  await flush();
  const fired = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(fired.body).toMatchObject({ state: "fired" });
  expect(triggersPartner(fired)).toBe(false);
  expect(tasks.get("t1")!.attention).toBe("working");
  expect(sent[0]).toMatchObject({ taskId: "t1" });
  expect(sent[0]!.text).toContain("等到了");
});

test("D271: a wake leaves out what the check saw when it is only a number (a clock's epoch)", async () => {
  const { clock, log, tasks, work, sent } = setup({ exec: async () => ({ exitCode: 0, stdout: "1794807944\n" }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.waiters.arm({ reason: "约45分钟后继续检查", taskId: "t1", check: { argv: ["date", "+%s"], succeedWhen: { matches: "^\\d+$" } }, everyMs: 60_000 });
  await flush();
  clock.advance(60_000);
  await flush();
  expect(log.read({ kinds: ["waiter"] }).at(-1)!.body).toMatchObject({ state: "fired" });
  expect(sent[0]!.text).toBe("等到了：「约45分钟后继续检查」。接着做。");
});

test("D483: a wait that runs out goes back to whoever waits: a task with what its looks saw (the person isn't asked by code), the partner's to the partner; every wait has an until", async () => {
  const { clock, log, tasks, work, sent } = setup({ exec: async () => ({ exitCode: 0, stdout: checksJson(["PENDING"]) }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.waiters.arm({ reason: "CI 通过", taskId: "t1", check: prCheck, everyMs: 60_000, until: new Date(clock.now() + 3 * 60_000).toISOString() });
  await flush();
  for (let i = 0; i < 3; i++) {
    clock.advance(60_000);
    await flush();
  }
  const last = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(last.body).toMatchObject({ state: "expired" });
  expect(triggersPartner(last)).toBe(false); // the task decides; the partner hears its report
  expect(tasks.get("t1")!.attention).not.toBe("needs_you");
  expect(sent.at(-1)!.taskId).toBe("t1");
  expect(sent.at(-1)!.text).toStartWith("没等到：「CI 通过」到 ");
  expect(sent.at(-1)!.text).toContain("gh pr checks 1592");
  expect(sent.at(-1)!.text).toContain("0 of 1 match (1 PENDING)");
  expect(sent.at(-1)!.text).toContain("wait_for");
  // A partner's wait that runs out is the partner's to say.
  work.waiters.arm({ reason: "CI 通过", check: prCheck, everyMs: 60_000, until: new Date(clock.now() + 60_000).toISOString() });
  clock.advance(60_000);
  await flush();
  expect(triggersPartner(log.read({ kinds: ["waiter"] }).at(-1)!)).toBe(true);
  // Every wait ends: one with no until of its own lasts a day for a task, a week for the partner.
  expect(Date.parse(work.waiters.arm({ reason: "CI", taskId: "t1", check: prCheck }).until!) - clock.now()).toBe(24 * 3600_000);
  expect(Date.parse(work.waiters.arm({ reason: "CI", check: prCheck }).until!) - clock.now()).toBe(7 * 24 * 3600_000);
});

test("D483: a look whose answer can't be read ends the wait at once: a task is woken with what happened; a partner's wait ends unmet", async () => {
  const { clock, log, tasks, work, sent } = setup({ exec: async () => ({ exitCode: 0, stdout: '{"total_count":3,"check_runs":[{"id":137312403288,"name":"ci/mem-bazel"' }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  const w = work.waiters.arm({ reason: "PR #10932 的三项 CI 检查全部完成", taskId: "t1", check: { argv: ["gh", "api", "repos/o/r/commits/abc/check-runs"], succeedWhen: { path: "check_runs[].status", equals: "completed" } }, everyMs: 60_000 });
  await flush();
  expect(tasks.get("t1")!.attention).toBe("blocked");
  clock.advance(60_000);
  await flush();
  const ended = log.read({ kinds: ["waiter"] }).at(-1)!.body as Bodies["waiter"];
  expect(ended).toMatchObject({ waiterId: w.waiterId, state: "cancelled" });
  expect(ended.cantTell).toContain("isn't JSON");
  expect(work.waiters.views()).toEqual([]); // never looks on in vain
  expect(tasks.get("t1")!.attention).toBe("working");
  expect(sent.at(-1)!.text).toStartWith("没等到：「PR #10932 的三项 CI 检查全部完成」，这次查看判断不了：its answer isn't JSON");
  expect(sent.at(-1)!.text).toContain("--jq");
  work.waiters.arm({ reason: "PR merged", check: { argv: ["gh", "api", "repos/o/r/pulls/1"], succeedWhen: { path: "merged", equals: "true" } }, everyMs: 60_000 });
  clock.advance(60_000);
  await flush();
  const partners = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(partners.body).toMatchObject({ state: "cancelled", unmet: "its look couldn't be read" });
  expect(triggersPartner(partners)).toBe(true);
});

test("D144: a check that fails ends the wait unmet; On hand keeps it today; Keep waiting re-arms it as it was", async () => {
  let states = ["PENDING", "PENDING"];
  const { clock, log, tasks, work } = setup({ exec: async () => ({ exitCode: 1, stdout: checksJson(states) }) });
  const failCheck = { ...prCheck, failWhen: { path: "[].state", oneOf: ["FAILURE", "ERROR"], any: true } };
  const w = work.waiters.arm({ reason: "PR #9950 的 CI 通过", check: failCheck, everyMs: 60_000, unmetSays: "有一项检查挂了" });
  clock.advance(60_000);
  await flush();
  expect(tasks.onHand().waiters.length).toBe(1); // pending: looks on
  states = ["SUCCESS", "FAILURE"];
  clock.advance(60_000);
  await flush();
  const ended = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(ended).toMatchObject({ origin: "waiter", body: { state: "cancelled", unmet: "有一项检查挂了" } });
  expect(triggersPartner(ended)).toBe(true);
  const on = tasks.onHand();
  expect(on.waiters).toEqual([]);
  expect(on.missed).toMatchObject([{ waiterId: w.waiterId, reason: "PR #9950 的 CI 通过", unmet: "有一项检查挂了" }]);
  expect(await work.frames.waiter("nope", "rearm")).toBe(false);
  expect(await work.frames.waiter(w.waiterId, "rearm")).toBe(true);
  const again = log.read({ kinds: ["waiter"] }).at(-1)!;
  expect(again).toMatchObject({ origin: "user", body: { waiterId: w.waiterId, state: "armed", unmetSays: "有一项检查挂了" } });
  expect((again.body as Bodies["waiter"]).unmet).toBeUndefined();
  expect(tasks.onHand().missed).toEqual([]);
  expect(tasks.onHand().waiters.map((x) => x.waiterId)).toEqual([w.waiterId]);
  // It fails again: back in the finished area, and gone the next day.
  clock.advance(60_000);
  await flush();
  expect(tasks.onHand().missed!.length).toBe(1);
  clock.advance(2 * 24 * 3600_000);
  expect(tasks.onHand().missed).toEqual([]);
});

test("D144: the partner cancels a wait that can't come true with why; a plain cancel leaves no trace", async () => {
  const { log, tasks, work, mcp } = setup({ exec: async () => ({ exitCode: 0, stdout: checksJson(["PENDING"]) }) });
  const a = work.waiters.arm({ reason: "CI 通过", check: prCheck });
  const b = work.waiters.arm({ reason: "PR merged", check: prCheck });
  await mcp.call({ role: "partner" }, "wait_cancel", { waiterId: a.waiterId, unmet: "PR 被关掉了" });
  await work.frames.waiter(b.waiterId, "cancel");
  const evs = log.read({ kinds: ["waiter"] }).slice(-2);
  expect(evs[0]).toMatchObject({ origin: "partner", body: { state: "cancelled", unmet: "PR 被关掉了" } });
  expect(triggersPartner(evs[0]!)).toBe(false); // the partner said it itself
  expect(evs[1]).toMatchObject({ origin: "user", body: { state: "cancelled" } });
  expect(tasks.onHand().missed!.map((x) => x.waiterId)).toEqual([a.waiterId]);
});

test("D483: a command that isn't there ends the wait with that fact; a routine's watch backs off by doubling", async () => {
  let n = 0;
  const { clock, log, work } = setup({ exec: async () => (n++, Promise.reject(new Error("spawn gh ENOENT"))) });
  work.waiters.arm({ reason: "CI", check: prCheck, everyMs: 60_000 });
  clock.advance(60_000);
  await flush();
  expect(n).toBe(1);
  expect((kinds(log, "waiter_look")[0] as Bodies["waiter_look"]).summary).toBe("gh is not installed here");
  expect(log.read({ kinds: ["waiter"] }).at(-1)!.body).toMatchObject({ state: "cancelled", cantTell: "the look can't run: gh is not installed here" });
  work.waiters.arm({ reason: "CI", routineId: "r1", check: prCheck, everyMs: 60_000 });
  n = 0;
  clock.advance(60_000);
  await flush();
  expect(n).toBe(1);
  clock.advance(60_000);
  await flush();
  expect(n).toBe(1); // backed off to 2 min
  clock.advance(60_000);
  await flush();
  expect(n).toBe(2);
  clock.advance(2 * 60_000);
  await flush();
  expect(n).toBe(2); // now 4 min
  clock.advance(2 * 60_000);
  await flush();
  expect(n).toBe(3);
});

test("an armed check survives a restart and looks again", async () => {
  const a = setup({ exec: async () => ({ exitCode: 0, stdout: checksJson(["PENDING"]) }) });
  a.work.waiters.arm({ reason: "CI", check: prCheck, everyMs: 60_000 });
  a.clock.advance(60_000);
  await flush();
  a.work.stop();
  let looked = 0;
  const clock = new FakeClock(a.clock.now());
  const log = a.log;
  const tasks = createRegistry(log, clock);
  const work2 = createWork({ log, tasks, mcp: createMcpHub({ secret: "s" }), runner: () => undefined, clock, persona: "default", exec: async () => (looked++, { exitCode: 0, stdout: checksJson(["SUCCESS"]) }), minEveryMs: 1000, restartLookMs: 10 });
  expect(work2.waiters.views()[0]).toMatchObject({ reason: "CI", lastSummary: "0 of 1 match (1 PENDING)" });
  clock.advance(10);
  await flush();
  expect(looked).toBe(1);
  expect((kinds(log, "waiter").at(-1) as Bodies["waiter"]).state).toBe("fired");
  work2.stop();
});

test("an event wait on an oo account is refused with the way out; no wait is set", async () => {
  const s = setup({ readEvent: true });
  const P = { role: "partner" } as const;
  const r = (await s.mcp.call(P, "wait_for", { reason: "Lina 回邮件了", event: { connection: "oo", service: "gmail", trigger: "new_email" } })) as { ok: boolean; error?: string };
  expect(r).toEqual({ ok: false, error: OO_NOT_WATCHABLE });
  const p = (await s.mcp.call(P, "routine_propose", { name: "邮件", brief: "x", trigger: { kind: "condition", condition: "新邮件", event: { connection: "oo", service: "gmail", trigger: "new_email" } } })) as { ok: boolean; error?: string };
  expect(p).toEqual({ ok: false, error: OO_NOT_WATCHABLE });
  expect(kinds(s.log, "waiter")).toEqual([]);
});

test("an event wait with a judge: code filters, the model judges only new things, rate-limited", async () => {
  const asked: string[] = [];
  const judge: Judge = async (q) => (asked.push(q.data), { met: q.data.includes("renewal"), reason: q.data.includes("renewal") ? "the renewal reminder" : "a receipt" });
  const s = setup({ judge, readEvent: true });
  s.work.waiters.arm({ reason: "域名续费的邮件到了", event: { connection: "OOMOL", service: "gmail", trigger: "gmail.on_message_received", contains: "namecheap" }, judge: "Is this the domain renewal reminder?", everyMs: 5 * 60_000 });
  s.events({ items: [{ id: "m0", text: "subject: lunch? · from: Alice" }], checkpoint: "h0" });
  s.clock.advance(5 * 60_000);
  await flush();
  expect(asked.length).toBe(0); // code dropped it: not from Namecheap
  s.events({ items: [{ id: "m1", text: "subject: Your receipt · from: Namecheap" }], checkpoint: "h1" });
  s.clock.advance(5 * 60_000);
  await flush();
  expect(asked.length).toBe(1);
  expect((kinds(s.log, "waiter").at(-1) as Bodies["waiter"]).state).toBe("armed");
  s.events({ items: [{ id: "m2", text: "subject: ducter.dev renewal notice · from: Namecheap" }], checkpoint: "h2" });
  s.clock.advance(5 * 60_000);
  await flush();
  expect(asked.length).toBe(2);
  const last = kinds(s.log, "waiter").at(-1) as Bodies["waiter"];
  expect(last).toMatchObject({ state: "fired" });
  expect(last.observed).toContain("renewal reminder");
  const looks = kinds(s.log, "waiter_look") as Bodies["waiter_look"][];
  expect(looks.map((l) => l.checkpoint).filter(Boolean)).toEqual(["h0", "h1", "h2"]);
});

test("a judge runs at most once per floor, even when the data changes", async () => {
  let asked = 0;
  let n = 0;
  const s = setup({ exec: async () => ({ exitCode: 0, stdout: `price ${++n}` }), judge: async () => (asked++, { met: false, reason: "not yet" }) });
  s.work.waiters.arm({ reason: "降价了", check: { argv: ["curl", "-s", "https://shop.example/item"], succeedWhen: { contains: "price" } }, judge: "Is the price under 300?", everyMs: 20_000 });
  for (const _ of [1, 2, 3, 4]) s.clock.advance(20_000), await flush();
  expect(asked).toBe(2); // 60 s floor in this test: looks at 20 s (judged), 40, 60, 80 (judged)
});

// ---------- until ----------

test("until: each try is judged; the next one starts by itself; met ends it once, holding back the task's own done", async () => {
  const verdicts = [{ met: false, reason: "3 checks failed", progress: "same" as const }, { met: false, reason: "1 check failed", progress: "better" as const }, { met: true, reason: "all green" }];
  const { log, tasks, work, sent } = setup({ judge: async () => verdicts.shift()! });
  openTask(log, "t1", "一直修到 CI 绿：hawdb main");
  tasks.setState("t1", "working", "hot");
  work.untils.start({ taskId: "t1", condition: "main 的 CI 全绿" });
  for (const _ of [1, 2, 3]) {
    const r = report(log, "t1", { state: "done", summary: "Pushed a fix." });
    expect(work.wakes(r)).toBe(false);
    await flush();
  }
  const tries = kinds(log, "until_try") as Bodies["until_try"][];
  expect(tries.map((t) => `${t.n}:${t.verdict}`)).toEqual(["1:same", "2:better", "3:met"]);
  expect(sent.map((s) => s.text.slice(0, 6))).toEqual(["第 2 次：", "第 3 次："]);
  const end = log.read({ kinds: ["until"] }).at(-1)!;
  expect(end.body).toMatchObject({ state: "met", stop: "met" });
  expect(triggersPartner(end)).toBe(true);
  expect(tasks.get("t1")!.until).toMatchObject({ state: "met", maxTries: 20, tries: [{ n: 1 }, { n: 2 }, { n: 3 }] });
});

test("until: no progress three times stops it and asks the user", async () => {
  const { log, tasks, work } = setup({ judge: async () => ({ met: false, reason: "same failure", progress: "same" }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.untils.start({ taskId: "t1", condition: "CI green" });
  for (const _ of [1, 2, 3]) report(log, "t1", { state: "done", summary: "Tried." }), await flush();
  expect(log.read({ kinds: ["until"] }).at(-1)!.body).toMatchObject({ state: "stopped", stop: "no_progress" });
  expect(tasks.get("t1")!.attention).toBe("needs_you");
});

test("until: a compiled check decides before any model, and going in circles stops it", async () => {
  const seen = [checksJson(["FAILURE", "SUCCESS"]), checksJson(["SUCCESS", "FAILURE"]), checksJson(["FAILURE", "SUCCESS"])];
  let judged = 0;
  const { log, tasks, work } = setup({ exec: async () => ({ exitCode: 1, stdout: seen.shift()! }), judge: async () => (judged++, { met: false, reason: "" }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.untils.start({ taskId: "t1", condition: "CI green", check: prCheck, maxTries: 5 });
  for (const _ of [1, 2, 3]) report(log, "t1", { state: "done", summary: "x" }), await flush();
  expect(judged).toBe(0);
  const tries = kinds(log, "until_try") as Bodies["until_try"][];
  expect(tries.every((t) => t.by === "check")).toBe(true);
  expect(log.read({ kinds: ["until"] }).at(-1)!.body).toMatchObject({ state: "stopped" });
});

test("until: the cap of tries", async () => {
  const { log, tasks, work } = setup({ judge: async () => ({ met: false, reason: `r${Math.random()}`, progress: "better" }) });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.untils.start({ taskId: "t1", condition: "x", maxTries: 2 });
  for (const _ of [1, 2]) report(log, "t1", { state: "progress", summary: "x" }), await flush();
  expect(log.read({ kinds: ["until"] }).at(-1)!.body).toMatchObject({ state: "stopped", stop: "max" });
});

// ---------- routines ----------

const monday9: RoutineTrigger = { kind: "time", every: "week", days: [1], time: "09:00", zone: "personal", tz: "Asia/Shanghai" };

test("schedule: every Monday 9:00 in Shanghai, said in words", () => {
  const from = Date.parse("2026-11-09T02:00:00Z"); // Mon 10:00 in Shanghai
  expect(nextFirings(monday9, from, 3).map((t) => new Date(t).toISOString())).toEqual(["2026-11-16T01:00:00.000Z", "2026-11-23T01:00:00.000Z", "2026-11-30T01:00:00.000Z"]);
  expect(describeTrigger(monday9, "zh")).toBe("每周一 9:00（跟着你的时区）");
  expect(describeTrigger(monday9, "en")).toBe("Mondays 9:00 (follows your time zone)");
  const ny = nextFirings({ kind: "time", every: "weekday", time: "09:30", zone: "world", tz: "America/New_York" }, Date.parse("2026-11-07T00:00:00Z"), 1)[0]!;
  expect(new Date(ny).toISOString()).toBe("2026-11-09T14:30:00.000Z"); // Mon, after the DST change
  expect(nextFirings({ kind: "time", every: "month", dayOfMonth: 31, time: "08:00", zone: "world", tz: "UTC" }, Date.parse("2026-11-01T00:00:00Z"), 1).map((t) => new Date(t).toISOString())).toEqual(["2026-11-30T08:00:00.000Z"]);
});

test("a routine: proposal card, Go, it fires as a fresh task, the run closes from its report", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:00:00Z") });
  const v = await s.work.routines.propose({ name: "周报", trigger: monday9, brief: "看上周 hawdb 和 ducter 里合了什么、开着什么、卡在哪儿，写成一页周报。" });
  expect(v.upcoming!.slice(0, 2)).toEqual(["2026-11-16T01:00:00.000Z", "2026-11-23T01:00:00.000Z"]);
  const card = s.log.read({ kinds: ["decision"] }).at(-1)!.body as Bodies["decision"];
  expect(card).toMatchObject({ routineId: v.routineId, goLabel: "开始", defaultOption: "hold" });
  expect(s.tasks.onHand().routines![0]).toMatchObject({ state: "proposed", triggerWords: "每周一 9:00（跟着你的时区）" });
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: card.decisionId, option: "go", by: "user" } });
  expect(s.tasks.onHand().routines![0]).toMatchObject({ state: "active", nextAt: "2026-11-16T01:00:00.000Z" });
  s.clock.advance(7 * 86_400_000);
  await flush();
  const runs = kinds(s.log, "routine_run") as Bodies["routine_run"][];
  expect(runs[0]).toMatchObject({ state: "started", taskId: "run1", scheduledFor: "2026-11-16T01:00:00.000Z" });
  expect(s.tasks.get("run1")!.fromRoutine).toEqual({ routineId: v.routineId, name: "周报", reports: "every" });
  expect(s.opened[0]).toContain("read only");
  // The real order on Claude Code (research/108 B3): report_to_main inside the turn, then the turn's usage.
  report(s.log, "run1", { state: "done", summary: "周报写好了。" });
  await flush();
  s.log.append({ stream: "task:run1", origin: "task", kind: "task_event", body: { taskId: "run1", role: "system", usage: { inputTokens: 9000, outputTokens: 1000 }, raw: { turnEnd: true } } });
  await flush();
  const view = s.tasks.onHand().routines![0]!;
  expect(view.lastRun).toMatchObject({ state: "done", tokens: 10000 });
  expect(view.budget.perRunTokens).toBe(20000);
  expect(view.nextAt).toBe("2026-11-23T01:00:00.000Z");
});

test("a routine: missed firings coalesce into one late run, or one skip; never several runs", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:00:00Z") });
  const v = await s.work.routines.propose({ name: "日报", trigger: { kind: "time", every: "day", time: "09:00", zone: "world", tz: "Asia/Shanghai" }, brief: "Daily notes." });
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: v.decisionId!, option: "go", by: "user" } });
  s.work.stop();
  // Ducter was off for four days; it comes back at 11:00, two hours after today's firing.
  const clock = new FakeClock(Date.parse("2026-11-13T03:00:00Z"));
  const tasks = createRegistry(s.log, clock);
  let opened = 0;
  const runner = { openTask: async () => (opened++, openTask(s.log, `late${opened}`), tasks.get(`late${opened}`) as TaskCard) } as unknown as Runner;
  const work2 = createWork({ log: s.log, tasks, mcp: createMcpHub({ secret: "s" }), runner: () => runner, clock, persona: "default", defaultZone: "Asia/Shanghai" });
  await flush();
  expect(opened).toBe(1);
  const run = (kinds(s.log, "routine_run") as Bodies["routine_run"][]).at(-1)!;
  expect(run).toMatchObject({ state: "started", catchUp: true, coalesced: 3, scheduledFor: "2026-11-13T01:00:00.000Z" });
  work2.stop();
});

test("a routine pauses itself after 3 failed runs; only the user resumes", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:00:00Z") });
  const v = await s.work.routines.propose({ name: "nightly", trigger: { kind: "time", every: "day", time: "02:00", zone: "world", tz: "UTC" }, brief: "Check the nightly." });
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: v.decisionId!, option: "go", by: "user" } });
  for (const i of [1, 2, 3]) {
    s.clock.advance(86_400_000);
    await flush();
    // It ran a command before it failed (D245: acted), so it isn't tried again: each counts.
    s.log.append({ stream: `task:run${i}`, origin: "task", kind: "task_event", body: { taskId: `run${i}`, role: "tool", tool: { name: "Bash", input: { command: "gh run list" } } } });
    report(s.log, `run${i}`, { state: "failed", summary: "the nightly's page didn't load" });
    turnEnd(s.log, `run${i}`);
    await flush();
  }
  const paused = s.log.read({ kinds: ["routine"] }).at(-1)!;
  expect(paused.body).toMatchObject({ state: "paused", pausedBy: "system", pauseReason: "failures" });
  expect(triggersPartner(paused)).toBe(true);
  expect(s.work.frames.routine(v.routineId, "resume")).toBe(true);
  expect(s.tasks.onHand().routines![0]!.state).toBe("active");
});

test("a condition routine: a live dry run on the card, and it fires on the change to true", async () => {
  let broken = false;
  const s = setup({ exec: async () => ({ exitCode: 0, stdout: JSON.stringify([{ conclusion: broken ? "failure" : "success" }]) }) });
  const check = { argv: ["gh", "run", "list", "--workflow", "nightly", "--limit", "1", "--json", "conclusion"], succeedWhen: { path: "[].conclusion", equals: "failure" } };
  const v = await s.work.routines.propose({ name: "nightly 挂了告诉我", trigger: { kind: "condition", condition: "hawdb 的 nightly 挂了", check, everyMs: 60_000 }, brief: "看 nightly 为什么挂了，告诉我。", reports: "on_change" });
  expect(v.dryRun).toMatchObject({ met: false, summary: "0 of 1 match (1 success)" });
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: v.decisionId!, option: "go", by: "user" } });
  await flush();
  broken = true;
  s.clock.advance(60_000);
  await flush();
  expect((kinds(s.log, "routine_run") as Bodies["routine_run"][]).filter((r) => r.state === "started").length).toBe(1);
  // Still broken on the next looks: no second run until it recovers and breaks again.
  report(s.log, "run1", { state: "done", summary: "nightly 挂在 compaction 测试上。" });
  s.clock.advance(60_000);
  await flush();
  s.clock.advance(60_000);
  await flush();
  expect((kinds(s.log, "routine_run") as Bodies["routine_run"][]).filter((r) => r.state === "started").length).toBe(1);
  expect(s.tasks.onHand().waiters).toEqual([]); // its watch lives on the routine card
});

test("a routine reaches its review date: it pauses and asks Keep this?", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:00:00Z") });
  const v = await s.work.routines.propose({ name: "周报", trigger: monday9, brief: "Weekly." });
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: v.decisionId!, option: "go", by: "user" } });
  s.clock.advance(30 * 86_400_000 + 1000);
  await flush();
  const r = s.log.read({ kinds: ["routine"] }).at(-1)!.body as Bodies["routine"];
  expect(r).toMatchObject({ state: "paused", pauseReason: "review" });
  const keep = s.log.read({ kinds: ["decision"] }).at(-1)!.body as Bodies["decision"];
  expect(keep.question).toContain("还要吗");
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: keep.decisionId, option: "go", by: "user" } });
  expect(s.tasks.onHand().routines![0]!.state).toBe("active");
});

test("until: a judge that counts what's left gives the same lights row, its total fixed from the first count", async () => {
  const verdicts = [
    { met: false, reason: "还剩 4 处", progress: "better" as const, done: 12, left: 4 },
    { met: false, reason: "还剩 1 处", progress: "better" as const, left: 1 },
    { met: true, reason: "干净了" },
  ];
  const { log, tasks, work } = setup({ judge: async () => verdicts.shift()! });
  openTask(log, "t1");
  tasks.setState("t1", "working", "hot");
  work.untils.start({ taskId: "t1", condition: "docs 里没有错别字了" });
  for (const _ of [1, 2, 3]) report(log, "t1", { state: "done", summary: "改了一些" }), await flush();
  const tries = kinds(log, "until_try") as Bodies["until_try"][];
  expect(tries.map((t) => t.progress)).toEqual([
    { done: 12, total: 16, unit: "items" },
    { done: 15, total: 16, unit: "items" },
    { done: 16, total: 16, unit: "items" },
  ]);
});

test("the judge's verdict: counts only when given as whole numbers", () => {
  expect(parseVerdict('{"met": false, "reason": "4 left", "done": 12, "left": 4}')).toEqual({ met: false, reason: "4 left", left: 4, done: 12 });
  expect(parseVerdict('{"met": false, "reason": "hm", "left": "some"}')).toEqual({ met: false, reason: "hm" });
});

// ---------- D185: started by hand, later or on a schedule ----------

test("D185: a one-time start the user set is active at once (no card), opens their words at its time, then it's over", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:00:00Z") }); // Mon 10:00 in Shanghai
  const once: RoutineTrigger = { kind: "time", every: "once", date: "2026-11-10", time: "09:00", zone: "world", tz: "Asia/Shanghai" };
  expect(describeTrigger(once, "zh")).toBe("11月10日 9:00");
  expect(describeTrigger(once, "en")).toBe("Nov 10, 9:00");
  const words = "跑一遍发布清单，把没勾的列出来。";
  const v = s.work.routines.yours({ name: "跑一遍发布清单", trigger: once, brief: words, project: "ducter", harness: "codex" });
  expect(v).toMatchObject({ state: "active", by: "you", triggerWords: "11月10日 9:00", nextAt: "2026-11-10T01:00:00.000Z", effect: "local_writes", harness: "codex" });
  expect(s.log.read({ kinds: ["decision"] })).toEqual([]); // the user's own tap is the Go
  s.clock.advance(86_400_000);
  await flush();
  expect(s.opened).toEqual([words]); // their words, as they wrote them
  expect(s.tasks.onHand().routines ?? []).toEqual([]); // ran once: it's over
  const note = s.log.read({ stream: "channel", kinds: ["job_status"] }).at(-1)!.body as Bodies["job_status"];
  expect(note.jobId).toBe("body_run1_opened");
  // A time already behind it is refused, plainly.
  expect(() => s.work.routines.yours({ name: "x", trigger: { ...once, date: "2026-11-01" }, brief: "x" })).toThrow("already passed");
});

test("D185: every weekday, set by the user: each run carries their words and one line on when", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:00:00Z") });
  const v = s.work.routines.yours({ name: "看一眼 nightly", trigger: { kind: "time", every: "weekday", time: "09:00", zone: "personal", tz: "Asia/Shanghai" }, brief: "看一眼 hawdb 的 nightly，挂了就修。" });
  expect(v.triggerWords).toBe("工作日 9:00（跟着你的时区）");
  s.clock.advance(86_400_000);
  await flush();
  expect(s.opened[0]!.startsWith("看一眼 hawdb 的 nightly，挂了就修。\n")).toBe(true);
  expect(s.opened[0]).toContain("set to repeat");
  expect(s.tasks.onHand().routines![0]).toMatchObject({ state: "active", nextAt: "2026-11-11T01:00:00.000Z" });
});
