// D591: the partner's `usage` tool gives facts, not words: each agent's share and the task that used
// most of it, the tasks with who started them, the partner's own replies and Ducter's checks, an
// agent's limit windows as last read; and "nothing used" said plainly.
import { expect, test } from "bun:test";
import { usageReport, type LogEvent } from "@ducter/protocol";
import { usageFacts } from "../src/usage-tool.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");
let seq = 0;
const ev = (ts: string, stream: string, kind: string, body: unknown) => ({ seq: ++seq, ts, persona: "default", stream, origin: "system", kind, body }) as LogEvent;

test("shares, the top task per agent, who started it, the partner's own turns, the limit as last read", () => {
  const r = usageReport(
    [
      ev("2026-11-25T08:00:00Z", "task:a", "task_open", { taskId: "a", title: "Split the store into shards", project: "", place: { kind: "none" }, harness: "claude-code", model: "opus", brief: "x", origin: "you" }),
      ev("2026-11-25T08:00:00Z", "task:b", "task_open", { taskId: "b", title: "Review PR #551 every 45 minutes", project: "", place: { kind: "none" }, harness: "codex", brief: "x" }),
      ev("2026-11-25T09:00:00Z", "task:a", "task_event", { taskId: "a", role: "assistant", usage: { turn: { input: 600_000, output: 20_000 } } }),
      ev("2026-11-25T10:00:00Z", "task:b", "task_event", { taskId: "b", role: "assistant", usage: { turn: { input: 300_000, output: 5_000 } } }),
      ev("2026-11-25T11:00:00Z", "partner", "partner_session", { event: "turn_used", harness: "claude-code", model: "opus", turn: { input: 20_000, output: 500 } }),
      ev("2026-11-25T12:00:00Z", "looks", "look_used", { harness: "claude-code", model: "haiku", turn: { input: 5_000, output: 50 }, what: "judge" }),
    ],
    { now: NOW },
  );
  const f = usageFacts(r, (h) => (h === "claude-code" ? { harness: h, windows: [{ label: "Current week", used: 0.82, resetsAt: "2026-11-27T07:00:00Z" }], at: "2026-11-26T11:00:00Z" } : undefined), "Asia/Shanghai") as {
    agents: { agent: string; share: string; used_most_by?: string; limit?: { used: string; resets?: string }[] }[];
    tasks: { title: string; started_by: string }[];
    your_replies_to_the_user?: { share: string };
    ducter_own_checks?: { share: string };
    not_counted: string;
  };
  expect(f.agents[0]).toMatchObject({ agent: "Claude Code", used_most_by: "Split the store into shards" });
  expect(f.agents[0]!.limit).toEqual([{ window: "Current week", used: "82%", resets: "2026-11-27 15:00" }] as never);
  expect(f.agents[1]).toMatchObject({ agent: "Codex", used_most_by: "Review PR #551 every 45 minutes", its_share_of_this_agent: "100%" } as never);
  expect(f.tasks.map((t) => t.started_by)).toEqual(["the user", "you, or what you look after"]);
  expect(f.your_replies_to_the_user?.share).toMatch(/%$/);
  expect(f.ducter_own_checks?.share).toMatch(/%$/);
  expect(f.not_counted).toContain("money");
  expect(JSON.stringify(f)).not.toContain(" · ");
});

test("nothing used: said plainly", () => {
  expect(usageFacts(usageReport([], { now: NOW }), () => undefined, "UTC")).toMatchObject({ ok: true, nothing: true });
});
