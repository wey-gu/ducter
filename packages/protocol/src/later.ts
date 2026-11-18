// D382: 晚点再问我 / Ask me later. A question waiting on the person is put off to a time: it leaves
// 等你 / Needs you (and the one needs-you count) for 在等 / Waiting, its countdown stops, and at that
// time it comes back as it was, with the same countdown length starting again. Nothing is done
// while it is away. This file holds what every client and core share: which cards may be put off,
// the offered times, and how far.

/** A card may not be put off further than this. */
export const LATER_MAX_MS = 30 * 24 * 3600_000;
/** Nor to less than this from now (a picked time a minute away is a tap on the wrong thing). */
export const LATER_MIN_MS = 5 * 60_000;
/** 今晚 / Tonight is this hour, offered until an hour before it. */
export const TONIGHT_HOUR = 20;
/** The morning when quiet hours are off. */
export const MORNING_DEFAULT = "08:00";

/** The decision fields `laterable` reads (a structural subset of Bodies["decision"]). */
export interface LaterableDecision {
  findId?: string;
  key?: unknown;
  signIn?: unknown;
  pay?: unknown;
  fill?: unknown;
  phone?: unknown;
  computer?: unknown;
  handset?: unknown;
  where?: unknown;
  closing?: unknown;
  call?: unknown;
  saying?: unknown;
  sender?: unknown;
}

/**
 * Whether a card offers 晚点再问我. Not where the moment itself is the point: a live turn on a
 * phone, a computer or a site (sign-in, fill, pay), a key a task waits in a call for, a call, a
 * computer to wait for or move off; nor a find's step (it lives in its note), nor a one-off
 * "keep as a rule?" or a stranger's first message, whose own Hold already means "not now".
 */
export function laterable(d: LaterableDecision): boolean {
  return !(d.findId || d.key || d.signIn || d.pay || d.fill || d.phone || d.computer || d.handset || d.where || d.closing || d.call || d.saying || d.sender);
}

export type LaterKey = "tonight" | "morning" | "monday";
export interface LaterChoice {
  key: LaterKey;
  /** Local time, ISO. */
  at: string;
  /** morning: it is still this morning (before the morning time today), so 今早 / This morning. */
  today?: boolean;
}

const hm = (s: string): [number, number] => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Math.min(23, Number(m[1])), Math.min(59, Number(m[2]))] : [8, 0];
};

/**
 * The offered times, in the viewer's own zone (the Date's local time): 今晚 20:00 while it is
 * before 19:00; the next morning (the end of quiet hours, else 08:00), at least half an hour off;
 * next Monday's morning unless that is the next morning already. The Go port is
 * apps/desktop/internal/views/later.go (laterChoices); both are tested on the same cases.
 */
export function laterChoices(now: Date, morning = MORNING_DEFAULT): LaterChoice[] {
  const out: LaterChoice[] = [];
  const [mh, mm] = hm(morning);
  if (now.getHours() < TONIGHT_HOUR - 1) {
    const t = new Date(now);
    t.setHours(TONIGHT_HOUR, 0, 0, 0);
    out.push({ key: "tonight", at: t.toISOString() });
  }
  const m = new Date(now);
  m.setHours(mh, mm, 0, 0);
  const today = m.getTime() - now.getTime() >= 30 * 60_000;
  if (!today) m.setDate(m.getDate() + 1);
  out.push({ key: "morning", at: m.toISOString(), ...(today ? { today: true } : {}) });
  const mon = new Date(now);
  mon.setHours(mh, mm, 0, 0);
  const ahead = (8 - mon.getDay()) % 7 || 7; // days to the next Monday (a week on a Monday)
  mon.setDate(mon.getDate() + ahead);
  if (mon.getTime() !== m.getTime()) out.push({ key: "monday", at: mon.toISOString() });
  return out;
}

/** Why a time can't be used, or "" when it can. */
export function laterRefusal(until: number, now: number): "" | "past" | "far" {
  if (!Number.isFinite(until) || until - now < LATER_MIN_MS) return "past";
  if (until - now > LATER_MAX_MS) return "far";
  return "";
}

/**
 * A picked day (0 today, 1 tomorrow, 2 the day after) and a clock ("9:00", "21:30", "9") as a
 * local time, or undefined when the clock doesn't read.
 */
export function pickedTime(now: Date, day: number, clock: string): Date | undefined {
  const m = /^\s*(\d{1,2})(?:[:：.](\d{2}))?\s*$/.exec(clock);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59) return undefined;
  const t = new Date(now);
  t.setDate(t.getDate() + Math.max(0, Math.min(2, day)));
  t.setHours(h, mi, 0, 0);
  return t;
}
