// The digest schema and how the spine renders (design/memory.md, research/14 §6.2).
//
// A segment digest keeps what exists and what binds, in a fixed order: TOC, binding decisions,
// Superseded, the user's verbatim anchors, obligations opened/closed, the task snapshot at close,
// and one short narrative. Every entry points at a channel seq (#n). IDs (D-n, O-n) are global and
// stable across the whole spine, so a later digest can supersede a decision or close an obligation
// without touching the frozen one that opened it.

export interface TocRow {
  from: number;
  to: number;
  gist: string;
  keys: string[]; // fact-style keywords: names, ids, paths, numbers, zh + en terms
}
export interface Decision {
  id: string; // D-n
  text: string;
  why?: string;
  at: number;
  supersedes?: string; // D-n it replaces
}
export interface Change {
  old: string;
  new: string;
  at: number;
}
export interface Anchor {
  at: number; // a user_msg seq
  quote: string; // an exact substring of that message
}
export interface Obligation {
  id: string; // O-n
  who: "me" | "user"; // me = the partner owes it; user = waiting on the user
  text: string;
  at: number;
  ref?: string; // task:<id> / decision:<id> / waiter:<id>: opened and closed by code, not the writer
}
export interface Closed {
  id: string;
  at: number;
}
export interface WindowSnap {
  taskId: string;
  title: string;
  state: string; // the last state seen in the segment
  at: number;
}

export interface SegmentDigest {
  v: 1;
  id: string; // S0001
  from: number;
  to: number;
  t0: string;
  t1: string;
  srcTokens: number;
  writer: string; // model, or "mechanical"
  degraded?: boolean; // the writer's digest failed its audit twice: a mechanical index instead
  repaired?: string[]; // entries the audit dropped (never added) before freezing
  toc: TocRow[];
  decisions: Decision[];
  superseded: Change[];
  anchors: Anchor[];
  opened: Obligation[];
  closed: Closed[];
  windows: WindowSnap[];
  narrative: string;
}

/** Segments rolled up by concatenation (research/14 §5): nothing is re-summarized. */
export interface EpochDigest {
  v: 1;
  id: string; // E0001
  from: number;
  to: number;
  t0: string;
  t1: string;
  segments: string[];
  toc: TocRow[]; // one row per segment: its range, the union of its keys (capped), its gists joined
  decisions: Decision[]; // in force at the epoch's end, copied as written
  superseded: Change[]; // carried as one-liners
  retired: string[]; // decisions from before the epoch that it superseded
  anchors: Anchor[]; // the newest two per segment
  opened: Obligation[]; // opened inside the epoch and still open at its end
  closed: Closed[]; // obligations from before the epoch that it closed
}

export type AnyDigest = ({ kind: "segment" } & SegmentDigest) | ({ kind: "epoch" } & EpochDigest);

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/g;
/** A rough token count: a CJK character is about one token, other text about four characters. */
export function estTokens(s: string): number {
  const cjk = s.match(CJK)?.length ?? 0;
  return Math.ceil(cjk + (s.length - cjk) / 4);
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};
function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const range = (a: number, b: number) => (a === b ? `#${a}` : `#${a}–#${b}`);

function tocLines(toc: TocRow[]): string[] {
  return toc.map((r) => `- ${range(r.from, r.to)} ${r.gist}${r.keys.length ? ` · ${r.keys.join(", ")}` : ""}`);
}
function decisionLine(d: Decision): string {
  return `- ${d.id} ${d.text}${d.why ? ` (why: ${d.why})` : ""} #${d.at}${d.supersedes ? ` · replaces ${d.supersedes}` : ""}`;
}

