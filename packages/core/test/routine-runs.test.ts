// D245: routines that fire robustly, on a fake clock with a fake runner and fake commands: a late
// run knows it is late, one safe retry, account errors space the routine out and recover, missed
// firings fold into one catch-up (also when the runner is wired after the restart), and a "when
// something changes" watch that needs no model, says what is new / updated / gone, and asks when
// it isn't sure.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, RoutineTrigger, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { diffWatch, snapshot, validateWatch } from "@ducter/protocol/src/watch.ts";
import type { Exec } from "@ducter/protocol/src/checks-run.ts";
import { FakeClock } from "../src/clock.ts";
import { triggersPartner } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { actedBy, troubleOf } from "../src/routines.ts";
import { createWork } from "../src/work.ts";
import { openTask, report, tempDir, tick } from "./helpers.ts";

const MIN = 60_000;
let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.reverse()) c();
  cleanups = [];
});
const flush = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

function setup(o: { exec?: Exec; start?: number; dir?: string; log?: ReturnType<typeof openLog>; ready?: () => boolean; connections?: unknown } = {}) {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const clock = new FakeClock(o.start ?? Date.parse("2026-11-09T02:00:00Z")); // Mon 10:00 in Shanghai
  const log = o.log ?? openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const briefs: string[] = [];
  let n = 0;
  const prefix = `r${Math.random().toString(36).slice(2, 6)}_`;
  const runner = {
    async openTask(input: { title: string; brief: string }) {
      const taskId = `${prefix}${++n}`;
      openTask(log, taskId, input.title);
      tasks.setState(taskId, "working", "hot");
      briefs.push(input.brief);
      return tasks.get(taskId) as TaskCard;
    },
    async send() {
      return { delivered: "prompted" as const };
    },
    async interrupt() {},
  } as unknown as Runner;
  const work = createWork({ log, tasks, mcp: createMcpHub({ secret: "s" }), runner: () => (o.ready && !o.ready() ? undefined : runner), clock, persona: "default", exec: o.exec, minEveryMs: 1000, restartLookMs: 10, defaultZone: "Asia/Shanghai", connections: o.connections as never });
  tasks.setDecorator((x) => work.decorate(x));
  cleanups.push(() => {
    work.stop();
    if (!o.log) log.close();
    t.cleanup();
  });
  const task = (i: number) => `${prefix}${i}`;
  const runs = () => log.read({ kinds: ["routine_run"], limit: 1000 }).map((e) => e.body as Bodies["routine_run"]);
  const started = () => runs().filter((r) => r.state === "started");
  const go = (decisionId: string) => log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option: "go", by: "user" } });
  const latest = () => log.read({ kinds: ["routine"], limit: 1000 }).at(-1)!;
  return { dir: t.dir, clock, log, tasks, work, briefs, task, runs, started, go, latest };
}

const daily9: RoutineTrigger = { kind: "time", every: "day", time: "09:00", zone: "world", tz: "Asia/Shanghai" };
const tool = (log: ReturnType<typeof openLog>, taskId: string, name: string) =>
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "tool", tool: { name, input: {} } } });

async function active(s: ReturnType<typeof setup>, input: Parameters<ReturnType<typeof setup>["work"]["routines"]["propose"]>[0]) {
  const v = await s.work.routines.propose(input);
  s.go(v.decisionId!);
  await flush();
  return v;
}

// ---------- the words ----------

test("account errors are told apart from other failures, and reading isn't acting", () => {
  expect(troubleOf("Not logged in · Please run /login")).toBe("signin");
  expect(troubleOf("gh: To get started with GitHub CLI, please run: gh auth login (HTTP 401)")).toBe("signin");
  expect(troubleOf("Gmail 要重新登录")).toBe("signin");
  expect(troubleOf("You've hit your usage limit. Try again at 3pm")).toBe("quota");
  expect(troubleOf("Your credit balance is too low")).toBe("quota");
  expect(troubleOf("the nightly's page didn't load")).toBeUndefined();
  expect(actedBy("Read")).toBe(false);
  expect(actedBy("mcp__ducter__report_to_main")).toBe(false);
  expect(actedBy("Bash")).toBe(true);
  expect(actedBy("mcp__ducter__connection_call")).toBe(true);
});

