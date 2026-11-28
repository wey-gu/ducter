// D650 (research/245 §3.8): hel's five Keeps as the Log held them on 2026-11-27, with their real
// `until` texts, and a second, unlike shape (a consumer's daily mail digest and an issue-triage
// helper). The old texts are exactly what B8 is about:
//   - the 403 loop's `until` is a standing rule (仅 Tide 批量合并，绝不手动合并), not an end;
//   - the review routine's is a no-end (用户明确要求停止);
//   - the 137-round review loop's is a this-round ask (本轮优先直接评审 …#551…);
//   - the #11230 loop's is real and testable (PR #11230 merged);
//   - the babysitter's is per item (每个 PR 跟到能合并), so the Keep itself has no end.
// The tests read each through the new end ask (a fake model), then check the head, the stall ask,
// stop, the budget pause and the round line. Nothing here came from the person's export; the words
// are the same ones research/245 quotes.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, RoutineBody, TaskLoopBody } from "@ducter/protocol";
import type { Helper } from "@ducter/protocol/src/helpers.ts";
import { openLog } from "../../src/log.ts";

const MIN = 60_000;
export const NOW = Date.parse("2026-11-27T15:30:00Z");
export const at = (min: number) => new Date(NOW + min * MIN).toISOString();

/** The fake model's answer for each Keep, exactly as `keepEndAsk` parses one. */
export interface ExpectedEnd {
  /** none: their words give no testable end. */
  none?: true;
  sentence?: string;
  look?: { kind: "pr" | "issue" | "date"; ref?: string; what?: "merged" | "closed"; at?: string };
}

export interface FixtureKeep {
  kind: "loop" | "routine" | "helper";
  id: string;
  title: string;
  /** The real `until` (or the helper's per-item paragraph) the old home recorded. */
  until?: string;
  said: string;
  brief: string;
  expected: ExpectedEnd;
}

/** Hel's five Keeps (research/245 §1.2), plus the consumer's daily digest, in one list. */
export const HEL_ENDS: FixtureKeep[] = [
  {
    kind: "loop",
    id: "t_403",
    title: "修复 Mem 首次连接遇到 403 的体验（#11406）",
    until: "仅 Tide 批量合并，绝不手动合并。",
    said: "修好首次连接 403 的体验，盯到 #11408 能合并。仅 Tide 批量合并，绝不手动合并。",
    brief: "每 45 分钟看一次 #11408；能合并时用 /lgtm，不要自己合并。",
    expected: { none: true },
  },
  {
    kind: "routine",
    id: "rt_review",
    title: "nowledge-co 自动 PR 评审",
    until: "用户明确要求停止",
    said: "每 45 分钟评审 nowledge-co 里请我 review 的 PR。一直做到：用户明确要求停止。",
    brief: "Review every PR nowledge-co asks me to review; draft the review and ask before posting.",
    expected: { none: true },
  },
  {
    kind: "loop",
    id: "t_review",
    title: "持续评审 nowledge-co，并处理 100gle 分给你的待办",
    until: "本轮优先直接评审 https://github.com/nowledge-co/nowledge-labs-website/pull/551 的最新改动，检查已有评审避免重复",
    said: "每 45 分钟看一轮 nowledge-co 的 review 请求。本轮优先直接评审 #551。",
    brief: "每 45 分钟 review 一轮 nowledge-co 的 PR，并处理 100gle 分给你的待办。",
    expected: { none: true },
  },
  {
    kind: "loop",
    id: "t_11230",
    title: "独立复审远程访问设置并跟进 #11230",
    until: "#11230 合并时结束",
    said: "独立复审远程访问设置并跟进 #11230，合了就结束。",
    brief: "每 10 分钟看一次 #11230；它合并时这件就结束。",
    expected: { sentence: "#11230 合并时结束", look: { kind: "pr", ref: "nowledge-co/mem#11230", what: "merged" } },
  },
  {
    kind: "helper",
    id: "nowledge-mem-pr-babysitter",
    title: "Nowledge Mem PR Babysitter",
    until: "对接手的 Mem PR 主动维护到可合并、通过评审、CI 通过，不自行合并。",
    said: "做一个 PR babysitter：我的 agent 把 PR 交给它，它修 CI 和评审意见，一直跟到能合并，不自己合并。",
    brief: "Each PR you are handed: fix CI and review comments, push, follow until it can merge. Never merge it yourself.",
    expected: { none: true },
  },
  // A second, unlike shape (the consumer with one daily briefing): no end at all.
  {
    kind: "routine",
    id: "rt_digest",
    title: "每天早上的邮件摘要",
    said: "每天早上把邮件读一遍，写成一页摘要给我。",
    brief: "每天早上读一遍邮件，写成一页摘要。",
    expected: { none: true },
  },
  {
    kind: "helper",
    id: "issue-triage",
    title: "Issue triage helper",
    said: "帮我分诊送过来的 issue，每个都加上标签、找到负责人。",
    brief: "Triage each issue handed to you: label it, find an owner, say what you did.",
    expected: { none: true },
  },
];

