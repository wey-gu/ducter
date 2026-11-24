// D511: copies of each older shape a home holds before Keeps, as a real home wrote them (the shapes of
// helpers.json, `task_loop`, `routine` and `routine_run`, `bridge_msg`; the data is hel's on 0.1.31,
// trimmed): the review loop every 45 minutes and the PR babysitter of D507's busy shape, a fare watched
// until booked (its loop ended by its condition), a paused loop, one ended by the person, and routines
// in every state. keeps-migration.test.ts starts a home over them and checks that each one became a
// Keep with its life and its history, and that none of the old records changed.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, RoutineBody, TaskLoopBody } from "@ducter/protocol";
import type { Helper } from "@ducter/protocol/src/helpers.ts";
import { openLog } from "../../src/log.ts";

const MIN = 60_000;
const T0 = Date.parse("2026-11-20T01:00:00Z");
const at = (min: number) => new Date(T0 + min * MIN).toISOString();

/** helpers.json as hel's home wrote it on 0.1.31 (D494/D507). */
export const HELPERS_JSON: { helpers: Helper[] } = {
  helpers: [
    {
      id: "nowledge-mem-pr-babysitter",
      name: "Nowledge Mem PR Babysitter",
      about: "做一个 Codex 的 loop agent，叫 Nowledge Mem PR babysitter，放在 Nowledge Bridge 里：我的 agent 把 PR 交给它，它修 CI 和评审意见，一直跟到能合并，再通过 Bridge 回话。",
      brief: "Each PR you are handed: fix CI and review comments, push, follow until it can merge. Never merge it yourself. Ask before commenting /test where others see it.",
      persona: "default",
      agentId: "ducter-helper-nowledge-mem-pr-babysitter",
      state: "on",
      createdAt: at(-60 * 24 * 3),
      link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hel", connectionId: "conn_7f2a", spaceId: "space_default" },
      mem: "ready",
      said: "ready",
    },
    {
      id: "docs-proofreader",
      name: "Docs proofreader",
      about: "Docs PRs my agents open: proofread them",
      brief: "Proofread the docs PR; suggest, never push.",
      persona: "default",
      agentId: "ducter-helper-docs-proofreader",
      state: "stopped",
      createdAt: at(-60 * 24 * 9),
      mem: "ready",
    },
  ],
};

const REVIEW = "持续评审 nowledge-co，并处理 100gle 分给你的待办";

