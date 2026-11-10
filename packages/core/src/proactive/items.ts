// What a look brings back, as one shape (D165, design/connectors.md §10 stage 0). A look reads
// headers and a short snippet; the snippet goes to triage in memory and is never written down.
import type { ConnectionSource } from "@ducter/protocol";

export type ItemKind = "mail" | "event" | "github" | "chat";

export interface Item {
  /** `${connectionId}|${service}|${account}|${id}`: unique across sources. */
  key: string;
  connectionId: string;
  source: ConnectionSource;
  service: string;
  app: string; // its title: "Gmail"
  account?: string;
  id: string;
  thread?: string;
  kind: ItemKind;
  at: number; // ms
  from?: string; // an address or a handle, lower case
  fromName?: string;
  to?: string[];
  subject?: string;
  /** At most 2 KB, for triage only; never stored. */
  snippet?: string;
  /** The person sent it (their own address, or a SENT label). */
  out?: boolean;
  /** Mailing-list or no-reply mail (List-Unsubscribe, a noreply sender, a bulk category). */
  bulk?: boolean;
  promo?: boolean;
  unread?: boolean;
  // events
  title?: string;
  start?: number;
  end?: number;
  attendees?: string[];
  location?: string;
  cancelled?: boolean;
  // GitHub and chat
  reason?: string; // review_requested, mention, assign, ci_activity …
  mention?: boolean;
  dm?: boolean;
  url?: string;
  repo?: string;
}

export const SNIPPET_MAX = 2048;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

/** The first array of records in a result (`threads`, `messages`, `items`, `events`, …, or the result itself). */
export function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  for (const k of ["threads", "messages", "emails", "items", "events", "notifications", "results", "data", "value"]) {
    if (Array.isArray(o[k])) return rowsOf(o[k]);
    if (o[k] && typeof o[k] === "object" && k === "data") return rowsOf(o[k]);
  }
  const first = Object.values(o).find((v) => Array.isArray(v));
  return first ? rowsOf(first) : [];
}

/** "Lina Wu <lina@x.org>" | {email, name} | "lina@x.org" → address (lower case) and name. */
export function party(v: unknown): { addr?: string; name?: string } {
  if (!v) return {};
  if (Array.isArray(v)) return party(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const addr = str(o.email) ?? str(o.address) ?? str(o.emailAddress) ?? str(o.login) ?? str(o.username);
    const name = str(o.name) ?? str(o.displayName) ?? str(o.global_name);
    return { ...(addr ? { addr: addr.toLowerCase() } : {}), ...(name ? { name } : {}) };
  }
  const s = String(v);
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { addr: m[2]!.trim().toLowerCase(), ...(m[1]!.trim() ? { name: m[1]!.trim() } : {}) };
  return s.includes("@") ? { addr: s.trim().toLowerCase() } : { name: s.trim() };
}

const timeOf = (v: unknown): number | undefined => {
  if (v == null) return;
  if (typeof v === "number") return v > 1e12 ? v : v > 1e9 ? v * 1000 : undefined;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return timeOf(o.dateTime ?? o.date ?? o.time);
  }
  const s = String(v);
  if (/^\d{12,}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
};

const labelsOf = (o: Record<string, unknown>): string[] => {
  const l = o.labelIds ?? o.labels ?? o.label_ids;
  return Array.isArray(l) ? l.map((x) => String(typeof x === "object" && x ? ((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).id) : x).toUpperCase()) : [];
};

const header = (o: Record<string, unknown>, name: string): string | undefined => {
  const hs = o.headers ?? (o.payload as Record<string, unknown> | undefined)?.headers;
  if (Array.isArray(hs)) {
    const h = hs.find((x) => String((x as Record<string, unknown>)?.name ?? "").toLowerCase() === name.toLowerCase()) as Record<string, unknown> | undefined;
    return str(h?.value);
  }
  if (hs && typeof hs === "object") return str((hs as Record<string, unknown>)[name] ?? (hs as Record<string, unknown>)[name.toLowerCase()]);
  return;
};

