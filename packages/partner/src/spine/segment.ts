// Where a segment closes (design/memory.md "Lifecycle", research/14 §4), and what code can see
// in one without a model: the open asks, the tasks and questions still open, the identifiers.
import type { Bodies, LogEvent } from "../../../protocol/src/index.ts";
import { estTokens, type Obligation, type WindowSnap } from "./digest.ts";

/** Channel events the spine reads: the conversation and its work, not receipts or renderings. */
export const SPINE_KINDS = ["user_msg", "ai_msg", "ack", "job_status", "report", "decision", "decision_resolved", "waiter", "memory_noted", "bridge_msg"] as const satisfies readonly LogEvent["kind"][];

export interface Unit {
  e: LogEvent;
  line: string; // as the model reads it (#seq [time who] text)
  tokens: number;
}

export interface CutOptions {
  hiTokens: number; // close once the unsummarized tail is over this (default 24K)
  loTokens: number; // the verbatim window keeps at least this much (default 8K)
  minTokens: number; // a quiet gap or a finished topic closes only a part at least this big
  quietMs: number; // a channel quiet this long closes what it has
  gapMs: number; // a pause this long is a good place to cut (30 min)
}
export const DEFAULT_CUT: CutOptions = { hiTokens: 24_000, loTokens: 8_000, minTokens: 4_000, quietMs: 2 * 3600_000, gapMs: 30 * 60_000 };

export interface Cut {
  from: number;
  to: number;
  reason: "budget" | "quiet" | "topic";
  units: Unit[];
}

const isPartnerSide = (e: LogEvent) => e.origin !== "user" && e.kind !== "user_msg";

/** The text of an event that anchors are checked against: the user's own message. */
export function userText(e: LogEvent): string | undefined {
  return e.kind === "user_msg" ? (e.body as Bodies["user_msg"]).text : undefined;
}

/** A finished topic: the user merged a task's work or opened its PR by button. */
function topicDone(e: LogEvent): boolean {
  return e.kind === "job_status" && e.origin === "user" && /\b(merged|pull request|PR)\b/i.test((e.body as Bodies["job_status"]).text);
}

/**
 * The next segment to close in the unsummarized units, or null. Never mid-turn: a cut falls
 * after a partner-side event and before the user's next message (or at the end of the channel).
 * Among the allowed places, a cut with no open ask straddling it, after a pause, or after a
 * task's result ranks first.
 */
export function chooseCut(units: Unit[], now: number, o: CutOptions = DEFAULT_CUT): Cut | null {
  if (!units.length) return null;
  const total = units.reduce((n, u) => n + u.tokens, 0);
  const boundary = (i: number) => {
    const u = units[i]!;
    if (!isPartnerSide(u.e)) return false; // the user's message waits for its answer
    const next = units[i + 1];
    return !next || next.e.kind === "user_msg" || !isPartnerSide(next.e) || Date.parse(next.e.ts) - Date.parse(u.e.ts) >= o.gapMs;
  };
  const make = (i: number, reason: Cut["reason"]): Cut => ({ from: units[0]!.e.seq, to: units[i]!.e.seq, reason, units: units.slice(0, i + 1) });

  if (total > o.hiTokens) {
    // A part of (hi - lo) .. hi tokens: the window still holds the rest verbatim.
    const lo = o.hiTokens - o.loTokens;
    let acc = 0;
    let best: { i: number; score: number } | null = null;
    let firstAfterLo = -1;
    for (let i = 0; i < units.length; i++) {
      acc += units[i]!.tokens;
      if (acc > o.hiTokens && best) break;
      if (!boundary(i)) continue;
      if (acc < lo) continue;
      if (firstAfterLo < 0) firstAfterLo = i;
      if (acc > o.hiTokens) break;
      const score = boundaryScore(units, i, o);
      if (!best || score >= best.score) best = { i, score };
    }
    const i = best?.i ?? firstAfterLo;
    if (i >= 0 && i < units.length - 1) return make(i, "budget");
    // No allowed place before the end (one very long turn): close at the last boundary we have.
    for (let j = units.length - 1; j >= 0; j--) if (boundary(j) && units.slice(0, j + 1).reduce((n, u) => n + u.tokens, 0) >= lo) return make(j, "budget");
    return null;
  }

  if (total < o.minTokens) return null;
  // A finished topic: close right after the user's merge (or the partner's line after it).
  for (let i = units.length - 1; i >= 0; i--) {
    if (!topicDone(units[i]!.e)) continue;
    let j = i;
    while (j + 1 < units.length && isPartnerSide(units[j + 1]!.e) && units[j + 1]!.e.kind !== "job_status") j++;
    const acc = units.slice(0, j + 1).reduce((n, u) => n + u.tokens, 0);
    if (acc >= o.minTokens && boundary(j)) return make(j, "topic");
    break;
  }
  // Quiet: nothing new for a while, and the last thing said was ours.
  const last = units[units.length - 1]!;
  if (now - Date.parse(last.e.ts) >= o.quietMs && boundary(units.length - 1)) return make(units.length - 1, "quiet");
  return null;
}