const HELPER = (k: FixtureKeep): Helper => ({
  id: k.id,
  name: k.title,
  about: k.said,
  brief: k.brief,
  persona: "default",
  agentId: `helper-${k.id}`,
  state: "on",
  createdAt: at(-60 * 24 * 3),
  mem: "ready",
});

const HELPER_JSON = {
  helpers: HEL_ENDS.filter((k) => k.kind === "helper").map(HELPER),
};

/** The old home's records: helpers.json, task_open + task_loop, routine + its run. No Keep yet. */
export function seedEnds(dataDir: string): void {
  writeFileSync(join(dataDir, "helpers.json"), JSON.stringify(HELPER_JSON, null, 2) + "\n", { mode: 0o600 });
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  const task = (taskId: string, title: string, brief: string, attention: Bodies["task_state"]["attention"]) => {
    log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief, language: "zh" } });
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency: "cold" } });
  };
  for (const k of HEL_ENDS) {
    if (k.kind === "loop") {
      task(k.id, k.title, k.said, "blocked");
      const b: TaskLoopBody = { taskId: k.id, state: "on", reason: k.title, everyMs: 45 * MIN, rhythmBy: "task", since: at(-60 * 24), by: "brief", ...(k.until ? { until: k.until } : {}) };
      log.append({ stream: `task:${k.id}`, origin: "system", kind: "task_loop", body: b });
    } else if (k.kind === "routine") {
      const base: RoutineBody = {
        routineId: k.id,
        name: k.title,
        trigger: { kind: "time", every: "day", time: "09:00", zone: "personal", tz: "Asia/Shanghai" },
        triggerWords: "每天 09:00 · 跟着你的时区",
        brief: k.said,
        reports: "on_change",
        effect: "read_only",
        budget: { monthTokens: 20_000_000 },
        state: "active",
        createdAt: at(-60 * 24 * 10),
        reviewAt: at(60 * 24 * 20),
      };
      if (k.id === "rt_review") Object.assign(base, { state: "paused", pausedBy: "system", pauseReason: "budget", budget: { monthTokens: 2_000_000 } });
      log.append({ stream: `routine:${k.id}`, origin: "system", kind: "routine", body: base });
      if (k.id === "rt_review") {
        log.append({ stream: `routine:${k.id}`, origin: "system", kind: "routine_run", body: { routineId: k.id, runId: "run_budget", scheduledFor: at(-60 * 20), state: "started", taskId: "t_review_run" } });
        task("t_review_run", "nowledge-co 自动 PR 评审", k.brief, "done");
        log.append({ stream: "task:t_review_run", origin: "task", kind: "report", body: { taskId: "t_review_run", state: "done", summary: "评审写好了，5 个请求在等你。", questions: [], evidence: [] } });
        log.append({ stream: `routine:${k.id}`, origin: "system", kind: "routine_run", body: { routineId: k.id, runId: "run_budget", scheduledFor: at(-60 * 20), state: "done", taskId: "t_review_run", tokens: 5_269_302 } });
        log.append({ stream: `routine:${k.id}`, origin: "system", kind: "routine_run", body: { routineId: k.id, runId: "run_skip", scheduledFor: at(-60), state: "skipped", reason: "budget" } });
      }
    }
  }
  log.close?.();
}

/** A loop whose last rounds all read the same (or all differ): the stall ask's own fixture. */
export function seedStall(dataDir: string, id: string, summaries: string[], title = "Watch #11230 until it merges"): void {
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "none" }, harness: "codex", brief: "每 10 分钟看一次 #11230。", language: "zh" } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: "blocked", residency: "cold" } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_loop", body: { taskId: id, state: "on", reason: title, everyMs: 10 * MIN, rhythmBy: "task", since: at(-600), by: "brief" } });
  summaries.forEach((summary, i) => {
    log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_${id}_${i}`, taskId: id, wakes: "task", reason: "#11230", state: "fired", at: at(-60 + i) } as Bodies["waiter"] });
    log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary, questions: [], evidence: [] } });
  });
  log.close?.();
}

/** A loop that lives inside a helper's held task: B6 must not mint a second Keep for it. */
export function seedHeldLoop(dataDir: string, id: string, helperId: string): void {
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: "独立复审远程访问设置并跟进 #11230", project: "", place: { kind: "none" }, harness: "codex", brief: "复审 #11230 的改动。" } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention: "blocked", residency: "cold" } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_loop", body: { taskId: id, state: "on", reason: "#11230", everyMs: 10 * MIN, rhythmBy: "task", since: at(-300), by: "brief" } });
  log.append({ stream: "channel", origin: "system", kind: "bridge_msg", body: { direction: "in", messageId: `m_${id}`, from: "Codex", agent: "Codex", text: "Please babysit nowledge-co/mem#11230 until it can merge.", helper: helperId } });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: `m_${id}_ack`, inReplyTo: `m_${id}`, to: "Codex", text: "Taken.", taskId: id, helper: helperId, state: "sent" } });
  log.close?.();
}
