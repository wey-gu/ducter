// D645 (research/245 §3.7): hel's shape for the truth fixes, as data. A helper Keep holding a
// haswell task whose worker has no gh; a home with gh; a loop task whose PR #11408 merged and a
// hand-off pair `issue:`/`pr:` for it; a task bound to an issue already closed before it was bound,
// and a reply to its closed card; and a second, unlike shape: an Obsidian-bound task on one Mac.
//
// The tests read this as a home's Log and data folder (core/test/truth-fixes.test.ts); the B1 test
// also takes the fake GitHub and the fake worker below, so the read's computer is a fact it can
// check.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, TaskLoopBody } from "@ducter/protocol";
import type { Exec } from "@ducter/protocol/src/checks-run.ts";
import type { WorkerInfo, WorkerLink, WorkerLinks } from "@ducter/protocol/src/internal.ts";
import type { Helper } from "@ducter/protocol/src/helpers.ts";
import { openLog } from "../../src/log.ts";

export const HELPER = { id: "nowledge-mem-pr-babysitter", name: "Nowledge Mem PR Babysitter" };
export const HELPER_TASK = "jxikmjm9";
export const PR_LOOP_TASK = "4rg2ebi7";
export const PR_REF = "nowledge-co/mem#11408";
export const OLD_LOOP_KEEP = "kp_9c76608d03";
const T0 = Date.parse("2026-11-26T09:14:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

/** helpers.json as hel's home wrote it: one helper on, the PR babysitter. */
export const HELPER_JSON: { helpers: Helper[] } = {
  helpers: [
    {
      id: HELPER.id,
      name: HELPER.name,
      about: "我的 agent 把 PR 交给它，它修 CI 和评审意见，跟到能合并。",
      brief: "Each PR you are handed: fix CI and review comments, push, follow until it can merge.",
      persona: "default",
      agentId: `ducter-helper-${HELPER.id}`,
      state: "on",
      createdAt: at(-60 * 24 * 2),
      link: { context: `ducter-helper-${HELPER.id}-on-hel`, connectionId: "conn_7f2a", spaceId: "space_default" },
      mem: "ready",
      said: "ready",
    },
  ],
};

/** Writes hel's shape into a home's Log and helpers.json. */
export function seedHelTruth(dataDir: string): void {
  writeFileSync(join(dataDir, "helpers.json"), JSON.stringify(HELPER_JSON, null, 2) + "\n", { mode: 0o600 });
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  const task = (taskId: string, title: string, brief: string, attention: Bodies["task_state"]["attention"], place: Bodies["task_open"]["place"] = { kind: "none" }) => {
    log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "nowledge-co", place, harness: "codex", brief } });
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency: attention === "working" ? "hot" : "parked" } });
  };
  const loop = (b: TaskLoopBody) => log.append({ stream: `task:${b.taskId}`, origin: "system", kind: "task_loop", body: b });

  // The helper's own task: a haswell repo task the helper took (its claim named it). It set itself
  // round after round; before this fix that minted a second Keep (hel's kp_9c76608d03).
  task(HELPER_TASK, "独立复审远程访问设置并跟进 #11230", "等 #11230 的必需 CI 完成及原开发任务提供结果。", "working", { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem", branch: "ducter/review", baseBranch: "main" });
  log.append({ stream: "channel", origin: "system", kind: "bridge_msg", body: { direction: "in", messageId: "m1", from: "Codex", agent: "Codex", text: "接手推进 https://github.com/nowledge-co/mem/pull/11230", helper: HELPER.id } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: "m2", inReplyTo: "m1", to: "Codex", text: "Taken: on it.", taskId: HELPER_TASK, helper: HELPER.id, state: "sent" } });
  loop({ taskId: HELPER_TASK, state: "on", reason: "等待 #11230 的必需 CI 完成", everyMs: 10 * 60_000, rhythmBy: "rounds", since: at(0), by: "rounds" });
  // The loop Keep that bug minted for the helper's task (hel's kp_9c76608d03): it must end at the
  // first start under the fix, with one line on the task, never a second holder.
  log.append({
    stream: `keep:${OLD_LOOP_KEEP}`,
    origin: "system",
    kind: "keep",
    body: {
      keepId: OLD_LOOP_KEEP,
      title: "独立复审远程访问设置并跟进 #11230",
      said: "等待 #11230 的必需 CI 完成及原开发任务提供结果。",
      from: { kind: "loop", taskId: HELPER_TASK },
      run: "same",
      wakes: [{ kind: "every", everyMs: 10 * 60_000 }],
      life: "on",
      createdAt: at(0),
      made: "task_loop",
    },
  });

  // The 403 loop: a haswell task that holds PR #11408, whose work is over when it merges. Its end
  // reads GitHub; on haswell there was no gh, so it never ended.
  task(PR_LOOP_TASK, "修复 Mem 首次连接遇到 403 的体验（#11406）", "每 45 分钟看一次 #11408，合并了就报 done。", "blocked", { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem", branch: "ducter/first-connect", baseBranch: "main" });
  log.append({ stream: `task:${PR_LOOP_TASK}`, origin: "task", kind: "report", body: { taskId: PR_LOOP_TASK, state: "progress", summary: "修好了首次连接的 403，PR #11408 提上去了。", questions: [], evidence: [{ kind: "url", label: "PR #11408", ref: "https://github.com/nowledge-co/mem/pull/11408" }] } });
  loop({ taskId: PR_LOOP_TASK, state: "on", reason: "等 #11408 合并", everyMs: 45 * 60_000, until: "#11408 合并", rhythmBy: "task", since: at(0), by: "brief" });
  // D609's old pair for one item: two records for one #11408, which D645 B7 makes one on read.
  const from = { task: PR_LOOP_TASK, name: "Ducter" };
  const to = { helper: HELPER.id, name: HELPER.name };
  log.append({ stream: "channel", origin: "system", kind: "handoff", body: { handoffId: "ho_issue", key: `task:${PR_LOOP_TASK}|helper:${HELPER.id}|issue:${PR_REF}`, from, to, item: { kind: "issue", ref: PR_REF, title: "first connect 403" }, said: "接手 #11408", state: "settled", settledBy: "merged", at: at(11), givenAt: at(11) } });
  log.append({ stream: "channel", origin: "system", kind: "handoff", body: { handoffId: "ho_pr", key: `task:${PR_LOOP_TASK}|helper:${HELPER.id}|pr:${PR_REF}`, from, to, item: { kind: "pr", ref: PR_REF, title: "fix(connectors): use the official CLI" }, said: "接手 #11408", state: "unclaimed", at: at(12), givenAt: at(12) } });

  // zqcpawnf: bound to an issue that had already closed a week before it was bound. Its first look
  // made a closed card; the person's reply went to the partner and never reached the task.
  task("zqcpawnf", "核对数据迁移设计并补齐统一备份与恢复", "核对 nowledge-co/mem#10500 的数据迁移设计。", "working");
  log.append({ stream: "channel", origin: "system", kind: "task_bound", body: { taskId: "zqcpawnf", item: { source: "src_gh", kind: "github", ref: "nowledge-co/mem#10500", label: "#10500", where: "nowledge-co/mem", title: "Data migration design" }, by: "partner" } });
  log.append({ stream: `task:zqcpawnf`, origin: "system", kind: "decision", body: { decisionId: "d_closed", taskId: "zqcpawnf", question: "nowledge-co/mem#10500 在 GitHub 上关掉了。这个任务停下吗？", goLabel: "停下", holdLabel: "接着做", defaultOption: "go", reversible: true, src: { kind: "closed", item: { source: "src_gh", kind: "github", ref: "nowledge-co/mem#10500", label: "#10500", where: "nowledge-co/mem", title: "Data migration design" }, taskId: "zqcpawnf" } } });
  log.append({ stream: `task:zqcpawnf`, origin: "task", kind: "report", body: { taskId: "zqcpawnf", state: "progress", summary: "我已经停下，等对方的回答。", questions: [], evidence: [] } });
  // The person's reply on the closed card: the words that should reach the task (B3, dsh-truthful).
  log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: "d_closed", option: "reply", by: "user", text: "如果问题实际上没做完，可以把任务再打开，甚至 issue 再打开" } });

  // The second, unlike shape: an Obsidian-bound task on one Mac, no worker.
  task("vault-tidy", "把这一周的会议记录整理成一份摘要", "勾掉 Obsidian 里的这条待办。", "blocked", { kind: "folder", device: "mac", path: "/Users/wey/vault" });
  log.append({ stream: "channel", origin: "system", kind: "task_bound", body: { taskId: "vault-tidy", item: { source: "src_obs", kind: "obsidian", ref: "Meetings/2026-11-24.md::^week", label: "2026-11-24", where: "Meetings/2026-11-24.md", title: "整理这周的会议记录" }, by: "you" } });

  log.close?.();
}

