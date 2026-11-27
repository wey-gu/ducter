// D650 (research/245 §3.8): a Keep says when it ends, how long it has gone, and ends. Replays hel's
// five Keeps with their real `until` texts (fixtures/keeps-ends.ts), and a consumer's second shape:
// each end is read once into a testable sentence + look or noEnd; a rule, a no-end and a this-round
// ask are never an end; six unchanged rounds ask once in 待你处理; stop is an end; a budget pause is an
// ask in words with its number; the head's line is the newest round's, never an older one; a review
// standing dies with its round; and a scanned loop follows its current rhythm.
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, KeepBody, TaskLoopBody } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, type Core } from "../src/core.ts";
import { cleanTokensUp } from "../src/routines.ts";
import { keepEndAsk, type KeepEndAsk, type KeepRoundAsk } from "../src/keeps.ts";
import { tempDir, tick } from "./helpers.ts";
import { HEL_ENDS, NOW, seedEnds, seedHeldLoop, seedStall } from "./fixtures/keeps-ends.ts";


let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const flush = async () => {
  for (let i = 0; i < 60; i++) await tick();
};
const lookState = new Map<string, "open" | "merged" | "closed">();

/** The fake cheap model: each fixture's end as the real one would answer it (a rule is none). */
const fakeEnd: KeepEndAsk = async (w) => {
  const f = HEL_ENDS.find((x) => x.title === w.title);
  if (!f || f.expected.none || !f.expected.sentence || !f.expected.look) return { none: true };
  return { sentence: f.expected.sentence, look: f.expected.look as { kind: "pr"; ref: string; what: "merged" } };
};

function boot(dir: string, extra: { roundAsk?: KeepRoundAsk } = {}) {
  // The seeded Log is written with the real clock; start from now so a round appended later is newer.
  const clock = new FakeClock(Math.max(NOW, Date.now()));
  const core: Core = startCore({
    dataDir: dir,
    port: 0,
    batchMs: 5,
    clock,
    keeps: {
      endAsk: fakeEnd,
      endLook: async (ref) => lookState.get(ref) ?? "open",
      ...(extra.roundAsk ? { roundAsk: extra.roundAsk } : {}),
    },
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger: () => {} });
  stops.push(() => core.stop());
  return { core, clock };
}

const decisions = (core: Core) => core.log.read({ fromSeq: 0, limit: 100_000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]);
const keepOf = (core: Core, kind: "loop" | "routine" | "helper", id: string): KeepBody => {
  const k = core.keeps.all().find((x) => (kind === "loop" ? x.from.kind === "loop" && x.from.taskId === id : kind === "routine" ? x.from.kind === "routine" && x.from.routineId === id : x.from.kind === "helper" && x.from.helperId === id));
  if (!k) throw new Error(`no Keep for ${kind}:${id}`);
  return k;
};

