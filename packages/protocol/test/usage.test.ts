// D588: what tasks used, folded from the Log's own shapes: a turn's `turn` as the runner logs it, a
// running total alone (an older turn end), a switch, another agent mid-task, who opened it, the
// person's own days, the days asked and nothing else.
import { expect, test } from "bun:test";
import type { Bodies, EventKind, LogEvent, Usage } from "../src/index.ts";
import { usageDay, usageReport, usageShare, usageSince, usageWeight } from "../src/usage.ts";

let seq = 0;
const NOW = Date.parse("2026-11-26T12:00:00Z");
const ev = <K extends EventKind>(ts: string, kind: K, body: Bodies[K]): LogEvent => ({ seq: ++seq, ts, persona: "default", stream: `task:${(body as { taskId: string }).taskId}`, origin: "system", kind, body });
const open = (ts: string, taskId: string, title: string, harness: string, model?: string, you?: boolean) => ev(ts, "task_open", { taskId, title, project: "", place: { kind: "none" }, harness, ...(model ? { model } : {}), brief: title, ...(you ? { origin: "you" as const } : {}) });
const turn = (ts: string, taskId: string, usage: Usage) => ev(ts, "task_event", { taskId, role: "assistant", text: "ok", usage });
const t = (input: number, output: number, cached?: number): Usage => ({ turn: { input, output, ...(cached !== undefined ? { cached } : {}) } });

test("in all, by agent, by who opened it, and the most used first (cache reads weigh a tenth)", () => {
  const evs = [
    open("2026-11-20T09:00:00Z", "a", "Review PR #10932 every 45 minutes", "codex", "gpt-6"),
    open("2026-11-25T09:00:00Z", "b", "Move the web build to Bun 1.4", "claude-code", "opus", true),
    turn("2026-11-25T10:00:00Z", "a", t(900_000, 8_000, 880_000)),
    turn("2026-11-25T11:00:00Z", "a", t(900_000, 8_000, 880_000)),
    turn("2026-11-26T10:00:00Z", "b", t(300_000, 40_000, 100_000)),
  ];
  const r = usageReport(evs, { now: NOW, days: 7 });
  expect(r.total).toEqual({ input: 2_100_000, output: 56_000, cached: 1_860_000 });
  expect(r.turns).toBe(3);
  expect(r.taskCount).toBe(2);
  expect(r.by.you).toEqual({ input: 300_000, output: 40_000, cached: 100_000 });
  expect(r.by.partner.input).toBe(1_800_000);
  // b weighs 200k + 40k + 10k = 250k; a 2 × (20k + 8k + 88k) = 232k: b first though a read more.
  expect(r.tasks.map((x) => x.taskId)).toEqual(["b", "a"]);
  expect(r.tasks[1]).toMatchObject({ title: "Review PR #10932 every 45 minutes", harness: "codex", model: "gpt-6", by: "partner", turns: 2, lastAt: "2026-11-25T11:00:00Z" });
  expect(r.agents.map((a) => `${a.harness}/${a.model}`)).toEqual(["claude-code/opus", "codex/gpt-6"]);
  expect(r.agents[1]).toMatchObject({ turns: 2, tasks: 1 });
  expect(r.notCounted).toEqual(["money"]);
  expect(usageWeight({ input: 100, output: 0, cached: 100 })).toBe(10);
});

test("a turn end with only the session's running totals counts its difference; a switch or another agent starts again", () => {
  const evs = [
    open("2026-11-24T09:00:00Z", "c", "Fix the flaky socket test", "claude-code"),
    turn("2026-11-24T09:10:00Z", "c", { inputTokens: 1000, outputTokens: 100, cacheRead: 500 }),
    turn("2026-11-24T09:20:00Z", "c", { inputTokens: 2500, outputTokens: 300, cacheRead: 1500 }),
    // Codex takes over: its own session from zero.
    ev("2026-11-24T09:30:00Z", "body_selected", { taskId: "c", harness: "codex", model: "gpt-6", why: { kind: "switch" } as never }),
    turn("2026-11-24T09:40:00Z", "c", { inputTokens: 400, outputTokens: 40 }),
    ev("2026-11-24T09:45:00Z", "task_event", { taskId: "c", role: "system", raw: { switched: true } }),
    turn("2026-11-24T09:50:00Z", "c", { inputTokens: 50, outputTokens: 5 }),
  ];
  const r = usageReport(evs, { now: NOW, days: 7 });
  expect(r.total).toEqual({ input: 2500 + 400 + 50, output: 300 + 40 + 5, cached: 1500 });
  const byAgent = Object.fromEntries(r.agents.map((a) => [a.harness, a]));
  expect(byAgent["claude-code"]!.tokens).toEqual({ input: 2500, output: 300, cached: 1500 });
  expect(byAgent["codex"]!.tokens).toEqual({ input: 450, output: 45, cached: 0 });
  expect(byAgent["codex"]!.model).toBe("gpt-6");
  expect(r.tasks[0]).toMatchObject({ harness: "codex", model: "gpt-6", turns: 4 });
});

