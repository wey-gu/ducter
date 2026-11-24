// D511: 照看 / Looking after. A home that held routines, tasks in rounds and helpers before Keeps starts
// with each of them a Keep, its life and its history, and nothing lost: the older records stay as
// they were (an older Ducter still reads them), a second start makes nothing twice, and whatever
// becomes standing work later is kept at once. Then the gestures and the partner's verbs over a Keep.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, KeepBody, OnHand, RoutineBody, ServerFrame, TaskCard, TaskLoopBody } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import type { KeepEndAsk, KeepRoundAsk } from "../src/keeps.ts";
import { tempDir } from "./helpers.ts";
import { seedOld } from "./fixtures/keeps-old.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** The fake cheap model: reads a Keep's end from its words as a model would, and counts each ask. */
const asked: string[] = [];
const fakeEnd: KeepEndAsk = async (w) => {
  asked.push(w.title);
  if (w.title === "Watch the nightly hawdb build") throw new Error("the model timed out");
  if (/babysitter/i.test(w.title)) return { until: "每个 PR 跟到能合并为止" };
  return {};
};

function boot(dir: string, roundAsk?: KeepRoundAsk) {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, keeps: { endAsk: fakeEnd, ...(roundAsk ? { roundAsk } : {}) },deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" } });
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
  return core;
}

const keepEvents = (core: Core) => core.log.read({ fromSeq: 0, limit: 100_000, kinds: ["keep"] });
const latest = <K extends "routine" | "task_loop">(core: Core, kind: K) => {
  const m = new Map<string, Bodies[K]>();
  for (const e of core.log.read({ fromSeq: 0, limit: 100_000, kinds: [kind] })) {
    const b = e.body as Bodies[K];
    m.set(kind === "routine" ? (b as RoutineBody).routineId : (b as TaskLoopBody).taskId, b);
  }
  return m;
};

