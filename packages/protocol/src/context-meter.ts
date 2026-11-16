// D288: a task's context meter, read from its own Log stream (the runner logs what the harness
// reports: a reading as the context grows, the turn's usage at each turn end, each compaction with
// the size before and after). Pure and language-neutral: the clients word it in their i18n. The
// Go port (apps/desktop/internal/views/contextmeter.go) passes the same cases
// (fixtures/context-meter.json).
import type { Bodies, LogEvent, TurnTokens, Usage, UsageWindow } from "./index.ts";
import { saveBeforeAt } from "./harness-facts.ts";

/** calm: room to work; near: past the point where the task is asked to save (D135), compaction is close. */
export type MeterLevel = "calm" | "near";

export interface ContextMeter {
  /** What the context holds now; absent when unknown (before the first reading, right after a compaction). */
  tokens?: number;
  /** The window it fills. */
  window?: number;
  /** Where the agent compacts on its own. */
  compactAt?: number;
  /** tokens / window, rounded. */
  percent?: number;
  level: MeterLevel;
  /** The last turn's tokens, and this task's in all (every session it had). */
  turn?: TurnTokens;
  total?: TurnTokens;
  /** How many times its context was compacted (by the agent, or asked). */
  compactions: number;
  /** The latest compaction: the size before and after, when known. */
  last?: { seq: number; from?: number; to?: number; manual?: boolean };
}

type Raw = {
  kind?: string;
  contextTokens?: number;
  contextWindow?: number;
  compactAt?: number;
  after?: number | boolean;
  before?: number;
  outcome?: string;
  trigger?: string;
  compactions?: number;
  switched?: unknown;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** The meter from a task's events (task stream, any order of kinds; only task_event is read). */
export function contextMeter(events: readonly LogEvent[]): ContextMeter {
  const m: ContextMeter = { level: "calm", compactions: 0 };
  // The session's running totals at the previous turn end (a turn without `turn` is their difference).
  let prev: { input: number; output: number; cached: number } | undefined;
  const add = (t: TurnTokens) => {
    const s = m.total ?? { input: 0, output: 0 };
    m.total = { input: s.input + t.input, output: s.output + t.output, ...(t.cached !== undefined || s.cached !== undefined ? { cached: (s.cached ?? 0) + (t.cached ?? 0) } : {}) };
  };
  const frame = (r: { contextWindow?: unknown; compactAt?: unknown }) => {
    const w = num(r.contextWindow);
    const c = num(r.compactAt);
    if (w) m.window = w;
    if (c) m.compactAt = c;
  };
  for (const ev of events) {
    if (ev.kind !== "task_event") continue;
    const b = ev.body as Bodies["task_event"];
    const raw = (b.raw && typeof b.raw === "object" ? b.raw : {}) as Raw;
    if (raw.kind === "context") {
      frame(raw);
      const n = num(raw.contextTokens);
      if (n !== undefined) m.tokens = n;
      if (raw.after && m.last && m.last.to === undefined && n !== undefined) m.last.to = n;
      continue;
    }
    if (raw.kind === "compaction_ended") {
      if (raw.outcome === "failed" || raw.outcome === "aborted") continue;
      m.compactions = Math.max(m.compactions + 1, num(raw.compactions) ?? 0);
      const from = num(raw.before) ?? num(raw.contextTokens);
      const to = num(raw.after);
      m.last = { seq: ev.seq, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}), ...(raw.trigger === "manual" ? { manual: true } : {}) };
      if (to !== undefined) m.tokens = to;
      else delete m.tokens;
      continue;
    }
    // Another agent took over: a new session, its own context (D282).
    if (raw.switched) {
      delete m.tokens;
      prev = undefined;
      continue;
    }
    const u = b.usage as Usage | undefined;
    if (!u) continue;
    frame(u);
    const n = num(u.contextTokens);
    if (n !== undefined) m.tokens = n;
    const now = { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0, cached: u.cacheRead ?? 0 };
    let turn: TurnTokens | undefined = u.turn;
    if (!turn && (u.inputTokens !== undefined || u.outputTokens !== undefined)) {
      // A running total that went down is a new session's (a resume, a switch): its own first turn.
      const fresh = !prev || now.input < prev.input || now.output < prev.output;
      const base = fresh ? { input: 0, output: 0, cached: 0 } : prev!;
      turn = { input: now.input - base.input, output: now.output - base.output, ...(u.cacheRead !== undefined ? { cached: Math.max(0, now.cached - base.cached) } : {}) };
    }
    if (u.inputTokens !== undefined || u.outputTokens !== undefined) prev = now;
    if (turn) {
      m.turn = turn;
      add(turn);
    }
  }
  if (m.tokens !== undefined && m.window) m.percent = Math.round((m.tokens / m.window) * 100);
  const point = m.compactAt ?? (m.window ? Math.round(m.window * 0.8) : undefined);
  if (m.tokens !== undefined && point && m.tokens >= saveBeforeAt(point)) m.level = "near";
  return m;
}

/** A token count as people read it: 812, 4.2k, 120k, 1.2M. */
export function tokensShort(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${trim1(n / 1000)}k`;
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${trim1(n / 1_000_000)}M`;
}

function trim1(x: number): string {
  const s = (Math.round(x * 10) / 10).toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/**
 * D288: what kind of limit a usage window is, so a client words it in its language: a 5-hour
 * one, a weekly one (with the model it is scoped to: "Current week (Opus)"), extra usage, or
 * another length (its label as the agent wrote it).
 */
export type LimitSpan = { span: "hours"; n: number; model?: string } | { span: "days"; n: number; model?: string } | { span: "extra" } | { span: "other"; label: string };

const HOUR = 3_600_000;

export function limitSpan(w: Pick<UsageWindow, "id" | "label" | "durationMs">): LimitSpan {
  if (w.id === "extra_usage") return { span: "extra" };
  const model = /\(([^)]+)\)\s*$/.exec(w.label)?.[1]?.trim();
  const scoped = model && !/^(all models|oauth apps)$/i.test(model) ? { model } : {};
  const ms = w.durationMs ?? (w.id === "five_hour" ? 5 * HOUR : /^seven_day/.test(w.id ?? "") ? 168 * HOUR : undefined);
  if (ms && ms % (24 * HOUR) === 0) return { span: "days", n: ms / (24 * HOUR), ...scoped };
  if (ms && ms % HOUR === 0) return { span: "hours", n: ms / HOUR, ...scoped };
  return { span: "other", label: w.label };
}

/** The window an account is closest to running out of: the one a person should see first. */
export function tightest(windows: readonly UsageWindow[]): UsageWindow | undefined {
  let best: UsageWindow | undefined;
  for (const w of windows) if (w.id !== "extra_usage" && (!best || w.used > best.used)) best = w;
  return best;
}
