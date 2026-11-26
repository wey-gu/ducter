// D588 (research/235 #2): 用了多少 / What the work used. The tokens every task's turns used over the
// last few days, counted from the Log alone (each turn end carries its usage, D288): in all, by AI
// agent and model, by who started the work, the tasks that used most, and day by day in the
// person's own days. Pure and read only: no store of its own, no model call, so it can always be
// counted again from the same Log. D591: the partner's own turns (`partner_session` turn_used) and
// Ducter's own looks (`look_used`) are counted too, apart from the tasks (`talk`, `looks`); every
// part carries its share of the whole, and every agent the task that used most of it, so a client
// and the partner's tool say what used it without a sum of their own. What it still can't count is
// said in the report (`notCounted`): money (nothing is priced).
import type { Bodies, LogEvent, TurnTokens, Usage } from "./index.ts";
import { turnTokensOf, type RunningTokens } from "./context-meter.ts";

const DAY = 86_400_000;
export const USAGE_DAYS_DEFAULT = 7;
export const USAGE_DAYS_MAX = 31;
/** The tasks named in the report at most (the most used first). */
export const USAGE_TOP_DEFAULT = 5;
export const USAGE_TOP_MAX = 50;
/** The event kinds the count reads. */
export const USAGE_KINDS = ["task_open", "body_selected", "task_event", "partner_session", "look_used"] as const;

/** Tokens added up: input counts its cached part (`cached`), as a turn's do. */
export interface TokenSum {
  input: number;
  output: number;
  cached: number;
}

/** D591: the task that used most of an agent, and its share of that agent (0..1, by weight). */
export interface UsageTop {
  taskId: string;
  title: string;
  share: number;
}

export interface UsageAgent {
  harness: string;
  model?: string;
  tokens: TokenSum;
  turns: number;
  tasks: number;
  /** D591: of the whole, by weight (0..1). */
  share: number;
}

/** D591: one AI agent across its models, what a usage limit counts against (one per account). */
export interface UsageHarness {
  harness: string;
  tokens: TokenSum;
  turns: number;
  share: number;
  /** The task that used most of this agent; none when only the partner and Ducter's looks used it. */
  top?: UsageTop;
}