// ---------- late ----------

test("a run that starts well after its time is told it is late; an on-time one isn't", async () => {
  const s = setup();
  const v = await active(s, { name: "早报", trigger: daily9, brief: "早上好，给我今天的安排。" });
  s.clock.advance(23 * 60 * MIN); // Tue 9:00 Shanghai
  await flush();
  expect(s.briefs[0]).not.toContain("started late");
  report(s.log, s.task(1), { state: "done", summary: "ok" });
  await flush();
  s.work.stop();
  // Home asleep from 8:50 on Wednesday; it comes back at 15:00.
  const back = setup({ dir: s.dir, log: s.log, start: Date.parse("2026-11-11T07:00:00Z") });
  await flush();
  const run = back.started().at(-1)!;
  expect(run).toMatchObject({ routineId: v.routineId, catchUp: true, lateMin: 360, scheduledFor: "2026-11-11T01:00:00.000Z" });
  expect(back.briefs[0]).toContain("This run started late");
  expect(back.briefs[0]).toContain("360 min late");
  expect(back.briefs[0]).toContain("Adapt anything that depends on the time of day");
});

test("a late run of the user's own routine says so after their words", async () => {
  const s = setup();
  s.work.routines.yours({ name: "看一眼 nightly", trigger: { kind: "time", every: "day", time: "09:00", zone: "world", tz: "Asia/Shanghai" }, brief: "看一眼 nightly。" });
  s.work.stop();
  const back = setup({ dir: s.dir, log: s.log, start: Date.parse("2026-11-10T02:00:00Z") }); // Tue 10:00, an hour late
  await flush();
  expect(back.briefs[0]!.startsWith("看一眼 nightly。\n")).toBe(true);
  expect(back.briefs[0]).toContain("60 min late");
  expect(back.started().at(-1)!.lateMin).toBe(60);
});

// ---------- one safe retry ----------

test("a run that failed before doing anything is tried once more, 12 minutes later; then it counts", async () => {
  const s = setup();
  await active(s, { name: "日报", trigger: daily9, brief: "Daily notes." });
  s.clock.advance(23 * 60 * MIN);
  await flush();
  s.tasks.setState(s.task(1), "failed", "parked", "harness exited: model overloaded");
  await flush();
  const failed = s.runs().at(-1)!;
  expect(failed).toMatchObject({ state: "failed", reason: "harness exited: model overloaded", retryAt: "2026-11-10T01:12:00.000Z" });
  expect(failed.acted).toBeUndefined();
  s.clock.advance(12 * MIN);
  await flush();
  expect(s.started().length).toBe(2);
  expect(s.started().at(-1)).toMatchObject({ attempt: 1, scheduledFor: "2026-11-10T01:00:00.000Z" });
  expect(s.briefs[1]).toContain("fresh start");
  report(s.log, s.task(2), { state: "failed", summary: "still overloaded" });
  await flush();
  expect(s.runs().at(-1)).toMatchObject({ state: "failed", attempt: 1 });
  expect(s.runs().at(-1)!.retryAt).toBeUndefined(); // only one retry
  s.clock.advance(60 * MIN);
  await flush();
  expect(s.started().length).toBe(2);
});

