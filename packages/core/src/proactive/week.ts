// D464 (research/201 ★4): Ducter counts its own offers, so "one in twenty is an aha" (D453) is a
// number each week, not a guess. Read-only, from the Log alone: every find said (the `finds`
// notes), what became of it (find_state, decision_resolved, a reply to it, find_opened), cut into
// Monday-to-Sunday weeks in the person's zone. A find counts in the week it was first said, with
// everything that came of it later. Offers and interruptions are counted apart: an interruption
// is a time-sensitive notification, rationed on its own (D453's two lanes).
//
// Nothing here changes what Ducter does. It is the author's instrument (`ducter proactive week`),
// never a scorecard shown to the person.
import type { Bodies, FindKind, FindRung, LogEvent, OfferCounts, ProactiveMode, ShadowGate, ShadowWeek, WeekReport, WeekRow } from "@ducter/protocol";
import { findFrom } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { dayKey } from "./detect.ts";
import { shadowItemId, shadowItems, verdictOf, withLabels } from "./shadow-review.ts";

const DAY = 86_400_000;
/** At most this many weeks back. */
export const WEEKS_MAX = 12;
export const WEEKS_DEFAULT = 2;
/** What the person took up, listed by its words per week. */
export const TAKEN_LIST = 8;
/** Senders listed with their weight (the ones furthest from 1). */
export const SENDERS_LIST = 6;
/** The Log kinds the count reads. */
export const WEEK_KINDS = ["finds", "find_state", "find_opened", "decision", "decision_resolved", "user_msg"] as const;
const INTERRUPT: readonly FindRung[] = ["now", "meeting"];

interface Rec {
  findId: string;
  kind: FindKind;
  text: string;
  day: string;
  offer: boolean;
  opened?: boolean;
  go?: boolean;
  useful?: boolean;
  replied?: boolean;
  held?: boolean;
  muted?: boolean;
  passed?: boolean;
  /** When it was first taken up, and how (for the quoted list). */
  took?: { by: "go" | "useful" | "replied"; at: string };
}

export const zeroCounts = (): OfferCounts => ({ shown: 0, opened: 0, go: 0, useful: 0, replied: 0, held: 0, muted: 0, faded: 0, waiting: 0, taken: 0, answered: 0 });

function add(c: OfferCounts, r: Rec): void {
  const taken = !!(r.go || r.useful || r.replied);
  const answered = taken || !!(r.opened || r.held || r.muted);
  c.shown++;
  if (r.opened) c.opened++;
  if (r.go) c.go++;
  if (r.useful) c.useful++;
  if (r.replied) c.replied++;
  if (r.held) c.held++;
  if (r.muted) c.muted++;
  if (taken) c.taken++;
  if (answered) c.answered++;
  const settled = taken || r.held || r.muted;
  if (!settled && r.passed) c.faded++;
  if (!settled && !r.passed) c.waiting++;
}

/** The Monday (YYYY-MM-DD) of the week a day is in. */
export function mondayOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const wd = (new Date(t).getUTCDay() + 6) % 7; // Monday 0
  return new Date(t - wd * DAY).toISOString().slice(0, 10);
}
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The first moment of the oldest week counted (a little early: the zone is applied per event). */
export function weeksSince(now: number, zone: string, weeks: number): number {
  const monday = mondayOf(dayKey(now, zone));
  return Date.parse(`${plusDays(monday, -7 * (weeks - 1))}T00:00:00Z`) - DAY;
}

export interface WeekInput {
  now: number;
  zone: string;
  weeks: number;
  mode: ProactiveMode;
  weights?: { kind: Partial<Record<FindKind, number>>; sender: Record<string, number> };
  /** D502: the shadow passes (`shadow_finds`, partner stream) in the same span; absent or none: no shadow section. */
  shadow?: LogEvent[];
  /** D674: the person's verdicts (`shadow_labels`, any age) and the gate now. */
  labels?: LogEvent[];
  gate?: ShadowGate;
}

