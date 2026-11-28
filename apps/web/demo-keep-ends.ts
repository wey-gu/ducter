// D650 (research/245 §3.8): the Keep card's head, the stall ask and the budget ask, for the
// shots in .shots/keep-ends/. A home with three Keeps: the #11230 loop (ends when #11230 merges,
// round 5, running 40 minutes), the review loop that has not moved for six rounds (its one ask in
// 待你处理), and the review routine Ducter paused for the month's budget (its ask in words, with
// 2M). No model, no gh, no network.
//   DUCTER_PORT=7611 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-keep-ends.ts
// then open /app#onhand/full (web 1180) or /app#onhand (390); the Mac uses DUCTER_SHELL_URL.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, RoutineBody, TaskLoopBody } from "@ducter/protocol";
import { openLog, startCore, stubRunner } from "./demo-core.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-keep-ends-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ language: zh ? "zh" : "en" }, null, 2) + "\n", { mode: 0o600 });

const now = Date.now();
const MIN = 60_000;
const at = (min: number) => new Date(now + min * MIN).toISOString();
const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });

function task(id: string, title: string, brief: string, attention: Bodies["task_state"]["attention"]) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, brief, project: "", place: { kind: "none" }, harness: "codex", language: zh ? "zh" : "en" } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_state", body: { taskId: id, attention, residency: "cold" } });
}
// A round is a wake, then its progress report (a done report would finish the task, D633). The
// final wake's progress is the newest round's own line.
function wake(id: string, n: number) {
  log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_${id}_${n}`, taskId: id, wakes: "task", reason: "#11230", state: "fired", at: at(-50 + n * 9) } as Bodies["waiter"] });
}
function progress(id: string, summary: string) {
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "progress", summary, questions: [], evidence: [] } });
}

// 1. The #11230 loop: a testable end, five rounds, running 40 minutes.
task("t_11230", w("独立复审远程访问设置并跟进 #11230", "Review remote access and follow #11230"), w("独立复审远程访问设置并跟进 #11230，合了就结束。", "Review remote access and follow #11230; it ends when #11230 merges."), "blocked");
log.append({ stream: "task:t_11230", origin: "system", kind: "task_loop", body: { taskId: "t_11230", state: "on", reason: "#11230", everyMs: 10 * MIN, rhythmBy: "task", since: at(-40), by: "brief" } as TaskLoopBody });
for (let n = 1; n <= 4; n++) {
  wake("t_11230", n);
  progress("t_11230", w(`第 ${n} 轮：CI 还在跑，等着。`, `Round ${n}: CI is still running; waiting.`));
}
wake("t_11230", 5);
progress("t_11230", w("第 5 轮：CI 还在跑，等着。", "Round 5: CI is still running; waiting."));

// 2. The review loop: six rounds that read the same; the stall ask is made on start.
task("t_review", w("持续评审 nowledge-co 的 PR", "Review nowledge-co's PRs"), w("每 45 分钟 review 一轮 nowledge-co 的 PR。", "Review nowledge-co's PRs every 45 minutes."), "blocked");
log.append({ stream: "task:t_review", origin: "system", kind: "task_loop", body: { taskId: "t_review", state: "on", reason: "review", everyMs: 45 * MIN, rhythmBy: "task", since: at(-5 * 60), by: "brief" } as TaskLoopBody });
// Six rounds that read the same (no reports, so their line is the same blank): the stall ask.
for (let n = 1; n <= 6; n++) wake("t_review", n);

// 3. The review routine, paused by Ducter for the month's budget (its ask is made on start).
const r: RoutineBody = {
  routineId: "rt_review",
  name: w("自动评审", "Automatic reviews"),
  trigger: { kind: "time", every: "day", time: "09:00", zone: "personal", tz: "Asia/Shanghai" },
  triggerWords: w("每天 09:00 · 跟着你的时区", "Every day at 09:00, your time zone"),
  brief: w("每天评审 nowledge-co 里请我 review 的 PR。", "Review the PRs nowledge-co asks me for every day."),
  reports: "on_change",
  effect: "read_only",
  budget: { monthTokens: 2_000_000, perRunTokens: 5_000_000 },
  state: "paused",
  pausedBy: "system",
  pauseReason: "budget",
  createdAt: at(-60 * 24 * 10),
  reviewAt: at(60 * 24 * 20),
};
log.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine", body: r });
log.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine_run", body: { routineId: "rt_review", runId: "run_1", scheduledFor: at(-60 * 20), state: "started", taskId: "t_run" } });
task("t_run", w("自动评审", "Automatic reviews"), r.brief, "done");
log.append({ stream: "task:t_run", origin: "task", kind: "report", body: { taskId: "t_run", state: "done", summary: w("评审写好了，5 个请求在等你。", "Reviews written; 5 requests wait for you."), questions: [], evidence: [] } });
log.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine_run", body: { routineId: "rt_review", runId: "run_1", scheduledFor: at(-60 * 20), state: "done", taskId: "t_run", tokens: 5_269_302 } });
log.append({ stream: "routine:rt_review", origin: "schedule", kind: "routine_run", body: { routineId: "rt_review", runId: "run_2", scheduledFor: at(-60), state: "skipped", reason: "budget" } });
log.close?.();

const core = startCore({
  dataDir,
  port: Number(process.env.DUCTER_PORT ?? 7611),
  keeps: {
    endAsk: async (x) =>
      /#11230/.test(x.title)
        ? { sentence: w("#11230 合并时结束", "#11230 merges"), look: { kind: "pr", ref: "nowledge-co/mem#11230", what: "merged" } }
        : { none: true },
    endLook: async () => "open",
  },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
core.keeps.sync();
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#onhand/full (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
await new Promise(() => {});