test("no retry once the run posted or did something, or when the next time is near", async () => {
  const s = setup();
  await active(s, { name: "日报", trigger: daily9, brief: "Daily notes." });
  s.clock.advance(23 * 60 * MIN);
  await flush();
  tool(s.log, s.task(1), "Read"); // reading is not acting
  tool(s.log, s.task(1), "Bash"); // a command could have changed something
  report(s.log, s.task(1), { state: "failed", summary: "the page didn't load" });
  await flush();
  expect(s.runs().at(-1)).toMatchObject({ state: "failed", acted: true });
  expect(s.runs().at(-1)!.retryAt).toBeUndefined();

  // Every hour: failing 40 minutes in, the next time (20 min away) is the retry.
  const h = setup();
  await active(h, { name: "看队列", trigger: { kind: "time", every: "hours", hours: 1, time: "00:00", zone: "world", tz: "UTC" }, brief: "Look at the queue." });
  h.clock.advance(60 * MIN); // 03:00 UTC
  await flush();
  h.clock.advance(40 * MIN);
  report(h.log, h.task(1), { state: "failed", summary: "timeout" });
  await flush();
  expect(h.runs().at(-1)!.retryAt).toBeUndefined();
  // The person cancelling it is never retried either.
  h.clock.advance(20 * MIN);
  await flush();
  h.tasks.setState(h.task(2), "dropped", "archived", "cancelled");
  await flush();
  expect(h.runs().at(-1)).toMatchObject({ state: "failed" });
  expect(h.runs().at(-1)!.retryAt).toBeUndefined();
});

// ---------- account errors ----------

test("account errors space the routine out, are said once, never pause it, and clear when it works", async () => {
  const s = setup();
  const v = await active(s, { name: "日报", trigger: daily9, brief: "Daily notes." });
  s.clock.advance(23 * 60 * MIN); // Tue 9:00
  await flush();
  s.tasks.setState(s.task(1), "failed", "parked", "Not logged in · Please run /login");
  await flush();
  expect(s.runs().at(-1)).toMatchObject({ state: "failed", trouble: "signin", retryAt: "2026-11-10T01:05:00.000Z" });
  let r = s.latest();
  expect((r.body as Bodies["routine"]).backoff).toMatchObject({ trouble: "signin", failures: 1, stepMs: 5 * MIN });
  expect(triggersPartner(r)).toBe(false); // one blip stays quiet
  s.clock.advance(5 * MIN);
  await flush();
  expect(s.started().at(-1)).toMatchObject({ attempt: 1, scheduledFor: "2026-11-10T01:00:00.000Z" });
  report(s.log, s.task(2), { state: "failed", summary: "Claude Code: Not logged in" });
  await flush();
  r = s.latest();
  expect(r.body).toMatchObject({ state: "active", news: "stuck", backoff: { failures: 2, stepMs: 10 * MIN, nextTryAt: "2026-11-10T01:15:00.000Z" } });
  expect(triggersPartner(r)).toBe(true); // said once
  // Three more in a row: still active, spaced 20, 40, 80 minutes, said only that once.
  for (const [i, step] of [[3, 10], [4, 20], [5, 40]] as const) {
    s.clock.advance(step * MIN);
    await flush();
    report(s.log, s.task(i), { state: "failed", summary: "Not logged in" });
    await flush();
  }
  r = s.latest();
  expect(r.body).toMatchObject({ state: "active", backoff: { failures: 5, stepMs: 80 * MIN } });
  expect((r.body as Bodies["routine"]).news).toBeUndefined();
  expect(s.work.routines.get(v.routineId)!.nextAt).toBe(new Date(s.clock.now() + 80 * MIN).toISOString());
  // The person signs in again: the next try works, the spacing is over, and that is said once.
  s.clock.advance(80 * MIN);
  await flush();
  expect(s.started().length).toBe(6);
  expect(s.started().at(-1)!.lateMin).toBeGreaterThan(150);
  report(s.log, s.task(6), { state: "done", summary: "日报写好了。" });
  await flush();
  r = s.latest();
  expect(r.body).toMatchObject({ state: "active", news: "works_again" });
  expect((r.body as Bodies["routine"]).backoff).toBeUndefined();
  expect(triggersPartner(r)).toBe(true);
});