/** The report from the Log's events (any order is read as the Log's: by seq). */
export function weekReport(events: LogEvent[], o: WeekInput): WeekReport {
  const weeks = Math.min(WEEKS_MAX, Math.max(1, Math.floor(o.weeks)));
  const today = dayKey(o.now, o.zone);
  const monday = mondayOf(today);
  const starts = Array.from({ length: weeks }, (_, i) => plusDays(monday, -7 * (weeks - 1 - i)));
  const evs = [...events].sort((a, b) => a.seq - b.seq);

  // Every find said, the first time (a fold-in repeats the note's earlier finds), and its steps.
  const recs = new Map<string, Rec>();
  const byDecision = new Map<string, string>();
  for (const e of evs) {
    if (e.kind === "finds") {
      const b = e.body as Bodies["finds"];
      for (const f of b.finds ?? []) {
        if (f.decisionId) byDecision.set(f.decisionId, f.findId);
        if (recs.has(f.findId)) continue;
        recs.set(f.findId, { findId: f.findId, kind: f.kind, text: f.text, day: dayKey(Date.parse(e.ts), o.zone), offer: !!f.offer || !INTERRUPT.includes(b.rung) });
      }
    } else if (e.kind === "decision") {
      const b = e.body as { decisionId?: string; findId?: string };
      if (b.decisionId && b.findId) byDecision.set(b.decisionId, b.findId);
    } else if (e.kind === "find_state") {
      const b = e.body as Bodies["find_state"];
      if (b.decisionId) byDecision.set(b.decisionId, b.findId); // a drafted reply's Go asked again
    }
  }
  const took = (r: Rec, by: "go" | "useful" | "replied", at: string) => {
    r[by] = true;
    r.took ??= { by, at };
  };
  for (const e of evs) {
    if (e.kind === "find_state") {
      const b = e.body as Bodies["find_state"];
      const r = recs.get(b.findId);
      if (!r) continue;
      if (b.state === "go" || b.state === "sending" || b.state === "sent") took(r, "go", e.ts);
      else if (b.state === "useful") took(r, "useful", e.ts);
      else if (b.state === "held") r.held = true;
      else if (b.state === "muted") r.muted = true;
      else if (b.state === "passed") r.passed = true;
    } else if (e.kind === "decision_resolved") {
      const b = e.body as Bodies["decision_resolved"];
      const r = recs.get(byDecision.get(b.decisionId) ?? "");
      if (!r) continue;
      if (b.by === "default") r.passed = true;
      else if (b.option === "go") took(r, "go", e.ts);
      else if (b.option === "reply") took(r, "replied", e.ts);
      else r.held = true;
    } else if (e.kind === "user_msg") {
      // D236: the person replied to this one find (回复 / Reply on it).
      const findId = (e.body as Bodies["user_msg"]).reply?.findId;
      const r = findId ? recs.get(findId) : undefined;
      if (r) took(r, "replied", e.ts);
    } else if (e.kind === "find_opened") {
      const r = recs.get((e.body as Bodies["find_opened"]).findId);
      if (r) r.opened = true;
    }
  }

  const rows: WeekRow[] = starts.map((from, i) => {
    const current = i === starts.length - 1;
    return { from, to: current ? today : plusDays(from, 6), current, offers: zeroCounts(), byKind: {}, bySource: {}, interruptions: zeroCounts(), takenUp: [] };
  });
  for (const r of recs.values()) {
    const row = rows.find((w) => r.day >= w.from && r.day <= plusDays(w.from, 6));
    if (!row) continue;
    if (!r.offer) add(row.interruptions, r);
    else {
      add(row.offers, r);
      add((row.byKind[r.kind] ??= zeroCounts()), r);
      add((row.bySource[findFrom(r.kind)] ??= zeroCounts()), r);
    }
    if (r.took) row.takenUp.push({ kind: r.kind, text: r.text, by: r.took.by, at: r.took.at, offer: r.offer });
  }
  for (const row of rows) row.takenUp = row.takenUp.sort((a, b) => a.at.localeCompare(b.at)).slice(-TAKEN_LIST);
  for (const row of rows) {
    const s = shadowWeek(
      (o.shadow ?? []).filter((e) => {
        const d = dayKey(Date.parse(e.ts), o.zone);
        return d >= row.from && d <= plusDays(row.from, 6);
      }),
      o.labels,
    );
    if (s) row.shadow = s;
  }

  const w = o.weights ?? { kind: {}, sender: {} };
  const senders = Object.entries(w.sender)
    .filter(([, v]) => v !== 1)
    .sort((a, b) => Math.abs(Math.log(b[1])) - Math.abs(Math.log(a[1])))
    .slice(0, SENDERS_LIST)
    .map(([sender, v]) => ({ sender, w: round(v) }));
  const kind = Object.fromEntries(Object.entries(w.kind).map(([k, v]) => [k, round(v ?? 1)])) as Partial<Record<FindKind, number>>;
  return { at: new Date(o.now).toISOString(), zone: o.zone, mode: o.mode, weeks: rows, weights: { kind, senders }, ...(o.gate && o.shadow?.length ? { gate: o.gate } : {}) };
}

