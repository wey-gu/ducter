// D661 (research/245 §3.3): the 15:18 board's shape as a demo core, for the shots and a live
// look. Four cards: one told to wait for the person while its attention still says working (the
// hel bug), one in a real turn held by a loop Keep, one waiting on #11230's CI, and the review
// routine Ducter paused for the month's budget. One PR, #11230, has two holders: the Keep item and
// the task that opened it.
//
//   DUCTER_PORT=7911 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-onestate.ts
//   DEMO_BEFORE=1 ... (the same core without the truth, so the fallback shows 在做 for a waiting
//   task and no needs-you; the after shots use the truth).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, RoutineBody, TaskLoopBody } from "@ducter/protocol";
import { openLog } from "../../packages/core/src/log.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const dataDir = process.env.DUCTER_DATA_DIR ?? mkdtempSync(join(tmpdir(), "ducter-onestate-"));
const fresh = process.env.DUCTER_DATA_DIR ? false : true;
if (!process.env.DUCTER_DATA_DIR) process.env.DUCTER_DATA_DIR = dataDir;
// One repository, three worktrees on three computers: the person's one project "mem" (D654).
writeFileSync(join(dataDir, "projects.json"), JSON.stringify({ version: 2, projects: [], names: {}, aliases: {
  "folder:mac:/Users/weyl/dev/nowledge-mem": "folder:local:/home/w/ducter/projects/mem",
  "folder:haswell:/home/w/ducter/projects/mem": "folder:local:/home/w/ducter/projects/mem",
}, hidden: [], pinned: [], order: [] }, null, 2));

const seed = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
const task = (id: string, title: string, brief: string, attention: Bodies["task_state"]["attention"], residency: Bodies["task_state"]["residency"], place: Bodies["task_open"]["place"] = { kind: "none" }) => {
  seed.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place, harness: "codex", brief, language: zh ? "zh" : "en" } });
  seed.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention, residency } });
};

// zqcpawnf: the person's answer was never delivered; its card still said working.
task("zqcpawnf", w("核对数据迁移设计并补齐统一备份与恢复", "Check the data-migration design and finish backup and restore"), w("核对 nowledge-co/mem#10500 的数据迁移设计。", "Check the data-migration design in nowledge-co/mem#10500."), "blocked", "warm");

// jxikmjm9: the helper's held item, really in a turn, one of #11230's two holders.
task("jxikmjm9", w("独立复审远程访问设置并跟进 #11230", "Re-review the access-anywhere setting and follow #11230"), w("等 #11230 的必需 CI 完成。", "Wait for #11230's required CI."), "working", "hot", { kind: "repo", device: "local", repoPath: "/home/w/ducter/projects/mem", branch: "ducter/review", baseBranch: "main" });
seed.append({ stream: `task:jxikmjm9`, origin: "system", kind: "task_loop", body: { taskId: "jxikmjm9", state: "on", reason: w("等 #11230 的必需 CI 完成", "waiting for #11230's required CI"), everyMs: 10 * MIN, rhythmBy: "rounds", since: iso(-3 * 24 * HOUR), by: "rounds" } as TaskLoopBody });

// tmqpewpk: truthful waiting on #11230's CI, the PR's author.
task("tmqpewpk", w("Refactor access anywhere setting page", "Refactor the access-anywhere setting page"), w("等 #11230 的 CI。", "Wait for #11230's CI."), "blocked", "warm", { kind: "repo", device: "mac", repoPath: "/Users/weyl/dev/nowledge-mem", branch: "ducter/access-anywhere", baseBranch: "main" });
seed.append({ stream: `task:tmqpewpk`, origin: "system", kind: "waiter", body: { waiterId: "w_11230", taskId: "tmqpewpk", state: "armed", reason: w("#11230 的检查", "#11230's checks"), at: iso(5 * MIN) } });
// Both carry #11230: the Keep's item and the task that opened it. The one holder index keeps the
// PR once, under the Keep item, with the author as an attribute.
const standing = { at: iso(-2 * MIN), title: w("远程访问设置重构", "Refactor the access-anywhere setting"), head: "352a5bf1", awaiting: ["wey-gu"], checks: { total: 11, passed: 6, failed: [], pending: ["build"] } };
seed.append({ stream: `task:jxikmjm9`, origin: "system", kind: "owned_news", body: { taskId: "jxikmjm9", pr: "nowledge-co/mem#11230", news: [], seen: { since: iso(-3 * MIN), state: "open", standing } } });
seed.append({ stream: `task:tmqpewpk`, origin: "system", kind: "owned_news", body: { taskId: "tmqpewpk", pr: "nowledge-co/mem#11230", news: [], seen: { since: iso(-2 * MIN), state: "open", standing } } });

