// D588 (research/235 #2): 用了多少 / What the work used. The tokens every task's turns used over the
// last few days, counted from the Log alone (each turn end carries its usage, D288): in all, by AI
// agent and model, by who started the work, the tasks that used most, and day by day in the
// person's own days. Pure and read only: no store of its own, no model call, so it can always be
// counted again from the same Log. What it can't count yet is said in the report (`notCounted`):
// the partner's own turns and Ducter's own looks never reach a task's stream, and nothing is priced.
import type { Bodies, LogEvent, TurnTokens, Usage } from "./index.ts";
import { turnTokensOf, type RunningTokens } from "./context-meter.ts";

const DAY = 86_400_000;
export const USAGE_DAYS_DEFAULT = 7;
export const USAGE_DAYS_MAX = 31;
/** The tasks named in the report at most (the most used first). */
export const USAGE_TOP_DEFAULT = 5;
export const USAGE_TOP_MAX = 50;
/** The event kinds the count reads. */
export const USAGE_KINDS = ["task_open", "body_selected", "task_event"] as const;

/** Tokens added up: input counts its cached part (`cached`), as a turn's do. */
export interface TokenSum {
  input: number;
  output: number;
  cached: number;
}

export interface UsageAgent {
  harness: string;
  model?: string;
  tokens: TokenSum;
  turns: number;
  tasks: number;
}

export interface UsageTask {
  taskId: string;
  title: string;
  harness: string;
  model?: string;
  /** "you": the person opened it (D128); "partner": the partner did, or what it looks after. */
  by: "you" | "partner";
  tokens: TokenSum;
  turns: number;
  /** Its last counted turn's time. */
  lastAt: string;
}

export interface UsageDay {
  /** The person's own day, YYYY-MM-DD at their offset. */
  day: string;
  tokens: TokenSum;
  turns: number;
}

export interface UsageReport {
  /** The first moment counted (the start of the first day, at the person's offset) and now. */
  since: string;
  until: string;
  days: UsageDay[];
  total: TokenSum;
  turns: number;
  /** Tasks with at least one counted turn. */
  taskCount: number;
  agents: UsageAgent[];
  by: { you: TokenSum; partner: TokenSum };
  /** The most used first; at most `top`. */
  tasks: UsageTask[];
  /** What this count leaves out, so a client can say so. */
  notCounted: ("partner_turns" | "ducter_looks" | "money")[];
}

const zero = (): TokenSum => ({ input: 0, output: 0, cached: 0 });
const addTo = (s: TokenSum, t: TurnTokens) => {
  s.input += t.input;
  s.output += t.output;
  s.cached += t.cached ?? 0;
};

/**
 * What a sum weighs, for ordering only: cache reads at a tenth (as the providers price them and as
 * core's judge budget counts them, research/48 P4), everything else in full.
 */
export const usageWeight = (s: TokenSum) => s.input - s.cached + s.output + s.cached * 0.1;

