// D310: one meaning of 今天做完 / Done today, for every surface that says it (the conversation's
// header, On hand's sentence and strip, the menu bar, `ducter status`). Shared with the Go twin
// (apps/desktop/internal/store/donetoday.go) through fixtures/done-today.json.

/** The day a moment falls on, in a time zone (the device's own when none is given): "2026-11-17". */
export function dayOf(ms: number, zone?: string): string {
  const d = new Date(ms);
  if (!zone) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Whether a task counts as done today: it finished ("done", or D467 "done_claimed": a done whose
 * check or merge is still to come, which every list shows as done; never failed) at a moment on
 * today's local day. A wait that ended unmet is not a task done: it is 没等到 / Didn't happen, said
 * on its own.
 */
export function isDoneToday(attention: string, finishedAt: string | undefined, now: number, zone?: string): boolean {
  if ((attention !== "done" && attention !== "done_claimed") || !finishedAt) return false;
  const at = Date.parse(finishedAt);
  return Number.isFinite(at) && dayOf(at, zone) === dayOf(now, zone);
}

/** How many of these tasks are done today. */
export function countDoneToday(tasks: Iterable<{ attention: string; at?: string }>, now: number, zone?: string): number {
  let n = 0;
  for (const t of tasks) if (isDoneToday(t.attention, t.at, now, zone)) n++;
  return n;
}
