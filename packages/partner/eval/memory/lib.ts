// The long-conversation memory eval (research/14 §6.6, research/15), shared by `bun test`
// (fakes: an oracle writer, reachability instead of a model) and the real run (memory/run.ts).
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../../protocol/src/index.ts";
import { openLog, type SqliteLog } from "../../../core/src/log.ts";
import { renderHistoryLine, renderProjection, type RenderCtx } from "../../src/render.ts";
import { estTokens, renderDigest, type SegmentDigest } from "../../src/spine/digest.ts";
import { autoRecall, recallIntent } from "../../src/spine/recall.ts";
import type { CutOptions } from "../../src/spine/segment.ts";
import { createSpine, type Spine } from "../../src/spine/spine.ts";
import type { DigestWriter, WriterInput } from "../../src/spine/writer.ts";
import { corpus, type Line, type Note } from "./corpus.ts";
import { ABSTAIN, probes, type Probe, type ProbeType } from "./probes.ts";

/**
 * Budgets scaled to the corpus (about 2K tokens of channel), so a week closes several parts and
 * rolls up an epoch: the production budgets (24K/8K) shrunk about 50×.
 */
export const EVAL_CUT: Partial<CutOptions> = { hiTokens: 450, loTokens: 150, minTokens: 120 };
export const EVAL_EPOCH = { after: 3, size: 2 };

const iso = (at: string) => `2026-${at.slice(0, 5)}T${at.slice(6)}:00+08:00`;

export interface World {
  log: SqliteLog;
  ctx: RenderCtx;
  notes: Map<number, Note>; // seq -> the note on that line
  end: number; // the time after the last line (ms)
}