describe("D650: ends are testable, or none", () => {
  test("hel's five real until texts and a consumer's shape are each classified; a rule is never an end", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    const { core } = boot(t.dir);
    await flush();
    for (const f of HEL_ENDS) {
      const k = keepOf(core, f.kind, f.id);
      if (f.expected.none) {
        expect(k.end?.said).toBe("none");
        expect(k.until).toBeUndefined();
        const sheet = core.keeps.sheets("default").find((x) => x.id === k.keepId)!;
        expect(sheet.noEnd).toBe(true);
        expect(sheet.end).toBeUndefined();
      } else {
        expect(k.end?.said).toBe("until");
        expect(k.until).toBe(f.expected.sentence);
        expect(k.end?.sentence).toBe(f.expected.sentence);
        expect(k.end?.look).toEqual(f.expected.look as never);
        const sheet = core.keeps.sheets("default").find((x) => x.id === k.keepId)!;
        expect(sheet.end).toEqual({ sentence: f.expected.sentence!, look: f.expected.look as never });
        expect(sheet.noEnd).toBeUndefined();
        expect(sheet.roundsRun).toBeGreaterThanOrEqual(0);
      }
    }
    // The 403 rule stays in the person's words (`said`), where every round reads it; it is not its end.
    expect(keepOf(core, "loop", "t_403").said).toContain("仅 Tide 批量合并");
    // The head's three facts: the end, the rounds, and since (the client draws 跑了 … from since).
    const k = keepOf(core, "loop", "t_11230");
    const sheet = core.keeps.sheets("default").find((x) => x.id === k.keepId)!;
    expect(sheet.end?.sentence).toBe("#11230 合并时结束");
    expect(typeof sheet.roundsRun).toBe("number");
    expect(sheet.since).toBe(k.createdAt);
  });

  test("the minute its look holds it ends, and the loop inside ends too", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    const { core } = boot(t.dir);
    await flush();
    const k = keepOf(core, "loop", "t_11230");
    lookState.set("nowledge-co/mem#11230", "merged");
    await core.keeps.checkEnds();
    await flush();
    expect(core.keeps.get(k.keepId)!.life).toBe("done");
    expect(core.keeps.get(k.keepId)!.met?.evidence).toBe("#11230 合并时结束");
    expect(core.work.loops.get("t_11230")!.state).toBe("ended");
    lookState.clear();
  });

  test("the prompt and parse: a rule or a one-round ask is none, an untestable sentence is none, a real ref is kept", async () => {
    const ask = (answer: unknown) => keepEndAsk(async () => ({ text: JSON.stringify(answer) }));
    expect(await ask({ none: true })({ title: "t", said: "仅 Tide 批量合并", brief: "" })).toEqual({ none: true });
    expect(await ask({ sentence: "每封邮件回完" })({ title: "t", said: "每封邮件回完", brief: "" })).toEqual({ none: true });
    expect(await ask({ sentence: "#11230 合并时结束", look: { kind: "pr", ref: "nowledge-co/mem#11230", what: "merged" } })({ title: "t", said: "", brief: "" })).toEqual({
      sentence: "#11230 合并时结束",
      look: { kind: "pr", ref: "nowledge-co/mem#11230", what: "merged" },
    });
    expect(await ask({ sentence: "到 12 月 20 日结束", look: { kind: "date", at: "2026-12-20" } })({ title: "t", said: "", brief: "" })).toEqual({ sentence: "到 12 月 20 日结束", look: { kind: "date", at: "2026-12-20T00:00:00.000Z" } });
  });
});

