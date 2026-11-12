// D221: an in-process oo (OoSource with its own OoCli) holding Gmail and two Google Calendar
// accounts, answering from the two-account fixture (fake-calendar.ts) moved to a chosen day.
// For the partner eval, the tool-budget test and the fingerprint: never the user's real oo.
import type { OoSource } from "../src/connections.ts";
import type { OoCli } from "../src/oo-link.ts";
import { twoAccounts, HOME, WORK, type CalFixture } from "./fake-calendar.ts";

const FIXTURE_DAY = "2026-11-18";
const DAY = 86_400_000;

/** The fixture with every date moved so that its Wednesday is `day` (YYYY-MM-DD). */
export function fixtureOn(day: string): CalFixture {
  const delta = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${FIXTURE_DAY}T00:00:00Z`)) / DAY);
  const json = JSON.stringify(twoAccounts()).replace(/\b(20\d\d-\d\d-\d\d)(?=[T"])/g, (d) => new Date(Date.parse(`${d}T00:00:00Z`) + delta * DAY).toISOString().slice(0, 10));
  return JSON.parse(json) as CalFixture;
}

const ACTIONS = ["list_calendars", "list_events", "get_event", "create_event", "patch_event", "delete_event", "free_busy_query"];

export function fakeOoCalendar(o: { day: string; calendar?: boolean }) {
  const fx = fixtureOn(o.day);
  const runs: { service: string; action: string; input: Record<string, unknown>; connection?: string }[] = [];
  const conn = (label: string) => label.replace(/[@.]/g, "-");
  const cli: OoCli = {
    async signedIn() {
      return true;
    },
    async services() {
      return [
        { service: "gmail", title: "Gmail", connections: [{ name: conn(HOME), label: HOME, default: true }] },
        ...(o.calendar === false
          ? []
          : [{ service: "googlecalendar", title: "Google Calendar", connections: [{ name: conn(HOME), label: HOME, default: true }, { name: conn(WORK), label: WORK, default: false }] }]),
      ];
    },
    async search(text) {
      const svc = /gmail|mail/i.test(text) ? "gmail" : "googlecalendar";
      return svc === "gmail" ? [{ service: "gmail", name: "search_threads", description: "Search Gmail threads." }] : ACTIONS.map((name) => ({ service: "googlecalendar", name, description: name.replace(/_/g, " ") }));
    },
    async schemas(ids) {
      return ids.map((id) => ({ service: id.split(".")[0]!, name: id.split(".")[1]!, inputSchema: { type: "object", properties: {} } }));
    },
    async run(service, action, input, connection) {
      runs.push({ service, action, input, ...(connection ? { connection } : {}) });
      const acc = connection === conn(WORK) ? WORK : HOME;
      if (service === "gmail") return { isError: false, data: { threads: [] } };
      if (action === "list_calendars") return { isError: false, data: { items: fx.calendars[acc] ?? [] } };
      if (action === "list_events") {
        const cid = String(input.calendarId ?? "primary");
        const lo = Date.parse(String(input.timeMin ?? "1970-01-01T00:00:00Z"));
        const hi = Date.parse(String(input.timeMax ?? "2100-01-01T00:00:00Z"));
        const items = (fx.events[`${acc}|${cid}`] ?? []).filter((e) => {
          const s = e.start as { dateTime?: string; date?: string };
          const t = Date.parse(s.dateTime ?? `${s.date}T00:00:00Z`);
          return t < hi && t >= lo - DAY;
        });
        return { isError: false, data: { kind: "calendar#events", items } };
      }
      if (action === "create_event" || action === "patch_event") return { isError: false, data: { id: "new1", status: "confirmed", htmlLink: "https://www.google.com/calendar/event?eid=bmV3MQ" } };
      if (action === "delete_event") return { isError: false, data: {} };
      return { isError: true, data: { error: { code: "oo", message: `The connector action metadata request returned HTTP 404.` } } };
    },
  };
  const source: OoSource = {
    cli,
    detect: () => ({ installed: true, account: true }),
    read: () => undefined,
  };
  return { source, runs };
}