/** D591: the partner's own replies, or Ducter's own looks: what no task used. */
export interface UsagePart {
  tokens: TokenSum;
  turns: number;
  share: number;
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
  /** D591: of the whole, by weight (0..1). */
  share: number;
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
  /** Everything: the tasks, the partner's own replies and Ducter's own looks. */
  total: TokenSum;
  turns: number;
  /** Tasks with at least one counted turn. */
  taskCount: number;
  agents: UsageAgent[];
  /** D591: by agent across its models, the most used first. */
  harnesses: UsageHarness[];
  /** The tasks only, by who opened them. */
  by: { you: TokenSum; partner: TokenSum };
  /** D591: the partner's own replies (every partner's), and Ducter's own looks. */
  talk: UsagePart;
  looks: UsagePart;
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
 * What a sum weighs, for ordering and shares: cache reads at a tenth (as the providers price them
 * and as core's judge budget counts them, research/48 P4), everything else in full.
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

const clean = (t: TurnTokens): TurnTokens => ({ input: Math.max(0, t.input || 0), output: Math.max(0, t.output || 0), cached: Math.max(0, t.cached ?? 0) });

/**
 * The report from the Log's task_open, body_selected, task_event, partner_session (turn_used) and
 * look_used events (any order of streams, seq order within each; a task's events before `since`
 * only set its title, agent and running totals).
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
  const agents = new Map<string, Omit<UsageAgent, "share"> & { ids: Set<string> }>();
  const harnesses = new Map<string, { tokens: TokenSum; turns: number; byTask: Map<string, TokenSum> }>();
  const total = zero();
  const by = { you: zero(), partner: zero() };
  const talk = { tokens: zero(), turns: 0 };
  const looks = { tokens: zero(), turns: 0 };
  let turns = 0;
  const task = (id: string): TaskState => {
    let t = tasks.get(id);
    if (!t) tasks.set(id, (t = { title: id, harness: "", by: "partner", tokens: zero(), turns: 0 }));
    return t;
  };
  const within = (ts: string) => {
    const at = Date.parse(ts);
    return at >= since && at <= o.now ? at : undefined;
  };
  /** One counted turn: into the whole, its day, its agent and model, and its agent across models. */
  const count = (at: number, turn: TurnTokens, harness: string, model: string | undefined, taskId?: string) => {
    addTo(total, turn);
    turns++;
    const row = dayRows.get(usageDay(at, tz));
    if (row) {
      addTo(row.tokens, turn);
      row.turns++;
    }
    const h = harness || "unknown";
    const key = `${h}\u0000${model ?? ""}`;
    let a = agents.get(key);
    if (!a) agents.set(key, (a = { harness: h, ...(model ? { model } : {}), tokens: zero(), turns: 0, tasks: 0, ids: new Set() }));
    addTo(a.tokens, turn);
    a.turns++;
    let hs = harnesses.get(h);
    if (!hs) harnesses.set(h, (hs = { tokens: zero(), turns: 0, byTask: new Map() }));
    addTo(hs.tokens, turn);
    hs.turns++;
    if (taskId) {
      a.ids.add(taskId);
      let s = hs.byTask.get(taskId);
      if (!s) hs.byTask.set(taskId, (s = zero()));
      addTo(s, turn);
    }
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
    if (ev.kind === "partner_session") {
      const b = ev.body as Bodies["partner_session"];
      const at = within(ev.ts);
      if (b.event !== "turn_used" || !b.turn || at === undefined) continue;
      const turn = clean(b.turn);
      if (!turn.input && !turn.output) continue;
      addTo(talk.tokens, turn);
      talk.turns++;
      count(at, turn, b.harness, b.model);
      continue;
    }
    if (ev.kind === "look_used") {
      const b = ev.body as Bodies["look_used"];
      const at = within(ev.ts);
      if (!b?.turn || at === undefined) continue;
      const turn = clean(b.turn);
      if (!turn.input && !turn.output) continue;
      addTo(looks.tokens, turn);
      looks.turns++;
      count(at, turn, b.harness, b.model);
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
    const at = within(ev.ts);
    if (!step.turn || at === undefined) continue;
    const turn = clean(step.turn);
    if (!turn.input && !turn.output) continue;
    addTo(t.tokens, turn);
    t.turns++;
    t.lastAt = ev.ts;
    addTo(by[t.by], turn);
    count(at, turn, t.harness, t.model, b.taskId);
  }
  const whole = usageWeight(total);
  const of = (s: TokenSum, w = whole) => (w > 0 ? Math.min(1, usageWeight(s) / w) : 0);
  const used = [...tasks.entries()].filter(([, t]) => t.turns > 0);
  const byWeight = <X extends { tokens: TokenSum }>(x: X, y: X) => usageWeight(y.tokens) - usageWeight(x.tokens);
  return {
    since: new Date(since).toISOString(),
    until: new Date(o.now).toISOString(),
    days: [...dayRows.values()],
    total,
    turns,
    taskCount: used.length,
    agents: [...agents.values()].map(({ ids, ...a }) => ({ ...a, tasks: ids.size, share: of(a.tokens) })).sort(byWeight),
    harnesses: [...harnesses.entries()]
      .map(([harness, h]): UsageHarness => {
        let best: [string, TokenSum] | undefined;
        for (const e of h.byTask) if (!best || usageWeight(e[1]) > usageWeight(best[1])) best = e;
        const w = usageWeight(h.tokens);
        return { harness, tokens: h.tokens, turns: h.turns, share: of(h.tokens), ...(best ? { top: { taskId: best[0], title: tasks.get(best[0])?.title ?? best[0], share: of(best[1], w) } } : {}) };
      })
      .sort(byWeight),
    by,
    talk: { ...talk, share: of(talk.tokens) },
    looks: { ...looks, share: of(looks.tokens) },
    tasks: used
      .map(([taskId, t]): UsageTask => ({ taskId, title: t.title, harness: t.harness || "unknown", ...(t.model ? { model: t.model } : {}), by: t.by, tokens: t.tokens, turns: t.turns, lastAt: t.lastAt!, share: of(t.tokens) }))
      .sort(byWeight)
      .slice(0, top),
    notCounted: ["money"],
  };
}

/** D591: a share as people read it: "62%", under one percent "<1%". */
export function usageShare(share: number): string {
  if (!(share > 0)) return "0%";
  if (share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}