test("only the days asked, in the person's own days; a turn before them still sets its baseline", () => {
  const tz = 480; // Shanghai
  // The first day counted is 2026-11-25 (+08:00), from 2026-11-24T16:00Z.
  const since = usageSince(NOW, 2, tz);
  expect(new Date(since).toISOString()).toBe("2026-11-24T16:00:00.000Z");
  const evs = [
    open("2026-11-01T09:00:00Z", "d", "Keep an eye on the release", "codex"),
    turn("2026-11-24T15:00:00Z", "d", { inputTokens: 1000, outputTokens: 10 }), // before: baseline only
    turn("2026-11-24T16:30:00Z", "d", { inputTokens: 1600, outputTokens: 30 }), // 00:30 on the 25th there
    turn("2026-11-25T23:30:00Z", "d", t(200, 2)), // 07:30 on the 26th there
  ];
  const r = usageReport(evs, { now: NOW, days: 2, tzOffsetMin: tz });
  expect(r.days.map((d) => d.day)).toEqual(["2026-11-25", "2026-11-26"]);
  expect(r.days.map((d) => d.tokens.input)).toEqual([600, 200]);
  expect(r.total).toEqual({ input: 800, output: 22, cached: 0 });
  expect(r.tasks[0]!.title).toBe("Keep an eye on the release");
  expect(usageDay(Date.parse("2026-11-25T23:30:00Z"), tz)).toBe("2026-11-26");
});

test("nothing used is an empty report with every day; days and top are bounded", () => {
  const r = usageReport([], { now: NOW, days: 99, top: 999 });
  expect(r.days).toHaveLength(31);
  expect(r.turns).toBe(0);
  expect(r.tasks).toEqual([]);
  const many = Array.from({ length: 8 }, (_, i) => [open("2026-11-26T01:00:00Z", `k${i}`, `task ${i}`, "pi"), turn("2026-11-26T02:00:00Z", `k${i}`, t(1000 * (i + 1), 1))]).flat();
  const top = usageReport(many, { now: NOW });
  expect(top.days).toHaveLength(7);
  expect(top.tasks.map((x) => x.taskId)).toEqual(["k7", "k6", "k5", "k4", "k3"]);
  expect(top.taskCount).toBe(8);
});

// D591: the partner's own turns and Ducter's own looks count too, apart from the tasks; every part
// says its share, and every agent the task that used most of it (what the limit card names).
const side = (ts: string, kind: "partner_session" | "look_used", body: Bodies["partner_session"] | Bodies["look_used"]): LogEvent => ({ seq: ++seq, ts, persona: "default", stream: kind === "look_used" ? "looks" : "partner", origin: "system", kind, body }) as LogEvent;

test("the partner's replies and Ducter's looks, shares, and each agent's top task", () => {
  const evs = [
    open("2026-11-25T08:00:00Z", "r", "Refactor the store", "claude-code", "opus", true),
    open("2026-11-25T08:00:00Z", "s", "Fix the login page", "claude-code", "sonnet", true),
    open("2026-11-25T08:00:00Z", "x", "Review PR #551", "codex", "gpt-6"),
    turn("2026-11-25T09:00:00Z", "r", t(600_000, 20_000)),
    turn("2026-11-25T09:30:00Z", "s", t(100_000, 5_000)),
    turn("2026-11-25T10:00:00Z", "x", t(200_000, 5_000)),
    side("2026-11-25T11:00:00Z", "partner_session", { event: "turn_used", harness: "claude-code", model: "opus", turn: { input: 60_000, output: 1_000, cached: 50_000 } }),
    side("2026-11-25T11:05:00Z", "partner_session", { event: "recut", harness: "claude-code" }),
    side("2026-11-25T12:00:00Z", "look_used", { harness: "claude-code", model: "haiku", turn: { input: 9_000, output: 100 }, what: "judge" }),
    // Before the days asked: not counted.
    side("2026-11-10T12:00:00Z", "look_used", { harness: "codex", turn: { input: 9_000, output: 100 }, what: "triage" }),
  ];
  const r = usageReport(evs, { now: NOW, days: 7 });
  expect(r.talk).toMatchObject({ turns: 1, tokens: { input: 60_000, output: 1_000, cached: 50_000 } });
  expect(r.looks).toMatchObject({ turns: 1, tokens: { input: 9_000, output: 100, cached: 0 } });
  expect(r.turns).toBe(5);
  expect(r.total.input).toBe(600_000 + 100_000 + 200_000 + 60_000 + 9_000);
  // The tasks only, by who opened them.
  expect(r.by.you.input + r.by.partner.input).toBe(900_000);
  expect(r.taskCount).toBe(3);
  const cc = r.harnesses.find((h) => h.harness === "claude-code")!;
  expect(r.harnesses[0]!.harness).toBe("claude-code");
  expect(cc.top).toMatchObject({ taskId: "r", title: "Refactor the store" });
  // r weighs 620k of claude-code's 620k + 105k + (10k + 1k + 5k) + 9.1k.
  expect(cc.top!.share).toBeCloseTo(620_000 / (620_000 + 105_000 + 16_000 + 9_100), 5);
  expect(r.harnesses.find((h) => h.harness === "codex")!.top!.share).toBe(1);
  expect(r.harnesses.reduce((s, h) => s + h.share, 0)).toBeCloseTo(1, 5);
  expect(r.tasks[0]).toMatchObject({ taskId: "r" });
  expect(r.tasks[0]!.share + r.tasks[1]!.share + r.tasks[2]!.share + r.talk.share + r.looks.share).toBeCloseTo(1, 5);
  expect(r.agents.map((a) => `${a.harness}/${a.model ?? ""}`)).toContain("claude-code/haiku");
  expect(r.notCounted).toEqual(["money"]);
  expect(usageShare(0.623)).toBe("62%");
  expect(usageShare(0.004)).toBe("<1%");
});

test("only the partner and the looks: no top task for that agent", () => {
  const r = usageReport([side("2026-11-26T08:00:00Z", "partner_session", { event: "turn_used", harness: "codex", turn: { input: 1000, output: 10 } })], { now: NOW });
  expect(r.harnesses).toHaveLength(1);
  expect(r.harnesses[0]!.top).toBeUndefined();
  expect(r.talk.share).toBe(1);
});