function boundaryScore(units: Unit[], i: number, o: CutOptions): number {
  let s = 0;
  const seg = units.slice(0, i + 1);
  if (!unansweredAsks(seg).length) s += 4;
  const next = units[i + 1];
  if (next && Date.parse(next.e.ts) - Date.parse(units[i]!.e.ts) >= o.gapMs) s += 3;
  const k = units[i]!.e.kind;
  if (k === "report" || k === "job_status") s += 2;
  if (next?.e.kind === "user_msg") s += 1;
  return s;
}

/** User messages with no partner answer (message, ack or question) after them in these units. */
export function unansweredAsks(units: Unit[]): number[] {
  const out: number[] = [];
  let pending: number[] = [];
  for (const u of units) {
    if (u.e.kind === "user_msg") pending.push(u.e.seq);
    else if (u.e.origin === "partner" && ["ai_msg", "ack", "decision"].includes(u.e.kind)) pending = [];
  }
  out.push(...pending);
  return out;
}

/**
 * Obligations code can see at the close, by ref: tasks still running, questions still open,
 * timers still armed. They are opened and closed by code, never by the writer.
 */
export function mechanicalObligations(units: Unit[]): { opened: Omit<Obligation, "id">[]; settled: { ref: string; at: number }[]; windows: WindowSnap[] } {
  const tasks = new Map<string, { title: string; at: number; state: string }>();
  const decisions = new Map<string, { q: string; at: number; task?: string }>();
  const waiters = new Map<string, { reason: string; at: number }>();
  const settled: { ref: string; at: number }[] = [];
  const windows = new Map<string, WindowSnap>();
  for (const { e } of units) {
    if (e.kind === "job_status") {
      const b = e.body as Bodies["job_status"];
      if (!b.taskId || e.origin === "user") continue;
      windows.set(b.taskId, { taskId: b.taskId, title: windows.get(b.taskId)?.title ?? b.text, state: b.state, at: e.seq });
      if (b.state === "running") tasks.set(b.taskId, { title: b.text, at: e.seq, state: b.state });
      else (tasks.delete(b.taskId), settled.push({ ref: `task:${b.taskId}`, at: e.seq }));
    } else if (e.kind === "report") {
      const r = e.body as Bodies["report"];
      const w = windows.get(r.taskId);
      windows.set(r.taskId, { taskId: r.taskId, title: w?.title ?? r.taskId, state: r.state, at: e.seq });
      if (r.state === "done" || r.state === "failed") (tasks.delete(r.taskId), settled.push({ ref: `task:${r.taskId}`, at: e.seq }));
    } else if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      decisions.set(d.decisionId, { q: d.question, at: e.seq, ...(d.taskId ? { task: d.taskId } : {}) });
    } else if (e.kind === "decision_resolved") {
      const b = e.body as Bodies["decision_resolved"];
      decisions.delete(b.decisionId);
      settled.push({ ref: `decision:${b.decisionId}`, at: e.seq });
    } else if (e.kind === "waiter") {
      const b = e.body as Bodies["waiter"];
      if (b.routineId) continue;
      if (b.state === "armed") waiters.set(b.waiterId, { reason: b.reason, at: e.seq });
      else (waiters.delete(b.waiterId), settled.push({ ref: `waiter:${b.waiterId}`, at: e.seq }));
    }
  }
  const opened: Omit<Obligation, "id">[] = [
    ...[...tasks.entries()].map(([id, t]) => ({ who: "me" as const, text: `report the result of task ${id} "${t.title}"`, at: t.at, ref: `task:${id}` })),
    ...[...decisions.entries()].map(([id, d]) => ({ who: "user" as const, text: `answer${d.task ? ` task ${d.task}'s question` : ""}: ${d.q.slice(0, 200)}`, at: d.at, ref: `decision:${id}` })),
    ...[...waiters.entries()].map(([id, w]) => ({ who: "me" as const, text: `come back when: ${w.reason.slice(0, 200)}`, at: w.at, ref: `waiter:${id}` })),
  ].sort((a, b) => a.at - b.at);
  return { opened, settled, windows: [...windows.values()] };
}

// Identifier shapes worth keeping exactly (OpenClaw-style, research/14 §6.4).
const ID_PATTERNS = [
  /https?:\/\/[^\s)>\]」，。]+/g, // URLs
  /(?:~|\.{1,2})?\/?(?:[\w.-]+\/)+[\w.-]+/g, // paths
  /\b[\w-]+\.(?:ts|tsx|js|json|md|py|rs|go|swift|sql|db|toml|yaml|yml|sh)\b/g, // file names
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g, // hashes
  /\b(?:t|task|job|dec|w)_[a-z0-9]{4,}\b/gi, // Ducter ids
  /\b[A-Z][A-Z0-9]*-\d+\b/g, // ticket-style ids (ABC-12)
  /\bv?\d+\.\d+(?:\.\d+)+\b/g, // versions
  /(?:\$|¥)?\d+(?:\.\d+)?\s?(?:K|M|ms|min|GB|MB|%|元|万|tokens?)(?![\w])/g, // numbers with units
];

