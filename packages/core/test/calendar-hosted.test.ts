// D222 over OOMOL Hosted (the real broker, the v2 catalog, /v1/apps with one address as both a
// Gmail and a Google Calendar app): every calendar read and the staged change go to that account's
// calendar app, never its Gmail one (hel, 2026-11-12: "app service does not match requested service").
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Bodies } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { createCalendar, type Calendar } from "../src/calendar.ts";
import { ooSource, openConnections } from "../src/connections.ts";
import { twoAccounts, WORK } from "./fake-calendar.ts";
import { fakeHostedCalendar } from "./fake-hosted-calendar.ts";
import { tempDir } from "./helpers.ts";

const TOKEN = "oct_hosted_secret_1";
const ZONE = "Asia/Tokyo";
const NOW = Date.parse("2026-11-18T08:00:00+09:00");
const noOo = ooSource({ env: {}, dir: "/nonexistent-oo", which: () => null });

let t: ReturnType<typeof tempDir>;
let h: ReturnType<typeof fakeHostedCalendar>;
let cal: Calendar;
let log: ReturnType<typeof openLog>;
beforeEach(async () => {
  t = tempDir();
  h = fakeHostedCalendar(twoAccounts(), TOKEN);
  log = openLog({ path: `${t.dir}/ducter.db`, persona: "default" });
  const c = openConnections({ dataDir: t.dir, log, oo: noOo });
  expect(await c.add({ url: h.server.url, token: TOKEN })).toMatchObject({ ok: true });
  cal = createCalendar({ dataDir: t.dir, connections: c, zone: () => ZONE, now: () => NOW, log });
});
afterEach(() => {
  cal.stop();
  h.server.stop();
  t.cleanup();
});

const execs = () => h.server.executed.filter((e) => e.name.endsWith("execute_action")).map((e) => e.args as { actionId: string; appId?: string });
const calls = () => log.read({ kinds: ["connection_call"], limit: 1000 }).map((e) => e.body as Bodies["connection_call"]);

test("the day reads each account's calendar app, not its Gmail app", async () => {
  expect(cal.accounts()).toHaveLength(2);
  const g = await cal.glance("2026-11-18", "2026-11-18");
  expect(g.errors).toBeUndefined();
  expect(g.days[0]!.events.map((e) => e.title)).toEqual(["看牙", "HawDB 周会", "Design sync", "Board call", "家里吃饭", "Gym"]);
  const cx = execs().filter((e) => e.actionId.startsWith("googlecalendar."));
  expect(cx.length).toBeGreaterThan(0);
  expect(new Set(cx.map((e) => e.appId))).toEqual(new Set(["app_gc_home", "app_gc_work"]));
  expect(calls().some((b) => b.state === "failed")).toBe(false);
});

test("a staged change runs on Go against the calendar app of the account it names", async () => {
  const r = await cal.propose({ change: "create", title: "Lunch with Ana", start: "2026-11-19T12:30", minutes: 60, account: WORK }, "d_lunch");
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_lunch", question: r.question.en, goLabel: r.goLabel.en, defaultOption: "hold", reversible: false, cal: r.cal } });
  expect(h.writes).toHaveLength(0);
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_lunch", option: "go", by: "user" } });
  for (let i = 0; i < 100 && !calls().some((b) => b.decisionId === "d_lunch" && b.state === "done"); i++) await Bun.sleep(10);
  expect(h.writes).toEqual([expect.objectContaining({ action: "create_event", appId: "app_gc_work" })]);
  expect(calls().find((b) => b.decisionId === "d_lunch" && b.state === "done")?.link).toContain("google.com/calendar");
});