/** A tiny GitHub over a mutable map: `owner/repo#n` → its true state, plus a signed-in gh's status. */
export function fakeHomeGh(state: Map<string, "open" | "merged" | "closed">, calls: string[] = []): Exec {
  return async (argv) => {
    calls.push(argv.join(" "));
    if (argv[0] === "gh" && argv[1] === "auth" && argv[2] === "status") return { exitCode: 0, stdout: "github.com\n  ✓ Logged in to github.com as wey" };
    const m = /^repos\/([^/]+\/[^/]+)\/(pulls|issues)\/(\d+)$/.exec(argv[2] ?? "");
    if (!m) return { exitCode: 1, stdout: "", };
    const s = state.get(`${m[1]}#${m[3]}`) ?? "open";
    return { exitCode: 0, stdout: JSON.stringify(m[2] === "pulls" ? { state: s === "merged" ? "closed" : s, merged: s === "merged" } : { state: s === "merged" ? "closed" : s }) };
  };
}

/** haswell, as it was: no gh at all. Every check there answers "gh is not installed here". */
export function haswell(calls: { op: string; argv?: string }[] = []): WorkerLinks {
  const link: WorkerLink = {
    id: "haswell",
    name: "haswell",
    online: () => true,
    call: async <T,>(op: string, args: unknown) => {
      const spec = (args as { spec?: { argv?: string[] } }).spec;
      calls.push({ op, ...(spec?.argv ? { argv: spec.argv.join(" ") } : {}) });
      if (op !== "check") throw new Error(`unknown op ${op}`);
      return { ok: false, met: false, summary: "gh is not installed here", error: "gh is not installed here" } as T;
    },
    onSession: () => () => {},
    onOnline: () => () => {},
  };
  return {
    link: (d) => (d === "haswell" ? link : undefined),
    list: () => [{ id: "haswell", name: "haswell", online: true } as WorkerInfo],
  };
}
