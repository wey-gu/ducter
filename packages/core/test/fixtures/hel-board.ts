// D661 (research/245 §1.1, §3.3): hel's 15:18 board as data, for the one state. The four cards
// the report names, their Keeps and the review routine paused by the month's budget. The tests read
// them through core/src/truth.ts (core/test/truth.test.ts) and through the holder index
// (core/test/holders.test.ts).
//
// The shape is the snapshot's, not the Log's: a task's attention, its open question, its PRs, a
// Keep's held item, a blind GitHub read, a paused routine. That is exactly what the one function
// may read.
import type { KeepSheet, TaskCard } from "@ducter/protocol";

const T = "2026-11-27T15:18:00Z";
const ago = (min: number) => new Date(Date.parse(T) - min * 60_000).toISOString();

const card = (o: Partial<TaskCard> & Pick<TaskCard, "taskId" | "title" | "attention">): TaskCard => ({
  persona: "default",
  project: "",
  place: { kind: "none" },
  harness: "codex",
  residency: "warm",
  openedAt: ago(180),
  updatedAt: ago(5),
  ...o,
});

/** `zqcpawnf`: told to wait for the person's answer after the bound issue had already closed. */
export const ZQ: TaskCard = card({
  taskId: "zqcpawnf",
  title: "核对数据迁移设计并补齐统一备份与恢复",
  attention: "working",
  residency: "parked",
  updatedAt: ago(25),
  pendingDecisionId: "d_closed",
  pendingDecision: {
    decisionId: "d_closed",
    taskId: "zqcpawnf",
    question: "nowledge-co/mem#10500 在 GitHub 上关掉了。这个任务停下吗？",
    goLabel: "停下",
    holdLabel: "接着做",
    defaultOption: "go",
    reversible: true,
    askedAt: ago(25),
  } as TaskCard["pendingDecision"],
  lastReport: { taskId: "zqcpawnf", state: "progress", summary: "I've paused as asked and am waiting for the user's answer on whether to stop.", questions: [], evidence: [] },
});

/** `jxikmjm9`: the helper's held item, really in a turn at 15:17–15:19, and one of #11230's holders. */
export const JX: TaskCard = card({
  taskId: "jxikmjm9",
  title: "独立复审远程访问设置并跟进 #11230",
  attention: "working",
  residency: "hot",
  updatedAt: ago(1),
  turnAt: ago(1),
  projectKey: "github.com/nowledge-co/mem",
  projectName: "mem",
  helper: { id: "nowledge-mem-pr-babysitter", name: "Nowledge Mem PR Babysitter" },
  keep: { id: "kp_c683e6dc3c", name: "Nowledge Mem PR Babysitter 随叫随到" },
  prs: [{ pr: "nowledge-co/mem#11230", url: "https://github.com/nowledge-co/mem/pull/11230", state: "open", at: ago(3), standing: { at: ago(3), checks: { total: 11, passed: 6, failed: [], pending: ["build"] }, awaiting: ["wey-gu"] } }],
  lastReport: { taskId: "jxikmjm9", state: "progress", summary: "#11230 的 Vitest 复审通过，等待当前提交的 CI 结果。", questions: [], evidence: [] },
});

/** `tmqpewpk`: truthful waiting on #11230's CI, the PR's author. */
export const TM: TaskCard = card({
  taskId: "tmqpewpk",
  title: "Refactor access anywhere setting page 等 2 个",
  attention: "blocked",
  harness: "antigravity",
  place: { kind: "repo", device: "mac", repoPath: "/Users/weyl/dev/nowledge-mem", branch: "ducter/access-anywhere", baseBranch: "main" },
  updatedAt: ago(9),
  projectKey: "github.com/nowledge-co/mem",
  projectName: "mem",
  reason: "report:blocked",
  prs: [{ pr: "nowledge-co/mem#11230", url: "https://github.com/nowledge-co/mem/pull/11230", state: "open", at: ago(2), standing: { at: ago(2), checks: { total: 11, passed: 6, failed: [], pending: ["build"] }, awaiting: ["wey-gu"] } }],
  lastReport: { taskId: "tmqpewpk", state: "blocked", summary: "留言发出去了；等 #11230 的 CI 结果。", questions: [], evidence: [] },
});

/** `4rg2ebi7`: the 45-minute loop on haswell, where no computer could read GitHub. */
export const PR: TaskCard = card({
  taskId: "4rg2ebi7",
  title: "修复 Mem 首次连接遇到 403 的体验（#11406）",
  attention: "blocked",
  residency: "parked",
  place: { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem", branch: "ducter/first-connect", baseBranch: "main" },
  updatedAt: ago(40),
  projectKey: "github.com/nowledge-co/mem",
  projectName: "mem",
  reason: "report:blocked",
  githubBlind: { since: ago(120), device: "haswell", home: "hel" },
  prs: [{ pr: "nowledge-co/mem#11408", url: "https://github.com/nowledge-co/mem/pull/11408", state: "open", at: ago(120) }],
  handoff: { id: "ho_pr", state: "unclaimed", item: { kind: "pr", ref: "nowledge-co/mem#11408", title: "fix(connectors): use the official CLI" }, sender: "4rg2ebi7", to: "Nowledge Mem PR Babysitter", givenAt: ago(120), at: ago(120) },
  lastReport: { taskId: "4rg2ebi7", state: "progress", summary: "首次连接修复已合并；官网改动还剩一项检查待完成", questions: [], evidence: [{ kind: "url", label: "PR #11408", ref: "https://github.com/nowledge-co/mem/pull/11408" }] },
});

/** The helper's Keep (it holds `jxikmjm9`), and the review routine paused by the budget. */
export const KEEPS: KeepSheet[] = [
  {
    id: "kp_c683e6dc3c",
    title: "Nowledge Mem PR Babysitter 随叫随到",
    persona: "default",
    life: "on",
    run: "perItem",
    wakes: [{ kind: "arrives" }],
    roundsRun: 149,
    items: [{ taskId: "jxikmjm9", title: "独立复审远程访问设置并跟进 #11230", at: "work", pr: "nowledge-co/mem#11230" }],
    taskIds: ["jxikmjm9"],
    asks: 0,
    week: 5,
    since: ago(60 * 24 * 3),
  } as KeepSheet,
  {
    id: "kp_32e13f1628",
    title: "修复 Mem 首次连接遇到 403 的体验（#11406）",
    persona: "default",
    life: "on",
    run: "same",
    wakes: [{ kind: "every", everyMs: 45 * 60_000 }],
    roundsRun: 74,
    items: [{ taskId: "4rg2ebi7", title: "修复 Mem 首次连接遇到 403 的体验（#11406）", at: "work", pr: "nowledge-co/mem#11408" }],
    taskIds: ["4rg2ebi7"],
    asks: 1,
    week: 24,
    since: ago(60 * 30),
  } as KeepSheet,
  {
    id: "kp_16a8a15d65",
    title: "nowledge-co 自动 PR 评审",
    persona: "default",
    life: "paused",
    pausedBy: "system",
    pausedWhy: "「nowledge-co 自动 PR 评审」这个月的用量到了上限（20M）。要放宽吗？",
    run: "fresh",
    wakes: [{ kind: "every", everyMs: 60 * 60_000 }],
    roundsRun: 1,
    items: [],
    taskIds: [],
    asks: 0,
    week: 1,
    since: ago(60 * 6),
  } as KeepSheet,
];

/** The 15:18 board's four cards. */
export const HEL_CARDS: TaskCard[] = [ZQ, JX, TM, PR];
