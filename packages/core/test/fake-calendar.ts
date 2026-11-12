// D222: two Google Calendar accounts as oo answers them (shapes read live, research/65), with
// made-up events. A fake broker: reads answer from the fixtures; a write is only ever staged and
// run on Go (runApproved), and every call is recorded so a test can show nothing else ran.
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { AppTarget, ConnectionsStore } from "../src/connections.ts";
import { ooOp } from "../src/oo-link.ts";

export const WORK = "wey@nowledge-labs.ai";
export const HOME = "weyl.gu@gmail.com";

export interface FakeCal {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
  selected?: boolean;
  backgroundColor?: string;
  timeZone?: string;
}

export interface CalFixture {
  calendars: Record<string, FakeCal[]>; // by account
  events: Record<string, Record<string, unknown>[]>; // by `${account}|${calendarId}` ("primary" for the main)
}

export function fakeCalendarStore(fx: CalFixture, o: { accounts?: string[] } = {}) {
  const accounts = o.accounts ?? [HOME, WORK];
  const calls: { action: string; input: Record<string, unknown>; account?: string; who: string }[] = [];
  const staged = new Map<string, { action: string; input: Record<string, unknown>; account?: string }>();
  const ran: string[] = [];
  const log: LogEvent[] = [];
  const subs = new Set<(e: LogEvent) => void>();
  const append = (e: { stream: string; origin: string; kind: string; body: unknown }) => {
    const ev = { seq: log.length + 1, ts: new Date().toISOString(), ...e } as unknown as LogEvent;
    log.push(ev);
    for (const f of subs) f(ev);
    return ev;
  };
  const apps = (): AppTarget[] => accounts.map((acc, i) => ({ connectionId: "conn_oo", source: "oo", service: "googlecalendar", title: "Google Calendar", account: accounts.length === 1 && i === 0 ? undefined : acc.replace(/[@.]/g, "-"), label: acc, watch: true, excluded: false }));
  const labelOf = (account?: string) => (account ? accounts.find((a) => a.replace(/[@.]/g, "-") === account) : accounts[0]);
  let writeFails = false;
  let readsFail = false;
  const store = {
    view: () => [{ id: "conn_oo", name: "oo", url: "oo:", source: "oo", addedAt: "2026-11-01T00:00:00Z", via: "oo", state: "ok" }],
    apps: (id: string) => (id === "conn_oo" ? apps() : []),
    async read(who: { role: string }, _c: string, action: string, input: Record<string, unknown>, account?: string) {
      calls.push({ action, input, account, who: who.role });
      if (ooOp(action) === "write") return { ok: false, error: "a write outside the Go path", op: "write" };
      if (readsFail) return { ok: false, error: '{"errorCode":"invalid_input","message":"app service does not match requested service"}', op: "read" };
      const acc = labelOf(account)!;
      if (action === "googlecalendar.list_calendars") return { ok: true, op: "read", result: { items: fx.calendars[acc] ?? [] } };
      if (action === "googlecalendar.list_events") {
        const cid = String(input.calendarId ?? "primary");
        const lo = Date.parse(String(input.timeMin));
        const hi = Date.parse(String(input.timeMax));
        const items = (fx.events[`${acc}|${cid}`] ?? []).filter((e) => {
          const s = e.start as { dateTime?: string; date?: string };
          const t = Date.parse(s.dateTime ?? `${s.date}T00:00:00Z`);
          return t < hi && t >= lo - 86_400_000;
        });
        return { ok: true, op: "read", result: { kind: "calendar#events", items } };
      }
      return { ok: false, error: `unknown action ${action}` };
    },
    stage(_c: string, action: string, input: Record<string, unknown>, decisionId: string, account?: string) {
      staged.set(decisionId, { action, input, account });
      append({ stream: "channel", origin: "partner", kind: "connection_call", body: { callId: `cc_${decisionId}`, connectionId: "conn_oo", connection: "oo", action, op: "write", state: "needs_go", decisionId, input: { input, account } } });
      return { ok: true, callId: `cc_${decisionId}` };
    },
    async runApproved(decisionId: string) {
      ran.push(decisionId);
      const s = staged.get(decisionId);
      const state = writeFails ? "failed" : "done";
      append({ stream: "channel", origin: "partner", kind: "connection_call", body: { callId: `cc_${decisionId}`, connectionId: "conn_oo", connection: "oo", action: s?.action ?? "", op: "write", state, decisionId, ...(writeFails ? { error: "oo: HTTP 403" } : { link: "https://www.google.com/calendar/event?eid=x" }) } });
      return writeFails ? { ok: false, error: "oo: HTTP 403" } : { ok: true, op: "write", result: {} };
    },
  } as unknown as ConnectionsStore;
  const logStore = {
    append,
    read: (q: { kinds?: string[] }) => log.filter((e) => !q.kinds || q.kinds.includes(e.kind)),
    subscribe: (f: (e: LogEvent) => void) => (subs.add(f), () => subs.delete(f)),
    head: () => log.length,
  };
  return {
    store,
    log: logStore,
    calls,
    staged,
    ran,
    events: log,
    failWrites: () => (writeFails = true),
    failReads: () => (readsFail = true),
    resolve: (decisionId: string, option: Bodies["decision_resolved"]["option"]) => append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId, option, by: "user" } }),
  };
}

