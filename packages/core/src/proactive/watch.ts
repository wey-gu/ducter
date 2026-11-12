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
import { FACTY_TERMS } from "./stage1.ts";

export const WATCH_FILE = "watch.json";
const MIN = 60_000;
const DAY = 86_400_000;
// Enough for what a look may page through while something waits (5 pages of 100), and more.
const SEEN_MAX = 2000;
export const CAL_AHEAD_DAYS = 14;
const CAL_LONG_DAYS = 30;

export interface LookSpec {
  kind: ItemKind;
  everyMs: number;
  /** Action ids to try, best first; one the source doesn't have is remembered and skipped. */
  actions: string[];
  /**
   * The reads one look makes with `action`: what is newer than `since` (mail, GitHub, chat) or the
   * coming window (calendars). long: the long look back (D226) asks mail only for subjects that may
   * hold a booking, a renewal or a payment, in a few short searches (one long OR'd search is the
   * kind a mail service may refuse), and calendars a month ahead.
   */
  inputs(since: number, now: number, o?: { long?: boolean; action?: string }): Record<string, unknown>[];
  /** The next page of a read, when the action pages (Gmail's fetch_emails: nextPageToken). */
  next?(result: unknown, input: Record<string, unknown>): Record<string, unknown> | undefined;
}

/** Pages one mail read may follow (100 a page): a day of a busy inbox, or what waited on a broken read. */
export const MAIL_PAGES = 5;
/** Subject words per search in the long look back. */
export const TERMS_PER_SEARCH = 14;
const termOf = (w: string) => (/\s/.test(w) ? `"${w}"` : w);
/** The long look back's subject searches: FACTY_TERMS in a few short groups. */
export const subjectGroups = (): string[] => {
  const out: string[] = [];
  for (let i = 0; i < FACTY_TERMS.length; i += TERMS_PER_SEARCH) out.push(`subject:(${FACTY_TERMS.slice(i, i + TERMS_PER_SEARCH).map(termOf).join(" OR ")})`);
  return out;
};