test("during a backoff, an every-hour routine's times fold into the next try instead of failing each hour", async () => {
  const s = setup({ start: Date.parse("2026-11-09T02:30:00Z") });
  const v = await active(s, { name: "看队列", trigger: { kind: "time", every: "hours", hours: 1, time: "00:00", zone: "world", tz: "UTC" }, brief: "Look at the queue." });
  // Every run fails on an account error, for most of a day: each one as soon as it starts.
  const at: number[] = [];
  for (let k = 0; k < 40 && at.length < 9; k++) {
    // Straight to when it says it runs next.
    s.clock.advance(Math.max(0, Date.parse(s.work.routines.get(v.routineId)!.nextAt!) - s.clock.now()));
    await flush();
    const n = s.started().length;
    if (n > at.length) {
      at.push(s.clock.now());
      s.tasks.setState(s.task(n), "failed", "parked", "You've hit your usage limit");
      await flush();
    }
  }
  expect(at).toHaveLength(9);
  const b = (s.latest().body as Bodies["routine"]).backoff!;
  expect(b).toMatchObject({ trouble: "quota", failures: 9, stepMs: 5 * MIN * 2 ** 8 });
  // Spaced out: once the spacing passes an hour, runs come at least that far apart (hourly times fold).
  const gaps = at.slice(1).map((t, i) => (t - at[i]!) / MIN);
  expect(gaps.slice(-3).every((g) => g >= 160)).toBe(true);
  expect(s.started().some((r) => (r.coalesced ?? 0) >= 2)).toBe(true);
  // Never paused: the spacing never reached a day, so none of these counted toward "3 in a row".
  expect((s.latest().body as Bodies["routine"]).state).toBe("active");
});

// ---------- one catch-up ----------

test("after a restart, a catch-up waits for the runner to be wired instead of being skipped", async () => {
  const s = setup();
  await active(s, { name: "日报", trigger: daily9, brief: "Daily notes." });
  s.work.stop();
  let ready = false;
  // Off for three days; back at 9:30 Thursday, with the runner wired a moment later.
  const back = setup({ dir: s.dir, log: s.log, start: Date.parse("2026-11-12T01:30:00Z"), ready: () => ready });
  await flush();
  expect(back.started().length).toBe(0);
  expect(back.runs().filter((r) => r.state === "skipped")).toEqual([]);
  ready = true;
  back.clock.advance(10_000);
  await flush();
  expect(back.started()).toHaveLength(1);
  expect(back.started()[0]).toMatchObject({ catchUp: true, coalesced: 2, scheduledFor: "2026-11-12T01:00:00.000Z", lateMin: 30 });
  expect(back.briefs[0]).toContain("2 missed times folded into this one");
});

// ---------- when something changes ----------

test("a watch on a folder: no model, nothing runs until it changes, and the run hears what is new, updated, gone", async () => {
  const s = setup();
  const inbox = join(s.dir, "inbox");
  mkdirSync(inbox);
  writeFileSync(join(inbox, "a.txt"), "a");
  writeFileSync(join(inbox, "b.txt"), "b");
  const trigger: RoutineTrigger = { kind: "condition", condition: "inbox 里有新文件", watch: { files: [inbox] }, everyMs: MIN };
  const v = await s.work.routines.propose({ name: "整理 inbox", trigger, brief: "把 inbox 里新来的文件分好类。", reports: "on_change" });
  expect(v.dryRun).toMatchObject({ met: false, summary: "sees 2 now" });
  s.go(v.decisionId!);
  await flush();
  s.clock.advance(MIN); // the first look learns what is there
  await flush();
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(0);
  writeFileSync(join(inbox, "c.txt"), "c");
  writeFileSync(join(inbox, "a.txt"), "a, longer now");
  utimesSync(join(inbox, "a.txt"), new Date(), new Date(Date.now() + 5000));
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(1);
  expect(s.briefs[0]).toContain("What changed since the last look");
  expect(s.briefs[0]).toContain("1 new · 1 updated");
  expect(s.briefs[0]).toContain(`New: ${inbox}/c.txt`);
  expect(s.briefs[0]).toContain(`Updated: ${inbox}/a.txt`);
  report(s.log, s.task(1), { state: "done", summary: "分好了。" });
  await flush();
  // Re-armed from what it saw: no change, no run.
  s.clock.advance(MIN);
  await flush();
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(1);
  rmSync(join(inbox, "b.txt"));
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(2);
  expect(s.briefs[1]).toContain(`Gone: ${inbox}/b.txt`);
  // Only one watch for the routine, and never on Waiting.
  expect(s.work.waiters.views().filter((w) => w.routineId === v.routineId)).toHaveLength(1);
  expect(s.tasks.onHand().waiters).toEqual([]);
});

