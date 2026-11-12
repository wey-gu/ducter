// D221: the person's calendars as one day, over two fake Google accounts (fake-calendar.ts).
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { createCalendar, isoIn, parseWhen, words, zonedMs, CALENDARS_FILE, type Calendar } from "../src/calendar.ts";
import { ooOp } from "../src/oo-link.ts";
import { fakeCalendarStore, twoAccounts, HOME, WORK } from "./fake-calendar.ts";

const ZONE = "Asia/Tokyo";
const NOW = Date.parse("2026-11-18T08:00:00+09:00");
let dir: string;
let f: ReturnType<typeof fakeCalendarStore>;
let cal: Calendar;
const make = (accounts?: string[]) => {
  f = fakeCalendarStore(twoAccounts(), accounts ? { accounts } : {});
  cal = createCalendar({ dataDir: dir, connections: f.store, zone: () => ZONE, now: () => NOW, log: f.log as never });
};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cal-"));
  make();
});
afterEach(() => {
  cal.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("time in a zone: a wall time and back, across zones", () => {
  const t = zonedMs("2026-11-18", "14:30", ZONE);
  expect(new Date(t).toISOString()).toBe("2026-11-18T05:30:00.000Z");
  expect(isoIn(t, ZONE)).toBe("2026-11-18T14:30:00+09:00");
  expect(isoIn(t, "America/Los_Angeles")).toBe("2026-11-17T21:30:00-08:00");
  // A local time the partner gives is read in the person's zone; one with an offset as written.
  expect(parseWhen("2026-11-18T14:30", ZONE)!.ms).toBe(t);
  expect(parseWhen("2026-11-18T05:30:00Z", ZONE)!.ms).toBe(t);
  expect(parseWhen("2026-11-18", ZONE)!.dateOnly).toBe(true);
});

test("one day across both accounts: merged, the shared invitation once, holidays as names, declined left out", async () => {
  const g = await cal.glance("2026-11-18", "2026-11-18");
  expect(g.accounts).toBe(2);
  const titles = g.days[0]!.events.map((e) => e.title);
  // Chronological, from both accounts and the Family calendar; the Old project calendar (not shown in Google) unread.
  expect(titles).toEqual(["看牙", "HawDB 周会", "Design sync", "Board call", "家里吃饭", "Gym"]);
  expect(titles).not.toContain("All hands"); // declined
  expect(titles).not.toContain("Old standup");
  expect(f.calls.some((c) => c.input.calendarId === "old456@group.calendar.google.com")).toBe(false);
  const weekly = g.days[0]!.events.find((e) => e.title === "HawDB 周会")!;
  expect(weekly).toMatchObject({ start: "2026-11-18T10:30:00+09:00", end: "2026-11-18T11:30:00+09:00", calendar: "", account: WORK, people: 2, with: ["Lina Chen", "alice"], mine: true, online: true, color: "#4986e7" });
  // The other side's zone, when the event was made there.
  expect(g.days[0]!.events.find((e) => e.title === "Design sync")).toMatchObject({ zone: "America/Los_Angeles", me: "needsAction", start: "2026-11-18T14:00:00+09:00" });
  // A place keeps its first line; never an address book's worth.
  expect(g.days[0]!.events.find((e) => e.title === "看牙")!.where).toBe("Shibuya Dental");
  expect(g.days[0]!.events.find((e) => e.title === "Gym")!.free).toBe(true);
  // 10:00 看牙 (personal) and 10:30 HawDB 周会 (work) overlap: the clash neither calendar can see.
  expect(g.clashes).toHaveLength(1);
  const [a, b] = g.clashes![0]!;
  expect([a, b].map((r) => g.days[0]!.events.find((e) => e.ref === r)!.title).sort()).toEqual(["HawDB 周会", "看牙"]);
  // Only reads ran.
  expect(f.calls.every((c) => ooOp(c.action) === "read")).toBe(true);
});

test("holidays and a week: day names on their day, no busy time", async () => {
  const g = await cal.glance("2026-11-18", "2026-11-24");
  expect(g.days).toHaveLength(7);
  expect(g.days.find((d) => d.date === "2026-11-23")!.marks).toEqual(["Labor Thanksgiving Day"]);
  expect(g.days.find((d) => d.date === "2026-11-23")!.events).toEqual([]);
});

test("which calendars it reads: Google's own choice first, the person's pick kept (0600)", async () => {
  await cal.refresh();
  const rows = cal.rows({ connectionId: "conn_oo", service: "googlecalendar", account: HOME.replace(/[@.]/g, "-") })!;
  expect(rows.map((r) => [r.kind, r.name, r.seen])).toEqual([
    ["main", "", true],
    ["holidays", "Holidays in Japan", true],
    ["own", "Family", true],
    ["own", "Old project", false],
  ]);
  expect(cal.pick("conn_oo", "googlecalendar", HOME, "family123@group.calendar.google.com", false)).toBe(true);
  const g = await cal.glance("2026-11-18", "2026-11-18");
  expect(g.days[0]!.events.map((e) => e.title)).not.toContain("家里吃饭");
  const p = join(dir, CALENDARS_FILE);
  expect(existsSync(p) && statSync(p).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(JSON.parse(readFileSync(p, "utf8")))).toContain("family123");
  expect(cal.pick("conn_oo", "googlecalendar", HOME, "nope", true)).toBe(false);
});

test("free time: weekdays 09–18, across both accounts, never over a meeting, from half an hour from now", async () => {
  const r = await cal.free({ minutes: 60, from: "2026-11-18", to: "2026-11-20" });
  expect(r.zone).toBe(ZONE);
  const day18 = r.slots.filter((s) => s.start.startsWith("2026-11-18"));
  // 09:00–10:00 is free; 10:00–11:30 busy (both accounts); next free hour 11:30; 14:00 sync; 16:00 board.
  // At most five options, spread over the days (each day's first, then each day's second).
  expect(r.slots).toHaveLength(5);
  expect(day18.map((s) => s.start.slice(11, 16))).toEqual(["09:00", "11:30"]);
  // An open day offers a morning, a midday and an afternoon, not three in a row.
  expect(r.slots.filter((s) => s.start.startsWith("2026-11-19")).map((s) => s.start.slice(11, 16))).toEqual(["09:00", "12:00"]);
  for (const s of r.slots) expect(Date.parse(s.end) - Date.parse(s.start)).toBe(3_600_000);
  // Gym is marked free, so the evening is not busy because of it (but it's outside 09–18 anyway).
  expect(r.slots.some((s) => s.start.startsWith("2026-11-21"))).toBe(false); // Saturday out of range
});

test("propose create: lands in the account the guests share, notifies them, says the clash, stages one write", async () => {
  await cal.glance("2026-11-18", "2026-11-18");
  const r = await cal.propose({ change: "create", title: "和 Lina 对一下 HawDB", start: "2026-11-18T11:00", minutes: 30, attendees: ["lina@nowledge-labs.ai"], theirZone: "America/Los_Angeles", theirName: "Lina" }, "d_1");
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.cal).toMatchObject({ kind: "create", account: WORK, calendar: "", start: "2026-11-18T11:00:00+09:00", end: "2026-11-18T11:30:00+09:00", notify: ["lina"], clash: "HawDB 周会", theirZone: "America/Los_Angeles", theirName: "Lina" });
  expect(r.goLabel).toEqual({ zh: "添加到日历", en: "Add to calendar" });
  const s = f.staged.get("d_1")!;
  expect(s.action).toBe("googlecalendar.create_event");
  expect(s.account).toBe(WORK.replace(/[@.]/g, "-"));
  expect(s.input).toMatchObject({ calendarId: "primary", sendUpdates: "all", event: { summary: "和 Lina 对一下 HawDB", start: { dateTime: "2026-11-18T11:00:00+09:00", timeZone: ZONE }, attendees: [{ email: "lina@nowledge-labs.ai" }] } });
  // Nothing ran: staged only.
  expect(f.ran).toEqual([]);
  // No guests: nobody is notified, and a personal event goes to the default account.
  const solo = await cal.propose({ change: "create", title: "取快递", start: "2026-11-19T12:00" }, "d_2");
  expect(solo.ok && solo.cal).toMatchObject({ notify: [], account: HOME });
  expect(f.staged.get("d_2")!.input.sendUpdates).toBe("none");
});

test("propose respond: the whole guest list goes back with only their answer changed; the organizer hears", async () => {
  const g = await cal.glance("2026-11-18", "2026-11-18");
  const sync = g.days[0]!.events.find((e) => e.title === "Design sync")!;
  const r = await cal.propose({ change: "respond", ref: sync.ref, response: "declined" }, "d_3");
  expect(r.ok && r.cal).toMatchObject({ kind: "respond", response: "declined", organizer: "Sam Lee", notify: ["Sam Lee"] });
  const s = f.staged.get("d_3")!;
  expect(s.action).toBe("googlecalendar.patch_event");
  const att = (s.input.event as { attendees: { email: string; responseStatus: string; self?: boolean }[] }).attendees;
  expect(att).toHaveLength(2);
  expect(att.find((x) => x.self)!.responseStatus).toBe("declined");
  expect(att.find((x) => !x.self)!.responseStatus).toBe("accepted");
  expect(r.ok && r.question.zh).toBe("拒绝「Design sync」的邀请？");
});

test("propose move: their own event moves (guests told); someone else's can't; cancel on another's is a decline", async () => {
  const g = await cal.glance("2026-11-18", "2026-11-18");
  const weekly = g.days[0]!.events.find((e) => e.title === "HawDB 周会")!;
  const mv = await cal.propose({ change: "move", ref: weekly.ref, start: "2026-11-18T15:00" }, "d_4");
  expect(mv.ok && mv.cal).toMatchObject({ kind: "move", start: "2026-11-18T15:00:00+09:00", end: "2026-11-18T16:00:00+09:00", was: { start: "2026-11-18T10:30:00+09:00" }, notify: ["Lina Chen", "alice"] });
  expect(f.staged.get("d_4")!.input).toMatchObject({ sendUpdates: "all", event: { start: { dateTime: "2026-11-18T15:00:00+09:00", timeZone: "Asia/Tokyo" } } });
  const board = g.days[0]!.events.find((e) => e.title === "Board call")!;
  const no = await cal.propose({ change: "move", ref: board.ref, start: "2026-11-18T17:00" }, "d_5");
  expect(no.ok).toBe(false);
  expect(!no.ok && no.error).toContain("Ana Ruiz");
  const cancel = await cal.propose({ change: "cancel", ref: board.ref }, "d_6");
  expect(cancel.ok && cancel.cal).toMatchObject({ kind: "respond", response: "declined" });
  const unknown = await cal.propose({ change: "cancel", ref: "c_nothere" }, "d_7");
  expect(unknown.ok).toBe(false);
});

test("Go runs it once by core and the partner isn't woken; Hold runs nothing; a reply wakes it", async () => {
  await cal.glance("2026-11-18", "2026-11-18");
  const r = await cal.propose({ change: "create", title: "Lunch", start: "2026-11-19T12:00" }, "d_go");
  expect(r.ok).toBe(true);
  f.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_go", question: "Add?", goLabel: "Add to calendar", defaultOption: "hold", reversible: false, cal: r.ok ? r.cal : undefined } satisfies Bodies["decision"] });
  const go = f.resolve("d_go", "go");
  expect(cal.wakes(go)).toBe(false);
  f.resolve("d_go", "go"); // a second tap
  await Bun.sleep(10);
  expect(f.ran).toEqual(["d_go"]);
  const done = f.events.filter((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).state === "done");
  expect((done[0]!.body as Bodies["connection_call"]).link).toContain("google.com/calendar");
  const r2 = await cal.propose({ change: "create", title: "Tea", start: "2026-11-19T15:00" }, "d_hold");
  expect(r2.ok).toBe(true);
  const hold = f.resolve("d_hold", "hold");
  expect(cal.wakes(hold)).toBe(false);
  await Bun.sleep(10);
  expect(f.ran).toEqual(["d_go"]);
  const reply = f.resolve("d_hold", "reply");
  expect(cal.wakes(reply)).toBe(true);
  // Not a calendar card: wakes as always.
  expect(cal.wakes(f.resolve("d_other", "go"))).toBe(true);
});

test("today's line for the greeting: only what is still ahead, from the last read", async () => {
  expect(cal.today()).toBeUndefined(); // nothing read yet: no line, no read on hello by itself
  await cal.glance("2026-11-18", "2026-11-18");
  expect(cal.today()).toEqual({ left: 6, next: { title: "看牙", start: "2026-11-18T10:00:00+09:00" }, clash: true });
});

test("one account: rows don't say whose", async () => {
  cal.stop();
  make([HOME]);
  const g = await cal.glance("2026-11-18", "2026-11-18");
  expect(g.accounts).toBe(1);
  expect(g.days[0]!.events.every((e) => !e.account)).toBe(true);
});

test("the card's words follow D212 (verbs; never 不X了)", () => {
  const base = { title: "周会", calendar: "", start: "2026-11-18T10:00:00+09:00", end: "2026-11-18T11:00:00+09:00", notify: [] };
  expect(words({ ...base, kind: "move" }).goLabel.zh).toBe("更改时间");
  expect(words({ ...base, kind: "cancel" }).goLabel.zh).toBe("取消日程");
  expect(words({ ...base, kind: "respond", response: "tentative" })).toEqual({ question: { zh: "对「周会」回复可能参加？", en: "Reply maybe to “周会”?" }, goLabel: { zh: "可能参加", en: "Maybe" } });
});

test("oo's freeBusy query is a read; the writes stay writes", () => {
  expect(ooOp("googlecalendar.free_busy_query")).toBe("read");
  expect(ooOp("googlecalendar.find_free_slots")).toBe("read");
  for (const a of ["create_event", "patch_event", "delete_event", "move_event", "quick_add_event", "add_attendee", "import_event"]) expect(ooOp(`googlecalendar.${a}`)).toBe("write");
});