/** The person's day of a moment: YYYY-MM-DD at `tzOffsetMin` east of UTC. */
export function usageDay(ms: number, tzOffsetMin: number): string {
  return new Date(ms + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** The first moment counted for `days` days back from now (midnight of the first, at the offset). */
export function usageSince(now: number, days: number, tzOffsetMin: number): number {
  const today = Date.parse(`${usageDay(now, tzOffsetMin)}T00:00:00Z`) - tzOffsetMin * 60_000;
  return today - DAY * (days - 1);
}

interface TaskState {
  title: string;
  harness: string;
  model?: string;
  by: "you" | "partner";
  prev?: RunningTokens;
  tokens: TokenSum;
  turns: number;
  lastAt?: string;
}

/**
 * The report from the Log's task_open, body_selected and task_event events (any order of streams,
 * seq order within each; events before `since` only set a task's title, agent and running totals).
 */
export function usageReport(events: readonly LogEvent[], o: { now: number; days?: number; tzOffsetMin?: number; top?: number }): UsageReport {
  const days = Math.min(USAGE_DAYS_MAX, Math.max(1, Math.floor(o.days ?? USAGE_DAYS_DEFAULT)));
  const tz = Math.max(-14 * 60, Math.min(14 * 60, Math.round(o.tzOffsetMin ?? 0)));
  const top = Math.min(USAGE_TOP_MAX, Math.max(0, Math.floor(o.top ?? USAGE_TOP_DEFAULT)));
  const since = usageSince(o.now, days, tz);
  const dayRows = new Map<string, UsageDay>();
  for (let i = 0; i < days; i++) {
    const d = usageDay(since + i * DAY + 1, tz);
    dayRows.set(d, { day: d, tokens: zero(), turns: 0 });
  }
  const tasks = new Map<string, TaskState>();
  const agents = new Map<string, UsageAgent & { ids: Set<string> }>();
  const total = zero();
  const by = { you: zero(), partner: zero() };
  let turns = 0;
  const task = (id: string): TaskState => {
    let t = tasks.get(id);
    if (!t) tasks.set(id, (t = { title: id, harness: "", by: "partner", tokens: zero(), turns: 0 }));
    return t;
  };
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  for (const ev of sorted) {
    if (ev.kind === "task_open") {
      const b = ev.body as Bodies["task_open"];
      const t = task(b.taskId);
      t.title = b.title || b.taskId;
      t.harness = b.harness;
      if (b.model) t.model = b.model;
      else delete t.model;
      t.by = b.origin === "you" ? "you" : "partner";
      continue;
    }
    if (ev.kind === "body_selected") {
      const b = ev.body as Bodies["body_selected"];
      const t = task(b.taskId);
      // Another agent from here on: its own session and running totals (D282).
      if (t.harness && t.harness !== b.harness) delete t.prev;
      t.harness = b.harness;
      if (b.model) t.model = b.model;
      else delete t.model;
      continue;
    }
    if (ev.kind !== "task_event") continue;
    const b = ev.body as Bodies["task_event"];
    const raw = (b.raw && typeof b.raw === "object" ? b.raw : {}) as { switched?: unknown };
    const t = task(b.taskId);
    if (raw.switched) {
      delete t.prev;
      continue;
    }
    const u = b.usage as Usage | undefined;
    if (!u) continue;
    const step = turnTokensOf(u, t.prev);
    t.prev = step.prev;
    const at = Date.parse(ev.ts);
    if (!step.turn || !(at >= since) || at > o.now) continue;
    const turn = { input: Math.max(0, step.turn.input), output: Math.max(0, step.turn.output), cached: Math.max(0, step.turn.cached ?? 0) };
    if (!turn.input && !turn.output) continue;
    addTo(t.tokens, turn);
    t.turns++;
    t.lastAt = ev.ts;
    addTo(total, turn);
    addTo(by[t.by], turn);
    turns++;
    const row = dayRows.get(usageDay(at, tz));
    if (row) {
      addTo(row.tokens, turn);
      row.turns++;
    }
    const key = `${t.harness}\u0000${t.model ?? ""}`;
    let a = agents.get(key);
    if (!a) agents.set(key, (a = { harness: t.harness || "unknown", ...(t.model ? { model: t.model } : {}), tokens: zero(), turns: 0, tasks: 0, ids: new Set() }));
    addTo(a.tokens, turn);
    a.turns++;
    a.ids.add(b.taskId);
  }
  const used = [...tasks.entries()].filter(([, t]) => t.turns > 0);
  const byWeight = <X extends { tokens: TokenSum }>(x: X, y: X) => usageWeight(y.tokens) - usageWeight(x.tokens);
  return {
    since: new Date(since).toISOString(),
    until: new Date(o.now).toISOString(),
    days: [...dayRows.values()],
    total,
    turns,
    taskCount: used.length,
    agents: [...agents.values()].map(({ ids, ...a }) => ({ ...a, tasks: ids.size })).sort(byWeight),
    by,
    tasks: used
      .map(([taskId, t]): UsageTask => ({ taskId, title: t.title, harness: t.harness || "unknown", ...(t.model ? { model: t.model } : {}), by: t.by, tokens: t.tokens, turns: t.turns, lastAt: t.lastAt! }))
      .sort(byWeight)
      .slice(0, top),
    notCounted: ["partner_turns", "ducter_looks", "money"],
  };
}