const NOREPLY = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|mailer-daemon|bounce|news(letter)?|marketing|updates?)@/i;

export interface Target {
  connectionId: string;
  source: ConnectionSource;
  service: string;
  title: string;
  account?: string;
  /** The person's own addresses and handles (to tell what they sent). */
  me: string[];
}

const keyOf = (t: Target, id: string) => `${t.connectionId}|${t.service}|${t.account ?? ""}|${id}`;

/** One mail (a thread's latest message, or a message). */
export function mailItem(t: Target, o: Record<string, unknown>): Item | undefined {
  const last = Array.isArray(o.messages) && o.messages.length ? (o.messages.at(-1) as Record<string, unknown>) : o;
  const id = str(last.id) ?? str(last.messageId) ?? str(o.id) ?? str(o.threadId);
  if (!id) return;
  const from = party(last.from ?? header(last, "From") ?? last.sender);
  const to = ([] as unknown[]).concat(last.to ?? header(last, "To") ?? []).flatMap((x) => (typeof x === "string" ? x.split(",") : [x])).map((x) => party(x).addr).filter((x): x is string => Boolean(x));
  const labels = labelsOf(last).concat(labelsOf(o));
  const me = t.me.map((m) => m.toLowerCase());
  const out = labels.includes("SENT") || (from.addr ? me.includes(from.addr) : false);
  const subject = str(last.subject) ?? str(o.subject) ?? header(last, "Subject");
  const snippet = str(last.snippet) ?? str(o.snippet) ?? str(last.preview) ?? str(last.bodyPreview) ?? str(last.body) ?? str(last.text);
  const bulk =
    Boolean(header(last, "List-Unsubscribe") ?? last.listUnsubscribe ?? last.list_unsubscribe) ||
    (from.addr ? NOREPLY.test(from.addr) : false) ||
    labels.some((l) => l === "CATEGORY_PROMOTIONS" || l === "CATEGORY_UPDATES" || l === "CATEGORY_SOCIAL" || l === "CATEGORY_FORUMS");
  return {
    key: keyOf(t, id),
    connectionId: t.connectionId,
    source: t.source,
    service: t.service,
    app: t.title,
    ...(t.account ? { account: t.account } : {}),
    id,
    ...(str(o.threadId) ?? str(last.threadId) ? { thread: str(o.threadId) ?? str(last.threadId) } : {}),
    kind: "mail",
    at: timeOf(last.internalDate ?? last.date ?? last.receivedAt ?? last.receivedDateTime ?? header(last, "Date") ?? o.date) ?? 0,
    ...(from.addr ? { from: from.addr } : {}),
    ...(from.name ? { fromName: from.name } : {}),
    ...(to.length ? { to } : {}),
    ...(subject ? { subject: clip(subject, 300) } : {}),
    ...(snippet ? { snippet: clip(snippet, SNIPPET_MAX) } : {}),
    ...(out ? { out } : {}),
    ...(bulk ? { bulk } : {}),
    ...(labels.includes("CATEGORY_PROMOTIONS") ? { promo: true } : {}),
    ...(labels.includes("UNREAD") || last.isRead === false || last.unread === true ? { unread: true } : {}),
  };
}

export function eventItem(t: Target, o: Record<string, unknown>): Item | undefined {
  const id = str(o.id) ?? str(o.iCalUID) ?? str(o.uid);
  const start = timeOf(o.start ?? o.startTime ?? o.start_time);
  if (!id || start === undefined) return;
  const attendees = (Array.isArray(o.attendees) ? o.attendees : [])
    .filter((a) => !(a as Record<string, unknown>)?.self)
    .map((a) => party(a).addr)
    .filter((x): x is string => Boolean(x));
  return {
    key: keyOf(t, id),
    connectionId: t.connectionId,
    source: t.source,
    service: t.service,
    app: t.title,
    ...(t.account ? { account: t.account } : {}),
    id,
    kind: "event",
    at: timeOf(o.updated ?? o.created) ?? start,
    title: clip(str(o.summary) ?? str(o.title) ?? str(o.subject) ?? "", 200),
    start,
    ...(timeOf(o.end ?? o.endTime ?? o.end_time) !== undefined ? { end: timeOf(o.end ?? o.endTime ?? o.end_time) } : {}),
    ...(attendees.length ? { attendees } : {}),
    ...(str(o.location) ? { location: clip(str(o.location)!, 200) } : {}),
    ...(o.status === "cancelled" ? { cancelled: true } : {}),
  };
}

