// D222 (design/calendar.md): the person's calendars as one day. Every calendar account the
// person's sources hold (oo, OOMOL, their own OpenConnector), every calendar inside each one that
// they let Ducter read, merged, deduplicated (an invitation sent to both of their addresses is one
// event), in the person's zone. Reads go through the broker like any other; a change is staged
// there as a write and runs only on the person's Go, once, by this module (never by a model).
//
// Google Calendar through oo is what was read live (research/65): list_calendars, list_events,
// get_event, create_event, patch_event, delete_event. Other calendar services are listed as
// accounts and read through connection_call as before.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, CalChange, CalDay, CalendarRow, CalEvent, CalGlance, CalResponse, CalToday, LogEvent } from "@ducter/protocol";
import type { AppTarget, ConnectionsStore } from "./connections.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export const CALENDARS_FILE = "calendars.json";
const MIN = 60_000;
const DAY = 86_400_000;
const LIST_MS = 15 * MIN; // a calendar list changes rarely
const EVENTS_MS = 2 * MIN; // a window read again after this
const MAX_DAYS = 14;
const SLOTS = 5; // free-time options handed back // a glance or a free-time search spans at most two weeks

/** The services read here as calendars. */
export const isCalendarService = (s: string) => /calendar/i.test(s);
/** The one we read live; its actions are the real ones (research/65). */
const GOOGLE = "googlecalendar";

// ---------- time in a zone (no library: Intl only) ----------

const FMT = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string) {
  let f = FMT.get(zone);
  if (!f) FMT.set(zone, (f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" })));
  return f;
}
/** The wall clock in a zone. */
export function wall(ms: number, zone: string) {
  const p = fmt(zone).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: Number(g("year")), m: Number(g("month")), d: Number(g("day")), h: Number(g("hour")) % 24, min: Number(g("minute")), s: Number(g("second")), wd: g("weekday") };
}
/** Minutes the zone is ahead of UTC at that instant. */
export function offsetMin(ms: number, zone: string): number {
  const w = wall(ms, zone);
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(ms / 1000) * 1000) / MIN);
}
/** The instant a wall time in a zone names ("2026-11-18", "14:30"). */
export function zonedMs(date: string, hm: string, zone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h ?? 0, mi ?? 0);
  let t = guess - offsetMin(guess, zone) * MIN;
  t = guess - offsetMin(t, zone) * MIN; // across a DST edge
  return t;
}
const pad = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD in the zone. */
export const dateIn = (ms: number, zone: string) => {
  const w = wall(ms, zone);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
};
/** ISO with the zone's offset: 2026-11-18T14:30:00+09:00. */
export function isoIn(ms: number, zone: string): string {
  const w = wall(ms, zone);
  const off = offsetMin(ms, zone);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.min)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isZone = (z: unknown): z is string => {
  if (typeof z !== "string" || !z) return false;
  try {
    fmt(z);
    return true;
  } catch {
    return false;
  }
};
/** A time the partner gave: a date ("2026-11-18"), a date-time with an offset, or a local one (read in the zone). */
export function parseWhen(v: unknown, zone: string): { ms: number; dateOnly: boolean } | undefined {
  if (typeof v !== "string" || !v.trim()) return;
  const s = v.trim();
  if (/^\d{4}-\d\d-\d\d$/.test(s)) return { ms: zonedMs(s, "00:00", zone), dateOnly: true };
  const local = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d)(?::\d\d)?$/.exec(s);
  if (local) return { ms: zonedMs(local[1]!, local[2]!, zone), dateOnly: false };
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : { ms: t, dateOnly: false };
}

// ---------- shapes ----------

interface RawCal {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  accessRole?: string;
  selected?: boolean;
  hidden?: boolean;
  backgroundColor?: string;
  timeZone?: string;
}
interface RawWhen {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
interface RawPerson {
  email?: string;
  displayName?: string;
  self?: boolean;
  organizer?: boolean;
  resource?: boolean;
  responseStatus?: string;
  optional?: boolean;
}
export interface RawEvent {
  id?: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: RawWhen;
  end?: RawWhen;
  attendees?: RawPerson[];
  organizer?: RawPerson;
  transparency?: string;
  eventType?: string;
  recurringEventId?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string }[] };
  guestsCanModify?: boolean;
}

/** One calendar of one account, with where it came from. */
interface Cal {
  app: AppTarget;
  row: CalendarRow;
  zone?: string;
}
/** An event with what a change needs to find it again. */
interface Held {
  ev: CalEvent;
  raw: RawEvent;
  cal: Cal;
  startMs: number;
  endMs: number;
}

const rowsOf = (data: unknown): Record<string, unknown>[] => {
  const o = data as { items?: unknown; data?: { items?: unknown } } | undefined;
  const x = Array.isArray(o?.items) ? o!.items : Array.isArray(o?.data?.items) ? o!.data!.items : Array.isArray(data) ? data : [];
  return (x as unknown[]).filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
};

