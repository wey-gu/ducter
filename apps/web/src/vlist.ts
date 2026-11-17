// D320: the opened task's turns as a virtual list: only the turns on screen and about a screen
// either side are in the page; the rest are two spacers of their heights, each turn's measured
// once drawn, else the session index's guess (its height class, 16 px steps). Pure, for the page
// (transcript.tsx) and its tests.

/** The rows' tops (and the whole height last), each row its height plus the gap after it. */
export function topsOf(heights: number[], gap: number): Float64Array {
  const tops = new Float64Array(heights.length + 1);
  for (let i = 0; i < heights.length; i++) tops[i + 1] = tops[i]! + heights[i]! + gap;
  return tops;
}

/** The last row whose top is at or above y. */
export function rowAt(tops: Float64Array, y: number): number {
  let lo = 0, hi = tops.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (tops[m]! <= y) lo = m;
    else hi = m - 1;
  }
  return lo;
}

/**
 * Which rows to draw for a view of `height` px whose top is `y` px into the list: those it shows
 * (first..last) and `over` px more either side (from..to, to exclusive).
 */
export function rangeOf(tops: Float64Array, y: number, height: number, over: number): { from: number; to: number; first: number; last: number } {
  const n = tops.length - 1;
  if (n <= 0) return { from: 0, to: 0, first: 0, last: -1 };
  const first = rowAt(tops, Math.max(0, y));
  const last = rowAt(tops, Math.max(0, y + height - 1));
  const from = rowAt(tops, Math.max(0, y - over));
  const to = Math.min(n, rowAt(tops, y + height + over) + 1);
  return { from, to, first, last };
}