describe("D511: the migration on start", () => {
  test("every loop, routine past its Go and helper becomes a Keep with its life, nothing older changed", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const helpersBefore = readFileSync(join(t.dir, "helpers.json"), "utf8");
    const core = boot(t.dir);
    const keeps = core.keeps!;
    const byFrom = (kind: string, id: string) => keeps.all().find((k) => (k.from.kind === "loop" ? k.from.taskId : k.from.kind === "routine" ? k.from.routineId : k.from.helperId) === id && k.from.kind === kind);

    // Loops (task_loop): run in the same task, rhythm or look as wakes; life from its state and who ended it.
    expect(byFrom("loop", "t_review")).toMatchObject({ run: "same", life: "on", made: "task_loop", wakes: [{ kind: "every", everyMs: 45 * 60_000 }], title: "持续评审 nowledge-co，并处理 100gle 分给你的待办" });
    expect(byFrom("loop", "t_review")!.said).toContain("每 45 分钟 review 一轮");
    expect(byFrom("loop", "t_fare")).toMatchObject({ life: "done", until: "我订了票", run: "same" });
    expect(byFrom("loop", "t_paused")).toMatchObject({ life: "paused", wakes: [{ kind: "every", everyMs: 120 * 60_000 }] });
    expect(byFrom("loop", "t_ended")).toMatchObject({ life: "stopped", wakes: [{ kind: "changes", words: "#10473" }] });
    // Routines: a fresh task each round; proposed and dismissed ones were never kept.
    expect(byFrom("routine", "rt_weekly")).toMatchObject({ run: "fresh", life: "on", made: "routine", wakes: [{ kind: "at", words: "每周一 09:00 · 跟着你的时区" }], title: "周报" });
    expect(byFrom("routine", "rt_watch")).toMatchObject({ life: "paused", wakes: [{ kind: "changes", words: "hawdb 的 nightly 挂了的时候" }] });
    expect(byFrom("routine", "rt_ended")).toMatchObject({ life: "stopped" });
    expect(byFrom("routine", "rt_prop")).toBeUndefined();
    expect(byFrom("routine", "rt_dism")).toBeUndefined();
    // Helpers (helpers.json): a task per item, woken by arrivals and its PRs' changes; its name the title.
    expect(byFrom("helper", "nowledge-mem-pr-babysitter")).toMatchObject({ run: "perItem", life: "on", made: "helpers.json", title: "Nowledge Mem PR Babysitter", wakes: [{ kind: "arrives" }, { kind: "changes" }] });
    expect(byFrom("helper", "docs-proofreader")).toMatchObject({ life: "stopped" });
    // Its end, read once by the (fake) cheap model from the person's words and recorded as its judgment.
    await Bun.sleep(30);
    expect(keeps.get(byFrom("helper", "nowledge-mem-pr-babysitter")!.keepId)).toMatchObject({ until: "每个 PR 跟到能合并为止", end: { said: "until" } });
    // Their words give no end: recorded as none, and the page says 没有终点.
    expect(keeps.get(byFrom("routine", "rt_weekly")!.keepId)).toMatchObject({ end: { said: "none" } });
    expect(keeps.get(byFrom("routine", "rt_weekly")!.keepId)!.until).toBeUndefined();
    expect(keeps.sheets("default").find((x) => x.title === "周报")!.noEnd).toBe(true);
    // The model failed: recorded, nothing said under 做到什么时候 (neither a goal nor 没有终点).
    const failed = keeps.sheets("default").find((x) => x.title === "Watch the nightly hawdb build")!;
    expect(keeps.get(failed.id)!.end?.said).toBe("failed");
    expect(failed.until).toBeUndefined();
    expect(failed.noEnd).toBeUndefined();
    // A goal the person stated (the fare's, D427's loop) is never asked about; an ended Keep neither.
    expect(asked).not.toContain("Docs proofreader");
    const askedFirst = asked.length;
    expect(askedFirst).toBeGreaterThan(0);
    expect(keeps.all()).toHaveLength(9);
    for (const k of keeps.all()) expect(k.migratedAt).toBeTruthy();

    // Nothing older changed: helpers.json byte for byte, every routine as it was, every loop's state.
    expect(readFileSync(join(t.dir, "helpers.json"), "utf8")).toBe(helpersBefore);
    const rs = latest(core, "routine");
    expect([...rs.values()].map((r) => `${r.routineId}:${r.state}`).sort()).toEqual(["rt_dism:dismissed", "rt_ended:ended", "rt_prop:proposed", "rt_watch:paused", "rt_weekly:active"]);
    const ls = latest(core, "task_loop");
    expect(ls.get("t_fare")).toMatchObject({ state: "ended", endedBy: "condition" });
    expect(ls.get("t_ended")).toMatchObject({ state: "ended", endedBy: "user" });
    expect(ls.get("t_paused")!.state).toBe("paused");

    // Its history: the rounds its mechanism already wrote.
    const review = keeps.page(byFrom("loop", "t_review")!.keepId)!;
    // D519: a report is the task's words to Ducter, kept for 看细节; the round's line is the model's (none here).
    expect(review.rounds.map((r) => [r.woke, r.spoke, r.report, r.did])).toEqual([
      ["time", "silent", "没有新的请求。", undefined],
      ["time", "asked", "上一轮：2 个有新提交已复审，7 个没变；2 份评审草稿等你看。", undefined],
      ["first", "silent", "第一轮：9 个请求在等你，7 个没变。", undefined],
    ]);
    expect(review.line).toBeUndefined();
    const weekly = keeps.page(byFrom("routine", "rt_weekly")!.keepId)!;
    expect(weekly.rounds.map((r) => [r.spoke, r.report])).toEqual([
      ["told", "周报草稿写好了：9 个 PR 合并。"],
      ["told", "周报草稿写好了：12 个 PR 合并。"],
    ]);
    const sitter = keeps.page(byFrom("helper", "nowledge-mem-pr-babysitter")!.keepId)!;
    expect(sitter.rounds.find((r) => r.woke === "arrival")).toMatchObject({ wokeWhat: "Codex", did: "自定义 provider 切到 Embedding 时只留一个模型", taskId: "t_pr11030" });
    expect(sitter.address).toMatchObject({ name: "Nowledge Mem PR Babysitter", mem: "ready" });
    expect(sitter.items.map((x) => x.taskId)).toEqual(["t_pr11030"]);
    await core.stop();

    // A second start: nothing made twice, nothing written.
    const again = boot(t.dir);
    stops.push(() => again.stop());
    const before = keepEvents(again).length;
    expect(again.keeps!.all()).toHaveLength(9);
    again.keeps!.sync();
    await Bun.sleep(30);
    expect(keepEvents(again).length).toBe(before);
    // Asked once per Keep, never again (a failed ask included: it says nothing rather than guess).
    expect(asked.length).toBe(askedFirst);
  });

  test("On hand: each Keep on or paused is a sheet under 看守中, and its tasks name it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const frames: ServerFrame[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    stops.push(() => ws.close());
    ws.send(JSON.stringify({ t: "hello" }));
    const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean): Promise<T> => {
      for (let i = 0; i < 300; i++) {
        const hit = [...frames].reverse().find(pred);
        if (hit) return hit as T;
        await Bun.sleep(10);
      }
      throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
    };
    const oh = (await until<Extract<ServerFrame, { t: "on_hand" }>>((f) => f.t === "on_hand")).onHand as OnHand;
    expect(oh.keeps!.map((k) => [k.title, k.life]).sort()).toEqual([
      ["Nowledge Mem PR Babysitter", "on"],
      ["Watch the nightly hawdb build", "paused"],
      ["hawdb nightly", "paused"],
      ["周报", "on"],
      ["持续评审 nowledge-co，并处理 100gle 分给你的待办", "on"],
    ]);
    const review = oh.keeps!.find((k) => k.run === "same" && k.life === "on")!;
    expect(review.taskIds).toEqual(["t_review"]);
    expect(oh.tasks.find((c) => c.taskId === "t_review")?.keep).toEqual({ id: review.id, name: review.title });
    expect(oh.tasks.find((c) => c.taskId === "t_pr11030")?.keep?.name).toBe("Nowledge Mem PR Babysitter");
    // A Keep's rounds are its own: the weekly report's two runs stand under it (never rows in 今天做完),
    // name it, and Past's list leaves them out (words still find them).
    const weekly = oh.keeps!.find((k) => k.run === "fresh" && k.life === "on")!;
    expect(weekly.taskIds).toEqual(expect.arrayContaining(["t_week1", "t_week2"]));
    expect(oh.tasks.find((c) => c.taskId === "t_week2")?.keep).toEqual({ id: weekly.id, name: "周报" });
    expect(core.keeps!.isRound("t_week1")).toBe(true);
    expect(core.keeps!.isRound("t_pr11030")).toBe(false); // an item a Keep opened stays its item
    ws.send(JSON.stringify({ t: "past", id: "p1", query: {} }));
    const past = await until<Extract<ServerFrame, { t: "past_result" }>>((f) => f.t === "past_result" && f.id === "p1");
    expect(past.items.map((i) => i.taskId)).not.toContain("t_week1");
    ws.send(JSON.stringify({ t: "past", id: "p2", query: { q: "周报" } }));
    const found = await until<Extract<ServerFrame, { t: "past_result" }>>((f) => f.t === "past_result" && f.id === "p2");
    expect(found.items.map((i) => i.taskId)).toContain("t_week1");

    // Its page, and a gesture: pause (the loop rests), resume.
    ws.send(JSON.stringify({ t: "keep", id: review.id }));
    const page = await until<Extract<ServerFrame, { t: "keep_result" }>>((f) => f.t === "keep_result" && f.id === review.id);
    expect(page.keep?.said).toContain("每 45 分钟");
    frames.length = 0;
    ws.send(JSON.stringify({ t: "keep_action", id: review.id, action: "pause" }));
    const paused = await until<Extract<ServerFrame, { t: "keep_result" }>>((f) => f.t === "keep_result" && f.id === review.id);
    expect(paused.keep?.life).toBe("paused");
    expect(core.work.loops.get("t_review")!.state).toBe("paused");
    frames.length = 0;
    ws.send(JSON.stringify({ t: "keep_action", id: review.id, action: "resume" }));
    const back = await until<Extract<ServerFrame, { t: "keep_result" }>>((f) => f.t === "keep_result" && f.id === review.id);
    expect(back.keep?.life).toBe("on");
    expect(core.work.loops.get("t_review")!.state).toBe("on");
  });
});

