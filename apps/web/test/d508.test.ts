// D508: a task whose result is an open PR is not done. The author's 今天做完 on 2026-11-24: three
// GitHub-issue tasks each opened a draft PR and stood as done, 合进 main and 开草稿 PR offered on
// hover over the time. Now such a task waits under its PR's state (ready to merge: in 等你 with 到
// GitHub 合并), only a merged one is done, and no local merge or new draft PR is offered while a PR
// holds the branch. The Mac's onhand_d508_test.go checks the same.
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const at = new Date(now - 60_000).toISOString();
const repo = { kind: "repo", repoPath: "/r/mem", branch: "ducter/fix-graph", baseBranch: "main" };
const card = (id: string, prs?: unknown[], extra: Record<string, unknown> = {}) => ({
  taskId: id,
  persona: "default",
  title: `Fix graph error response for ${id}`,
  place: repo,
  harness: "codex",
  attention: "done",
  residency: "cold",
  openedAt: at,
  updatedAt: at,
  ...(prs ? { prs } : {}),
  ...extra,
});
const pr = (n: number, state: string, standing?: unknown) => ({ pr: `nowledge-co/mem#${n}`, url: `https://github.com/nowledge-co/mem/pull/${n}`, state, at, ...(standing ? { standing } : {}) });

async function board(tasks: unknown[]) {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const p = await import("../src/onhand-pr.tsx");
  const { Store } = await import("../src/store.ts");
  A.S = new Store();
  A.L = strings("zh");
  A.send = () => {};
  A.S.welcomed = true;
  A.receive({ t: "on_hand", onHand: { tasks, counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters, missed: [] } } as any);
  return { A, o, p };
}
const waiters: unknown[] = [];

describe("a finished task stands under its PR (D508)", () => {
  test("waiting on CI or review waits; ready stands in 等你; merged is done; no PR is done", async () => {
    const { o, A } = await board([
      card("ci", [pr(11070, "open", { at, draft: true, checks: { total: 10, passed: 6, failed: [], pending: ["build", "lint", "tide", "e2e"] } })]),
      card("review", [pr(11071, "open", { at, awaiting: ["hawkingrei"], checks: { total: 10, passed: 9, failed: [], pending: ["tide"] } })]),
      card("ready", [pr(11072, "open", { at, approvedBy: ["hawkingrei"], checks: { total: 4, passed: 4, failed: [], pending: [] }, merge: "clean" })]),
      card("merged", [pr(11073, "merged")]),
      card("plain"),
    ]);
    const parts = o.boardParts(o.lensLanes(""));
    expect(parts.ready.map((x) => x.id)).toEqual(["ready"]);
    expect(parts.waiting.map((x) => x.id).sort()).toEqual(["ci", "review"]);
    expect(parts.today.map((x) => x.id).sort()).toEqual(["merged", "plain"]);
    const n = o.stateCounts("");
    expect(n[0]).toBe(1);
    expect(n[2]).toBe(2);
    expect(n[3]).toBe(2);
    void A;
  });

  test("the row's line: the phase in plain words, its facts each their own", async () => {
    const { p, A } = await board([]);
    const task = (prs: unknown[]) => ({ id: "x", card: card("x", prs), events: [], evidence: [] }) as any;
    const said = (s: unknown) => p.prRowOf(task([pr(1, "open", s)]))!;
    const r = said({ at, awaiting: ["hawkingrei"], checks: { total: 10, passed: 9, failed: [], pending: ["tide"] } });
    expect(p.prWords(task([]), r.said)).toBe("在等评审");
    expect(p.prFacts(r.said)).toEqual(["等 hawkingrei 看", "CI 过了 9/10"]);
    const c = said({ at, changes: [{ id: "1", by: "hawkingrei", at, text: "add a test" }] });
    expect(p.prWords(task([]), c.said)).toBe("hawkingrei 要求修改");
    const ready = said({ at, approvedBy: ["hawkingrei"], checks: { total: 4, passed: 4, failed: [], pending: [] }, merge: "clean" });
    expect(ready.stands).toBe("needs");
    expect(p.prWords(task([]), ready.said)).toBe("可以合了");
    expect(p.prFacts(ready.said)).toEqual(["hawkingrei 通过了评审"]);
    // Never a " · " join: each fact its own element.
    for (const f of p.prFacts(r.said)) expect(f).not.toContain(" · ");
    void A;
  });

  test("no local merge or new draft PR once a PR holds the branch; without one they are in ⋯", async () => {
    const { o, A } = await board([card("haspr", [pr(11070, "open")], { changes: { adds: 321, dels: 46 } }), card("nopr", undefined, { changes: { adds: 3, dels: 1 } })]);
    const has = A.S.tasks.get("haspr")!;
    const none = A.S.tasks.get("nopr")!;
    (has as any).card.lastReport = { taskId: "haspr", state: "done", summary: "开了草稿 PR。", questions: [], evidence: [], branch: { commits: 2, uncommitted: false } };
    (none as any).card.lastReport = { taskId: "nopr", state: "done", summary: "改好了。", questions: [], evidence: [], branch: { commits: 2, uncommitted: false } };
    const { finishedMenu } = await import("../src/away.tsx");
    expect(finishedMenu(o.finishedOf(has)!)).toEqual(["open", "remove"]);
    const f = o.finishedOf(none)!;
    expect(finishedMenu(f)).toEqual(["merge", "open_pr", "open", "remove"]);
    expect(o.bulkOf(["haspr"]).merge).toEqual([]);
  });
});
