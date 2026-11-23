// D473: `ducter repairs [--weeks N] [--json]`: how self-repair did on this home, week by week,
// counted from the Log only (read-only, seconds). An episode starts when a task couldn't start
// (task_state failed with its cause) or stopped without a report (the stall rule), and ends when
// it works again, is set aside, or the count is taken. It ended healed when Ducter's own retry or
// repair did it, fixed by the partner when a rethink did, and reached the person when they wrote
// to it, tapped its fix, or it is still failed.
import type { Bodies, LogEvent, MendBody, MendClass, MendHow, RepairReport, RepairWeek } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

const DAY = 86_400_000;
export const REPAIR_WEEKS_DEFAULT = 2;
export const REPAIR_WEEKS_MAX = 12;
const KINDS = ["task_state", "mend", "task_event", "task_open", "job_status"] as const;
const HOWS: MendHow[] = ["reopen", "clone_here", "start_at", "clear_lock"];

const mondayUtc = (ms: number) => {
  const d = new Date(ms);
  const wd = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - wd * DAY).toISOString().slice(0, 10);
};

const emptyWeek = (week: string): RepairWeek => ({
  week,
  failures: { start: 0, stall: 0 },
  healed: 0,
  rethought: 0,
  partnerFixed: 0,
  reachedPerson: 0,
  byHow: Object.fromEntries(HOWS.map((h) => [h, { tried: 0, worked: 0 }])) as RepairWeek["byHow"],
  held: 0,
});

interface Episode {
  week: string;
  cls: MendClass;
  tried: boolean;
  rethought: boolean;
  person: boolean;
  /** A send to the task since the last failure was the partner's or Ducter's (its next start is theirs, not the person's). */
  sentByUs: boolean;
  /** A mend try is going since the last failure. */
  going: boolean;
}

/** The first moment counted for `weeks` weeks back from now (the Monday, UTC). */
export function repairSince(now: number, weeks: number): number {
  return Date.parse(`${mondayUtc(now)}T00:00:00Z`) - 7 * DAY * (weeks - 1);
}

export function repairReport(events: LogEvent[], o: { now: number; weeks: number }): RepairReport {
  const weeks = Math.min(REPAIR_WEEKS_MAX, Math.max(1, Math.floor(o.weeks)));
  const since = repairSince(o.now, weeks);
  const out = new Map<string, RepairWeek>();
  for (let i = 0; i < weeks; i++) {
    const w = new Date(since + i * 7 * DAY).toISOString().slice(0, 10);
    out.set(w, emptyWeek(w));
  }
  const weekOf = (ts: string) => out.get(mondayUtc(Date.parse(ts)));
  const causes: Record<string, number> = {};
  const open = new Map<string, Episode>();
  /** A try going per task, waiting for the next state to say whether it started. */
  const trying = new Map<string, { week: RepairWeek; how: MendHow }>();
  const end = (taskId: string, how: "worked" | "aside") => {
    const ep = open.get(taskId);
    open.delete(taskId);
    const w = ep && out.get(ep.week);
    if (!ep || !w) return;
    if (ep.person) w.reachedPerson++;
    else if (ep.rethought) w.partnerFixed++;
    else if (ep.tried && how === "worked") w.healed++;
    else w.reachedPerson++; // set aside with nothing tried: the person did it
  };
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (Date.parse(e.ts) < since) continue;
    const taskId = (e.body as { taskId?: string }).taskId;
    if (!taskId) continue;
    const ep = open.get(taskId);
    switch (e.kind) {
      case "task_state": {
        const s = e.body as Bodies["task_state"];
        const t = trying.get(taskId);
        if (t && s.attention !== "queued") {
          trying.delete(taskId);
          if (s.attention !== "failed") t.week.byHow[t.how].worked++;
        }
        if (s.attention === "failed" && s.cant) {
          if (ep) {
            ep.going = ep.sentByUs = false;
            break;
          }
          const w = weekOf(e.ts);
          if (!w) break;
          w.failures.start++;
          causes[s.cant.why] = (causes[s.cant.why] ?? 0) + 1;
          open.set(taskId, { week: w.week, cls: "start", tried: false, rethought: false, person: false, sentByUs: false, going: false });
        } else if (ep && (s.attention === "working" || s.attention === "done" || s.attention === "done_claimed")) end(taskId, "worked");
        else if (ep && (s.attention === "superseded" || s.attention === "dropped")) end(taskId, "aside");
        break;
      }
      case "mend": {
        const m = e.body as MendBody;
        const w = weekOf(e.ts);
        if (m.cls === "round") break; // D481: a long round looked at is no failure and no repair
        if (m.rung === "rethink") {
          if (ep) ep.rethought = true;
          if (w) {
            w.rethought++;
            if (m.budget) w.held++;
          }
        } else if (m.state === "going" && m.how) {
          if (ep) (ep.tried = true), (ep.going = true);
          if (w) {
            w.byHow[m.how].tried++;
            trying.set(taskId, { week: w, how: m.how });
          }
        }
        break;
      }
      case "task_event": {
        const b = e.body as Bodies["task_event"];
        if ((b.raw as { stall?: boolean } | undefined)?.stall === true && !ep) {
          const w = weekOf(e.ts);
          if (!w) break;
          w.failures.stall++;
          open.set(taskId, { week: w.week, cls: "stall", tried: false, rethought: false, person: false, sentByUs: false, going: false });
          break;
        }
        if (!ep || b.role !== "user") break;
        if ((b.from ?? "user") === "user") ep.person = true;
        else ep.sentByUs = true;
        break;
      }
      case "job_status":
        if (ep && e.origin === "user") ep.person = true;
        break;
      case "task_open":
        // A start again that no try of Ducter's and no word of the partner's asked for: the person's tap.
        if (ep && ep.cls === "start" && !ep.going && !ep.sentByUs) ep.person = true;
        break;
    }
  }
  // Still failed when counted: the person sees it on its card.
  for (const [taskId] of open) {
    const ep = open.get(taskId)!;
    const w = out.get(ep.week);
    if (w) w.reachedPerson++;
  }
  return { weeks: [...out.values()], causes };
}

/** The events the count needs since `since` (ms), paged back from the newest, every stream. */
export function readRepairEvents(log: Pick<LogStore, "read" | "head">, since: number): LogEvent[] {
  const out: LogEvent[] = [];
  let before = log.head() + 1;
  for (;;) {
    const page = log.read({ kinds: [...KINDS], limit: 5000, beforeSeq: before });
    if (!page.length) break;
    out.push(...page);
    if (Date.parse(page[0]!.ts) < since || page.length < 5000) break;
    before = page[0]!.seq;
  }
  return out.filter((e) => Date.parse(e.ts) >= since);
}