const ev = (id: string, summary: string, start: string, end: string, more: Record<string, unknown> = {}) => ({ id, iCalUID: `${id}@google.com`, status: "confirmed", summary, htmlLink: `https://www.google.com/calendar/event?eid=${id}`, start: { dateTime: start, timeZone: "Asia/Tokyo" }, end: { dateTime: end, timeZone: "Asia/Tokyo" }, ...more });
const me = (email: string, status = "accepted") => ({ email, self: true, responseStatus: status });

/** Wednesday 2026-11-18 in Tokyo, with both accounts, a holiday, a clash across accounts and an invitation. */
export function twoAccounts(): CalFixture {
  return {
    calendars: {
      [HOME]: [
        { id: HOME, summary: HOME, primary: true, accessRole: "owner", selected: true, backgroundColor: "#9fe1e7", timeZone: "Asia/Hong_Kong" },
        { id: "ja.japanese#holiday@group.v.calendar.google.com", summary: "Holidays in Japan", accessRole: "reader", selected: true, backgroundColor: "#16a765" },
        { id: "family123@group.calendar.google.com", summary: "Family", accessRole: "owner", selected: true, backgroundColor: "#f691b2" },
        { id: "old456@group.calendar.google.com", summary: "Old project", accessRole: "owner", backgroundColor: "#cccccc" },
      ],
      [WORK]: [{ id: WORK, summary: WORK, primary: true, accessRole: "owner", selected: true, backgroundColor: "#4986e7", timeZone: "Asia/Tokyo" }],
    },
    events: {
      [`${HOME}|primary`]: [
        ev("dentist", "看牙", "2026-11-18T10:00:00+09:00", "2026-11-18T11:00:00+09:00", { location: "Shibuya Dental\n2F", organizer: { email: HOME, self: true }, creator: { email: HOME, self: true } }),
        // The same invitation sent to both addresses: one event.
        ev("board-h", "Board call", "2026-11-18T16:00:00+09:00", "2026-11-18T17:00:00+09:00", { iCalUID: "board@x", organizer: { email: "ceo@example.com" }, attendees: [me(HOME), { email: "ceo@example.com", displayName: "Ana Ruiz", organizer: true, responseStatus: "accepted" }] }),
        ev("gym", "Gym", "2026-11-18T19:00:00+09:00", "2026-11-18T20:00:00+09:00", { transparency: "transparent", organizer: { email: HOME, self: true } }),
      ],
      [`${HOME}|ja.japanese#holiday@group.v.calendar.google.com`]: [{ id: "h1", status: "confirmed", summary: "Labor Thanksgiving Day", start: { date: "2026-11-23" }, end: { date: "2026-11-24" }, transparency: "transparent" }],
      [`${HOME}|family123@group.calendar.google.com`]: [ev("dinner", "家里吃饭", "2026-11-18T18:30:00+09:00", "2026-11-18T20:00:00+09:00", { organizer: { email: "family123@group.calendar.google.com", self: true } })],
      [`${HOME}|old456@group.calendar.google.com`]: [ev("old", "Old standup", "2026-11-18T09:00:00+09:00", "2026-11-18T09:15:00+09:00")],
      [`${WORK}|primary`]: [
        ev("weekly", "HawDB 周会", "2026-11-18T10:30:00+09:00", "2026-11-18T11:30:00+09:00", { organizer: { email: WORK, self: true }, attendees: [{ email: WORK, self: true, organizer: true, responseStatus: "accepted" }, { email: "lina@nowledge-labs.ai", displayName: "Lina Chen", responseStatus: "accepted" }, { email: "alice@example.com", responseStatus: "needsAction" }], hangoutLink: "https://meet.google.com/abc" }),
        ev("board-w", "Board call", "2026-11-18T16:00:00+09:00", "2026-11-18T17:00:00+09:00", { iCalUID: "board@x", organizer: { email: "ceo@example.com" }, attendees: [me(WORK), { email: "ceo@example.com", displayName: "Ana Ruiz", organizer: true, responseStatus: "accepted" }] }),
        ev("sync", "Design sync", "2026-11-18T14:00:00+09:00", "2026-11-18T14:30:00+09:00", { start: { dateTime: "2026-11-17T21:00:00-08:00", timeZone: "America/Los_Angeles" }, end: { dateTime: "2026-11-17T21:30:00-08:00", timeZone: "America/Los_Angeles" }, organizer: { email: "sam@partner.io", displayName: "Sam Lee" }, attendees: [me(WORK, "needsAction"), { email: "sam@partner.io", displayName: "Sam Lee", organizer: true, responseStatus: "accepted" }] }),
        ev("skip", "All hands", "2026-11-18T12:00:00+09:00", "2026-11-18T13:00:00+09:00", { organizer: { email: "hr@nowledge-labs.ai" }, attendees: [me(WORK, "declined")] }),
      ],
    },
  };
}
