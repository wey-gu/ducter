// D661 (research/245 §3.3): hel's 15:18 board through the one state. Each card's derived state
// and waitsFor is asserted; the paused routine counts as needs-you; the counts come from the same
// list the web and the Mac read.
import { describe, expect, test } from "bun:test";
import { countsOfTruth, onHandTruth, truthOf } from "../src/truth.ts";
import { HEL_CARDS, JX, KEEPS, PR, TM, ZQ } from "./fixtures/hel-board.ts";

const now = Date.parse("2026-11-27T15:18:00Z");
const truthOfHel = () =>
  onHandTruth({
    now,
    day: "2026-11-27",
    tasks: HEL_CARDS,
    keeps: KEEPS,
    waiterOf: (id) => (id === "tmqpewpk" ? { reason: "#11230 的 CI", nextLookAt: new Date(now + 5 * 60_000).toISOString(), at: new Date(now + 5 * 60_000).toISOString(), check: {} as never } : undefined),
    bridgeOf: () => undefined,
    subjectOf: () => undefined,
    mendingOf: () => false,
    asOf: 100,
  });

describe("D661: one state per task, derived once", () => {
  test("zqcpawnf waited on the person: needs_you with the closed card's question", () => {
    const t = truthOf({ now, card: ZQ });
    expect(t.state).toBe("needs_you");
    expect(t.waitsFor).toContain("这个任务停下吗");
    const all = truthOfHel();
    expect(all.needsYou.map((x) => x.taskId)).toContain("zqcpawnf");
  });

  test("jxikmjm9 was in a turn: working, never needs-you because a Keep holds it", () => {
    const t = truthOf({ now, card: JX, keepItem: KEEPS[0]!.items[0]! });
    expect(t.state).toBe("working");
    expect(truthOfHel().working.map((x) => x.taskId)).toContain("jxikmjm9");
  });

  test("tmqpewpk waits on #11230's CI: waiting, with the named thing", () => {
    const t = truthOf({ now, card: TM, waiter: { reason: "#11230 的 CI", nextLookAt: new Date(now + 5 * 60_000).toISOString(), at: new Date(now + 5 * 60_000).toISOString(), check: {} as never } });
    expect(t.state).toBe("waiting");
    expect(t.wait?.name).toContain("#11230");
    const item = truthOfHel().waiting.find((x) => x.taskId === "tmqpewpk");
    expect(item).toBeTruthy();
  });

  test("4rg2ebi7's GitHub read was blind for hours: needs_you with its fix", () => {
    const t = truthOf({ now, card: PR, keepItem: KEEPS[1]!.items[0]! });
    expect(t.state).toBe("needs_you");
    expect(t.waitsFor).toContain("看不到 GitHub");
    expect(t.waitsFor).toContain("haswell");
    expect(t.wait?.blind).toBe(true);
    expect(t.wait?.fix).toContain("gh");
  });

  test("the review routine paused by the budget is needs-you through the same function", () => {
    const all = truthOfHel();
    const k = all.needsYou.find((x) => x.keepId === "kp_16a8a15d65");
    expect(k).toBeTruthy();
    expect(k!.waitsFor).toContain("用量");
  });

  test("the four counts are the truth's, the same lists every surface reads", () => {
    const all = truthOfHel();
    expect(countsOfTruth(all)).toEqual({ needs_you: 3, working: 1, waiting: 1, done_today: 0 });
    expect(all.needsYou.map((x) => x.taskId).filter(Boolean).sort()).toEqual(["4rg2ebi7", "zqcpawnf"]);
  });

  test("a task told to wait stays needs_you while the question is open; a delivered turn moves it", () => {
    expect(truthOf({ now, card: ZQ }).state).toBe("needs_you");
    // The answer delivered and a turn running: the question is gone from the card (its decision
    // resolved, no waitsFor) and the turn is the fact that moves it.
    const answered = { ...ZQ, attention: "working" as const, residency: "hot" as const, pendingDecision: undefined, pendingDecisionId: undefined, waitsFor: undefined, lastReport: { taskId: "zqcpawnf", state: "progress" as const, summary: "接着做了。", questions: [], evidence: [] } };
    expect(truthOf({ now, card: answered }).state).toBe("working");
  });

  test("a turn that ended leaves working at once: a stale working/warm card is not working", () => {
    const stale = { ...JX, attention: "working" as const, residency: "warm" as const, updatedAt: new Date(now - 2 * 60_000).toISOString() };
    expect(truthOf({ now, card: stale }).state).toBe("stopped");
  });

  test("a task in rounds between rounds waits on the next round, never a stop", () => {
    const loop = { ...TM, attention: "blocked" as const, prs: undefined, lastReport: undefined, waiter: undefined, rounds: { nextAt: new Date(now + 10 * 60_000).toISOString() } };
    const t = truthOf({ now, card: loop });
    expect(t.state).toBe("waiting");
    expect(t.wait?.back).toBe(loop.rounds.nextAt);
  });

  test("an offer is not a question: it never makes a task needs-you", () => {
    const offer = { ...TM, attention: "blocked" as const, prs: undefined, lastReport: undefined, pendingDecision: { ...ZQ.pendingDecision!, offer: true } };
    expect(truthOf({ now, card: offer }).state).not.toBe("needs_you");
  });

  test("every needs-you line names its object, never a bare choice", () => {
    // A generic real question gets the task's title first.
    const generic = { ...ZQ, pendingDecision: { ...ZQ.pendingDecision!, question: "要合并吗？" } };
    const g = truthOf({ now, card: generic });
    expect(g.needs).toBe("question");
    expect(g.waitsFor).toContain("核对数据迁移设计");
    // A Keep's held item names the Keep.
    const k = truthOf({ now, card: JX, keepItem: { taskId: JX.taskId, at: "you", yours: "要合并吗？" }, keepName: "PR Babysitter" });
    expect(k.needs).toBe("keep");
    expect(k.waitsFor).toContain("PR Babysitter");
    // A finished task's ready PR names the PR.
    const ready = { ...JX, attention: "done" as const, prs: [{ pr: "nowledge-co/mem#11230", url: "https://github.com/nowledge-co/mem/pull/11230", state: "open" as const, at: new Date(now - 60_000).toISOString(), standing: { at: new Date(now - 60_000).toISOString(), approvedBy: ["wey-gu"], checks: { total: 2, passed: 2, failed: [], pending: [] } } }] };
    const r = truthOf({ now, card: ready });
    expect(r.needs).toBe("ready");
    expect(r.waitsFor).toContain("#11230");
    // A blind GitHub read names the computer and the fix.
    const b = truthOf({ now, card: PR });
    expect(b.needs).toBe("blind");
    expect(b.waitsFor).toContain("haswell");
    expect(b.waitsFor).toContain("gh");
  });

  test("a paused routine and a call name their own objects too", () => {
    const all = onHandTruth({
      now,
      day: "2026-11-27",
      tasks: [],
      keeps: [{ id: "kp_r", title: "自动 PR 评审", life: "paused", pausedBy: "system", pausedWhy: "「自动 PR 评审」这个月的用量到了上限（20M）。要放宽吗？", routineId: "rt_r" }],
      calls: [{ callId: "c1", state: "question", name: "Sushi Saito" }],
    });
    const routine = all.needsYou.find((x) => x.routineId === "rt_r");
    expect(routine?.needs).toBe("routine");
    expect(routine?.waitsFor).toContain("自动 PR 评审");
    const call = all.needsYou.find((x) => x.callId === "c1");
    expect(call?.needs).toBe("question");
    expect(call?.waitsFor).toContain("Sushi Saito");
  });

  test("a fresh stop is stopped; after half an hour it is the person's, with the fact and no bare question", () => {
    const fresh = { ...TM, attention: "blocked" as const, prs: undefined, lastReport: undefined, updatedAt: new Date(now - 5 * 60_000).toISOString() };
    expect(truthOf({ now, card: fresh }).state).toBe("stopped");
    const old = { ...fresh, title: "核对数据迁移设计", updatedAt: new Date(now - 40 * 60_000).toISOString(), waitsFor: "这个任务停下吗？" };
    const t = truthOf({ now, card: old });
    expect(t.state).toBe("needs_you");
    expect(t.needs).toBe("stopped");
    expect(t.waitsFor).toBe("它停下了，没说在等什么。"); // the time is the row's right edge, never twice
    expect(t.waitsFor).not.toContain("停下吗");
  });
});