/** The corpus as a real Log, the way core and the partner would have written it. */
export function buildWorld(dir: string, lines: Line[] = corpus): World {
  let now = 0;
  const log = openLog({ path: join(dir, "ducter.db"), persona: "eval", clock: { now: () => now } });
  const notes = new Map<number, Note>();
  const decisions = new Map<string, Bodies["decision"]>();
  const titles = new Map<string, string>();
  let lastUser = 0;
  for (const l of lines) {
    now = Date.parse(iso(l.at));
    if ("user" in l) {
      const e = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: l.user } });
      lastUser = e.seq;
      if (l.note) notes.set(e.seq, l.note);
    } else if ("ai" in l) {
      const e = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: l.ai, replyTo: lastUser } as Bodies["ai_msg"] });
      if (l.note) notes.set(e.seq, l.note);
    } else if ("open" in l) {
      titles.set(l.open.task, l.open.title);
      log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: `job_${l.open.task}`, text: l.open.ack, replyTo: lastUser } });
      log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `job_${l.open.task}`, text: l.open.title, state: "running", taskId: l.open.task } });
    } else if ("report" in l) {
      const r = l.report;
      log.append({ stream: "channel", origin: "task", kind: "report", body: { taskId: r.task, state: r.state, summary: r.summary, questions: r.question ? [{ id: "q1", text: r.question.text, default: r.question.default, blocking: true, reversible: true }] : [], evidence: [] } as Bodies["report"] });
      if (r.question) {
        const d: Bodies["decision"] = { decisionId: `dec_${r.task}`, taskId: r.task, question: r.question.text, goLabel: r.question.default, defaultOption: "hold", reversible: true };
        decisions.set(d.decisionId, d);
        log.append({ stream: "channel", origin: "system", kind: "decision", body: d });
      }
      if (r.state === "done" || r.state === "failed")
        log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: `job_${r.task}`, text: titles.get(r.task) ?? r.task, state: r.state, taskId: r.task } });
    } else if ("resolve" in l) {
      const e = log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: `dec_${l.resolve.task}`, option: l.resolve.option, ...(l.resolve.text ? { text: l.resolve.text } : {}), by: "user" } });
      if (l.note) notes.set(e.seq, l.note);
    } else if ("merged" in l) {
      log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${l.merged.task}_merge`, taskId: l.merged.task, state: "done", text: "merged into main" } });
    } else if ("timer" in l) {
      const t = l.timer;
      log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: t.id, reason: t.reason, state: t.state, ...(t.due ? { at: iso(t.due) } : {}) } });
    }
  }
  const ctx: RenderCtx = { taskTitle: (id) => titles.get(id), decision: (id) => decisions.get(id) };
  return { log, ctx, notes, end: now + 60_000 };
}

/**
 * The fake writer: a perfect reader of the notes. It writes what a careful model should, and
 * only that, so the fake run measures cuts, audit, ledger, roll-up, projection and search.
 */
export function oracleWriter(w: World): DigestWriter {
  const decided = new Map<string, string>(); // note key -> decision text
  return {
    name: "oracle",
    async write(i: WriterInput) {
      const here = i.units.map((u) => ({ u, n: w.notes.get(u.e.seq) })).filter((x) => x.n);
      // A decision replaced later in this same part is only a change, not a decision.
      const replacedHere = new Set(here.map((x) => x.n!.replaces).filter(Boolean));
      for (const x of here) if (x.n!.decide && x.n!.key) decided.set(x.n!.key, x.n!.decide);
      const decisions = here
        .filter((x) => x.n!.decide && !replacedHere.has(x.n!.key))
        .map(({ u, n }) => {
          const old = n!.replaces ? decided.get(n!.replaces) : undefined;
          const sup = old ? i.inForce.find((d) => d.text === old)?.id : undefined;
          return { text: n!.decide!, ...(n!.why ? { why: n!.why } : {}), at: u.e.seq, ...(sup ? { supersedes: sup } : {}) };
        });
      const superseded = here
        .filter((x) => x.n!.replaces && decided.get(x.n!.replaces))
        .map(({ u, n }) => ({ old: decided.get(n!.replaces!)!, new: n!.decide!, at: u.e.seq }));
      const user = i.units.filter((u) => u.e.kind === "user_msg");
      const chunks: { from: number; to: number; gist: string; keys: string[] }[] = [];
      for (let k = 0; k < user.length; k += 3) {
        const a = user[k]!.e.seq;
        const next = user[k + 3]?.e.seq;
        const to = next ? (i.units.filter((u) => u.e.seq < next).pop()?.e.seq ?? a) : i.to;
        chunks.push({ from: k === 0 ? i.from : a, to, gist: (user[k]!.e.body as Bodies["user_msg"]).text.slice(0, 60), keys: [] });
      }
      if (!chunks.length) chunks.push({ from: i.from, to: i.to, gist: "tasks and reports", keys: [] });
      chunks[chunks.length - 1]!.keys.push(...i.mustKeep);
      const opened = here.filter((x) => x.n!.owe).map(({ u, n }) => ({ who: "me", text: n!.owe!, at: u.e.seq }));
      const owedText = new Map([...w.notes.values()].filter((n) => n.owe && n.key).map((n) => [n.key!, n.owe!]));
      const closed = here
        .filter((x) => x.n!.closes)
        .map(({ u, n }) => ({ id: i.open.find((o) => o.text === owedText.get(n!.closes!))?.id ?? "?", at: u.e.seq }))
        .filter((c) => c.id !== "?");
      // The ask the audit sees as open (a last user message) is owed too.
      const last = i.units[i.units.length - 1]!;
      if (last.e.kind === "user_msg" && !opened.some((o) => o.at === last.e.seq)) opened.push({ who: "me", text: "answer the last message", at: last.e.seq });
      return JSON.stringify({
        toc: chunks,
        decisions,
        superseded,
        anchors: here.filter((x) => x.n!.anchor).map(({ u, n }) => ({ at: u.e.seq, quote: n!.anchor! })).slice(0, 6),
        opened,
        closed,
        narrative: user.map((u) => (u.e.body as Bodies["user_msg"]).text.slice(0, 24)).slice(0, 3).join("；"),
      });
    },
  };
}

export async function runSpine(w: World, writer: DigestWriter, store = w.log.spine): Promise<Spine> {
  const spine = createSpine({ log: w.log, store, writer, line: (e) => renderHistoryLine(e, w.ctx), now: () => w.end + 3 * 3600_000, cut: EVAL_CUT, epochAfter: EVAL_EPOCH.after, epochSize: EVAL_EPOCH.size, onError: (e) => console.error("[spine]", e) });
  // Poke until nothing more closes (a quiet channel at the end closes the last part too).
  for (let k = 0; k < 20; k++) {
    const before = store.list().length;
    await spine.poke();
    if (store.list().length === before) break;
  }
  return spine;
}

export type Condition = "full" | "window" | "spine";
export const CONDITIONS: Condition[] = ["full", "window", "spine"];

/** What the model has in front of it under each condition (the search tool comes on top). */
export function contextFor(w: World, spine: Spine, c: Condition): string {
  const v = spine.view();
  if (c === "spine") return renderProjection(v.window, [], w.ctx, { earlier: v.earlier, ledger: v.ledger, ...(v.gap ? { gap: v.gap } : {}) });
  if (c === "window") return renderProjection(v.window, [], w.ctx, { earlier: "", ledger: "" });
  const all = w.log.read({ stream: "channel", fromSeq: 1, limit: 100_000 });
  return renderProjection(all, [], w.ctx, { earlier: "", ledger: "" });
}

/** The search tool, as the model sees it: best matches with their seq. */
export function searchLines(w: World, query: string, limit = 5): string[] {
  return w.log.search(query, { stream: "channel", limit }).map((e) => `#${e.seq} ${renderHistoryLine(e, w.ctx) ?? JSON.stringify(e.body).slice(0, 300)}`);
}