// 4rg2ebi7: the 45-minute loop on haswell, waiting on #11408's checks; its hand-off to the
// Babysitter is an attribute on its own row.
task("4rg2ebi7", w("修复 Mem 首次连接遇到 403 的体验（#11406）", "Fix the 403 on Mem's first connection (#11406)"), w("每 45 分钟看一次 #11408。", "Look at #11408 every 45 minutes."), "blocked", "parked", { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem", branch: "ducter/first-connect", baseBranch: "main" });
// A plain waiting row (not a Keep): its hand-off is a holder attribute on the row.
seed.append({ stream: `task:4rg2ebi7`, origin: "system", kind: "waiter", body: { waiterId: "w_11408", taskId: "4rg2ebi7", state: "armed", reason: w("#11408 的检查", "#11408's checks"), at: iso(7 * MIN) } });
seed.append({ stream: `task:4rg2ebi7`, origin: "system", kind: "owned_news", body: { taskId: "4rg2ebi7", pr: "nowledge-co/mem#11408", news: [], seen: { since: iso(-30 * HOUR), state: "open", standing: { at: iso(-4 * MIN), title: w("用官方 CLI 做首次连接", "Use the official CLI for first connect"), head: "a1b2c3d", checks: { total: 8, passed: 5, failed: [], pending: ["e2e"] } } } } });
seed.append({ stream: `task:4rg2ebi7`, origin: "system", kind: "handoff", body: { handoffId: "ho_11408", key: "task:4rg2ebi7|helper:nowledge-mem-pr-babysitter|pr:nowledge-co/mem#11408", from: { task: "4rg2ebi7", name: "Ducter" }, to: { helper: "nowledge-mem-pr-babysitter", name: "Nowledge Mem PR Babysitter" }, item: { kind: "pr", ref: "nowledge-co/mem#11408", title: w("用官方 CLI 做首次连接", "Use the official CLI for first connect") }, said: w("接手 #11408", "Take #11408"), state: "unclaimed", at: iso(-26 * HOUR), givenAt: iso(-26 * HOUR) } });

// The review routine Ducter paused for the month's budget: needs-you through the same function.
const r: RoutineBody = {
  routineId: "rt_review",
  name: w("nowledge-co 自动 PR 评审", "nowledge-co automatic PR reviews"),
  trigger: { kind: "time", every: "day", time: "09:00", zone: "personal", tz: "Asia/Shanghai" },
  triggerWords: w("每天 09:00 · 跟着你的时区", "Every day at 09:00, your time zone"),
  brief: w("每天评审 nowledge-co 里请我 review 的 PR。", "Review the PRs nowledge-co asks me for every day."),
  reports: "on_change",
  effect: "read_only",
  budget: { monthTokens: 20_000_000, perRunTokens: 5_000_000 },
  state: "paused",
  pausedBy: "system",
  pauseReason: "budget",
  createdAt: iso(-10 * 24 * HOUR),
  reviewAt: iso(20 * 24 * HOUR),
};
seed.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine", body: r });
seed.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine_run", body: { routineId: "rt_review", runId: "run_1", scheduledFor: iso(-20 * HOUR), state: "started", taskId: "t_run" } });
task("t_run", w("自动评审", "Automatic reviews"), r.brief, "done", "archived");
seed.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine_run", body: { routineId: "rt_review", runId: "run_1", scheduledFor: iso(-20 * HOUR), state: "done", taskId: "t_run", tokens: 5_269_302 } });
seed.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine_run", body: { routineId: "rt_review", runId: "run_2", scheduledFor: iso(-1 * HOUR), state: "skipped", reason: "budget" } });
seed.close?.();

const core = startCore({
  dataDir,
  port: Number(process.env.DUCTER_PORT ?? 7911),
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ version: "0.44.0" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0 } as never,
  // The demo's PR states are the seeded facts: never read the real github.com here.
  work: { holdingsEveryMs: 0, ownedEveryMs: 0 },
  // The row's one line is read by the cheap model in a real home; here it answers at once, so the
  // demo shows both the gist and the raw fallback (one report is left without a line).
  ...(process.env.DEMO_BEFORE ? { truth: false as const } : {}),
  ...(process.env.DEMO_BEFORE ? {} : { gists: {
    ask: async ({ report }) => {
      if (report.includes("403") || report.includes("官网")) return { line: w("首次连接修好了，在等 #11408 的结果。", "The first-connect fix is in; waiting on #11408.") };
      if (report.includes("Vitest")) return { line: w("复审通过了，在等 #11230 的检查。", "Review passed; waiting on #11230's checks.") };
      if (report.includes("留言")) return { line: w("等 #11230 的检查结果。", "Waiting on #11230's checks.") };
      if (report.includes("评审写好了")) return { line: w("评审写好了，5 个请求在等你。", "Reviews written; 5 requests wait for you.") };
      return { line: w("它说在等你的回答。", "It says it is waiting for your answer.") };
    },
  } }),
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

// The reports: new events, so the demo's cheap model reads each into the row's own line.
core.log.append({ stream: `task:zqcpawnf`, origin: "task", kind: "report", body: { taskId: "zqcpawnf", state: "progress", summary: w("我已经停下，等对方的回答。", "I've paused as asked and am waiting for the user's answer."), questions: [], evidence: [] } });
core.log.append({ stream: `task:jxikmjm9`, origin: "task", kind: "report", body: { taskId: "jxikmjm9", state: "progress", summary: w("#11230 的 Vitest 复审通过，等待当前提交的 CI 结果。", "#11230's Vitest review passed; waiting on the current commit's CI."), questions: [], evidence: [{ kind: "url", label: "PR #11230", ref: "https://github.com/nowledge-co/mem/pull/11230" }] } });
core.log.append({ stream: `task:tmqpewpk`, origin: "task", kind: "report", body: { taskId: "tmqpewpk", state: "blocked", summary: w("留言发出去了；等 #11230 的 CI 结果。", "The comment went out; waiting on #11230's CI."), questions: [], evidence: [] } });
core.log.append({ stream: `task:t_run`, origin: "task", kind: "report", body: { taskId: "t_run", state: "done", summary: w("评审写好了，5 个请求在等你。", "Reviews written; 5 requests wait for you."), questions: [], evidence: [] } });
core.log.append({ stream: `task:4rg2ebi7`, origin: "task", kind: "report", body: { taskId: "4rg2ebi7", state: "progress", summary: w("首次连接修复已合并；官网改动还剩一项检查待完成", "The first-connect fix merged; one website check is left."), questions: [], evidence: [{ kind: "url", label: "PR #11408", ref: "https://github.com/nowledge-co/mem/pull/11408" }] } });
// D645: it was told to wait for the person; the old card still says waiting, and no decision card
// is open. The one truth reads `waitsFor` and says needs-you. Appended after the runner's own
// start so it is the card's newest fact.
await Bun.sleep(80);
core.log.append({ stream: `task:zqcpawnf`, origin: "system", kind: "task_state", body: { taskId: "zqcpawnf", attention: "blocked", residency: "warm", waitsFor: w("这个任务停下吗？", "Should this task stop?") } });

const sync = core.keeps.sync();
console.log("[demo] keeps", sync, core.keeps.sheets("default").length);

console.log(`[demo] ${zh ? "zh" : "en"}${process.env.DEMO_BEFORE ? " before" : " after"} at http://127.0.0.1:${core.port}/app#onhand/full`);
process.on("SIGINT", async () => {
  await core.stop();
  if (fresh) rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
});
await new Promise(() => {});
