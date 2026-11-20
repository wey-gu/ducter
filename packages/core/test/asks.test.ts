// D426: what one message asked for, line by line: lines added by the partner, ticked by each
// task's report (its `asks`, or the whole report), moved by a task's own state, and the hold: a
// single line's success while others work is not told to the partner; the last one wakes it with
// everything held. Fakes only: a scratch Log and registry.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { AsksBody, LogEvent } from "@ducter/protocol";
import { asksCount } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createAsks } from "../src/asks.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { startCore, type Core } from "../src/core.ts";
import { openTask, report, tempDir } from "./helpers.ts";

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.reverse()) c();
  cleanups = [];
});

function setup() {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-12T00:31:00+08:00"));
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const released: LogEvent[] = [];
  const woke: LogEvent[] = [];
  const asks = createAsks({ log, tasks, release: (evs) => released.push(...evs) });
  log.subscribe((e) => asks.onEvent(e));
  log.subscribe((e) => {
    if (e.kind === "report" && asks.wakes(e)) woke.push(e);
  });
  cleanups.push(() => {
    log.close?.();
    t.cleanup();
  });
  const msg = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "我下周有什么预约么 帮我在 gmail 日历记录我 20 号要去北京 agibar 参加一个分享，这个周日要去杭州 coscon 参加 bof，下周四要参加 Tabs 上海和组织者见面" } });
  const latest = () => log.read({ stream: "channel", kinds: ["asks"], limit: 50 }).at(-1)?.body as AsksBody | undefined;
  return { log, tasks, asks, msg, latest, released, woke };
}

test("one task, four lines: its report ticks each line by its own state, under the message", () => {
  const { log, asks, msg, latest, woke } = setup();
  openTask(log, "cal", "查看下周预约并记三项日历");
  asks.add(msg.seq, "cal", ["我下周有什么预约", "20 号北京 agibar 分享", "周日杭州 coscon BoF", "下周四 Tabs 上海见组织者"]);
  expect(latest()!.msgSeq).toBe(msg.seq);
  expect(latest()!.lines.map((l) => l.state)).toEqual(["working", "working", "working", "working"]);
  // A progress report ticks the look-up while it goes on (the person sees it at once).
  report(log, "cal", { state: "progress", asks: [{ state: "done", note: "下周三 10:00 看牙" }] });
  expect(latest()!.lines.map((l) => l.state)).toEqual(["done", "working", "working", "working"]);
  expect(latest()!.lines[0]!.note).toBe("下周三 10:00 看牙");
  // The browser blocks: two entries made, one waits for the person: each line says which.
  report(log, "cal", {
    state: "needs_input",
    summary: "两项记好了，周四那项要你定几点",
    asks: [{ state: "done" }, { state: "done", note: "记好了" }, { state: "done", note: "记好了" }, { state: "needs_input", note: "要你定一下几点" }],
  });
  expect(latest()!.lines.map((l) => l.state)).toEqual(["done", "done", "done", "needs_you"]);
  expect(asksCount(latest()!.lines)).toEqual({ done: 3, left: 1 });
  // One task for all of them: nothing to hold.
  expect(woke.length).toBe(2);
});

test("a report without asks moves every open line of its task; the task's own state too", () => {
  const { log, tasks, asks, msg, latest } = setup();
  openTask(log, "a");
  asks.add(msg.seq, "a", ["one", "two"]);
  tasks.setState("a", "needs_you", "hot");
  expect(latest()!.lines.map((l) => l.state)).toEqual(["needs_you", "needs_you"]);
  tasks.setState("a", "working", "hot");
  expect(latest()!.lines.map((l) => l.state)).toEqual(["working", "working"]);
  report(log, "a", { state: "failed", summary: "The browser closed." });
  expect(latest()!.lines.map((l) => l.state)).toEqual(["failed", "failed"]);
});