describe("D511: a Keep made, changed, stopped", () => {
  test("made from one sentence: on at once with its words, its card; changed; stopped", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const keeps = core.keeps!;
    const r = await keeps.make({
      title: "12 月 20 日上海飞东京的机票",
      said: "帮我盯一下 12 月 20 日上海飞东京的机票，降到 2000 以下告诉我，我订了就不用看了",
      brief: "Look up the cheapest Shanghai to Tokyo fare on Dec 20 and report it.",
      wake: { at: { kind: "time", every: "day", time: "08:00", zone: "personal", tz: "Asia/Shanghai" } },
      until: "我订了这一天的票",
      speaks: "降到 ¥2,000 以下",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.keep).toMatchObject({ run: "fresh", life: "on", made: "keep_make", until: "我订了这一天的票", speaks: "降到 ¥2,000 以下" });
    expect(r.card).toMatchObject({ title: "12 月 20 日上海飞东京的机票", until: "我订了这一天的票", firstEver: true });
    const rt = core.work.routines.get((r.keep.from as { routineId: string }).routineId)!;
    expect(rt.state).toBe("active"); // no Go card: a Keep that only reads is on at once
    expect(rt.brief).toContain("我订了这一天的票");
    expect(core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).some((e) => (e.body as Bodies["decision"]).routineId === rt.routineId)).toBe(false);
    // Made once: the sync it set off makes no second Keep for its routine.
    keeps.sync();
    expect(keeps.all().filter((k) => k.from.kind === "routine")).toHaveLength(1);

    const c = await keeps.change(r.keep.keepId, { speaks: "降到 ¥1,800 以下", at: { kind: "time", every: "day", time: "07:30", zone: "personal", tz: "Asia/Shanghai" } });
    expect(c.ok && c.keep.speaks).toBe("降到 ¥1,800 以下");
    expect(core.work.routines.get(rt.routineId)!.trigger).toMatchObject({ time: "07:30" });

    const s = await keeps.change(r.keep.keepId, { act: { action: "stop" } });
    expect(s.ok && s.keep.life).toBe("stopped");
    expect(core.work.routines.get(rt.routineId)!.state).toBe("ended");
    expect(keeps.sheets("default").map((x) => x.id)).not.toContain(r.keep.keepId);
    expect(keeps.ended("default").map((x) => x.id)).toContain(r.keep.keepId);
    expect(keeps.say(r.keep.keepId)).toContain("is stopped");
  });

  test("a helper made as a Keep with an address; paused holds its address, resumed takes it up", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    const r = await core.keeps!.make({ title: "PR babysitter", said: "开个帮手，我的 agent 把 PR 交给它盯到能合并", brief: "Fix CI and reviews; never merge.", wake: { address: true }, until: "每个 PR 能合并" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.keep).toMatchObject({ run: "perItem", wakes: [{ kind: "arrives" }, { kind: "changes" }] });
    const h = core.helpers!.list()[0]!;
    expect(h.brief).toContain("每个 PR 能合并");
    expect((await core.keeps!.act(r.keep.keepId, { action: "pause" })).ok).toBe(true);
    expect(core.helpers!.get(h.id)!.state).toBe("stopped");
    expect(core.keeps!.get(r.keep.keepId)!.life).toBe("paused"); // not stopped: the person paused it
    expect((await core.keeps!.act(r.keep.keepId, { action: "resume" })).ok).toBe(true);
    expect(core.helpers!.get(h.id)!.state).toBe("on");
    expect(core.keeps!.get(r.keep.keepId)!.life).toBe("on");
  });

  test("a task that starts resting on its own wait after a wake is a Keep from that moment", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const core = boot(t.dir);
    stops.push(() => core.stop());
    core.log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "Review the queue", project: "", place: { kind: "none" }, harness: "codex", brief: "每 30 分钟看一次队列" } });
    core.tasks.setState("t1", "blocked", "cold");
    // The task rests on its own wait (its brief repeats): Ducter keeps the loop, and the loop is a Keep.
    core.waiters.arm({ reason: "the queue", taskId: "t1", at: new Date(Date.now() + 30 * 60_000).toISOString(), wakes: "task" });
    for (let i = 0; i < 100 && !core.work.loops.get("t1"); i++) await Bun.sleep(10);
    expect(core.work.loops.get("t1")).toBeTruthy();
    await Bun.sleep(20);
    const k = core.keeps!.all().find((x) => x.from.kind === "loop" && x.from.taskId === "t1") as KeepBody;
    expect(k).toMatchObject({ made: "task_loop", life: "on", run: "same" });
    expect(k.migratedAt).toBeUndefined();
  });
});

