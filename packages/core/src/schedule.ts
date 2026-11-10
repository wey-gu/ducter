// Time triggers for routines (D114): the next firings of "every Monday at 9:00" in a time zone,
// and the trigger said in words. Pure; tested with fixed instants.
import type { RoutineTrigger } from "@ducter/protocol";

type TimeTrigger = Extract<RoutineTrigger, { kind: "time" }>;
const DAY = 86_400_000;

/** The wall clock of an instant in a zone. */
function wall(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), hh: Number(get("hour")), mm: Number(get("minute")), wd };
}

/** The instant a wall-clock time in a zone happens (a time in a DST gap moves past it). */
export function zoned(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const w = wall(t, tz);
    const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm);
    const diff = asUtc - guess;
    if (diff === 0) return t;
    t -= diff;
  }
  return t;
}

export function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const parseTime = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`time must be HH:MM, got ${s}`);
  return { hh: Number(m[1]), mm: Number(m[2]) };
};

export function validateTimeTrigger(t: TimeTrigger): string | undefined {
  try {
    parseTime(t.time);
  } catch (e) {
    return (e as Error).message;
  }
  if (!validZone(t.tz)) return `unknown time zone ${t.tz}`;
  if (t.every === "once" && !parseDate(t.date)) return `a one-time routine needs date (YYYY-MM-DD), got ${t.date ?? "nothing"}`;
  if (t.every === "week" && !(t.days?.length && t.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return "a weekly routine needs days (0 = Sunday … 6)";
  if (t.every === "month" && !(t.dayOfMonth && t.dayOfMonth >= 1 && t.dayOfMonth <= 31)) return "a monthly routine needs dayOfMonth (1–31)";
  if (t.every === "hours" && !(t.hours && t.hours >= 1 && t.hours <= 24)) return "an hourly routine needs hours (1–24)";
  return undefined;
}

/** "2026-11-12" as year, month, day; undefined when it isn't a real day. */
function parseDate(s: string | undefined): { y: number; m: number; d: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.trim() ?? "");
  if (!m) return undefined;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : undefined;
}

/** The firings strictly after `fromMs`, at most n, within a year. `tz` overrides the trigger's. */
export function nextFirings(t: TimeTrigger, fromMs: number, n: number, tz = t.tz): number[] {
  const { hh, mm } = parseTime(t.time);
  if (t.every === "once") {
    const day = parseDate(t.date);
    const at = day ? zoned(day.y, day.m, day.d, hh, mm, tz) : undefined;
    return at !== undefined && at > fromMs && n > 0 ? [at] : [];
  }
  const out: number[] = [];
  const start = wall(fromMs, tz);
  let day = Date.UTC(start.y, start.m - 1, start.d);
  for (let i = 0; i < 400 && out.length < n; i++, day += DAY) {
    const dt = new Date(day);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate(), wd = dt.getUTCDay();
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const ok =
      t.every === "day" || t.every === "hours" ? true
      : t.every === "weekday" ? wd >= 1 && wd <= 5
      : t.every === "week" ? Boolean(t.days?.includes(wd))
      : d === Math.min(t.dayOfMonth ?? 1, last);
    if (!ok) continue;
    const times = t.every === "hours" ? Array.from({ length: Math.ceil((24 * 60 - (hh * 60 + mm)) / ((t.hours ?? 1) * 60)) }, (_, k) => hh * 60 + mm + k * (t.hours ?? 1) * 60) : [hh * 60 + mm];
    for (const min of times) {
      const at = zoned(y, m, d, Math.floor(min / 60), min % 60, tz);
      if (at > fromMs) out.push(at);
      if (out.length >= n) break;
    }
  }
  return out;
}

/** The time between two firings, roughly (for how late a missed one may still run). */
export function periodMs(t: TimeTrigger): number {
  if (t.every === "hours") return (t.hours ?? 1) * 3_600_000;
  if (t.every === "day" || t.every === "weekday" || t.every === "once") return DAY;
  if (t.every === "week") return (7 / Math.max(1, t.days?.length ?? 1)) * DAY;
  return 30 * DAY;
}

const ZH_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EN_DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The trigger in words: "每周一 9:00 · 跟着你的时区" / "Mondays 9:00 · follows your time zone". */
export function describeTrigger(t: RoutineTrigger, zh: boolean): string {
  if (t.kind === "condition") return t.condition;
  const time = t.time.replace(/^0(\d)/, "$1");
  if (t.every === "once") {
    // One firing: the day and the time, no time zone line (it is the user's own clock now).
    const d = parseDate(t.date);
    if (!d) return time;
    return zh ? `${d.m}月${d.d}日 ${time}` : `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.m - 1]} ${d.d}, ${time}`;
  }
  const when =
    t.every === "day" ? (zh ? `每天 ${time}` : `Every day ${time}`)
    : t.every === "weekday" ? (zh ? `工作日 ${time}` : `Weekdays ${time}`)
    : t.every === "hours" ? (zh ? `从 ${time} 起每 ${t.hours} 小时` : `Every ${t.hours} h from ${time}`)
    : t.every === "month" ? (zh ? `每月 ${t.dayOfMonth} 号 ${time}` : `Monthly on the ${t.dayOfMonth}${["th", "st", "nd", "rd"][t.dayOfMonth! % 10 > 3 || [11, 12, 13].includes(t.dayOfMonth!) ? 0 : t.dayOfMonth! % 10]} ${time}`)
    : zh ? `每${(t.days ?? []).map((d) => ZH_DAYS[d]).join("、")} ${time}` : `${(t.days ?? []).map((d) => EN_DAYS[d]).join(", ")} ${time}`;
  const zone = t.zone === "personal" ? (zh ? "跟着你的时区" : "follows your time zone") : zh ? `按 ${t.tz} 时间` : `${t.tz} time`;
  return `${when} · ${zone}`;
}
