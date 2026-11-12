// D165 step 4: the seven kinds, by code over the ledger. Each with its evidence, one next step
// and words that fit the phone (zh ≤ ~60 characters, two sentences).
import { afterEach, expect, test } from "bun:test";
import { detect, meetingPrep, workingDaysSince } from "../src/proactive/detect.ts";
import { fitsBudget } from "../src/proactive/judge.ts";
import { openLedger, type NewFact } from "../src/proactive/ledger.ts";
import { busyWeek, MORNING, quietDay, ZONE } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";
import { fill } from "./proactive-fill.ts";

const dirs: (() => void)[] = [];
afterEach(() => dirs.splice(0).forEach((f) => f()));
const ledger = () => {
  const t = tempDir();
  dirs.push(t.cleanup);
  return openLedger(t.dir);
};
const ref = (id: string) => ({ connectionId: "conn_oo", service: "gmail", id, thread: `t_${id}` });

test("a busy week: the trip that doesn't join up, the renewal on an expired card, Lina waiting, the vendor silent", async () => {
  const l = ledger();
  await fill(l, busyWeek());
  const found = detect(l, { now: MORNING, zone: ZONE });
  const by = Object.fromEntries(found.map((c) => [c.kind, c]));
  expect(Object.keys(by).sort()).toEqual(["deadline", "mismatch", "waiting_on_them", "waiting_on_you"]);

  expect(by.mismatch!.words.zh).toBe("11/21 的 CA929 晚上 21:40 到成田，新宿的酒店却是 11/22 才入住，那晚还没地方住。");
  expect(by.mismatch!.how).toHaveLength(2);
  expect(by.mismatch!.step).toMatchObject({ kind: "lookup", needs: { browse: true }, goLabel: { zh: "看看能不能提前" } });
  expect(by.mismatch!.urgent).toBe(false); // 11 days out

  expect(by.deadline!.words.zh).toBe("ducter.dev 11/16 到期（$10.44）。自动续费那张卡已经过期了。");
  expect(by.deadline!.step!.brief).toContain("Never pay");

  // Lina asked by mail on Friday and again this morning, and on GitHub: one find, the PR read first.
  const lina = found.filter((c) => c.kind === "waiting_on_you");
  expect(lina).toHaveLength(1);
  expect(lina[0]!.words.zh).toContain("又问了一次");
  expect(lina[0]!.step).toMatchObject({ kind: "read", goLabel: { zh: "先帮我读一遍" } });

  expect(by.waiting_on_them!.words.zh).toBe("你 11/3 问 ops「invoice 1182 amount」，到现在没回。");
  for (const c of found) {
    expect(fitsBudget(c.words.zh, true)).toBe(true);
    expect(fitsBudget(c.words.en, false)).toBe(true);
    expect(c.how.length).toBeGreaterThan(0);
  }
  // The mail that tried to give orders produced nothing at all.
  expect(JSON.stringify(found)).not.toContain("unknown.example.net");
});

test("a quiet day finds nothing", async () => {
  const l = ledger();
  await fill(l, quietDay());
  expect(detect(l, { now: MORNING, zone: ZONE })).toEqual([]);
});

test("waiting on you: two working days, or asked again; answered is never said", () => {
  expect(workingDaysSince(Date.parse("2026-11-06T10:00:00+08:00"), MORNING, ZONE)).toBe(2); // Fri → Tue
  const l = ledger();
  const ask = (id: string, at: string, thread: string): NewFact => ({ ref: { ...ref(id), thread }, label: "Kai · q", at, type: "ask_in", from: "kai@example.org", name: "Kai", what: "the budget", person: true });
  l.add([ask("a", "2026-11-09T09:00:00+08:00", "t1")]);
  expect(detect(l, { now: MORNING, zone: ZONE, kinds: ["waiting_on_you"] })).toEqual([]); // 1 working day
  l.add([ask("b", "2026-11-05T09:00:00+08:00", "t2")]);
  expect(detect(l, { now: MORNING, zone: ZONE, kinds: ["waiting_on_you"] })).toHaveLength(1);
  l.add([{ ref: { ...ref("r"), thread: "t2" }, label: "me", at: "2026-11-09T12:00:00+08:00", type: "reply", out: true, with: "kai@example.org" }]);
  expect(detect(l, { now: MORNING, zone: ZONE, kinds: ["waiting_on_you"] })).toEqual([]);
});

test("something you promised is said on the due morning, unless you already wrote to them", () => {
  const l = ledger();
  l.add([{ ref: ref("p"), label: "Wey · Re: deck", at: "2026-11-05T18:00:00+08:00", type: "commitment", to: "bob@acme.example.com", what: "send the deck", by: "2026-11-10" }]);
  expect(detect(l, { now: MORNING - 86_400_000, zone: ZONE, kinds: ["promised"] })).toEqual([]); // not the due day
  const [p] = detect(l, { now: MORNING, zone: ZONE, kinds: ["promised"] });
  expect(p!.words.zh).toBe("你答应 bob 今天「send the deck」。");
  l.add([{ ref: ref("s"), label: "Wey · deck", at: "2026-11-10T06:30:00+08:00", type: "reply", out: true, with: "bob@acme.example.com" }]);
  expect(detect(l, { now: MORNING, zone: ZONE, kinds: ["promised"] })).toEqual([]);
});

