// D588: `ducter usage [--days 7] [--json]`: what the tasks used, counted from the Log only (read
// only, seconds; the fold is protocol's `usageReport`). Every task's opening and agent are read from
// the whole Log (a task opened last month may have worked today); its turns from the days asked
// plus one day before, so a turn end with only a session's running totals still has its baseline.
// D591: the partner's own turns and Ducter's own looks from the days asked.
import { USAGE_DAYS_DEFAULT, USAGE_DAYS_MAX, usageReport, usageSince, type LogEvent, type UsageReport } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

const DAY = 86_400_000;
const PAGE = 5000;

/** Pages back from the head until a page starts before `since` (or the Log's start). */
function readBack(log: Pick<LogStore, "read" | "head">, kinds: LogEvent["kind"][], since: number): LogEvent[] {
  const out: LogEvent[] = [];
  let before = log.head() + 1;
  for (;;) {
    const page = log.read({ kinds, limit: PAGE, beforeSeq: before });
    if (!page.length) break;
    out.push(...page);
    if (Date.parse(page[0]!.ts) < since || page.length < PAGE) break;
    before = page[0]!.seq;
  }
  return out;
}

export function readUsageEvents(log: Pick<LogStore, "read" | "head">, since: number): LogEvent[] {
  const opens = readBack(log, ["task_open", "body_selected"], -Infinity);
  const turns = readBack(log, ["task_event"], since - DAY).filter((e) => Date.parse(e.ts) >= since - DAY);
  // D591: the partner's own turns and Ducter's own looks, each carrying its own count.
  const own = readBack(log, ["partner_session", "look_used"], since).filter((e) => Date.parse(e.ts) >= since);
  return [...opens, ...turns, ...own];
}

export function usageDays(log: Pick<LogStore, "read" | "head">, o: { now: number; days?: number; tzOffsetMin?: number; top?: number }): UsageReport {
  const days = Math.min(USAGE_DAYS_MAX, Math.max(1, Math.floor(o.days ?? USAGE_DAYS_DEFAULT)));
  const since = usageSince(o.now, days, o.tzOffsetMin ?? 0);
  return usageReport(readUsageEvents(log, since), { ...o, days });
}
