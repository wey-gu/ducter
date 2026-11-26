// D591: DEMO_USAGE=1 seeds a heavy developer's week of counted work, so Settings › Overview's
// 这周的额度用在了哪儿 / Where this week's allowance went and the limit card's line have real
// numbers: the WAL bench and a Log index rework on Claude Code (Opus), the PR review comments, a
// review loop on nowledge-co/mem#551 every 45 minutes and a CI hunt on Codex, the weekly numbers on
// pi, the partner's own replies and Ducter's own checks. With DEMO_LIMIT=1 the WAL bench and the
// review comments are the limit demo's own tasks (seedLimits), so their limit cards name what used
// most of Claude Code this week. Every turn is logged now: the shares are what matter.
import type { Core } from "@ducter/core";
import type { Bodies } from "@ducter/protocol";

export function seedUsage(core: Core, zh: boolean) {
  const log = core.log;
  const open = (id: string, title: string, harness: string, model: string | undefined, you: boolean) => {
    if (log.read({ stream: `task:${id}`, kinds: ["task_open"], limit: 1 }).length) return;
    log.append({ stream: `task:${id}`, origin: you ? "user" : "partner", kind: "task_open", body: { taskId: id, title, project: "HawDB", place: { kind: "none" }, harness, ...(model ? { model } : {}), brief: title, ...(you ? { origin: "you" as const } : {}) } });
  };
  const turns = (id: string, n: number, input: number, cached: number, output: number) => {
    for (let i = 0; i < n; i++) log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "assistant", text: "", usage: { turn: { input, output, cached } } } satisfies Bodies["task_event"] });
  };
  open("t_lim1", zh ? "跑完 WAL 基准测试，给出 p99" : "Run the WAL bench and report the p99", "claude-code", "opus", false);
  open("u_fts", zh ? "把 Log 的全文索引改成按月分表" : "Split the Log's full-text index by month", "claude-code", "opus", true);
  open("t_lim2", zh ? "整理 PR #1592 的评审意见" : "Sort out the review comments on PR #1592", "claude-code", "opus", false);
  open("u_loop", zh ? "每 45 分钟 review 一次 nowledge-co/mem#551" : "Review nowledge-co/mem#551 every 45 minutes", "codex", "gpt-6.2-sol", false);
  open("u_ci", zh ? "查 mem 这周 main 上红的 CI" : "Find why mem's CI went red on main this week", "codex", "gpt-6.2-sol", true);
  open("t_lim4", zh ? "把周报的数据拉一遍" : "Pull the numbers for the weekly report", "pi", undefined, false);
  turns("t_lim1", 12, 380_000, 300_000, 9_000);
  turns("u_fts", 8, 300_000, 220_000, 12_000);
  turns("t_lim2", 4, 120_000, 90_000, 4_000);
  turns("u_loop", 40, 150_000, 135_000, 2_000);
  turns("u_ci", 6, 200_000, 150_000, 6_000);
  turns("t_lim4", 3, 40_000, 0, 3_000);
  for (let i = 0; i < 30; i++) log.append({ stream: "partner", origin: "system", kind: "partner_session", body: { event: "turn_used", harness: "claude-code", model: "opus", turn: { input: 60_000, output: 800, cached: 52_000 } } });
  for (let i = 0; i < 25; i++) log.append({ stream: "looks", origin: "system", kind: "look_used", body: { harness: "claude-code", model: "haiku", turn: { input: 8_000, output: 100, cached: 0 }, what: "judge" } });
}