test("a watch on a command's JSON list: keyed items, a fetch time doesn't count, an error is never a change", async () => {
  let items = [{ id: 1, title: "Fix login", state: "open" }, { id: 2, title: "Docs", state: "open" }];
  let fail = false;
  let fetchedAt = 0;
  const exec: Exec = async () => (fail ? { exitCode: 1, stdout: "HTTP 502" } : { exitCode: 0, stdout: JSON.stringify({ fetchedAt: ++fetchedAt, issues: items }) });
  const s = setup({ exec });
  const watch = { argv: ["gh", "api", "repos/nowledge-co/hawdb/issues"], path: "issues", key: ["id"] };
  expect(validateWatch(watch)).toEqual({ ok: true });
  expect(validateWatch({ argv: ["rm", "-rf", "x"] }).ok).toBe(false);
  expect(validateWatch({ files: ["~/.ssh"] }).ok).toBe(false);
  expect(validateWatch({ url: "file:///etc/passwd" }).ok).toBe(false);
  await active(s, { name: "hawdb 新 issue", trigger: { kind: "condition", condition: "hawdb 的 issue 有变化", watch, everyMs: MIN }, brief: "说说 hawdb 的 issue 有什么变化。" });
  s.clock.advance(MIN);
  await flush();
  s.clock.advance(MIN); // only fetchedAt moved
  await flush();
  expect(s.started()).toHaveLength(0);
  fail = true;
  s.clock.advance(MIN);
  await flush();
  s.clock.advance(4 * MIN);
  await flush();
  expect(s.started()).toHaveLength(0);
  fail = false;
  items = [{ id: 1, title: "Fix login", state: "closed" }, { id: 3, title: "Crash on start", state: "open" }];
  s.clock.advance(10 * MIN);
  await flush();
  expect(s.started()).toHaveLength(1);
  expect(s.briefs[0]).toContain("1 new · 1 updated · 1 gone");
  expect(s.briefs[0]).toContain("New: 3");
  expect(s.briefs[0]).toContain("Gone: 2");
});