/** The older records, written into the home's Log and data folder (no Keep yet). */
export function seedOld(dataDir: string): { tasks: string[]; routines: string[]; helpers: string[] } {
  writeFileSync(join(dataDir, "helpers.json"), JSON.stringify(HELPERS_JSON, null, 2) + "\n", { mode: 0o600 });
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  const task = (taskId: string, title: string, brief: string, attention: Bodies["task_state"]["attention"]) => {
    log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "nowledge-co", place: { kind: "none" }, harness: "codex", brief } });
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency: "cold" } });
  };
  const loop = (b: TaskLoopBody) => log.append({ stream: `task:${b.taskId}`, origin: "system", kind: "task_loop", body: b });
  const wake = (taskId: string, n: number, reason: string, kind?: "check") =>
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "waiter", body: { waiterId: `w_${taskId}_${n}`, taskId, wakes: "task", reason, state: "fired", at: at(n * 45), ...(kind ? { kind, check: { argv: ["gh", "pr", "view"], path: "state", equals: "MERGED" } } : {}) } as Bodies["waiter"] });
  const report = (taskId: string, state: Bodies["report"]["state"], summary: string) => log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, questions: [], evidence: [] } });

  // The review loop (D498): every 45 minutes, three rounds; the second drafted reviews and asked.
  task("t_review", REVIEW, "每 45 分钟 review 一轮 nowledge-co 的 PR，并处理 100gle 分给你的待办；评审先写成草稿，发之前问我。", "blocked");
  loop({ taskId: "t_review", state: "on", reason: REVIEW, everyMs: 45 * MIN, rhythmBy: "task", since: at(0), by: "brief" });
  report("t_review", "done", "第一轮：9 个请求在等你，7 个没变。");
  wake("t_review", 1, REVIEW);
  log.append({ stream: `task:t_review`, origin: "task", kind: "decision", body: { decisionId: "d_rev2", taskId: "t_review", question: "2 份评审写好了，发到 GitHub?", goLabel: "发出去", defaultOption: "hold", reversible: false } });
  report("t_review", "done", "上一轮：2 个有新提交已复审，7 个没变；2 份评审草稿等你看。");
  wake("t_review", 2, REVIEW);
  report("t_review", "done", "没有新的请求。");

  // A fare watched every morning until booked: its loop ended by its condition (done).
  task("t_fare", "12 月 20 日上海飞东京的机票", "每天早上看一次 12 月 20 日上海飞东京的票价，降到 ¥2,000 以下告诉我，直到我订了票。", "done");
  loop({ taskId: "t_fare", state: "ended", reason: "看票价", everyMs: 24 * 60 * MIN, since: at(-60 * 24 * 5), by: "brief", until: "我订了票", endedBy: "condition" });
  report("t_fare", "done", "今早 ¥2,180，你订了东航的票。");

  // A loop the person paused, and one they ended.
  task("t_paused", "Watch the nightly hawdb build", "Every 2 hours, check the nightly hawdb build and fix what broke.", "blocked");
  loop({ taskId: "t_paused", state: "paused", reason: "the nightly build", everyMs: 120 * MIN, rhythmBy: "user", since: at(-600), by: "rounds" });
  task("t_ended", "Keep an eye on #10473", "直到 #10473 合并，每 30 分钟看一次。", "done");
  loop({ taskId: "t_ended", state: "ended", reason: "#10473", look: { check: { argv: ["gh", "pr", "view", "10473"], path: "state", equals: "MERGED" }, everyMs: 30 * MIN }, since: at(-900), by: "brief", endedBy: "user", back: { at: at(-800), from: "done" } });

  // Routines (D114) in every state; a proposed or dismissed one was never kept.
  const routine = (r: RoutineBody) => log.append({ stream: `routine:${r.routineId}`, origin: "system", kind: "routine", body: r });
  const base = { reports: "every" as const, effect: "read_only" as const, budget: { monthTokens: 2_000_000 }, createdAt: at(-60 * 24 * 10), reviewAt: at(60 * 24 * 20) };
  routine({ ...base, routineId: "rt_weekly", name: "周报", trigger: { kind: "time", every: "week", days: [1], time: "09:00", zone: "personal", tz: "Asia/Shanghai" }, triggerWords: "每周一 09:00 · 跟着你的时区", brief: "Draft the weekly report from last week's merged PRs.", state: "active" });
  routine({ ...base, routineId: "rt_watch", name: "hawdb nightly", trigger: { kind: "condition", condition: "hawdb's nightly breaks", check: { argv: ["gh", "run", "list"], path: "0.conclusion", equals: "failure" }, everyMs: 30 * MIN }, triggerWords: "hawdb 的 nightly 挂了的时候", brief: "Find why it broke and tell me.", reports: "on_change", state: "paused", pausedBy: "system", pauseReason: "failures" });
  routine({ ...base, routineId: "rt_ended", name: "Daily standup notes", trigger: { kind: "time", every: "weekday", time: "09:30", zone: "personal", tz: "Asia/Shanghai" }, triggerWords: "Weekdays 09:30", brief: "Draft standup notes.", state: "ended" });
  routine({ ...base, routineId: "rt_prop", name: "Inbox sort", trigger: { kind: "time", every: "day", time: "18:00", zone: "personal", tz: "Asia/Shanghai" }, triggerWords: "每天 18:00", brief: "Sort the inbox.", state: "proposed", decisionId: "d_prop" });
  routine({ ...base, routineId: "rt_dism", name: "Never", trigger: { kind: "time", every: "day", time: "07:00", zone: "personal", tz: "Asia/Shanghai" }, triggerWords: "每天 07:00", brief: "No.", state: "dismissed" });
  // The weekly routine's two runs (its history, its rounds).
  for (const [n, sum] of [[1, "周报草稿写好了：12 个 PR 合并。"], [2, "周报草稿写好了：9 个 PR 合并。"]] as const) {
    const t = `t_week${n}`;
    task(t, `周报 ${n}`, "Draft the weekly report.", "done");
    report(t, "done", sum);
    log.append({ stream: "routine:rt_weekly", origin: "system", kind: "routine_run", body: { routineId: "rt_weekly", runId: `run${n}`, scheduledFor: at(n * 60 * 24 * 7), state: "started", taskId: t } });
    log.append({ stream: "routine:rt_weekly", origin: "system", kind: "routine_run", body: { routineId: "rt_weekly", runId: `run${n}`, scheduledFor: at(n * 60 * 24 * 7), state: "done", taskId: t } });
  }

  // The babysitter's mail (D507): Codex handed it #11030, its claim named the task; the task works on it.
  task("t_pr11030", "自定义 provider 切到 Embedding 时只留一个模型", "Babysit nowledge-co/mem#11030 until it can merge.", "working");
  log.append({ stream: "channel", origin: "system", kind: "bridge_msg", body: { direction: "in", messageId: "m1", from: "Codex", agent: "Codex", text: "Please babysit nowledge-co/mem#11030 until it can merge.", helper: "nowledge-mem-pr-babysitter" } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m2", inReplyTo: "m1", to: "Codex", text: "Taken: on it.", taskId: "t_pr11030", helper: "nowledge-mem-pr-babysitter", state: "sent" } });
  report("t_pr11030", "done", "lint 挂在一个没用的 import 上；删掉，测试过了，推了上去。");
  log.append({ stream: "task:t_pr11030", origin: "system", kind: "task_state", body: { taskId: "t_pr11030", attention: "working", residency: "hot" } });
  log.close?.();
  return { tasks: ["t_review", "t_fare", "t_paused", "t_ended"], routines: ["rt_weekly", "rt_watch", "rt_ended"], helpers: ["nowledge-mem-pr-babysitter", "docs-proofreader"] };
}
