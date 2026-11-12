// D222 through OOMOL Hosted (connector.oomol.com/v1/mcp, no oo CLI): the two-account fixture
// (fake-calendar.ts) behind the v2 catalog, with /v1/apps listing each address twice, once as Gmail
// and once as Google Calendar, Gmail first (as OOMOL lists them). execute_action checks the picked
// app's service: a Gmail app id on a calendar action is refused with OOMOL's own words, "app service
// does not match requested service" (hel, 2026-11-12).
import { fakeOpenConnectorV2, type FakeAction } from "./fake-mcp.ts";
import { HOME, WORK, type CalFixture } from "./fake-calendar.ts";

const DAY = 86_400_000;

export const HOSTED_APPS = [
  { id: "app_gm_home", service: "gmail", accountLabel: HOME, connectionName: "gmail-home", authType: "oauth2", status: "active", isDefault: true },
  { id: "app_gm_work", service: "gmail", accountLabel: WORK, connectionName: "gmail-work", authType: "oauth2", status: "active", isDefault: false },
  { id: "app_gc_home", service: "googlecalendar", accountLabel: HOME, connectionName: "gcal-home", authType: "oauth2", status: "active", isDefault: true },
  { id: "app_gc_work", service: "googlecalendar", accountLabel: WORK, connectionName: "gcal-work", authType: "oauth2", status: "active", isDefault: false },
];

export function fakeHostedCalendar(fx: CalFixture, token: string) {
  const writes: { action: string; input: Record<string, unknown>; appId?: unknown }[] = [];
  const acc = (app?: Record<string, unknown>) => String(app?.accountLabel ?? HOME);
  const actions: FakeAction[] = [
    { id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [] }) },
    { id: "googlecalendar.list_calendars", operationType: "read", run: (_i, app) => ({ items: fx.calendars[acc(app)] ?? [] }) },
    {
      id: "googlecalendar.list_events",
      operationType: "read",
      run: (input, app) => {
        const cid = String(input.calendarId ?? "primary");
        const lo = Date.parse(String(input.timeMin ?? "1970-01-01T00:00:00Z"));
        const hi = Date.parse(String(input.timeMax ?? "2100-01-01T00:00:00Z"));
        const items = (fx.events[`${acc(app)}|${cid}`] ?? []).filter((e) => {
          const s = e.start as { dateTime?: string; date?: string };
          const t = Date.parse(s.dateTime ?? `${s.date}T00:00:00Z`);
          return t < hi && t >= lo - DAY;
        });
        return { kind: "calendar#events", items };
      },
    },
    {
      id: "googlecalendar.create_event",
      operationType: "write",
      run: (input, app) => {
        writes.push({ action: "create_event", input, appId: app?.id });
        return { id: "new1", status: "confirmed", htmlLink: "https://www.google.com/calendar/event?eid=bmV3MQ" };
      },
    },
  ];
  const server = fakeOpenConnectorV2(actions, token, { apps: HOSTED_APPS });
  return { server, writes };
}
