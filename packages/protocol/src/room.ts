// D538: room for heavy work on a computer, pure (both clients and the home read it; no node here).

/** What heavy work needs free on a computer to start (tsc with a 4 GB heap, Playwright, Vite: hel's peak was 6.8 GB). */
export const HEAVY_FREE = 3 * 2 ** 30;
/** One heavy task at a time per this much memory, at least one: hel's 7.6 GB one, a 64 GB computer eight. */
export const HEAVY_PER = 8 * 2 ** 30;
export const heavySlots = (total: number) => Math.max(1, Math.floor(total / HEAVY_PER));

/** Whether a computer has room for heavy work now (its memory unknown: no opinion, yes). */
export function roomFor(c: { mem?: { total: number; free: number }; heavyNow?: number }): boolean {
  if (!c.mem) return true;
  return c.mem.free >= HEAVY_FREE && (c.heavyNow ?? 0) < heavySlots(c.mem.total);
}
