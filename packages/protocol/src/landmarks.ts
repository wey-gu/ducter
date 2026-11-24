// D325: the locator's list of landmarks, made from the session index (D320) alone, so a session of
// any length lists every one of them without loading a turn. A landmark is:
//  - a turn someone opened by saying something (the brief, the person's words, the partner's);
//  - a report, a compaction, a switch or move of who does it, an interruption (the index's marks);
//  - a run of quiet turns between them (a wake, Ducter's note, a Go relayed), said once: one item's
//    own words, or a count with the time from the first to the last.
// A quiet turn that reports is its report (a loop's round reads as what it found). Rows are in the
// session's order. Pure and language-neutral: each client says the words (i18n) and draws the
// rows; the Go port is apps/desktop/internal/views/landmarks.go, and both pass
// fixtures/landmarks.json.
import type { IndexTurn, ReportMarkState } from "./session.ts";
import type { Block } from "./transcript.ts";

export type LandmarkKind = "brief" | "you" | "partner" | "quiet" | "report" | "compacted" | "switched" | "moved" | "interrupted";

export interface Landmark {
  k: LandmarkKind;
  /** The turns it stands for, as indexes into the index's turns (from ≤ to). */
  from: number;
  to: number;
  /** The turn a click goes to (its first event's seq): a run's last item, a mark's turn. */
  seq: number;
  /** What was said (its first line), or a report's first line; absent when there are no words. */
  text?: string;
  /** A run of one quiet turn: what opened it (the client says it as its hairline does). */
  p?: Block;
  /** A run of more than one: how many, and whether every one was a wake. */
  n?: number;
  wakes?: true;
  /** When: the item's time, or a run's first and last. */
  at: string;
  endAt?: string;
  /** D524: a brief the person wrote themselves (else the partner handed it over). */
  by?: "you";
  /** D524: how a report stood (absent: progress): its mark's shape and tone on the rail. */
  s?: ReportMarkState;
}

const MARKS = new Set(["report", "compacted", "switched", "moved", "interrupted"]);
const said = (t: IndexTurn) => t.p?.k === "brief" || t.p?.k === "you" || t.p?.k === "partner";
const firstLine = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l) ?? "";

/** The landmarks of a session's turns, in order. */
export function landmarksOf(turns: IndexTurn[]): Landmark[] {
  const out: Landmark[] = [];
  let run: { i: number; t: IndexTurn }[] = [];
  const flush = () => {
    if (run.length === 1) {
      const { i, t } = run[0]!;
      out.push({ k: "quiet", from: i, to: i, seq: t.seq, p: t.p!, at: t.at });
    } else if (run.length > 1) {
      const a = run[0]!, b = run.at(-1)!;
      out.push({ k: "quiet", from: a.i, to: b.i, seq: b.t.seq, n: run.length, ...(run.every((r) => r.t.p!.k === "wake") ? { wakes: true as const } : {}), at: a.t.at, endAt: b.t.at });
    }
    run = [];
  };
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const marks = (t.marks ?? []).filter((m) => MARKS.has(m.k));
    if (said(t)) {
      flush();
      const text = firstLine((t.p as { text?: string }).text ?? "");
      const by = t.p!.k === "brief" && (t.p as { by?: string }).by === "you" ? { by: "you" as const } : {};
      out.push({ k: t.p!.k as LandmarkKind, from: i, to: i, seq: t.seq, ...(text ? { text } : {}), at: t.at, ...by });
    } else if (t.p && !marks.some((m) => m.k === "report")) run.push({ i, t });
    for (const m of marks) {
      flush();
      out.push({ k: m.k as LandmarkKind, from: i, to: i, seq: t.seq, ...(m.w ? { text: m.w } : {}), at: m.at ?? t.endAt, ...(m.s ? { s: m.s } : {}) });
    }
  }
  flush();
  return out;
}

/** The first landmark whose turns end at or after turn `i`, by bisection (rows are in turn order). */
function firstEndingAtOrAfter(lms: Landmark[], i: number): number {
  let lo = 0, hi = lms.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (lms[m]!.to < i) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The landmark nearest turn `i` (one that holds it, else the closer of the two around it), or -1. */
export function landmarkNear(lms: Landmark[], i: number): number {
  if (!lms.length) return -1;
  const k = firstEndingAtOrAfter(lms, i);
  if (k >= lms.length) return lms.length - 1;
  if (lms[k]!.from <= i || k === 0) return k;
  // Between landmark k-1 (ends before i) and k (starts after it): the closer; the later on a tie.
  return i - lms[k - 1]!.to < lms[k]!.from - i ? k - 1 : k;
}

/** The landmarks that stand for any turn from `first` to `last` (the turns in view), as [lo, hi). */
export function landmarksIn(lms: Landmark[], first: number, last: number): [number, number] {
  if (last < first) return [0, 0];
  const lo = firstEndingAtOrAfter(lms, first);
  let hi = lo;
  while (hi < lms.length && lms[hi]!.from <= last) hi++;
  return [lo, hi];
}