const norm = (s: string) => s.replace(/\s+/g, "");

// ---------- the fake run: reachability, stale, obligations, false memory ----------

export interface FakeReport {
  sizes: Record<Condition, number>;
  digests: { segments: number; epochs: number; degraded: number; rewrites: number; srcTokens: number; digestTokens: number };
  reach: Record<Condition, { inView: number; reachable: number; n: number; missed?: string[] }>;
  byType: Record<string, Record<Condition, number>>; // inView rate
  stale: { replaced: number; stillInForce: number; newMissing: number };
  obligations: { expected: string[]; found: string[] };
  falseMemory: { anchors: number; badAnchors: number };
  recall: { fired: number; admitted: number; precise: number };
}

export function fakeReport(w: World, spine: Spine): FakeReport {
  const ctxs = Object.fromEntries(CONDITIONS.map((c) => [c, contextFor(w, spine, c)])) as Record<Condition, string>;
  const reach = Object.fromEntries(CONDITIONS.map((c) => [c, { inView: 0, reachable: 0, n: 0 }])) as FakeReport["reach"];
  const byType: FakeReport["byType"] = {};
  for (const p of probes) {
    if (p.trap || !p.evidence.length) continue;
    const hits = norm(p.query ? searchLines(w, p.query).join("\n") : "");
    for (const c of CONDITIONS) {
      const r = reach[c];
      r.n++;
      const inView = p.evidence.every((ev) => norm(ctxs[c]).includes(norm(ev)));
      const found = inView || p.evidence.every((ev) => hits.includes(norm(ev)));
      if (inView) r.inView++;
      if (found) r.reachable++;
      else (r.missed ??= []).push(p.id);
      const t = (byType[p.type] ??= { full: 0, window: 0, spine: 0 });
      t[c] += inView ? 1 : 0;
    }
  }
  for (const t of Object.keys(byType)) {
    const n = probes.filter((p) => p.type === t && !p.trap && p.evidence.length).length;
    for (const c of CONDITIONS) byType[t]![c] = byType[t]![c] / n;
  }
  // Stale: a replaced decision must not be in force; its replacement must be.
  const led = spine.ledger();
  const notes = [...w.notes.values()];
  const decideOf = new Map(notes.filter((n) => n.key && n.decide).map((n) => [n.key!, n.decide!]));
  const replacing = notes.filter((n) => n.replaces);
  const stale = {
    replaced: replacing.length,
    stillInForce: replacing.filter((n) => led.inForce.some((d) => d.text === decideOf.get(n.replaces!))).length,
    newMissing: replacing.filter((n) => !led.inForce.some((d) => d.text === n.decide)).length,
  };
  // Obligations at the end: what is owed and what runs, in the ledger or in the window.
  const spineText = ctxs.spine;
  // Matched by meaning-bearing words, not the oracle's wording (a real writer phrases it its own way).
  const owed: [string, RegExp][] = [
    ["the digest eval by next Wednesday", /评测|eval/i],
    ["task t_psh01 (APNs) still running", /t_psh01/],
  ];
  const expected = owed.map(([l]) => l);
  const found = owed.filter(([, re]) => led.open.some((o) => re.test(o.text) || re.test(o.ref ?? ""))).map(([l]) => l);
  // False memory in digests: anchors not copied exactly (the audit should make this 0).
  const segs = w.log.spine.list().filter((r) => r.kind === "segment").map((r) => r.body as SegmentDigest);
  let anchors = 0;
  let badAnchors = 0;
  for (const d of segs)
    for (const a of d.anchors) {
      anchors++;
      const e = w.log.read({ fromSeq: a.at, limit: 1 })[0];
      if (!e || e.kind !== "user_msg" || !(e.body as Bodies["user_msg"]).text.includes(a.quote)) badAnchors++;
    }
  // Pre-turn recall: on questions with recall intent, how many admitted hits carry the evidence.
  const from = spine.view().window[0]?.seq ?? 1;
  let fired = 0;
  let admitted = 0;
  let precise = 0;
  for (const p of probes) {
    if (!recallIntent(p.q)) continue;
    const r = autoRecall(w.log, p.q, from);
    if (!r) continue;
    fired++;
    admitted += r.admitted.length;
    precise += r.admitted.filter((h) => p.evidence.some((ev) => norm(h.text).includes(norm(ev)))).length;
  }
  const digestTokens = spine.digests().reduce((n, d) => n + estTokens(renderDigest(d)), 0);
  return {
    sizes: Object.fromEntries(CONDITIONS.map((c) => [c, estTokens(ctxs[c])])) as Record<Condition, number>,
    digests: { segments: segs.length, epochs: w.log.spine.list().filter((r) => r.kind === "epoch").length, degraded: segs.filter((d) => d.degraded).length, rewrites: spine.stats.rewrites, srcTokens: segs.reduce((n, d) => n + d.srcTokens, 0), digestTokens },
    reach,
    byType,
    stale,
    obligations: { expected, found },
    falseMemory: { anchors, badAnchors },
    recall: { fired, admitted, precise },
  };
}