const round = (v: number) => Math.round(v * 100) / 100;

/** D502: shadow-only findings quoted per week. */
export const SHADOW_LIST = 6;

/**
 * D502: one week of shadow passes against the detectors: the findings (each fact set once), those a
 * detector also has, those only the model has (what promotion would add), and the detectors' joins
 * no finding touched. Passes that never asked the model (budget, no facts, failed) count nothing.
 */
export function shadowWeek(events: LogEvent[], labels?: LogEvent[]): ShadowWeek | undefined {
  const runs = events.filter((e) => e.kind === "shadow_finds").map((e) => ({ at: e.ts, r: e.body as Bodies["shadow_finds"] })).filter((x) => !x.r.skipped);
  if (!runs.length) return;
  const findings = runs.flatMap((x) => x.r.findings.map((f) => ({ ...f, at: x.at })));
  const touched = new Set(findings.flatMap((f) => f.facts));
  const detectorsOnly = new Set(runs.flatMap((x) => x.r.detectorsOnly.filter((d) => !d.facts.some((id) => touched.has(id))).map((d) => d.key)));
  const only = findings.filter((f) => !f.alsoBy.length);
  // D674: the week's items (findings and the detectors' joins) with the person's verdicts.
  const items = withLabels(shadowItems(events), labels ?? []);
  const byId = new Map(items.map((i) => [i.id, i]));
  const counted = labels?.length
    ? { items: items.length, labelled: items.filter((i) => verdictOf(i)).length, yes: items.filter((i) => verdictOf(i) === "yes").length, no: items.filter((i) => verdictOf(i) === "no").length, stopped: items.filter((i) => i.stopped).length }
    : undefined;
  return {
    runs: runs.length,
    findings: findings.length,
    both: findings.length - only.length,
    shadowOnly: only.length,
    detectorsOnly: detectorsOnly.size,
    list: only.slice(-SHADOW_LIST).map((f) => {
      const v = byId.get(shadowItemId("shadow", f.key));
      const verdict = v ? verdictOf(v) : undefined;
      return { text: f.text, confidence: f.confidence, facts: f.facts.length, at: f.at, ...(verdict ? { verdict } : {}) };
    }),
    ...(counted ? { labels: counted } : {}),
  };
}

/** D502: the shadow passes since `since` (ms), from the partner stream. */
export function readShadowEvents(log: Pick<LogStore, "read">, since: number): LogEvent[] {
  const out: LogEvent[] = [];
  let before: number | undefined;
  for (;;) {
    const page = log.read({ stream: "partner", kinds: ["shadow_finds"], limit: 500, ...(before !== undefined ? { beforeSeq: before } : {}) });
    if (!page.length) break;
    out.push(...page);
    if (Date.parse(page[0]!.ts) < since || page.length < 500) break;
    before = page[0]!.seq;
  }
  return out.filter((e) => Date.parse(e.ts) >= since);
}

/** The channel's events the count needs since `since` (ms), paged back from the newest. */
export function readWeekEvents(log: Pick<LogStore, "read">, since: number): LogEvent[] {
  const out: LogEvent[] = [];
  let before: number | undefined;
  for (;;) {
    const page = log.read({ stream: "channel", kinds: [...WEEK_KINDS], limit: 2000, ...(before !== undefined ? { beforeSeq: before } : {}) });
    if (!page.length) break;
    out.push(...page);
    if (Date.parse(page[0]!.ts) < since || page.length < 2000) break;
    before = page[0]!.seq;
  }
  return out.filter((e) => Date.parse(e.ts) >= since);
}