test("the hold: a line done while others work wakes no one; the last one wakes the partner with what was held", () => {
  const { log, asks, msg, latest, woke, released } = setup();
  for (const id of ["p", "n", "s"]) openTask(log, id);
  asks.add(msg.seq, "p", ["check the pricing page"]);
  asks.add(msg.seq, "n", ["write the release notes"]);
  asks.add(msg.seq, "s", ["update the status page"]);
  const first = report(log, "p", { state: "done", summary: "Two fixes on the pricing page." });
  expect(woke).toEqual([]);
  expect(latest()!.lines[0]!.state).toBe("done");
  // A failure is said at once, held successes stay held.
  report(log, "s", { state: "failed", summary: "No access to the status page." });
  expect(woke.map((e) => (e.body as { taskId: string }).taskId)).toEqual(["s"]);
  expect(released).toEqual([]);
  // The last line settles: what was held wakes with it.
  report(log, "n", { state: "done", summary: "Release notes written." });
  expect(released.map((e) => e.seq)).toEqual([first.seq]);
  expect(woke.map((e) => (e.body as { taskId: string }).taskId)).toEqual(["s", "n"]);
});

test("a held part's line takes its task when it opens; lines rebuild from the Log", () => {
  const { log, tasks, asks, msg } = setup();
  asks.add(msg.seq, "", ["the third part"], "k1");
  asks.heldOpened("k1", "t3");
  expect(asks.of(msg.seq)![0]!.taskId).toBe("t3");
  const again = createAsks({ log, tasks });
  expect(again.forTask("t3")!.msgSeq).toBe(msg.seq);
  expect(again.recent(1)[0]!.lines[0]!.words).toBe("the third part");
});

// D430: the hold is in the Log: a restart in the middle neither loses the close-out nor says it twice.
test("the hold across a restart: the held line is kept, the last one wakes it once, a second restart wakes nothing", () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  const clock = new FakeClock(Date.parse("2026-11-12T00:31:00+08:00"));
  const path = join(t.dir, "ducter.db");
  const boot = () => {
    const log = openLog({ path, persona: "default", clock });
    const tasks = createRegistry(log, clock);
    const released: LogEvent[] = [];
    const woke: LogEvent[] = [];
    const asks = createAsks({ log, tasks, release: (evs) => released.push(...evs) });
    log.subscribe((e) => asks.onEvent(e));
    log.subscribe((e) => {
      if (e.kind === "report" && asks.wakes(e)) woke.push(e);
    });
    return { log, asks, released, woke };
  };
  const a = boot();
  const msg = a.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "check the pricing page, write the release notes, update the status page" } });
  for (const id of ["p", "n", "s"]) openTask(a.log, id);
  a.asks.add(msg.seq, "p", ["check the pricing page"]);
  a.asks.add(msg.seq, "n", ["write the release notes"]);
  a.asks.add(msg.seq, "s", ["update the status page"]);
  const first = report(a.log, "p", { state: "done", summary: "Two fixes on the pricing page." });
  clock.advance(5 * 60_000);
  const second = report(a.log, "s", { state: "done", summary: "Status page updated." });
  expect(a.woke).toEqual([]);
  a.log.close?.();

  // Ducter restarts an hour later, in the middle: both successes are still held.
  clock.advance(60 * 60_000);
  const b = boot();
  expect(b.released).toEqual([]);
  report(b.log, "n", { state: "done", summary: "Release notes written." });
  expect(b.released.map((e) => e.seq)).toEqual([first.seq, second.seq]);
  expect(b.woke.map((e) => (e.body as { taskId: string }).taskId)).toEqual(["n"]);
  expect((b.log.read({ kinds: ["asks"], limit: 100 }).at(-1)!.body as AsksBody).holding).toBeUndefined();
  b.log.close?.();

  // Again: nothing is said twice.
  const c = boot();
  expect(c.released).toEqual([]);
  expect(c.asks.of(msg.seq)!.map((l) => l.state)).toEqual(["done", "done", "done"]);
  c.log.close?.();
});

test("stopped after the last line settled but before the release: it goes at start, once", () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  const clock = new FakeClock(Date.parse("2026-11-12T00:31:00+08:00"));
  const path = join(t.dir, "ducter.db");
  const log = openLog({ path, persona: "default", clock });
  const tasks = createRegistry(log, clock);
  const msg = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "a and b" } });
  openTask(log, "a");
  openTask(log, "b");
  const r = report(log, "a", { state: "done" });
  // The Log as a crash left it: a held report, and every line settled.
  log.append({ stream: "channel", origin: "system", kind: "asks", body: { msgSeq: msg.seq, lines: [{ words: "a", taskId: "a", state: "done" }, { words: "b", taskId: "b", state: "done" }], holding: [r.seq] } });
  const released: LogEvent[] = [];
  createAsks({ log, tasks, release: (evs) => released.push(...evs) });
  expect(released.map((e) => e.seq)).toEqual([r.seq]);
  const again: LogEvent[] = [];
  createAsks({ log, tasks, release: (evs) => again.push(...evs) });
  expect(again).toEqual([]);
  log.close?.();
});