// ---------- grading real answers ----------

export type Label = "correct" | "partial" | "wrong" | "abstain" | "false_memory" | "stale";

export function grade(p: Probe, answer: string, cites: number[], head: number): { label: Label; score: number; badCites: number } {
  const badCites = cites.filter((s) => !Number.isInteger(s) || s < 1 || s > head).length;
  const abstained = ABSTAIN.test(answer);
  if (p.trap) return abstained ? { label: "correct", score: 1, badCites } : { label: "false_memory", score: 0, badCites };
  if (p.stale?.some((re) => re.test(answer))) return { label: "stale", score: 0, badCites };
  const parts: boolean[] = [];
  for (const re of p.must ?? []) parts.push(re.test(answer));
  if (p.any) parts.push(p.any.some((re) => re.test(answer)));
  if (p.atLeast) parts.push(p.atLeast.of.filter((re) => re.test(answer)).length >= p.atLeast.n);
  const ok = parts.filter(Boolean).length;
  if (ok === parts.length) return { label: "correct", score: 1, badCites };
  if (abstained && ok === 0) return { label: "abstain", score: 0, badCites };
  if (ok > 0) return { label: "partial", score: 0.5, badCites };
  return { label: "wrong", score: 0, badCites };
}

export interface Graded {
  probe: Probe;
  cond: Condition;
  answer: string;
  cites: number[];
  searches: string[];
  label: Label;
  score: number;
  badCites: number;
}

export function summarize(rows: Graded[]) {
  const out: Record<Condition, { acc: number; byType: Record<string, number>; falseMemory: number; staleRate: number; abstain: number; searched: number; n: number }> = {} as never;
  for (const c of CONDITIONS) {
    const rs = rows.filter((r) => r.cond === c);
    if (!rs.length) continue;
    const byType: Record<string, number> = {};
    for (const t of new Set(rs.map((r) => r.probe.type))) {
      const ts = rs.filter((r) => r.probe.type === t);
      byType[t] = ts.reduce((n, r) => n + r.score, 0) / ts.length;
    }
    const staleable = rs.filter((r) => r.probe.stale);
    out[c] = {
      acc: rs.reduce((n, r) => n + r.score, 0) / rs.length,
      byType,
      // An asserted past fact with no support: a concrete answer to a trap, or a citation of a line that doesn't exist.
      falseMemory: rs.filter((r) => r.label === "false_memory" || r.badCites > 0).length / rs.length,
      staleRate: staleable.length ? staleable.filter((r) => r.label === "stale").length / staleable.length : 0,
      abstain: rs.filter((r) => r.label === "abstain").length / rs.length,
      searched: rs.filter((r) => r.searches.length > 0).length / rs.length,
      n: rs.length,
    };
  }
  return out;
}

export const TYPES: ProbeType[] = ["obligations", "decision_why", "verbatim", "temporal", "supersession", "aggregation", "assistant_said", "existence", "task_state", "abstention", "gist"];
export { probes, corpus };
export type { LogEvent };
