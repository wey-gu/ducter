// Stage 0 (D165 §10, call 6): Ducter looks by itself, by code, no model. oo has no triggers
// (OO_NOT_WATCHABLE), so every source is read on a schedule through the broker as the read-only
// "watch" caller: mail, GitHub and chat every 10 minutes, calendars every 15. Each look asks only
// for what is newer than the last one (a checkpoint per app, kept in watch.json, 0600) and never
// changes the inbox (reads through the API mark nothing read).
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadLine } from "@ducter/protocol";
import type { Clock } from "../clock.ts";
import { CHAT_SERVICES, type AppTarget, type ConnectionsStore } from "../connections.ts";
import { itemsOf, type Item, type ItemKind, type Target } from "./items.ts";

export const WATCH_FILE = "watch.json";
const MIN = 60_000;
const DAY = 86_400_000;
const SEEN_MAX = 600;

export interface LookSpec {
  kind: ItemKind;
  everyMs: number;
  /** Action ids to try, best first; the first that answers is remembered per app. */
  actions: string[];
  /** The read's input: what is newer than `since` (mail, GitHub, chat) or the coming window (calendars). */
  input(since: number, now: number): Record<string, unknown>;
}

const MAIL: LookSpec = {
  kind: "mail",
  everyMs: 10 * MIN,
  actions: ["gmail.search_threads", "gmail.fetch_emails", "gmail.list_messages"],
  input: (since) => ({ query: `after:${Math.floor(since / 1000)}`, maxResults: 50 }),
};
const OUTLOOK: LookSpec = { ...MAIL, actions: ["outlook.list_messages", "outlook.search_messages"], input: (since) => ({ filter: `receivedDateTime ge ${new Date(since).toISOString()}`, top: 50 }) };
// D221 (research/64): the real actions, read live through oo. Google lists one calendar per read
// (calendarId; the main one is "primary"), so a look reads each calendar the person lets it read.
const CALENDAR = (service: string): LookSpec => ({
  kind: "event",
  everyMs: 15 * MIN,
  actions: service === "outlook_calendar" ? ["outlook_calendar.list_calendar_view", "outlook_calendar.list_events"] : [`${service}.list_events`],
  input: (_since, now) =>
    service === "outlook_calendar"
      ? { startDateTime: new Date(now - 6 * 3_600_000).toISOString(), endDateTime: new Date(now + 3 * DAY).toISOString() }
      : { timeMin: new Date(now - 6 * 3_600_000).toISOString(), timeMax: new Date(now + 3 * DAY).toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 100 },
});
const GITHUB: LookSpec = {
  kind: "github",
  everyMs: 10 * MIN,
  actions: ["github.list_notifications", "github.list_notifications_for_authenticated_user"],
  input: (since) => ({ since: new Date(since).toISOString(), participating: true, all: true }),
};
const CHAT = (svc: string): LookSpec => ({
  kind: "chat",
  everyMs: 10 * MIN,
  actions: [`${svc}.list_mentions`, `${svc}.search_messages`, `${svc}.list_direct_messages`],
  input: (since) => ({ query: "to:me", after: new Date(since).toISOString(), limit: 50 }),
});

/** How each service is looked at; undefined: not watched (it is still read when asked). */
export function lookFor(service: string): LookSpec | undefined {
  if (service === "gmail") return MAIL;
  if (service === "outlook") return OUTLOOK;
  if (/calendar/.test(service)) return CALENDAR(service);
  if (service === "github") return GITHUB;
  if (CHAT_SERVICES.has(service)) return CHAT(service.replace(/bot$/, ""));
  return;
}

/** The person's own addresses and handles, from the account's label (oo shows the address). */
export const meOf = (a: AppTarget): string[] => [a.label, a.account].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase());

const appKey = (a: Pick<AppTarget, "connectionId" | "service" | "account">) => `${a.connectionId}|${a.service}|${a.account ?? ""}`;

interface FileState {
  since: Record<string, number>;
  seen: Record<string, string[]>;
  action: Record<string, string>;
  reads: (ReadLine & { connectionId: string })[];
}