test("a watch that isn't sure of what it saw asks before the routine runs", async () => {
  let list: unknown[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const s = setup({ exec: async () => ({ exitCode: 0, stdout: JSON.stringify(list) }) });
  await active(s, { name: "盯着发布", trigger: { kind: "condition", condition: "发布列表有变化", watch: { argv: ["gh", "release", "list", "--json", "tagName"], key: ["id"] }, everyMs: MIN }, brief: "说说发布有什么变化。" });
  s.clock.advance(MIN);
  await flush();
  list = []; // everything gone at once: more likely a bad look than a real change
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(0);
  const ask = s.log.read({ kinds: ["decision"] }).at(-1)!.body as Bodies["decision"];
  expect(ask).toMatchObject({ unsure: true, defaultOption: "hold", goLabel: "照样做" });
  expect(ask.question).toContain("跟平时很不一样");
  // Still empty: no second card while the first is open.
  s.clock.advance(MIN);
  await flush();
  expect(s.log.read({ kinds: ["decision"] }).filter((e) => (e.body as Bodies["decision"]).unsure)).toHaveLength(1);
  s.go(ask.decisionId);
  await flush();
  expect(s.started()).toHaveLength(1);
});

test("a watch on an app's reading tool goes through Ducter's own look, and the snapshot is stable", async () => {
  let mails = [{ id: "m1", subject: "Invoice" }];
  const calls: string[] = [];
  const connections = {
    read: async (who: { role: string }, connection: string, action: string) => (calls.push(`${who.role} ${connection} ${action}`), { ok: true, op: "read", result: { messages: mails } }),
    watchable: () => ({ ok: true }),
  };
  const s = setup({ connections });
  await active(s, { name: "新邮件", trigger: { kind: "condition", condition: "收件箱有新邮件", watch: { tool: { connection: "oo", action: "gmail.fetch_emails", input: { query: "is:unread" } }, path: "messages", key: ["id"], fields: ["subject"] }, everyMs: MIN }, brief: "说说新邮件。" });
  s.clock.advance(MIN);
  await flush();
  mails = [...mails, { id: "m2", subject: "Flight changed" }];
  s.clock.advance(MIN);
  await flush();
  expect(calls[0]).toBe("watch oo gmail.fetch_emails");
  expect(s.started()).toHaveLength(1);
  expect(s.briefs[0]).toContain("New: m2");
  // Order and key order don't make a change.
  const a = snapshot([{ id: 1, x: 1, y: 2 }, { id: 2, x: 3 }], { key: ["id"] });
  const b = snapshot([{ id: 2, x: 3 }, { y: 2, x: 1, id: 1 }], { key: ["id"] });
  expect(diffWatch(a.baseline, b).changed).toBe(false);
});

test("a restart keeps the one watch a routine had, and what it saw", async () => {
  let n = 1;
  const exec: Exec = async () => ({ exitCode: 0, stdout: `v${n}` });
  const s = setup({ exec });
  const v = await active(s, { name: "盯着版本", trigger: { kind: "condition", condition: "版本号变了", watch: { url: "https://example.com/version.txt" }, everyMs: MIN }, brief: "说说新版本。" });
  s.clock.advance(MIN);
  await flush();
  s.work.stop();
  const back = setup({ dir: s.dir, log: s.log, exec, start: s.clock.now() });
  await flush();
  back.clock.advance(MIN);
  await flush();
  expect(back.work.waiters.views().filter((w) => w.routineId === v.routineId)).toHaveLength(1);
  expect(back.started()).toHaveLength(0); // it remembered v1: no change
  n = 2;
  back.clock.advance(MIN);
  await flush();
  expect(back.started()).toHaveLength(1);
  expect(back.briefs[0]).toContain("Now it reads:\nv2");
});

test("Hold on an unsure look: it watches on from what it saw before, so a source that comes back is no change", async () => {
  let list: unknown[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const s = setup({ exec: async () => ({ exitCode: 0, stdout: JSON.stringify(list) }) });
  await active(s, { name: "盯着发布", trigger: { kind: "condition", condition: "发布列表有变化", watch: { argv: ["gh", "release", "list", "--json", "tagName"], key: ["id"] }, everyMs: MIN }, brief: "说说发布有什么变化。" });
  s.clock.advance(MIN);
  await flush();
  list = [];
  s.clock.advance(MIN);
  await flush();
  const ask = s.log.read({ kinds: ["decision"] }).at(-1)!.body as Bodies["decision"];
  s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: ask.decisionId, option: "hold", by: "user" } });
  await flush();
  list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(0);
  list = [...list, { id: "d" }];
  s.clock.advance(MIN);
  await flush();
  expect(s.started()).toHaveLength(1);
  expect(s.briefs[0]).toContain("New: d");
});