test("a plan changed: now when it affects today or tomorrow, else the morning", () => {
  const l = ledger();
  l.add([
    { ref: ref("c1"), label: "Air China · Schedule change", at: "2026-11-10T05:00:00+08:00", type: "change", what: "flight_changed", name: "CA929", on: "2026-11-11T19:05:00+08:00" },
    { ref: ref("c2"), label: "Air China · Cancelled", at: "2026-11-10T05:00:00+08:00", type: "change", what: "flight_cancelled", name: "CA181", on: "2026-11-30" },
  ]);
  const cs = detect(l, { now: MORNING, zone: ZONE, kinds: ["plan_changed"] });
  expect(cs.find((c) => c.words.zh.startsWith("CA929"))).toMatchObject({ urgent: true, words: { zh: "CA929 改了：现在是 11/11 19:05。" } });
  expect(cs.find((c) => c.words.zh.startsWith("CA181"))).toMatchObject({ urgent: false, words: { zh: "CA181（11/30）取消了。" } });
});

test("money: the day before an unpaid renewal is urgent; a receipt after it settles it", () => {
  const l = ledger();
  l.add([{ ref: ref("r"), label: "Cloudflare · renews", at: "2026-10-17T09:00:00+08:00", type: "renewal", name: "ducter.dev", due: "2026-11-11", amount: "$10.44" }]);
  expect(detect(l, { now: MORNING, zone: ZONE, kinds: ["deadline"] })[0]).toMatchObject({ urgent: true });
  l.add([{ ref: ref("p"), label: "Cloudflare · receipt", at: "2026-11-09T09:00:00+08:00", type: "payment", name: "ducter.dev renewal", amount: "$10.44" }]);
  expect(detect(l, { now: MORNING, zone: ZONE, kinds: ["deadline"] })).toEqual([]);
});

test("a meeting while you're in the air is a mismatch", () => {
  const l = ledger();
  l.add([
    { ref: ref("f"), label: "Air China · CA929", at: "2026-11-02T20:00:00+08:00", type: "booking", what: "flight", name: "CA929", start: "2026-11-21T17:20:00+08:00", end: "2026-11-21T21:40:00+09:00" },
    { ref: { connectionId: "conn_oo", service: "googlecalendar", id: "e" }, label: "Board call", at: "2026-11-01T00:00:00Z", type: "meeting", title: "Board call", start: "2026-11-21T18:00:00+08:00", end: "2026-11-21T19:00:00+08:00", with: ["ceo@example.com"] },
  ]);
  const [m] = detect(l, { now: MORNING, zone: ZONE, kinds: ["mismatch"] });
  expect(m!.words.zh).toBe("11/21 18:00 的「Board call」那会儿你在 CA929 上。");
});

test("before a meeting: 10 minutes before, only with something open with them", async () => {
  const l = ledger();
  await fill(l, busyWeek());
  const at = Date.parse("2026-11-10T09:50:00+08:00");
  const [p] = meetingPrep(l, { now: at, zone: ZONE });
  expect(p!.kind).toBe("meeting");
  expect(p!.words.zh).toStartWith("10:00「Weekly sync with Lina」和 Lina：");
  // Lunch has no one with anything open: never said.
  expect(meetingPrep(l, { now: Date.parse("2026-11-10T11:50:00+08:00"), zone: ZONE })).toEqual([]);
  // Too early: nothing yet.
  expect(meetingPrep(l, { now: Date.parse("2026-11-10T09:30:00+08:00"), zone: ZONE })).toEqual([]);
});

// D222: two meetings at once, often in two accounts that can't see each other.
test("a clash today or tomorrow, across calendars, is a mismatch; one event in both calendars is not", () => {
  const l = ledger();
  const m = (id: string, account: string, title: string, start: string, end: string) => ({ ref: { connectionId: "conn_oo", service: "googlecalendar", account, id }, label: title, at: "2026-11-01T00:00:00Z", type: "meeting" as const, title, start, end, with: [] });
  l.add([
    m("a", "home", "看牙", "2026-11-11T10:00:00+08:00", "2026-11-11T11:00:00+08:00"),
    m("b", "work", "HawDB 周会", "2026-11-11T10:30:00+08:00", "2026-11-11T11:30:00+08:00"),
    // The same invitation in both accounts.
    m("c", "home", "Board call", "2026-11-11T16:00:00+08:00", "2026-11-11T17:00:00+08:00"),
    m("d", "work", "Board call", "2026-11-11T16:00:00+08:00", "2026-11-11T17:00:00+08:00"),
    // Next week: not yet.
    m("e", "home", "Lunch", "2026-11-18T12:00:00+08:00", "2026-11-18T13:00:00+08:00"),
    m("f", "work", "Review", "2026-11-18T12:30:00+08:00", "2026-11-18T13:00:00+08:00"),
  ]);
  const clashes = detect(l, { now: MORNING, zone: ZONE, kinds: ["mismatch"] }).filter((c) => c.key.startsWith("clash:"));
  expect(clashes).toHaveLength(1);
  expect(clashes[0]!.words.zh).toMatch(/^(今天|明天) 10:30「看牙」和「HawDB 周会」撞了。$/);
  expect(clashes[0]!.words.en).toContain("overlap");
});