describe("D650: the stall ask, and six more rounds", () => {
  test("six unchanged rounds ask once in 待你处理, with End the default after a day and Six more rounds", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    seedStall(t.dir, "t_stall", Array(6).fill("没有新变化。"));
    const { core, clock } = boot(t.dir);
    await flush();
    const d = decisions(core).find((x) => x.keep?.ask === "stall" && x.keep.id === keepOf(core, "loop", "t_stall").keepId);
    expect(d).toBeTruthy();
    expect(d!.question).toContain(keepOf(core, "loop", "t_stall").title);
    expect(d!.question).toMatch(/6 (rounds|轮)/);
    expect(d!.question).toMatch(/End it\?|结束它吗/);
    expect(d!.goLabel).toMatch(/^(End|结束)$/);
    expect(d!.holdLabel).toMatch(/Six more rounds|再看 6 轮/);
    expect(d!.defaultOption).toBe("go");
    expect(Date.parse(d!.defaultAt!) - clock.now()).toBe(24 * 3_600_000);
    // The Keep stands in 待你处理 once, through the same open-ask list every surface counts.
    expect(core.tasks.onHand().openAsks!.ids).toContain(d!.decisionId);
    expect(core.keeps.sheets("default").find((x) => x.id === d!.keep!.id)!.asks).toBe(1);
    // A day later the default ends it, as the brief says.
    clock.advance(24 * 3_600_000);
    await flush();
    expect(core.keeps.get(d!.keep!.id)!.life).toBe("stopped");
  });


  test("a consumer's daily digest asks after six unchanged runs too", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    const log = (await import("../src/log.ts")).openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
    for (let n = 1; n <= 6; n++) {
      const id = `t_digest_${n}`;
      log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: "早上的邮件摘要", project: "", place: { kind: "none" }, harness: "codex", brief: "读邮件，写摘要。", language: "zh" } });
      log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: "done", residency: "cold" } });
      log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: "今天没有要你看的邮件。", questions: [], evidence: [] } });
      log.append({ stream: "routine:rt_digest", origin: "schedule", kind: "routine_run", body: { routineId: "rt_digest", runId: `d${n}`, scheduledFor: new Date(Date.now() - (7 - n) * 86_400_000).toISOString(), state: "started", taskId: id } });
      log.append({ stream: "routine:rt_digest", origin: "schedule", kind: "routine_run", body: { routineId: "rt_digest", runId: `d${n}`, scheduledFor: new Date(Date.now() - (7 - n) * 86_400_000).toISOString(), state: "done", taskId: id } });
    }
    log.close?.();
    const { core } = boot(t.dir);
    await flush();
    const id = keepOf(core, "routine", "rt_digest").keepId;
    const d = decisions(core).find((x) => x.keep?.ask === "stall" && x.keep.id === id);
    expect(d).toBeTruthy();
    expect(d!.question).toMatch(/6 (rounds|轮)/);
  });

  test("not after five unchanged rounds, and not after six that each changed", async () => {
    for (const [n, summaries] of [
      [5, Array(5).fill("没有新变化。")],
      [6, ["第 1 次：变了。", "第 2 次：又变了。", "第 3 次：变了。", "第 4 次：变了。", "第 5 次：变了。", "第 6 次：变了。"]],
    ] as const) {
      const t = tempDir();
      stops.push(t.cleanup);
      seedEnds(t.dir);
      seedStall(t.dir, "t_stall", [...summaries]);
      const { core } = boot(t.dir);
      await flush();
      expect(decisions(core).filter((x) => x.keep?.ask === "stall")).toHaveLength(0);
      void n;
    }
  });

  test("Six more rounds asks again only after six new rounds", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    seedStall(t.dir, "t_stall", Array(6).fill("没有新变化。"));
    const { core, clock } = boot(t.dir);
    await flush();
    const first = decisions(core).find((x) => x.keep?.ask === "stall")!;
    clock.advance(60_000);
    core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: first.decisionId, option: "hold", by: "user" } });
    await flush();
    const silent = (n: number) =>
      core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_more_${n}`, taskId: "t_stall", wakes: "task", reason: "#11230", state: "fired", at: new Date().toISOString() } as Bodies["waiter"] });
    for (let i = 0; i < 5; i++) silent(i);
    core.keeps.sync();
    expect(decisions(core).filter((x) => x.keep?.ask === "stall")).toHaveLength(1); // still the resolved one
    silent(5);
    core.keeps.sync();
    expect(decisions(core).filter((x) => x.keep?.ask === "stall")).toHaveLength(2);
  });
});

describe("D650: stop, the head's line, reviews and the rhythm", () => {
  test("stop is an end: the Keep is stopped, not paused", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    const { core } = boot(t.dir);
    await flush();
    const k = keepOf(core, "loop", "t_403");
    const r = await core.keeps.change(k.keepId, { act: { action: "stop" } }, { by: "you" });
    expect(r.ok).toBe(true);
    expect(core.keeps.get(k.keepId)!.life).toBe("stopped");
    expect(core.work.loops.get("t_403")!.state).toBe("ended");
    expect(core.keeps.get(k.keepId)!.pausedUntil).toBeUndefined();
  });

  test("the head's line is the newest round's own or its report's first sentence, never an older one", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    seedStall(t.dir, "t_line", ["没有新变化。", "还是没变化。"]);
    const { core } = boot(t.dir);
    await flush();
    const id = keepOf(core, "loop", "t_line").keepId;
    const page = core.keeps.page(id)!;
    expect(page.line?.text).toBe("还是没变化。");
    expect(page.line?.at).toBe(page.rounds[0]!.at);
    // A newer silent round: the head has no older line to borrow (hel's 22-hour-old 上一轮).
    core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_silent_new", taskId: "t_line", wakes: "task", reason: "#11230", state: "fired", at: new Date().toISOString() } as Bodies["waiter"] });
    core.keeps.sync();
    expect(core.keeps.page(id)!.line).toBeUndefined();
  });

  test("a failed line is retried at most 3 times, spaced; the third reading stands", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    seedStall(t.dir, "t_retry", ["第一次报告。"]);
    let calls = 0;
    const fakeRound: KeepRoundAsk = async () => {
      calls++;
      if (calls <= 2) throw new Error("the cheap model timed out");
      return { line: "读好了" };
    };
    const { core, clock } = boot(t.dir, { roundAsk: fakeRound });
    await flush();
    const id = keepOf(core, "loop", "t_retry").keepId;
    core.keeps.page(id);
    await flush();
    clock.advance(31_000);
    core.keeps.page(id);
    await flush();
    clock.advance(2 * 60_000);
    core.keeps.page(id);
    await flush();
    const lines = core.log.read({ fromSeq: 0, limit: 100_000, kinds: ["keep_round"] }).filter((e) => (e.body as Bodies["keep_round"]).keepId === id);
    expect(lines.filter((e) => (e.body as Bodies["keep_round"]).line).length).toBe(1);
    expect(lines.filter((e) => (e.body as Bodies["keep_round"]).failed).length).toBe(2);
    expect(core.keeps.page(id)!.rounds[0]!.did).toBe("读好了");
    expect(calls).toBe(3);
  });

  test("a review standing belongs only to a review Keep and expires with its round", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    // A review task: the partner said needs.reviews at open, its round called review_report, then it woke again.
    const log = (await import("../src/log.ts")).openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
    log.append({ stream: "task:t_rev2", origin: "partner", kind: "task_open", body: { taskId: "t_rev2", title: "Review the queue", project: "", place: { kind: "none" }, harness: "codex", brief: "每 30 分钟 review 一轮。", needs: { reviews: true } } as never });
    log.append({ stream: "task:t_rev2", origin: "system", kind: "task_state", body: { taskId: "t_rev2", attention: "blocked", residency: "cold" } });
    log.append({ stream: "task:t_rev2", origin: "system", kind: "task_loop", body: { taskId: "t_rev2", state: "on", reason: "review", everyMs: 30 * 60_000, rhythmBy: "task", since: new Date(Date.now() - 600_000).toISOString(), by: "brief" } as TaskLoopBody });
    log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_rev2_1", taskId: "t_rev2", wakes: "task", reason: "review", state: "fired", at: new Date().toISOString() } as Bodies["waiter"] });
    log.append({ stream: "task:t_rev2", origin: "task", kind: "task_event", body: { taskId: "t_rev2", role: "tool", tool: { name: "review_report", input: { prs: [{ ref: "nowledge-co/mem#1", changed: true }] } } } as never });
    log.append({ stream: "task:t_rev2", origin: "task", kind: "report", body: { taskId: "t_rev2", state: "done", summary: "1 个请求在等你看。", questions: [], evidence: [] } });
    log.close?.();
    const { core, clock } = boot(t.dir);
    await flush();
    const sheet = core.keeps.sheets("default").find((x) => x.id === keepOf(core, "loop", "t_rev2").keepId)!;
    expect(sheet.reviews?.waiting).toBe(1);
    // A new round: the old standing expires (it belonged to the last round).
    clock.advance(60_000);
    core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_rev2_2", taskId: "t_rev2", wakes: "task", reason: "review", state: "fired", at: new Date().toISOString() } as Bodies["waiter"] });
    core.keeps.sync();
    expect(core.keeps.sheets("default").find((x) => x.id === keepOf(core, "loop", "t_rev2").keepId)!.reviews).toBeUndefined();
    // A reviewed PR is never owned, even when a report names it.
    core.work.owned.reviewed("t_rev2", ["nowledge-co/mem#1"]);
    await flush();
    expect(core.work.owned.of("t_rev2")).not.toContain("nowledge-co/mem#1");
  });

  test("a loop's Keep follows its current rhythm, not the first one", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    seedStall(t.dir, "t_rhythm", ["看过。"]);
    const { core } = boot(t.dir);
    await flush();
    const id = keepOf(core, "loop", "t_rhythm").keepId;
    expect(core.keeps.get(id)!.wakes).toEqual([{ kind: "every", everyMs: 10 * 60_000 }]);
    core.work.loops.every("t_rhythm", 60, "user");
    await flush();
    expect(core.keeps.get(id)!.wakes).toEqual([{ kind: "every", everyMs: 60 * 60_000 }]);
  });

  test("a helper's held task never gets its own loop Keep (B6)", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    seedHeldLoop(t.dir, "t_held", "nowledge-mem-pr-babysitter");
    const { core } = boot(t.dir);
    await flush();
    expect(core.keeps.all().some((k) => k.from.kind === "loop" && k.from.taskId === "t_held")).toBe(false);
    const held = core.keeps.ofTask("t_held");
    expect(held).toBeTruthy();
    expect(core.keeps.get(held!.id)!.from.kind).toBe("helper");
  });
});

describe("D650: the budget pause is an ask in words, with its number", () => {
  test("an offered budget is a clean two-significant-figure number, up", () => {
    expect(cleanTokensUp(10_538_604)).toBe(11_000_000);
    expect(cleanTokensUp(1_200_000)).toBe(1_200_000);
    expect(cleanTokensUp(950_000)).toBe(950_000);
    expect(cleanTokensUp(2_000_000)).toBe(2_000_000);
  });

  test("a routine paused for the month asks once, counts as needs-you, and Go raises the cap", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedEnds(t.dir);
    const { core } = boot(t.dir);
    await flush();
    const d = decisions(core).find((x) => x.budget);
    expect(d).toBeTruthy();
    expect(d!.question).toMatch(/used|usage|用量/);
    expect(d!.question).toContain("自动 PR 评审");
    expect(d!.question).toContain("2M");
    expect(d!.question).toContain("11M");
    expect(d!.question).not.toContain("budget");
    expect(d!.goLabel).toMatch(/Raise it to 11M|放宽到 11M/);
    expect(d!.holdLabel).toBe("先这样");
    expect(d!.defaultOption).toBe("hold");
    // Counted needs-you through the one open list, and the Keep's sheet says why in words.
    expect(core.tasks.onHand().openAsks!.ids).toContain(d!.decisionId);
    const k = keepOf(core, "routine", "rt_review");
    const sheet = core.keeps.sheets("default").find((x) => x.id === k.keepId)!;
    expect(sheet.asks).toBeGreaterThanOrEqual(1);
    expect(sheet.pausedWhy).toMatch(/used up|用量/);
    // No raw reason code reaches a card: not the sheet, not the page, not a skipped round's line.
    const page = core.keeps.page(k.keepId)!;
    expect(JSON.stringify({ sheet, page })).not.toContain("budget");
    expect(page.rounds.some((r) => /used up|用量/.test(r.did ?? ""))).toBe(true);
    // Go: the month is raised, the per-run cap stays within it, and it runs on its usual times again.
    core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: d!.decisionId, option: "go", by: "user" } });
    await flush();
    const r = core.work.routines.get("rt_review")!;
    expect(r.state).toBe("active");
    expect(r.budget.monthTokens).toBeGreaterThan(2_000_000);
    expect(r.budget.perRunTokens ?? 0).toBeLessThanOrEqual(r.budget.monthTokens);
  });
});