const HEX = /^#[0-9a-f]{6}$/i;
const PUBLIC_MAIL = /@(gmail|googlemail|outlook|hotmail|live|icloud|me|yahoo|qq|163|126|foxmail|proton(mail)?)\./i;

/** What a calendar is, from the provider's own markers. */
export function kindOfCal(c: RawCal): CalendarRow["kind"] {
  if (c.primary) return "main";
  if (/#holiday@group\.v\.calendar\.google\.com$/.test(c.id) || /holiday/i.test(c.id)) return "holidays";
  if (/#contacts@group\.v\.calendar\.google\.com$/.test(c.id) || /addressbook#contacts/.test(c.id)) return "birthdays";
  if ((c.accessRole === "owner" || c.accessRole === "writer") && /@group\.calendar\.google\.com$/.test(c.id)) return "own";
  return "shared";
}

/** Read by default: what the person shows in Google Calendar themselves (its own "selected"). */
export const seenByDefault = (c: RawCal, kind: CalendarRow["kind"]) => kind === "main" || (!c.hidden && c.selected === true);

/** A name short enough to say: a display name, else the part before @. Never the whole address. */
export const nameOf = (p: RawPerson) => (p.displayName?.trim() || (p.email ?? "").split("@")[0] || "").slice(0, 40);

const busyOf = (h: Held) => !h.ev.allDay && !h.ev.free && h.ev.me !== "declined";

// ---------- the module ----------

export interface CalendarDeps {
  dataDir: string;
  connections: ConnectionsStore;
  zone: () => string;
  now?: () => number;
  log: Pick<LogStore, "read" | "subscribe" | "head">;
}

export interface ProposeInput {
  change: "create" | "move" | "cancel" | "respond";
  ref?: string;
  title?: string;
  start?: string;
  end?: string;
  minutes?: number;
  attendees?: string[];
  account?: string;
  calendar?: string;
  where?: string;
  online?: boolean;
  response?: "accepted" | "declined" | "tentative";
  theirZone?: string;
  theirName?: string;
  note?: string;
}

export interface Calendar {
  /** The person's zone (every time here is in it). */
  zone(): string;
  /** The calendar accounts the person let it read (not excluded). */
  accounts(): AppTarget[];
  /** A calendar account's calendars with seen marked (cached; undefined until listed). */
  rows(a: Pick<AppTarget, "connectionId" | "service" | "account" | "label">): CalendarRow[] | undefined;
  /** Lists every account's calendars now (for Accounts and before a read). */
  refresh(): Promise<void>;
  /** Read one calendar or stop reading it. */
  pick(connectionId: string, service: string, account: string | undefined, calendarId: string, seen: boolean): boolean;
  /** The calendar ids to read for an account (the watcher's look). */
  seenIds(a: AppTarget): Promise<string[]>;
  /** Every seen calendar, merged, over [from, to) (ms). */
  events(from: number, to: number): Promise<{ events: CalEvent[]; marks: Map<string, string[]>; errors: string[] }>;
  glance(fromDate: string, toDate: string): Promise<CalGlance & { errors?: string[] }>;
  free(o: { minutes: number; from?: string; to?: string; dayStart?: string; dayEnd?: string; weekends?: boolean }): Promise<{ zone: string; slots: { start: string; end: string }[]; errors?: string[] }>;
  /** Builds the Go card and stages its write; the caller logs the decision. */
  propose(p: ProposeInput, decisionId: string): Promise<{ ok: true; cal: CalChange; goLabel: Record<"zh" | "en", string>; question: Record<"zh" | "en", string> } | { ok: false; error: string }>;
  /** D149: today's line for the empty conversation, from the last read only. */
  today(): CalToday | undefined;
  /** When today was last read (ms), if it was. */
  readAt(): number | undefined;
  /** Whether a Log event should wake the partner (a calendar card's Go and Hold don't: core runs it). */
  wakes(e: LogEvent): boolean;
  /** Changes on the calendar list (Accounts re-renders). */
  onChange(fn: () => void): () => void;
  stop(): void;
}

export function createCalendar(deps: CalendarDeps): Calendar {
  const now = deps.now ?? Date.now;
  const path = join(deps.dataDir, CALENDARS_FILE);
  let picks: Record<string, boolean> = {};
  if (existsSync(path)) {
    try {
      picks = (JSON.parse(readFileSync(path, "utf8")) as { picks?: Record<string, boolean> }).picks ?? {};
    } catch {
      /* start from the defaults */
    }
  }
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ picks }), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());
  const acctKey = (a: Pick<AppTarget, "connectionId" | "service" | "account">) => `${a.connectionId}|${a.service}|${a.account ?? ""}`;
  const lists = new Map<string, { at: number; cals: RawCal[] }>();
  const windows = new Map<string, { at: number; items: RawEvent[] }>();
  const held = new Map<string, Held>(); // ref -> the event as last read
  let lastRead: { at: number; events: Held[] } | undefined;
  const staged = new Set<string>(); // decision ids of calendar cards
  const running = new Set<string>();

  const accounts = () => deps.connections.view().flatMap((c) => deps.connections.apps(c.id).filter((a) => isCalendarService(a.service) && !a.excluded));
  const label = (a: AppTarget) => a.label ?? a.account;
  const many = () => accounts().length > 1;

  async function read(a: AppTarget, action: string, input: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const r = await deps.connections.read({ role: "watch" }, a.connectionId, `${a.service}.${action}`, input, a.account);
    return r.ok ? { ok: true, data: (r as { result?: unknown }).result } : { ok: false, error: r.error };
  }

  async function listOf(a: AppTarget, force = false): Promise<RawCal[] | undefined> {
    const k = acctKey(a);
    const hit = lists.get(k);
    if (hit && !force && now() - hit.at < LIST_MS) return hit.cals;
    if (a.service !== GOOGLE) return [{ id: "primary", primary: true, summary: "", accessRole: "owner", selected: true }];
    const r = await read(a, "list_calendars", {});
    if (!r.ok) return hit?.cals;
    const cals = rowsOf(r.data)
      .map((x) => x as unknown as RawCal)
      .filter((c) => typeof c.id === "string" && c.id);
    lists.set(k, { at: now(), cals });
    return cals;
  }

  const pickKey = (a: Pick<AppTarget, "connectionId" | "service" | "account">, id: string) => `${acctKey(a)}|${id}`;
  function rowOf(a: AppTarget, c: RawCal): CalendarRow {
    const kind = kindOfCal(c);
    const k = pickKey(a, c.id);
    return {
      id: c.id,
      name: kind === "main" ? "" : (c.summaryOverride ?? c.summary ?? "").slice(0, 60),
      kind,
      ...(c.backgroundColor && HEX.test(c.backgroundColor) ? { color: c.backgroundColor.toLowerCase() } : {}),
      canEdit: c.accessRole === "owner" || c.accessRole === "writer",
      seen: k in picks ? picks[k]! : seenByDefault(c, kind),
    };
  }

  /** Every seen calendar, of every account. */
  async function seenCals(): Promise<{ cals: Cal[]; errors: string[] }> {
    const out: Cal[] = [];
    const errors: string[] = [];
    await Promise.all(
      accounts().map(async (a) => {
        const list = await listOf(a);
        if (!list) return void errors.push(`${a.title}${label(a) ? ` (${label(a)})` : ""}: couldn't list its calendars`);
        for (const c of list) {
          const row = rowOf(a, c);
          if (row.seen) out.push({ app: a, row, ...(isZone(c.timeZone) ? { zone: c.timeZone } : {}) });
        }
      }),
    );
    // A stable order: accounts as the sources list them, main calendars first.
    const order = accounts().map(acctKey);
    out.sort((x, y) => order.indexOf(acctKey(x.app)) - order.indexOf(acctKey(y.app)) || Number(y.row.kind === "main") - Number(x.row.kind === "main"));
    return { cals: out, errors };
  }

  const refOf = (cal: Cal, id: string) => `c_${createHash("sha1").update(`${acctKey(cal.app)}|${cal.row.id}|${id}`).digest("hex").slice(0, 8)}`;

  function toEvent(cal: Cal, x: RawEvent, zone: string): Held | undefined {
    if (!x.id || x.status === "cancelled" || !x.start || !x.end) return;
    if (x.eventType === "workingLocation") return; // where they work today is not an event
    const allDay = !!x.start.date && !x.start.dateTime;
    const startMs = allDay ? zonedMs(x.start.date!, "00:00", zone) : Date.parse(x.start.dateTime ?? "");
    const endMs = allDay ? zonedMs(x.end.date ?? addDays(x.start.date!, 1), "00:00", zone) : Date.parse(x.end.dateTime ?? "");
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return;
    const people = (x.attendees ?? []).filter((p) => !p.self && !p.resource);
    const self = (x.attendees ?? []).find((p) => p.self);
    const evZone = x.start.timeZone;
    const theirs = isZone(evZone) && !/^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i.test(evZone) && offsetMin(startMs, evZone) !== offsetMin(startMs, zone) ? evZone : undefined;
    const online = !!x.hangoutLink || !!x.conferenceData?.entryPoints?.some((e) => e.entryPointType === "video");
    const ev: CalEvent = {
      ref: refOf(cal, x.id),
      title: (x.summary ?? "").trim().slice(0, 120),
      start: allDay ? x.start.date! : isoIn(startMs, zone),
      end: allDay ? (x.end.date ?? addDays(x.start.date!, 1)) : isoIn(endMs, zone),
      ...(allDay ? { allDay: true } : {}),
      ...(theirs ? { zone: theirs } : {}),
      calendar: cal.row.name,
      ...(many() && label(cal.app) ? { account: label(cal.app) } : {}),
      ...(cal.row.color ? { color: cal.row.color } : {}),
      ...(x.location?.trim() ? { where: x.location.trim().split("\n")[0]!.slice(0, 80) } : {}),
      ...(online ? { online: true } : {}),
      ...(x.htmlLink && /^https:\/\/(www\.)?(calendar\.)?google\.com\//.test(x.htmlLink) ? { link: x.htmlLink } : {}),
      ...(people.length ? { people: people.length, with: people.slice(0, 3).map(nameOf).filter(Boolean) } : {}),
      ...(self?.responseStatus && ["accepted", "declined", "tentative", "needsAction"].includes(self.responseStatus) ? { me: self.responseStatus as CalResponse } : {}),
      ...(x.organizer?.self || (!x.attendees?.length && cal.row.canEdit) ? { mine: true } : {}),
      ...(x.transparency === "transparent" ? { free: true } : {}),
      ...(x.recurringEventId ? { recurring: true } : {}),
    };
    return { ev, raw: x, cal, startMs, endMs };
  }

  async function windowOf(cal: Cal, from: number, to: number): Promise<RawEvent[] | undefined> {
    const k = `${acctKey(cal.app)}|${cal.row.id}|${from}|${to}`;
    const hit = windows.get(k);
    if (hit && now() - hit.at < EVENTS_MS) return hit.items;
    const r = await read(cal.app, "list_events", { calendarId: cal.row.kind === "main" && cal.app.service === GOOGLE ? "primary" : cal.row.id, timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 250, timeZone: deps.zone() });
    if (!r.ok) return;
    const items = rowsOf(r.data) as unknown as RawEvent[];
    if (windows.size > 200) windows.clear();
    windows.set(k, { at: now(), items });
    return items;
  }

  async function readAll(from: number, to: number) {
    const zone = deps.zone();
    const { cals, errors } = await seenCals();
    const got: Held[] = [];
    const marks = new Map<string, string[]>();
    // A few at a time: oo runs a process per read.
    const queue = [...cals];
    const worker = async () => {
      for (let cal = queue.shift(); cal; cal = queue.shift()) {
        const items = await windowOf(cal, from, to);
        if (!items) {
          errors.push(`${cal.row.name || cal.app.title}${label(cal.app) ? ` (${label(cal.app)})` : ""}: couldn't read`);
          continue;
        }
        for (const x of items) {
          const h = toEvent(cal, x, zone);
          if (!h) continue;
          if (cal.row.kind === "holidays" || cal.row.kind === "birthdays") {
            // A day's name, never busy time.
            for (let d = h.startMs; d < h.endMs; d += DAY) {
              const key = dateIn(d, zone);
              if (h.ev.title && !(marks.get(key) ?? []).includes(h.ev.title)) marks.set(key, [...(marks.get(key) ?? []), h.ev.title]);
            }
            continue;
          }
          got.push(h);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // One event sent to both of their addresses: once, from the copy they organize or the first account.
    const byUid = new Map<string, Held>();
    const out: Held[] = [];
    for (const h of got.sort((a, b) => a.startMs - b.startMs || Number(!!b.ev.mine) - Number(!!a.ev.mine))) {
      const uid = h.raw.iCalUID ? `${h.raw.iCalUID}|${h.startMs}` : undefined;
      if (uid && byUid.has(uid)) continue;
      if (uid) byUid.set(uid, h);
      out.push(h);
    }
    for (const h of out) held.set(h.ev.ref, h);
    if (held.size > 2000) for (const k of [...held.keys()].slice(0, 1000)) held.delete(k);
    return { held: out, marks, errors };
  }

  const clashesOf = (hs: Held[]): [string, string][] => {
    const busy = hs.filter(busyOf).sort((a, b) => a.startMs - b.startMs);
    const out: [string, string][] = [];
    for (let i = 0; i < busy.length; i++)
      for (let j = i + 1; j < busy.length && busy[j]!.startMs < busy[i]!.endMs; j++) if (busy[j]!.endMs > busy[i]!.startMs) out.push([busy[i]!.ev.ref, busy[j]!.ev.ref]);
    return out;
  };

  function unstage(decisionId: string) {
    staged.delete(decisionId);
  }

  // Go runs a staged change once, by core (the partner isn't woken: the card shows the outcome; a
  // failure wakes it through the failed connection_call).
  const isCalDecision = (id: string) => {
    if (staged.has(id)) return true;
    // The newest decisions first: a card is answered soon after it is made.
    const d = deps.log.read({ stream: "channel", kinds: ["decision"], beforeSeq: deps.log.head() + 1, limit: 2000 }).find((e) => (e.body as Bodies["decision"]).decisionId === id);
    return !!(d && (d.body as Bodies["decision"]).cal);
  };
  const off = deps.log.subscribe((e) => {
    if (e.kind !== "decision_resolved") return;
    const r = e.body as Bodies["decision_resolved"];
    if (r.option !== "go" || running.has(r.decisionId) || !isCalDecision(r.decisionId)) return;
    running.add(r.decisionId);
    void deps.connections
      .runApproved(r.decisionId)
      .then(() => {
        unstage(r.decisionId);
        windows.clear(); // the next look sees the change
      })
      .catch((err) => console.warn(`[calendar] ${(err as Error).message}`))
      .finally(() => running.delete(r.decisionId));
  });

  async function findHeld(ref: string): Promise<Held | undefined> {
    const h = held.get(ref);
    if (h) return h;
    // Not read this session: look over the coming month and the past week once.
    await readAll(now() - 7 * DAY, now() + 31 * DAY);
    return held.get(ref);
  }

  /** Which account a new event goes to: the one named, else the one whose domain the guests share, else the default. */
  function accountFor(want: string | undefined, attendees: string[]): AppTarget | undefined {
    const all = accounts().filter((a) => a.service === GOOGLE);
    if (!all.length) return;
    if (want) {
      const w = want.toLowerCase();
      const hit = all.find((a) => [a.account, a.label].some((x) => x && (x.toLowerCase() === w || x.toLowerCase().startsWith(`${w}@`) || x.toLowerCase().split("@")[1]?.split(".")[0] === w)));
      if (hit) return hit;
    }
    const domains = attendees.map((x) => x.toLowerCase().split("@")[1]).filter((d): d is string => !!d && !PUBLIC_MAIL.test(`@${d}`));
    const byDomain = all.find((a) => domains.some((d) => (label(a) ?? "").toLowerCase().endsWith(`@${d}`)));
    return byDomain ?? all[0];
  }

  const api: Calendar = {
    zone: () => deps.zone(),
    accounts,
    rows(a) {
      const hit = lists.get(acctKey(a));
      if (!hit) return;
      const app = accounts().find((x) => acctKey(x) === acctKey(a));
      return app ? hit.cals.map((c) => rowOf(app, c)) : undefined;
    },
    async refresh() {
      const before = JSON.stringify([...lists.values()].map((x) => x.cals.map((c) => c.id)));
      await Promise.all(accounts().map((a) => listOf(a)));
      if (JSON.stringify([...lists.values()].map((x) => x.cals.map((c) => c.id))) !== before) changed();
    },
    pick(connectionId, service, account, calendarId, seen) {
      const a = accounts().find((x) => x.connectionId === connectionId && x.service === service && (!account || x.account === account || x.label === account));
      if (!a || !lists.get(acctKey(a))?.cals.some((c) => c.id === calendarId)) return false;
      picks[pickKey(a, calendarId)] = seen;
      save();
      windows.clear();
      changed();
      return true;
    },
    async seenIds(a) {
      const list = await listOf(a);
      if (!list) return [];
      return list.filter((c) => {
        const r = rowOf(a, c);
        return r.seen && r.kind !== "holidays" && r.kind !== "birthdays";
      }).map((c) => (c.primary && a.service === GOOGLE ? "primary" : c.id));
    },
    async events(from, to) {
      const r = await readAll(from, to);
      return { events: r.held.map((h) => h.ev), marks: r.marks, errors: r.errors };
    },
    async glance(fromDate, toDate) {
      const zone = deps.zone();
      let to = toDate < fromDate ? fromDate : toDate;
      if (Date.parse(to) - Date.parse(fromDate) > (MAX_DAYS - 1) * DAY) to = addDays(fromDate, MAX_DAYS - 1);
      const from = zonedMs(fromDate, "00:00", zone);
      const end = zonedMs(addDays(to, 1), "00:00", zone);
      const r = await readAll(from, end);
      const days: CalDay[] = [];
      for (let d = fromDate; d <= to; d = addDays(d, 1)) {
        const lo = zonedMs(d, "00:00", zone);
        const hi = zonedMs(addDays(d, 1), "00:00", zone);
        const evs = r.held.filter((h) => h.startMs < hi && h.endMs > lo && h.ev.me !== "declined").sort((a, b) => Number(!b.ev.allDay) - Number(!a.ev.allDay) || a.startMs - b.startMs);
        days.push({ date: d, ...(r.marks.get(d)?.length ? { marks: r.marks.get(d) } : {}), events: evs.map((h) => h.ev) });
      }
      const inRange = r.held.filter((h) => h.startMs < end && h.endMs > from);
      if (from <= now() && now() < end) lastRead = { at: now(), events: inRange };
      const clashes = clashesOf(inRange);
      return { zone, from: fromDate, to, days, ...(clashes.length ? { clashes } : {}), accounts: accounts().length, at: new Date(now()).toISOString(), ...(r.errors.length ? { errors: r.errors } : {}) };
    },
    async free(o) {
      const zone = deps.zone();
      const minutes = Math.max(10, Math.min(8 * 60, Math.round(o.minutes || 30)));
      const today = dateIn(now(), zone);
      const fromDate = o.from && /^\d{4}-\d\d-\d\d/.test(o.from) ? o.from.slice(0, 10) : today;
      let toDate = o.to && /^\d{4}-\d\d-\d\d/.test(o.to) ? o.to.slice(0, 10) : addDays(fromDate, 6);
      if (Date.parse(toDate) - Date.parse(fromDate) > (MAX_DAYS - 1) * DAY) toDate = addDays(fromDate, MAX_DAYS - 1);
      const dayStart = /^\d\d:\d\d$/.test(o.dayStart ?? "") ? o.dayStart! : "09:00";
      const dayEnd = /^\d\d:\d\d$/.test(o.dayEnd ?? "") ? o.dayEnd! : "18:00";
      const r = await readAll(zonedMs(fromDate, "00:00", zone), zonedMs(addDays(toDate, 1), "00:00", zone));
      const busy = r.held.filter(busyOf).map((h) => [h.startMs, h.endMs] as const).sort((a, b) => a[0] - b[0]);
      // From half an hour from now, on the half hour.
      const earliest = Math.ceil((now() + 30 * MIN) / (30 * MIN)) * 30 * MIN;
      const perDays: { start: string; end: string }[][] = [];
      for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
        const slots: { start: string; end: string }[] = [];
        perDays.push(slots);
        const wd = wall(zonedMs(d, "12:00", zone), zone).wd;
        if (!o.weekends && (wd === "Sat" || wd === "Sun")) continue;
        let t = Math.max(zonedMs(d, dayStart, zone), earliest);
        const close = zonedMs(d, dayEnd, zone);
        let perDay = 0;
        while (t + minutes * MIN <= close && perDay < 3) {
          const hit = busy.find(([s, e]) => s < t + minutes * MIN && e > t);
          if (hit) {
            t = Math.ceil(hit[1] / (30 * MIN)) * 30 * MIN;
            continue;
          }
          slots.push({ start: isoIn(t, zone), end: isoIn(t + minutes * MIN, zone) });
          perDay++;
          // The next option starts after the next busy block, so options differ.
          const next = busy.find(([s]) => s >= t + minutes * MIN);
          // An open stretch: the next option a few hours on (morning, midday, afternoon).
          t = next ? Math.ceil(next[1] / (30 * MIN)) * 30 * MIN : t + Math.max(minutes * MIN, 3 * 60 * MIN);
        }
      }
      // A few options, spread over the days: each day's first, then each day's second, in time order.
      const slots: { start: string; end: string }[] = [];
      for (let i = 0; i < 3 && slots.length < SLOTS; i++) for (const day of perDays) if (day[i] && slots.length < SLOTS) slots.push(day[i]!);
      slots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      return { zone, slots, ...(r.errors.length ? { errors: r.errors } : {}) };
    },
    async propose(p, decisionId) {
      const zone = deps.zone();
      const theirZone = isZone(p.theirZone) ? p.theirZone : undefined;
      let a: AppTarget | undefined;
      let cal: CalendarRow | undefined;
      let action = "";
      let input: Record<string, unknown> = {};
      let change: CalChange;
      const attendees = (p.attendees ?? []).map((x) => String(x).trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 30);
      const span = (startIn: unknown, endIn: unknown, minutes: number | undefined, base?: { s: number; e: number }) => {
        const s = parseWhen(startIn, zone);
        if (!s) return;
        if (s.dateOnly && !endIn && !minutes) return { s: s.ms, e: s.ms + DAY, allDay: true };
        const e = parseWhen(endIn, zone);
        const len = minutes && minutes > 0 ? minutes * MIN : base ? base.e - base.s : 30 * MIN;
        const end = e && !e.dateOnly ? e.ms : s.ms + len;
        return end > s.ms ? { s: s.ms, e: end, allDay: false } : undefined;
      };
      const when = (ms: number, allDay: boolean, z?: string) => (allDay ? { date: dateIn(ms, zone) } : { dateTime: isoIn(ms, z ?? zone), timeZone: z ?? zone });
      const clashAt = async (s: number, e: number, except?: string) => {
        const r = await readAll(s - DAY, e + DAY);
        return r.held.find((h) => h.ev.ref !== except && busyOf(h) && h.startMs < e && h.endMs > s)?.ev.title;
      };

      if (p.change === "create") {
        a = accountFor(p.account, attendees);
        if (!a) return { ok: false, error: "No Google Calendar account to add it to." };
        const list = (await listOf(a)) ?? [];
        const rows = list.map((c) => rowOf(a!, c)).filter((r) => r.canEdit && r.kind !== "holidays" && r.kind !== "birthdays");
        const want = p.calendar?.trim().toLowerCase();
        cal = (want && rows.find((r) => r.name.toLowerCase() === want)) || rows.find((r) => r.kind === "main") || rows[0];
        if (!cal) return { ok: false, error: "That account has no calendar it can add to." };
        const t = span(p.start, p.end, p.minutes);
        if (!t) return { ok: false, error: "Give start (and end or minutes) as ISO date-times in the user's zone, e.g. 2026-11-18T14:00." };
        if (!(p.title ?? "").trim()) return { ok: false, error: "Give the event a title in the user's language." };
        action = "create_event";
        input = {
          calendarId: cal.kind === "main" ? "primary" : cal.id,
          sendUpdates: attendees.length ? "all" : "none",
          event: {
            summary: p.title!.trim().slice(0, 200),
            start: when(t.s, t.allDay),
            end: when(t.e, t.allDay),
            ...(attendees.length ? { attendees: attendees.map((email) => ({ email })) } : {}),
            ...(p.where?.trim() ? { location: p.where.trim().slice(0, 300) } : {}),
            ...(p.note?.trim() ? { description: p.note.trim().slice(0, 2000) } : {}),
            ...(p.online ? { conferenceData: { createRequest: { requestId: decisionId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
          },
        };
        const clash = t.allDay ? undefined : await clashAt(t.s, t.e);
        change = {
          kind: "create",
          title: p.title!.trim().slice(0, 120),
          calendar: cal.name,
          ...(many() && label(a) ? { account: label(a) } : {}),
          ...(cal.color ? { color: cal.color } : {}),
          start: t.allDay ? dateIn(t.s, zone) : isoIn(t.s, zone),
          end: t.allDay ? dateIn(t.e, zone) : isoIn(t.e, zone),
          ...(t.allDay ? { allDay: true } : {}),
          // A guest by the name the person used for them, when there is one guest and they named them.
          notify: attendees.length === 1 && p.theirName?.trim() ? [p.theirName.trim().slice(0, 40)] : attendees.map((x) => x.split("@")[0]!),
          ...(p.where?.trim() ? { where: p.where.trim().slice(0, 80) } : {}),
          ...(p.online ? { online: true } : {}),
          ...(clash ? { clash } : {}),
        };
      } else {
        if (!p.ref) return { ok: false, error: "Name the event by its ref (from calendar do=agenda)." };
        const h = await findHeld(p.ref);
        if (!h) return { ok: false, error: "No event with that ref now. Look again with do=agenda." };
        a = h.cal.app;
        cal = h.cal.row;
        if (a.service !== GOOGLE) return { ok: false, error: "Changes are only built for Google Calendar; for this one use connection_call." };
        const calendarId = cal.kind === "main" ? "primary" : cal.id;
        const others = (h.raw.attendees ?? []).filter((x) => !x.self && !x.resource);
        // The organizer by name: the organizer field often has only an address; the guest list has the name.
        const org = h.raw.organizer;
        const organizer = !org || org.self ? undefined : { ...org, displayName: org.displayName ?? (h.raw.attendees ?? []).find((x) => x.organizer || (org.email && x.email === org.email))?.displayName };
        const base: Omit<CalChange, "kind" | "notify"> = {
          title: h.ev.title,
          calendar: cal.name,
          ...(h.ev.account ? { account: h.ev.account } : {}),
          ...(cal.color ? { color: cal.color } : {}),
          start: h.ev.start,
          end: h.ev.end,
          ...(h.ev.allDay ? { allDay: true } : {}),
          ...(h.ev.where ? { where: h.ev.where } : {}),
        };
        if (p.change === "respond" || (p.change === "cancel" && organizer && others.length)) {
          // Someone else's invitation: the person answers it (cancelling theirs is declining).
          const response = p.change === "cancel" ? "declined" : p.response;
          if (!response || !["accepted", "declined", "tentative"].includes(response)) return { ok: false, error: "respond needs response: accepted, declined or tentative." };
          if (!(h.raw.attendees ?? []).some((x) => x.self)) return { ok: false, error: "The user isn't on that event's guest list; there is no invitation to answer." };
          action = "patch_event";
          // The whole guest list goes back (a patch replaces it), only their own answer changed.
          input = { calendarId, eventId: h.raw.id, sendUpdates: "all", event: { attendees: (h.raw.attendees ?? []).map((x) => (x.self ? { ...x, responseStatus: response } : x)) } };
          change = { ...base, kind: "respond", response, ...(organizer ? { organizer: nameOf(organizer) } : {}), notify: organizer ? [nameOf(organizer)] : [] };
        } else if (p.change === "cancel") {
          if (!cal.canEdit) return { ok: false, error: "That calendar is read-only for the user." };
          action = "delete_event";
          input = { calendarId, eventId: h.raw.id, sendUpdates: others.length ? "all" : "none" };
          change = { ...base, kind: "cancel", notify: others.map(nameOf) };
        } else {
          if (organizer && others.length && !h.raw.guestsCanModify) return { ok: false, error: `Only ${nameOf(organizer)} (the organizer) can move it. Offer to reply to them instead.` };
          if (!cal.canEdit) return { ok: false, error: "That calendar is read-only for the user." };
          const t = span(p.start, p.end, p.minutes, { s: h.startMs, e: h.endMs });
          if (!t || t.allDay) return { ok: false, error: "Give the new start (and end or minutes) as ISO date-times in the user's zone." };
          const z = isZone(h.raw.start?.timeZone) ? h.raw.start!.timeZone : zone;
          action = "patch_event";
          input = { calendarId, eventId: h.raw.id, sendUpdates: others.length ? "all" : "none", event: { start: when(t.s, false, z), end: when(t.e, false, z) } };
          const clash = await clashAt(t.s, t.e, h.ev.ref);
          change = { ...base, kind: "move", start: isoIn(t.s, zone), end: isoIn(t.e, zone), was: { start: h.ev.start, end: h.ev.end }, notify: others.map(nameOf), ...(clash ? { clash } : {}) };
        }
      }
      const z = theirZone;
      if (z && !change.allDay && offsetMin(Date.parse(change.start), z) !== offsetMin(Date.parse(change.start), zone)) {
        change.theirZone = z;
        if (p.theirName?.trim()) change.theirName = p.theirName.trim().slice(0, 40);
      }
      const staged_ = deps.connections.stage(a.connectionId, `${a.service}.${action}`, input, decisionId, a.account);
      if (!staged_.ok) return { ok: false, error: staged_.error };
      staged.add(decisionId);
      return { ok: true, cal: change, ...words(change) };
    },
    readAt: () => lastRead?.at,
    today() {
      if (!lastRead || now() - lastRead.at > 3 * 3_600_000) return;
      const zone = deps.zone();
      const d = dateIn(now(), zone);
      const ahead = lastRead.events.filter((h) => !h.ev.allDay && h.ev.me !== "declined" && h.startMs > now() && dateIn(h.startMs, zone) === d).sort((a, b) => a.startMs - b.startMs);
      if (!ahead.length) return;
      const todays = lastRead.events.filter((h) => dateIn(h.startMs, zone) === d && h.endMs > now());
      return { left: ahead.length, next: { title: ahead[0]!.ev.title, start: ahead[0]!.ev.start }, ...(clashesOf(todays).length ? { clash: true } : {}) };
    },
    wakes(e) {
      if (e.kind !== "decision_resolved") return true;
      const r = e.body as Bodies["decision_resolved"];
      return r.option === "reply" || !isCalDecision(r.decisionId);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop() {
      off();
    },
  };
  return api;
}

// ---------- the card's own words (both languages; the clients draw the rest) ----------

/** The question and the Go label, by the kind (D212: a button is a verb phrase). */
export function words(c: CalChange): { question: Record<"zh" | "en", string>; goLabel: Record<"zh" | "en", string> } {
  const t = c.title || "(无标题)";
  const te = c.title || "(no title)";
  switch (c.kind) {
    case "create":
      return { question: { zh: `添加「${t}」？`, en: `Add “${te}”?` }, goLabel: { zh: "添加到日历", en: "Add to calendar" } };
    case "move":
      return { question: { zh: `改「${t}」的时间？`, en: `Move “${te}”?` }, goLabel: { zh: "更改时间", en: "Move it" } };
    case "cancel":
      return { question: { zh: `取消「${t}」？`, en: `Cancel “${te}”?` }, goLabel: { zh: "取消日程", en: "Cancel event" } };
    default:
      if (c.response === "accepted") return { question: { zh: `接受「${t}」的邀请？`, en: `Accept “${te}”?` }, goLabel: { zh: "接受", en: "Accept" } };
      if (c.response === "declined") return { question: { zh: `拒绝「${t}」的邀请？`, en: `Decline “${te}”?` }, goLabel: { zh: "拒绝", en: "Decline" } };
      return { question: { zh: `对「${t}」回复可能参加？`, en: `Reply maybe to “${te}”?` }, goLabel: { zh: "可能参加", en: "Maybe" } };
  }
}