export interface Watchers {
  /** Arms a timer per watched app (and drops the rest): call when settings or connections change. */
  sync(): void;
  /** One look at one app, over [since, now]: what it read, or undefined when it couldn't. */
  look(a: AppTarget, since: number, what?: ReadLine["what"]): Promise<Item[] | undefined>;
  /** A look back over `days` at every app of a source (or all), for the first look and the ledger. */
  lookBack(days: number, opts?: { connectionId?: string; kinds?: ItemKind[] }): Promise<{ items: Item[]; apps: number }>;
  /** 看了哪些 / What it read today, newest first. */
  reads(connectionId: string): ReadLine[];
  /** Items read today, per source. */
  readToday(connectionId: string): number;
  lastReadAt(a: AppTarget): string | undefined;
  forget(connectionId: string): void;
  stop(): void;
}

export function createWatchers(opts: {
  dataDir: string;
  connections: ConnectionsStore;
  clock: Clock;
  /** Watching runs only while this holds (the person said yes, D165 call 4). */
  enabled: () => boolean;
  /** New items from a scheduled look. */
  onItems: (a: AppTarget, items: Item[]) => void | Promise<void>;
  /** The person's zone, for "today". */
  zone: () => string;
  /** D221: the calendars to read in a calendar account (absent: its default calendar only). */
  calendarIds?: (a: AppTarget) => Promise<string[]>;
}): Watchers {
  const path = join(opts.dataDir, WATCH_FILE);
  let st: FileState = { since: {}, seen: {}, action: {}, reads: [] };
  if (existsSync(path)) {
    try {
      st = { ...st, ...(JSON.parse(readFileSync(path, "utf8")) as Partial<FileState>) };
    } catch {
      /* start fresh */
    }
  }
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(st), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  const timers = new Map<string, unknown>();
  let stopped = false;

  const fmts = new Map<string, Intl.DateTimeFormat>();
  const dayOf = (ms: number) => {
    const z = opts.zone();
    let f = fmts.get(z);
    if (!f) fmts.set(z, (f = new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit" })));
    return f.format(new Date(ms));
  };
  const today = () => dayOf(opts.clock.now());
  const trimReads = () => {
    const d = today();
    st.reads = st.reads.filter((r) => dayOf(Date.parse(r.at)) === d).slice(-400);
  };

  const target = (a: AppTarget): Target => ({ connectionId: a.connectionId, source: a.source, service: a.service, title: a.title, ...(a.account ? { account: a.account } : {}), me: meOf(a) });

  async function look(a: AppTarget, since: number, what?: ReadLine["what"]): Promise<Item[] | undefined> {
    const spec = lookFor(a.service);
    if (!spec || a.excluded) return;
    const k = appKey(a);
    const now = opts.clock.now();
    const tries = st.action[k] ? [st.action[k]!, ...spec.actions.filter((x) => x !== st.action[k])] : spec.actions;
    // A calendar account: each calendar the person lets it read, one read each (D221).
    const cals = spec.kind === "event" && opts.calendarIds && a.service === "googlecalendar" ? await opts.calendarIds(a).catch(() => []) : [];
    for (const action of tries) {
      const inputs = cals.length ? cals.map((calendarId) => ({ ...spec.input(since, now), calendarId, timeZone: opts.zone() })) : [spec.input(since, now)];
      const results: unknown[] = [];
      let failed = "";
      for (const input of inputs) {
        const r = await opts.connections.read({ role: "watch" }, a.connectionId, action, input, a.account);
        if (r.ok) results.push(r.result);
        else failed ||= r.error;
      }
      if (!results.length) {
        // An action this source doesn't have: try the next one; anything else ends the look.
        if (/no (such )?(action|tool)|unknown action|metadata request returned HTTP 404/i.test(failed)) continue;
        return;
      }
      st.action[k] = action;
      let items = results.flatMap((res) => itemsOf(target(a), spec.kind, res));
      // Chat: only @-mentions and DMs (D165 call 1); the rest is never even counted.
      if (spec.kind === "chat") items = items.filter((i) => i.mention || i.dm || i.out);
      trimReads();
      st.reads.push({ connectionId: a.connectionId, at: new Date(opts.clock.now()).toISOString(), service: a.service, ...(a.label ?? a.account ? { account: a.label ?? a.account } : {}), items: items.length, what: what ?? (spec.kind === "event" ? "events" : spec.kind === "chat" || spec.kind === "github" ? "mentions" : "new") });
      save();
      return items;
    }
    return;
  }

  async function tick(a: AppTarget) {
    const k = appKey(a);
    timers.delete(k);
    if (stopped || !opts.enabled()) return;
    const spec = lookFor(a.service)!;
    const now = opts.clock.now();
    const since = st.since[k] ?? now - spec.everyMs;
    try {
      const items = await look(a, since);
      if (items) {
        const seen = new Set(st.seen[k] ?? []);
        // Calendars come back as a window: an event is new when its id or its time changed.
        const idOf = (i: Item) => (i.kind === "event" ? `${i.id}@${i.start}${i.cancelled ? "x" : ""}` : i.id);
        const fresh = items.filter((i) => !seen.has(idOf(i)));
        // The checkpoint moves only after the items were taken in (research/48 P5): a restart in
        // between reads them again (the ledger keeps one fact per item), never loses them.
        if (fresh.length) await opts.onItems(a, fresh);
        st.seen[k] = [...(st.seen[k] ?? []), ...fresh.map(idOf)].slice(-SEEN_MAX);
        if (spec.kind !== "event") st.since[k] = Math.max(since, ...items.map((i) => i.at).filter((t) => t > 0 && t <= now + MIN), now - MIN);
        save();
      }
    } catch (err) {
      console.warn(`[watch] ${a.title}: ${(err as Error).message}`);
    }
    arm(a);
  }

  function arm(a: AppTarget) {
    const spec = lookFor(a.service);
    if (!spec || stopped) return;
    const k = appKey(a);
    if (timers.has(k)) return;
    timers.set(k, opts.clock.setTimeout(() => void tick(a), spec.everyMs));
  }

  return {
    sync() {
      const on = opts.enabled();
      const want = new Map<string, AppTarget>();
      if (on) for (const c of opts.connections.view()) for (const a of opts.connections.apps(c.id)) if (a.watch && !a.excluded && lookFor(a.service)) want.set(appKey(a), a);
      for (const [k, t] of timers) if (!want.has(k)) opts.clock.clearTimeout(t), timers.delete(k);
      for (const [k, a] of want) {
        // Watching starts from now: the first look already covered the days before (§11).
        if (st.since[k] === undefined) st.since[k] = opts.clock.now();
        arm(a);
      }
      save();
    },
    look,
    async lookBack(days, o = {}) {
      const since = opts.clock.now() - days * DAY;
      const items: Item[] = [];
      let apps = 0;
      for (const c of opts.connections.view()) {
        if (o.connectionId && c.id !== o.connectionId) continue;
        for (const a of opts.connections.apps(c.id)) {
          const spec = lookFor(a.service);
          if (!spec || a.excluded || (o.kinds && !o.kinds.includes(spec.kind))) continue;
          const got = await look(a, since);
          if (got) apps++, items.push(...got);
        }
      }
      return { items, apps };
    },
    reads(connectionId) {
      trimReads();
      return st.reads.filter((r) => r.connectionId === connectionId).reverse().map(({ connectionId: _c, ...r }) => r);
    },
    readToday(connectionId) {
      trimReads();
      // The card says emails: mail looks only (not events, mentions or notifications).
      return st.reads.filter((r) => r.connectionId === connectionId && (r.what === "new" || r.what === "full")).reduce((n, r) => n + r.items, 0);
    },
    lastReadAt(a) {
      const hit = [...st.reads].reverse().find((r) => r.connectionId === a.connectionId && r.service === a.service && (r.account ?? "") === (a.label ?? a.account ?? ""));
      return hit?.at;
    },
    forget(connectionId) {
      for (const m of [st.since, st.seen, st.action] as Record<string, unknown>[]) for (const k of Object.keys(m)) if (k.startsWith(`${connectionId}|`)) delete m[k];
      st.reads = st.reads.filter((r) => r.connectionId !== connectionId);
      for (const [k, t] of timers) if (k.startsWith(`${connectionId}|`)) opts.clock.clearTimeout(t), timers.delete(k);
      save();
    },
    stop() {
      stopped = true;
      for (const t of timers.values()) opts.clock.clearTimeout(t);
      timers.clear();
    },
  };
}