describe("D519: a Keep's page says what happened, to the person", () => {
  test("each round's line is the model's reading of its report, asked once and recorded; wakes with no report are rounds too", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const reads: string[] = [];
    // The fake cheap model: one plain line per report, as a model would write it to the person.
    const fakeRound: KeepRoundAsk = async (w) => {
      reads.push(w.report);
      if (w.report.includes("请 Ducter")) return { line: "发布端的授权已用上，例行检查照旧" };
      return { line: `读过：${[...w.report].slice(0, 6).join("")}` };
    };
    const core = boot(t.dir, fakeRound);
    const keeps = core.keeps!;
    const id = keeps.all().find((k) => k.from.kind === "loop" && k.from.taskId === "t_review")!.keepId;
    // Today's rounds as the home writes them (hel, 2026-11-24): its timer fires on the channel; one
    // round reported to Ducter in its own words, the next two said nothing at all.
    const fire = (n: number) => core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_today_${n}`, taskId: "t_review", wakes: "task", reason: "持续评审", state: "fired", at: new Date().toISOString() } as Bodies["waiter"] });
    fire(1);
    core.log.append({ stream: "task:t_review", origin: "task", kind: "report", body: { taskId: "t_review", state: "done", summary: "请 Ducter 在发布端应用用户对 #11024 的授权，无需再发确认卡。周期检查继续。", questions: [], evidence: [] } });
    fire(2);
    fire(3);
    // The PR its rounds keep open, named by GitHub's own title.
    core.log.append({ stream: "task:t_review", origin: "system", kind: "owned_news", body: { taskId: "t_review", pr: "nowledge-co/mem#11024", news: [], seen: { since: new Date().toISOString(), state: "open", standing: { at: new Date().toISOString(), title: "fix(release): sign the macOS build in CI" } } } });
    let page = keeps.page(id)!;
    for (let i = 0; i < 100 && page.rounds.filter((r) => r.did).length < 4; i++) await Bun.sleep(10), (page = keeps.page(id)!);
    // Newest first: the two silent wakes, then the round that reported (its line, its report behind 看细节).
    expect(page.rounds.slice(0, 3).map((r) => [r.woke, r.spoke, r.did, r.report])).toEqual([
      ["time", "silent", undefined, undefined],
      ["time", "silent", undefined, undefined],
      ["time", "silent", "发布端的授权已用上，例行检查照旧", "请 Ducter 在发布端应用用户对 #11024 的授权，无需再发确认卡。周期检查继续。"],
    ]);
    expect(page.rounds).toHaveLength(6);
    expect(page.rounds.slice(3).every((r) => r.did?.startsWith("读过："))).toBe(true);
    expect(page.line?.text).toBe("发布端的授权已用上，例行检查照旧");
    expect(page.lines).toBe(4);
    // What it holds: the PR, titled as itself; never the loop's own task under the Keep's title.
    expect(page.items.map((x) => [x.title, x.pr])).toEqual([["fix(release): sign the macOS build in CI", "nowledge-co/mem#11024"]]);
    expect(reads.filter((r) => /请 Ducter|一轮|没有新的请求/.test(r))).toHaveLength(4);
    keeps.page(id);
    await core.stop();
    // A second start: every line kept, none of its rounds read again (the other Keeps' newest are read once now).
    const again = boot(t.dir, fakeRound);
    stops.push(() => again.stop());
    const p2 = again.keeps!.page(id)!;
    await Bun.sleep(30);
    expect(p2.rounds.filter((r) => r.did).length).toBe(4);
    expect(reads.filter((r) => /请 Ducter|一轮|没有新的请求/.test(r))).toHaveLength(4);
  });
});
