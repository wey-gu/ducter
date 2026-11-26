// D591: a heavy developer's week of work, for the usage scenarios: a review loop on Codex that ran
// every 45 minutes (most of the week's Codex), one big refactor on Claude Code (Opus; most of the
// week's Claude Code), a small fix, the partner's own replies and Ducter's own checks. Logged at
// their own times through the eval core's clock (`back`), each turn end with its own count, so the
// `usage` tool reads them as `ducter usage` would.
import type { Bodies } from "../../protocol/src/index.ts";

type EvalCore = { log: { append(e: { stream: string; origin: string; kind: string; body: unknown }): { seq: number } } };

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function seedUsageWeek(core: EvalCore, back: { ms: number }, zh: boolean) {
  const open = (taskId: string, title: string, harness: string, model: string, you: boolean) =>
    core.log.append({ stream: `task:${taskId}`, origin: you ? "user" : "partner", kind: "task_open", body: { taskId, title, project: "ducter", place: { kind: "none" }, harness, model, brief: title, ...(you ? { origin: "you" as const } : {}) } satisfies Bodies["task_open"] });
  const turn = (taskId: string, input: number, output: number, cached: number) =>
    core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "assistant", text: "ok", usage: { turn: { input, output, cached } } } satisfies Bodies["task_event"] });
  back.ms = 6 * DAY;
  open("u_loop", zh ? "每 45 分钟 review 一次 PR #551" : "Review PR #551 every 45 minutes", "codex", "gpt-6.2-sol", false);
  open("u_store", zh ? "把 store 拆成按用户分片" : "Split the store into shards by user", "claude-code", "opus", true);
  open("u_login", zh ? "修登录页的样式" : "Fix the login page styles", "claude-code", "sonnet", true);
  for (let d = 6; d >= 1; d--) {
    for (let h = 0; h < 8; h++) {
      back.ms = d * DAY - h * HOUR;
      turn("u_loop", 180_000, 3_000, 160_000);
    }
  }
  for (const d of [4, 3, 2]) {
    for (let h = 0; h < 6; h++) {
      back.ms = d * DAY - h * HOUR;
      turn("u_store", 420_000, 18_000, 300_000);
    }
  }
  back.ms = 1 * DAY;
  turn("u_login", 90_000, 4_000, 40_000);
  for (let d = 6; d >= 1; d--) {
    back.ms = d * DAY - 2 * HOUR;
    core.log.append({ stream: "partner", origin: "system", kind: "partner_session", body: { event: "turn_used", harness: "claude-code", model: "opus", turn: { input: 70_000, output: 1_200, cached: 60_000 } } satisfies Bodies["partner_session"] });
    core.log.append({ stream: "looks", origin: "system", kind: "look_used", body: { harness: "claude-code", model: "haiku", turn: { input: 8_000, output: 120, cached: 0 }, what: "judge" } satisfies Bodies["look_used"] });
  }
  back.ms = 0;
}