export function githubItem(t: Target, o: Record<string, unknown>): Item | undefined {
  const id = str(o.id);
  if (!id) return;
  const subj = (o.subject ?? {}) as Record<string, unknown>;
  const repo = str((o.repository as Record<string, unknown> | undefined)?.full_name) ?? str(o.repo);
  const title = str(subj.title) ?? str(o.title);
  return {
    key: keyOf(t, id),
    connectionId: t.connectionId,
    source: t.source,
    service: t.service,
    app: t.title,
    ...(t.account ? { account: t.account } : {}),
    id,
    ...(str(subj.url) ?? str(o.url) ? { thread: str(subj.url) ?? str(o.url) } : {}),
    kind: "github",
    at: timeOf(o.updated_at ?? o.updatedAt ?? o.created_at) ?? 0,
    ...(title ? { subject: clip(title, 300) } : {}),
    ...(str(o.reason) ? { reason: str(o.reason) } : {}),
    ...(repo ? { repo } : {}),
    ...(str(subj.url) ?? str(o.html_url) ? { url: str(o.html_url) ?? str(subj.url) } : {}),
    ...(o.unread === true ? { unread: true } : {}),
    ...(str((o.actor as Record<string, unknown> | undefined)?.login) ? { from: str((o.actor as Record<string, unknown>).login)!.toLowerCase() } : {}),
  };
}

export function chatItem(t: Target, o: Record<string, unknown>): Item | undefined {
  const id = str(o.id) ?? str(o.ts);
  if (!id) return;
  const author = party(o.author ?? o.user ?? o.from);
  const text = str(o.content) ?? str(o.text) ?? str(o.message);
  const me = t.me.map((m) => m.toLowerCase());
  const mentions = Array.isArray(o.mentions) ? o.mentions.map((m) => party(m).addr ?? party(m).name?.toLowerCase()) : [];
  const mention = o.mentioned === true || o.mention === true || mentions.some((m) => m && me.includes(m)) || (text ? me.some((m) => text.toLowerCase().includes(`@${m}`)) : false);
  const dm = o.dm === true || o.is_im === true || o.channel_type === "im" || o.guild_id === null;
  return {
    key: keyOf(t, id),
    connectionId: t.connectionId,
    source: t.source,
    service: t.service,
    app: t.title,
    ...(t.account ? { account: t.account } : {}),
    id,
    ...(str(o.channel_id) ?? str(o.channel) ? { thread: str(o.thread_ts) ?? str(o.channel_id) ?? str(o.channel) } : {}),
    kind: "chat",
    at: timeOf(o.timestamp ?? o.ts ?? o.created_at ?? o.date) ?? 0,
    ...(author.addr ?? author.name ? { from: (author.addr ?? author.name)!.toLowerCase() } : {}),
    ...(author.name ? { fromName: author.name } : {}),
    ...(text ? { snippet: clip(text, SNIPPET_MAX), subject: clip(text.split("\n")[0]!, 120) } : {}),
    ...(mention ? { mention } : {}),
    ...(dm ? { dm } : {}),
    ...(author.addr && me.includes(author.addr) ? { out: true } : {}),
  };
}

export function itemsOf(t: Target, kind: ItemKind, data: unknown): Item[] {
  const make = kind === "mail" ? mailItem : kind === "event" ? eventItem : kind === "github" ? githubItem : chatItem;
  const out: Item[] = [];
  for (const row of rowsOf(data)) {
    try {
      const it = make(t, row);
      if (it) out.push(it);
    } catch {
      /* a row in a shape we don't know: skipped */
    }
  }
  return out;
}
