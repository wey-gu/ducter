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

  test("a fresh stop is stopped; after half an hour it is the person's", () => {
    const fresh = { ...TM, attention: "blocked" as const, prs: undefined, lastReport: undefined, updatedAt: new Date(now - 5 * 60_000).toISOString() };
    expect(truthOf({ now, card: fresh }).state).toBe("stopped");
    const old = { ...fresh, updatedAt: new Date(now - 40 * 60_000).toISOString() };
    expect(truthOf({ now, card: old }).state).toBe("needs_you");
  });
});