/** Identifier-shaped strings in a text, in order of first appearance. */
export function identifiers(text: string): string[] {
  const out = new Set<string>();
  ID_PATTERNS.forEach((re, k) => {
    for (const m of text.matchAll(re)) {
      const v = m[0].replace(/[.,;:]+$/, "");
      if (v.length < 3 || /^#?\d+$/.test(v)) continue;
      // A path needs to look like one ("zh/en" and "Go/Hold" are words, not paths).
      if (k === 1 && !(/^(~|\.|\/)/.test(v) || v.split("/").length >= 3 || /\.\w{1,5}$/.test(v))) continue;
      out.add(v);
    }
  });
  return [...out];
}

/** Identifiers that must survive the digest: said by the user, or repeated; at most `cap`. */
export function salientIdentifiers(units: Unit[], cap = 12): string[] {
  const count = new Map<string, { n: number; user: boolean; first: number }>();
  units.forEach((u, i) => {
    for (const id of identifiers(u.line)) {
      const c = count.get(id) ?? { n: 0, user: false, first: i };
      c.n++;
      if (u.e.kind === "user_msg") c.user = true;
      count.set(id, c);
    }
  });
  return [...count.entries()]
    .filter(([, c]) => c.user || c.n >= 2)
    .sort((a, b) => Number(b[1].user) - Number(a[1].user) || b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, cap)
    .map(([id]) => id);
}

export { estTokens };
