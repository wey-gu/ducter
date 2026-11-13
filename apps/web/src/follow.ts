// D254: the conversation keeps its place like a messaging app (design/conversation.md "Keeping
// your place", research/83). Pure rules, so they are tested without a browser; views.tsx wires
// them to the scroller. The Mac app keeps the same rules in Go (apps/desktop/internal/views/follow.go).

/** How close to the end still counts as at the end (a finger never lands on the exact pixel). */
export const AT_END = 80;

export interface Metrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/** How far below what is shown the end is. */
export const gapOf = (m: Metrics) => Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight);

/**
 * Whether the conversation follows its end after a scroll. Only the reader moving up lets go of the
 * end; a glide down to it (ours or theirs) never does, so the chip never flickers on the way.
 */
export function stillFollowing(was: boolean, lastTop: number, m: Metrics): boolean {
  if (gapOf(m) <= AT_END) return true;
  if (m.scrollTop < lastTop - 1) return false;
  return was;
}

/** A row of the conversation as these rules see it: its first seq, and whether the person wrote it. */
export interface Row {
  seq: number;
  mine: boolean;
}

/** What came from the partner after `mark` (the last row the reader had at the end): how many, and the first. */
export function newSince(rows: readonly Row[], mark: number): { count: number; first?: number } {
  let count = 0;
  let first: number | undefined;
  for (const r of rows) {
    if (r.mine || r.seq <= mark) continue;
    count++;
    first ??= r.seq;
  }
  return { count, first };
}

/**
 * Where the New messages divider goes when the conversation opens: before the first of the
 * partner's rows the person hasn't read. None when they wrote after it (they were there).
 */
export function dividerAt(rows: readonly Row[], readUpTo: number): number | undefined {
  let at: number | undefined;
  for (const r of rows) {
    if (r.mine) at = undefined;
    else if (r.seq > readUpTo && at === undefined) at = r.seq;
  }
  return at;
}

/**
 * Where to land: the first new thing's top (less a little air) when what came is taller than the
 * screen, else the end. One rule for opening at the divider and for the chip: you always start
 * reading at the start of what is new, and never past the end.
 */
export function landing(m: Metrics, firstTop: number | undefined, air = 12): number {
  const end = Math.max(0, m.scrollHeight - m.clientHeight);
  if (firstTop === undefined) return end;
  return Math.max(0, Math.min(end, firstTop - air));
}

/** The chip shows when something new came while the reader was up, or they are more than a screen away. */
export function showWayBack(gap: number, clientHeight: number, fresh: number): boolean {
  return fresh > 0 || gap > clientHeight * 0.75;
}

/** The count as the chip says it: 1 … 99, then 99+. */
export const countWords = (n: number) => (n > 99 ? "99+" : String(n));

// ---------- the draft ----------

const DRAFT = "ducter.draft";
type Kv = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const kv = (): Kv | undefined => {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
};

/** What was being typed to the partner when the page last closed. */
export function readDraft(s: Kv | undefined = kv()): string {
  try {
    return s?.getItem(DRAFT) ?? "";
  } catch {
    return "";
  }
}

/** Keeps the draft (an empty one is forgotten). */
export function keepDraft(v: string, s: Kv | undefined = kv()) {
  try {
    if (v.trim()) s?.setItem(DRAFT, v.slice(0, 20_000));
    else s?.removeItem(DRAFT);
  } catch {}
}