// research/68: through OOMOL, gmail.search_threads answers {threadId, snippet} only (no sender, no
// subject, no date, no labels), so nothing read with it could be dated, ruled or looked back over.
// fetch_emails with detail "summary" answers each message's sender, To, subject, labels and
// internalDate, and pages; it comes first, and search_threads stays the fallback.
const MAIL: LookSpec = {
  kind: "mail",
  everyMs: 10 * MIN,
  actions: ["gmail.fetch_emails", "gmail.search_threads", "gmail.list_messages"],
  inputs: (since, _now, o) => {
    const after = `after:${Math.floor(since / 1000)}`;
    const queries = o?.long ? subjectGroups().map((g) => `${after} ${g}`) : [after];
    return queries.map((query) => (o?.action === "gmail.fetch_emails" ? { query, maxResults: 100, detail: "summary" } : { query, maxResults: 50 }));
  },
  next: (result, input) => {
    const t = result && typeof result === "object" ? (result as Record<string, unknown>).nextPageToken : undefined;
    return typeof t === "string" && t ? { ...input, pageToken: t } : undefined;
  },
};
const OUTLOOK: LookSpec = { kind: "mail", everyMs: 10 * MIN, actions: ["outlook.list_messages", "outlook.search_messages"], inputs: (since) => [{ filter: `receivedDateTime ge ${new Date(since).toISOString()}`, top: 50 }] };
// D222 (research/65): the real actions, read live through oo. Google lists one calendar per read
// (calendarId; the main one is "primary"), so a look reads each calendar the person lets it read.
const CALENDAR = (service: string): LookSpec => ({
  kind: "event",
  everyMs: 15 * MIN,
  actions: service === "outlook_calendar" ? ["outlook_calendar.list_calendar_view", "outlook_calendar.list_events"] : [`${service}.list_events`],
  // D226: two weeks ahead (a calendar entry and a confirmation two weeks out can disagree; 3 days
  // saw only the clashes); the long look back a month.
  inputs: (_since, now, o) => {
    const until = new Date(now + (o?.long ? CAL_LONG_DAYS : CAL_AHEAD_DAYS) * DAY).toISOString();
    return [
      service === "outlook_calendar"
        ? { startDateTime: new Date(now - 6 * 3_600_000).toISOString(), endDateTime: until }
        : { timeMin: new Date(now - 6 * 3_600_000).toISOString(), timeMax: until, singleEvents: true, orderBy: "startTime", maxResults: 100 },
    ];
  },
});
const GITHUB: LookSpec = {
  kind: "github",
  everyMs: 10 * MIN,
  actions: ["github.list_notifications", "github.list_notifications_for_authenticated_user"],
  inputs: (since) => [{ since: new Date(since).toISOString(), participating: true, all: true }],
};
const CHAT = (svc: string): LookSpec => ({
  kind: "chat",
  everyMs: 10 * MIN,
  actions: [`${svc}.list_mentions`, `${svc}.search_messages`, `${svc}.list_direct_messages`],
  inputs: (since) => [{ query: "to:me", after: new Date(since).toISOString(), limit: 50 }],
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
  /** Ids taken in: read closely, or left by a rule. Only those; one whose reading failed waits (pending). */
  seen: Record<string, string[]>;
  action: Record<string, string>;
  /** Actions a source answered it doesn't have (skipped after, so the better one is tried first). */
  missing: Record<string, string[]>;
  /** Ids whose close reading failed: read again on the next look, for up to PENDING_DAYS (ids and dates only). */
  pending: Record<string, { id: string; at: number; first: number }[]>;
  reads: (ReadLine & { connectionId: string })[];
}

/** How long an item whose reading failed keeps waiting to be read again. */
export const PENDING_DAYS = 3;
const NO_ACTION = /no (such )?(action|tool)|unknown action|metadata request returned HTTP 404/i;

export interface Watchers {
  /** Arms a timer per watched app (and drops the rest): call when settings or connections change. */
  sync(): void;
  /** One look at one app, over [since, now]: what it read, or undefined when it couldn't. */
  look(a: AppTarget, since: number, what?: ReadLine["what"], o?: { long?: boolean }): Promise<Item[] | undefined>;
  /** A look back over `days` at every app of a source (or all), for the first look and the ledger. */
  lookBack(days: number, opts?: { connectionId?: string; kinds?: ItemKind[]; long?: boolean }): Promise<{ items: Item[]; apps: number }>;
  /** Items waiting to be read again, over every source. */
  waiting(): number;
  /** D226: what the watchers looked at today, over every source (counts only). */
  lookedToday(): { mail: number; events: number; mentions: number };
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
  /**
   * New items from a scheduled look. `pending`: the keys of those it could not read closely (the
   * model failed or isn't there yet); they are not marked seen and come back on the next look.
   */
  onItems: (a: AppTarget, items: Item[]) => void | Promise<void | { pending?: string[] }>;
  /** The person's zone, for "today". */
  zone: () => string;
  /** D222: the calendars to read in a calendar account (absent: its default calendar only). */
  calendarIds?: (a: AppTarget) => Promise<string[]>;
}): Watchers {
  const path = join(opts.dataDir, WATCH_FILE);
  let st: FileState = { since: {}, seen: {}, action: {}, missing: {}, pending: {}, reads: [] };
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

  /** One action over its inputs, each followed for its pages: what came back, and the first error. */
  async function readAll(a: AppTarget, spec: LookSpec, action: string, inputs: Record<string, unknown>[]): Promise<{ results: unknown[]; failed: string; refused: number }> {
    const results: unknown[] = [];
    let failed = "";
    let refused = 0;
    for (const first of inputs) {
      let input: Record<string, unknown> | undefined = first;
      for (let page = 0; input && page < (spec.next ? MAIL_PAGES : 1); page++) {
        const r = await opts.connections.read({ role: "watch" }, a.connectionId, action, input, a.account);
        if (!r.ok) {
          failed ||= r.error;
          if (page === 0) refused++;
          break;
        }
        results.push(r.result);
        input = spec.next?.(r.result, input);
      }
    }
    return { results, failed, refused };
  }

  async function look(a: AppTarget, since: number, what?: ReadLine["what"], lo: { long?: boolean } = {}): Promise<Item[] | undefined> {
    const spec = lookFor(a.service);
    if (!spec || a.excluded) return;
    const k = appKey(a);
    const now = opts.clock.now();
    const gone = new Set(st.missing[k] ?? []);
    const left = spec.actions.filter((x) => !gone.has(x));
    // Every action said missing: the source may have changed; ask again from the best.
    const tries = left.length ? left : spec.actions;
    // A calendar account: each calendar the person lets it read, one read each (D222).
    const cals = spec.kind === "event" && opts.calendarIds && a.service === "googlecalendar" ? await opts.calendarIds(a).catch(() => []) : [];
    for (const action of tries) {
      const base = spec.inputs(since, now, { ...lo, action });
      const inputs = cals.length ? cals.flatMap((calendarId) => base.map((i) => ({ ...i, calendarId, timeZone: opts.zone() }))) : base;
      let { results, failed, refused } = await readAll(a, spec, action, inputs);
      if (!results.length && NO_ACTION.test(failed)) {
        // An action this source doesn't have: remembered, and the next one tried.
        st.missing[k] = [...new Set([...(st.missing[k] ?? []), action])];
        continue;
      }
      // The long look back's subject searches refused (a mail service may cap a query): the
      // newest mail instead, paged, so the look back still reads (rules and triage sort it).
      if (lo.long && spec.kind === "mail" && refused) {
        console.warn(`[watch] ${a.title}: ${refused} of ${inputs.length} subject searches refused (${failed.slice(0, 120)}); reading the newest mail instead`);
        const plain = await readAll(a, spec, action, spec.inputs(since, now, { action }));
        results = [...results, ...plain.results];
      }
      if (!results.length) return;
      st.action[k] = action;
      const byKey = new Map<string, Item>();
      for (const it of results.flatMap((res) => itemsOf(target(a), spec.kind, res))) if (!byKey.has(it.key)) byKey.set(it.key, it);
      let items = [...byKey.values()];
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
        // between reads them again (the ledger keeps one fact per item), never loses them. An item
        // is seen only once it was read closely or a rule left it; one whose reading failed waits.
        const got = fresh.length ? await opts.onItems(a, fresh) : undefined;
        const wait = new Set((got && got.pending) ?? []);
        const took = fresh.filter((i) => !wait.has(i.key));
        st.seen[k] = [...(st.seen[k] ?? []), ...took.map(idOf)].slice(-SEEN_MAX);
        const pend = new Map((st.pending[k] ?? []).map((p) => [p.id, p]));
        for (const i of took) pend.delete(idOf(i));
        for (const i of fresh) if (wait.has(i.key) && !pend.has(idOf(i))) pend.set(idOf(i), { id: idOf(i), at: i.at, first: now });
        const still = [...pend.values()].filter((p) => now - p.first <= PENDING_DAYS * DAY && (!p.at || now - p.at <= PENDING_DAYS * DAY));
        if (still.length) st.pending[k] = still;
        else delete st.pending[k];
        if (spec.kind !== "event") {
          let next = Math.max(since, ...items.map((i) => i.at).filter((t) => t > 0 && t <= now + MIN), now - MIN);
          // What waits is asked for again: the checkpoint stays before the oldest of it.
          const dated = still.map((p) => p.at).filter((t) => t > 0);
          if (dated.length) next = Math.min(next, Math.min(...dated) - 1000);
          st.since[k] = next;
        }
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
          const got = await look(a, since, undefined, o.long ? { long: true } : {});
          if (got) apps++, items.push(...got);
        }
      }
      return { items, apps };
    },
    reads(connectionId) {
      trimReads();
      return st.reads.filter((r) => r.connectionId === connectionId).reverse().map(({ connectionId: _c, ...r }) => r);
    },
    waiting: () => Object.values(st.pending).reduce((n, l) => n + l.length, 0),
    lookedToday() {
      trimReads();
      const n = { mail: 0, events: 0, mentions: 0 };
      for (const r of st.reads) {
        if (r.what === "events") n.events += r.items;
        else if (r.what === "mentions") n.mentions += r.items;
        else n.mail += r.items;
      }
      return n;
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
      for (const m of [st.since, st.seen, st.action, st.missing, st.pending] as Record<string, unknown>[]) for (const k of Object.keys(m)) if (k.startsWith(`${connectionId}|`)) delete m[k];
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