/** One digest as text, in the fixed order. Empty sections say "(none)" (the digest is explicit). */
export function renderDigest(d: AnyDigest): string {
  const out: string[] = [];
  const head = d.kind === "epoch" ? `${d.id}: ${d.segments.length} earlier parts` : d.id;
  out.push(`## ${day(d.t0)} → ${day(d.t1)} · ${range(d.from, d.to)} · ${head}${d.kind === "segment" && d.degraded ? " · index only: search the Log for details" : ""}`);
  out.push("Topics:", ...(d.toc.length ? tocLines(d.toc) : ["- (none)"]));
  out.push("Decisions:", ...(d.decisions.length ? d.decisions.map(decisionLine) : ["- (none)"]));
  out.push("Changed (old → new):", ...(d.superseded.length ? d.superseded.map((c) => `- ${c.old} → ${c.new} #${c.at}`) : ["- (none)"]));
  out.push("The user's own words:", ...(d.anchors.length ? d.anchors.map((a) => `- #${a.at} 「${a.quote}」`) : ["- (none)"]));
  const opened = d.opened.map((o) => `- + ${o.id} ${o.who === "me" ? "you owe" : "waiting on the user"}: ${o.text} #${o.at}`);
  const closed = d.closed.map((c) => `- − ${c.id} settled #${c.at}`);
  out.push("Obligations:", ...(opened.length + closed.length ? [...opened, ...closed] : ["- (none)"]));
  if (d.kind === "segment") {
    out.push("Tasks at the end of this part:", ...(d.windows.length ? d.windows.map((w) => `- ${w.taskId} "${w.title}" ${w.state} #${w.at}`) : ["- (none)"]));
    out.push(`In short: ${d.narrative || "(none)"}`);
  } else if (d.retired.length) {
    out.push(`Replaced here: ${d.retired.join(", ")}`);
  }
  return out.join("\n");
}

export interface Ledger {
  open: Obligation[];
  inForce: Decision[];
}

/**
 * The derived ledger: set arithmetic over every frozen digest, in order. The model never
 * touches it, and nothing open is dropped.
 */
export function computeLedger(digests: AnyDigest[]): Ledger {
  const open = new Map<string, Obligation>();
  const decisions = new Map<string, Decision>();
  for (const d of digests) {
    for (const o of d.opened) open.set(o.id, o);
    for (const c of d.closed) open.delete(c.id);
    for (const x of d.decisions) decisions.set(x.id, x);
    for (const x of d.decisions) if (x.supersedes) decisions.delete(x.supersedes);
    if (d.kind === "epoch") for (const id of d.retired) decisions.delete(id);
  }
  return { open: [...open.values()], inForce: [...decisions.values()] };
}

export function renderLedger(l: Ledger, when: (seq: number) => string | undefined): string {
  const out: string[] = ["Still open as of the newest digest (the lines after it may have settled some):"];
  if (!l.open.length) out.push("- (none)");
  for (const o of l.open) {
    const t = when(o.at);
    out.push(`- ${o.id} ${o.who === "me" ? "you owe" : "waiting on the user"}: ${o.text} #${o.at}${t ? ` (${t.slice(0, 10)})` : ""}`);
  }
  out.push("Decisions in force:");
  if (!l.inForce.length) out.push("- (none)");
  for (const d of l.inForce) out.push(`- ${d.id} ${clip(d.text, 200)} #${d.at}`);
  return out.join("\n");
}

const MAX_EPOCH_KEYS = 24;

/** Rolls the given segments into one epoch: concatenation and set arithmetic, no model. */
export function rollUp(id: string, segs: SegmentDigest[]): EpochDigest {
  const ids = new Set<string>();
  const opened = new Map<string, Obligation>();
  const closedOutside: Closed[] = [];
  const decisions = new Map<string, Decision>();
  const retired: string[] = [];
  for (const s of segs) {
    for (const o of s.opened) (opened.set(o.id, o), ids.add(o.id));
    for (const c of s.closed) {
      if (opened.has(c.id)) opened.delete(c.id);
      else if (!ids.has(c.id)) closedOutside.push(c);
    }
    for (const d of s.decisions) decisions.set(d.id, d);
    for (const d of s.decisions) {
      if (!d.supersedes) continue;
      if (decisions.has(d.supersedes)) decisions.delete(d.supersedes);
      else retired.push(d.supersedes);
    }
  }
  return {
    v: 1,
    id,
    from: segs[0]!.from,
    to: segs[segs.length - 1]!.to,
    t0: segs[0]!.t0,
    t1: segs[segs.length - 1]!.t1,
    segments: segs.map((s) => s.id),
    toc: segs.map((s) => ({
      from: s.from,
      to: s.to,
      gist: clip(s.toc.map((r) => r.gist).join("; "), 400),
      keys: [...new Set(s.toc.flatMap((r) => r.keys))].slice(0, MAX_EPOCH_KEYS),
    })),
    decisions: [...decisions.values()],
    superseded: segs.flatMap((s) => s.superseded),
    retired,
    anchors: segs.flatMap((s) => s.anchors.slice(-2)),
    opened: [...opened.values()],
    closed: closedOutside,
  };
}