test("the whole core across a restart: the partner hears the held success with the last one, once", async () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  const clock = new FakeClock(Date.parse("2026-11-12T00:31:00+08:00"));
  const start = () => {
    const core: Core = startCore({ dataDir: t.dir, port: 0, clock, defaultDelayMs: 60_000 });
    const woke: LogEvent[] = [];
    core.setPartner({ onTrigger: (e) => void woke.push(e) });
    return { core, woke };
  };
  const reports = (w: LogEvent[]) => w.filter((e) => e.kind === "report").map((e) => (e.body as { taskId: string }).taskId);
  const one = start();
  const msg = one.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "查一下定价页，再写发布说明" } });
  openTask(one.core.log, "p");
  openTask(one.core.log, "n");
  one.core.asks.add(msg.seq, "p", ["查一下定价页"]);
  one.core.asks.add(msg.seq, "n", ["写发布说明"]);
  report(one.core.log, "p", { state: "done", summary: "定价页两处改好了" });
  await Bun.sleep(5);
  expect(reports(one.woke)).toEqual([]);
  await one.core.stop();

  clock.advance(30 * 60_000);
  const two = start();
  await Bun.sleep(5);
  expect(reports(two.woke)).toEqual([]);
  report(two.core.log, "n", { state: "done", summary: "发布说明写好了" });
  await Bun.sleep(5);
  expect(reports(two.woke).sort()).toEqual(["n", "p"]);
  await two.core.stop();

  const three = start();
  await Bun.sleep(5);
  expect(reports(three.woke)).toEqual([]);
  await three.core.stop();
});

test("the count shows from four lines, once something is done, while something is left", () => {
  const l = (state: "working" | "done" | "needs_you" | "failed") => ({ words: "x", taskId: "t", state });
  expect(asksCount([l("done"), l("working"), l("working")])).toBeUndefined();
  expect(asksCount([l("working"), l("working"), l("working"), l("working")])).toBeUndefined();
  expect(asksCount([l("done"), l("failed"), l("working"), l("needs_you")])).toEqual({ done: 1, left: 2 });
  expect(asksCount([l("done"), l("failed"), l("done"), l("done")])).toBeUndefined();
});

// D443: a reply to a line that waits for the person answers its task's question (as a reply to the
// question card does, D236 (4)); a line that is still working stays words to the partner.
test("a reply to a waiting line is its task's answer; to a working line, words to the partner", async () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  const clock = new FakeClock(Date.parse("2026-11-12T00:31:00+08:00"));
  const core: Core = startCore({ dataDir: t.dir, port: 0, clock, defaultDelayMs: 60_000 });
  core.setPartner({ onTrigger() {} });
  const msg = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "记 20 号北京的分享，再查下周四的会" } });
  openTask(core.log, "cal");
  openTask(core.log, "look");
  core.asks.add(msg.seq, "cal", ["20 号北京的分享"]);
  core.asks.add(msg.seq, "look", ["下周四的会"]);
  report(core.log, "cal", { state: "needs_input", summary: "要你定几点", questions: [{ id: "q", text: "几点开始？", blocking: true, reversible: true }], asks: [{ state: "needs_input", note: "要你定一下几点" }] });
  await Bun.sleep(5);
  const q = core.decisions.pendingOf("cal");
  expect(q.length).toBe(1);
  const { logUserMessage } = await import("../src/reply.ts");
  const e = logUserMessage(core.log, core.decisions, { text: "下午两点", reply: { seq: msg.seq, ask: 0 } });
  expect(e.body.reply).toMatchObject({ ask: 0, taskIds: ["cal"], decisionId: q[0], answers: true });
  expect(core.decisions.isPending(q[0]!)).toBe(false);
  const r = core.log.read({ kinds: ["decision_resolved"], limit: 10 }).at(-1)!.body as { option: string; text: string };
  expect(r).toMatchObject({ option: "reply", text: "下午两点" });
  // The other line is still at work: a reply to it answers nothing.
  const w = logUserMessage(core.log, core.decisions, { text: "顺便看下地点", reply: { seq: msg.seq, ask: 1 } });
  expect(w.body.reply?.decisionId).toBeUndefined();
  expect(w.body.reply?.answers).toBeUndefined();
  await core.stop();
});
