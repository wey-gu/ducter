// D243 (research/81): service notices reach triage; the new detectors (快到了 / Coming up,
// 你用的服务 / A service you use, money changing, 之前说的有变 / An update to what I told you),
// each by code over the ledger, with words that fit the phone.
import { afterEach, expect, test } from "bun:test";
import { detect } from "../src/proactive/detect.ts";
import { itemsOf, type Target } from "../src/proactive/items.ts";
import { fitsBudget } from "../src/proactive/judge.ts";
import { openLedger, type NewFact } from "../src/proactive/ledger.ts";
import { NOTICE_DAY_MAX, noticeWorthy, stage1 } from "../src/proactive/stage1.ts";
import { eventFact, parseTriage } from "../src/proactive/triage.ts";
import { ME } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";
import { rig } from "./proactive-rig.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ZONE = "Asia/Shanghai";
const NOW = Date.parse("2026-11-13T09:00:00+08:00"); // Friday morning
const H = 3_600_000;
const dirs: (() => void)[] = [];
afterEach(() => dirs.splice(0).forEach((f) => f()));
const ledger = () => {
  const t = tempDir();
  dirs.push(t.cleanup);
  return openLedger(t.dir);
};
const ref = (id: string, service = "gmail") => ({ connectionId: "conn_oo", service, id });
const iso = (ms: number) => new Date(ms).toISOString();
const gmail: Target = { connectionId: "conn_oo", source: "oo", service: "gmail", title: "Gmail", account: ME, me: [ME] };
const mail = (id: string, from: string, subject: string, extra: Record<string, unknown> = {}) => ({ id, from, to: [ME], subject, snippet: "", date: "2026-11-13T08:00:00+08:00", ...extra });

test("stage 1: a service's notice that may need the person goes to triage; lists, marketing and receipts stay left out", () => {
  const items = itemsOf(gmail, "mail", {
    threads: [
      mail("ps", "PlanetScale <notifications@planetscale.example.com>", "Scheduled maintenance for 2 production databases", { labelIds: ["CATEGORY_UPDATES"] }),
      mail("cf", "Cloudflare <noreply@notify.cloudflare.example.com>", "Upcoming billing change for AI Search", { labelIds: ["CATEGORY_UPDATES"] }),
      mail("ana", "ANA <noreply@ana.example.jp>", "Your booking is confirmed: NH 920", { labelIds: ["CATEGORY_UPDATES"] }),
      mail("gh", "GitHub <notifications@github.example.com>", "Run failed: nightly-stats - main"),
      mail("news", "AI Weekly <newsletter@aiweekly.example.com>", "This week in AI", { headers: [{ name: "List-Unsubscribe", value: "<mailto:u@x>" }] }),
      mail("promo", "Shop <deals@shop.example.com>", "Flash sale: 50% off, limited time", { labelIds: ["CATEGORY_PROMOTIONS"] }),
      mail("rcpt", "Linear <no-reply@linear.example.app>", "Your receipt from Linear #2219", { labelIds: ["CATEGORY_UPDATES"] }),
    ],
  });
  const s = stage1(items);
  expect(s.pass.map((i) => i.id).sort()).toEqual(["ana", "cf", "gh", "ps"]);
  expect(s.notices).toBe(4);
  expect(s.left).toEqual({ notices: 2, promo: 1, muted: 0 });
  // A day's room: past it they are counted, never read.
  const capped = stage1(items, { noticeRoom: 1 });
  expect(capped.notices).toBe(1);
  expect(capped.left.notices).toBe(5);
  expect(NOTICE_DAY_MAX).toBeGreaterThanOrEqual(40);
  expect(noticeWorthy({ kind: "mail", subject: "系统维护通知：周六 13:00 停机" } as never)).toBe(true);
  expect(noticeWorthy({ kind: "mail", subject: "本周精选文章" } as never)).toBe(false);
});

test("triage: service and billing facts are read field by field; off-shape ones are dropped", () => {
  const out = parseTriage(
    JSON.stringify([
      { id: "a", person: false, needsAnswer: false, facts: [{ type: "service", what: "maintenance", name: "PlanetScale prod-db-1", start: "2026-11-14T13:00:00+08:00", prod: true, effect: "restarts may drop connections" }, { type: "service", what: "weird", name: "X" }, { type: "service", what: "outage" }] },
      { id: "b", person: false, needsAnswer: false, facts: [{ type: "billing", what: "starts_charging", name: "Cloudflare AI Search", on: "2026-11-15" }, { type: "billing", name: "no date" }] },
    ]),
    ["a", "b"],
  );
  expect(out[0]!.facts).toEqual([
    { type: "service", what: "maintenance", name: "PlanetScale prod-db-1", start: "2026-11-14T13:00:00+08:00", effect: "restarts may drop connections", prod: true },
    { type: "service", what: "other", name: "X" },
  ]);
  expect(out[1]!.facts).toEqual([{ type: "billing", what: "starts_charging", name: "Cloudflare AI Search", on: "2026-11-15" }]);
});

test("a flight in the calendar is a booking, never a meeting", () => {
  const cal: Target = { ...gmail, service: "googlecalendar", title: "Google Calendar" };
  const [ev] = itemsOf(cal, "event", { items: [{ id: "e1", summary: "Flight to Tokyo (NH 920)", start: { dateTime: "2026-11-14T19:40:00+08:00" }, end: { dateTime: "2026-11-14T22:30:00+08:00" }, location: "Shanghai Pudong T2" }] });
  expect(eventFact(ev!)).toMatchObject({ type: "booking", what: "flight", name: "NH 920", from: "Shanghai Pudong T2", place: "Tokyo" });
  const [meet] = itemsOf(cal, "event", { items: [{ id: "e2", summary: "Q4 2026 planning", start: { dateTime: "2026-11-14T10:00:00+08:00" }, end: { dateTime: "2026-11-14T11:00:00+08:00" } }] });
  expect(eventFact(meet!)?.type).toBe("meeting");
});

const flight = (id: string, service = "gmail"): NewFact => ({ ref: ref(id, service), label: service === "gmail" ? "ANA · Your booking is confirmed: NH 920" : "Flight to Tokyo (NH 920)", at: "2026-11-01T10:00:00+08:00", type: "booking", what: "flight", name: "NH 920", ...(service === "gmail" ? { from: "Shanghai Pudong T2", place: "Tokyo Haneda" } : { from: "Shanghai Pudong T2" }), start: "2026-11-14T19:40:00+08:00", end: "2026-11-14T23:30:00+09:00" });

test("快到了: a flight in the next day and a half: when, from where, when to be at the airport; the calendar and the mail are one find", () => {
  const l = ledger();
  l.add([flight("m_book"), flight("ev_flight", "googlecalendar")]);
  expect(detect(l, { now: Date.parse("2026-11-12T19:00:00+08:00"), zone: ZONE }).filter((c) => c.kind === "coming_up")).toHaveLength(0); // 48h out: not yet
  const [c, ...rest] = detect(l, { now: NOW, zone: ZONE }).filter((x) => x.kind === "coming_up");
  expect(rest).toHaveLength(0);
  expect(c!.words.zh).toBe("明天 19:40 NH 920 从 Shanghai Pudong T2 起飞，飞 Tokyo Haneda；17:40 前到机场。");
  expect(c!.words.en).toBe("NH 920 leaves Shanghai Pudong T2 at 19:40 tomorrow for Tokyo Haneda, landing 23:30. Be at the airport by 17:40.");
  expect(fitsBudget(c!.words.zh, true)).toBe(true);
  expect(c!.how).toHaveLength(2);
  expect(c!.urgent).toBe(false); // 34.7 h out
  expect(c!.sender).toBe("ANA");
  const later = detect(l, { now: Date.parse("2026-11-13T14:00:00+08:00"), zone: ZONE }).find((x) => x.kind === "coming_up")!;
  expect(later.urgent).toBe(true); // within 30 h: 只说急的 says it
  // A later change: 计划变了 says that one instead.
  l.add([{ ref: ref("m_chg"), label: "ANA · Schedule change NH 920", at: "2026-11-13T08:00:00+08:00", type: "change", what: "flight_changed", name: "NH 920", on: "2026-11-14T21:00:00+08:00" }]);
  expect(detect(l, { now: NOW, zone: ZONE }).filter((x) => x.kind === "coming_up")).toHaveLength(0);
});

test("你用的服务: production maintenance tomorrow, joined with the person's flight that day; a building's notice stays below the bar", () => {
  const l = ledger();
  l.add([
    flight("m_book"),
    ...[13, 15].map((h, i) => ({ ref: ref("m_ps"), label: "PlanetScale · Scheduled maintenance", at: iso(NOW - H), type: "service" as const, what: "maintenance" as const, name: `PlanetScale prod-db-${i + 1}`, start: `2026-11-14T${h}:00:00+08:00`, end: `2026-11-14T${h}:30:00+08:00`, effect: "restarts may drop connections", prod: true })),
    { ref: ref("m_ww"), label: "WeWork · Scheduled maintenance: carpet cleaning", at: iso(NOW - 30 * H), type: "service", what: "maintenance", name: "WeWork carpet cleaning", start: "2026-11-14T09:00:00+08:00", end: "2026-11-14T12:00:00+08:00" },
  ]);
  const svc = detect(l, { now: NOW, zone: ZONE }).filter((c) => c.kind === "service");
  const ps = svc.find((c) => c.sender === "PlanetScale")!;
  expect(ps.words.zh).toBe("明天 13:00、15:00 PlanetScale 2 个生产实例要维护，都在你 19:40 的航班之前。");
  expect(ps.words.en).toBe("PlanetScale has maintenance on 2 production instances tomorrow at 13:00 and 15:00 (restarts may drop connections), both before your 19:40 NH 920.");
  expect(ps.urgent).toBe(true);
  expect(ps.cost).toBeGreaterThanOrEqual(80);
  expect(ps.notes).toEqual(["effect: restarts may drop connections"]);
  expect(ps.step).toMatchObject({ kind: "read", goLabel: { zh: "看看要准备什么" } });
  const ww = svc.find((c) => c.sender === "WeWork")!;
  expect(ww.cost).toBeLessThan(50);
  expect(ww.words.zh).toBe("明天 09:00 WeWork 要维护。");
});

test("你用的服务: a job failing again and again is said; one CI failure is not; resolved is resolved", () => {
  const l = ledger();
  const fail = (id: string, h: number, name = "nightly-stats on main", prod = true): NewFact => ({ ref: ref(id), label: `GitHub · Run failed: ${name}`, at: iso(NOW - h * H), type: "service", what: "failing", name, ...(prod ? { prod: true } : {}) });
  l.add([fail("s1", 11), fail("s2", 10), fail("s3", 9), fail("ci", 3, "CI on feat/x", false)]);
  const f = detect(l, { now: NOW, zone: ZONE }).filter((c) => c.kind === "service");
  expect(f).toHaveLength(1);
  expect(f[0]!.words.zh).toBe("nightly-stats on main 从昨天 22:00 起失败了 3 次，最近一次 00:00。");
  expect(f[0]!.urgent).toBe(true);
  l.add([{ ref: ref("ok"), label: "GitHub · Run succeeded: nightly-stats - main", at: iso(NOW - H), type: "service", what: "resolved", name: "nightly-stats on main" }]);
  expect(detect(l, { now: NOW, zone: ZONE }).filter((c) => c.kind === "service")).toHaveLength(0);
});

test("你用的服务: a shutdown is said within six weeks; one called off is never said", () => {
  const l = ledger();
  l.add([{ ref: ref("c1"), label: "Conductor · Conductor is shutting down on December 1", at: "2026-11-10T18:00:00+08:00", type: "service", what: "shutdown", name: "Conductor", start: "2026-12-01" }]);
  const [s] = detect(l, { now: NOW, zone: ZONE }).filter((c) => c.kind === "service");
  expect(s!.words.zh).toBe("Conductor 说 12/1 停止服务。");
  expect(s!.step?.goLabel.zh).toBe("看看要怎么迁走");
  l.add([{ ref: ref("c2"), label: "Conductor · Update: Conductor is staying open", at: "2026-11-13T07:20:00+08:00", type: "service", what: "resolved", name: "Conductor shutdown", effect: "it is staying open" }]);
  expect(detect(l, { now: NOW, zone: ZONE }).filter((c) => c.kind === "service")).toHaveLength(0);
});

test("快到期 · 要花钱: money about to change, with the day it takes effect", () => {
  const l = ledger();
  l.add([
    { ref: ref("cf"), label: "Cloudflare · Upcoming billing change for AI Search", at: "2026-11-12T19:10:00+08:00", type: "billing", what: "starts_charging", name: "Cloudflare AI Search", on: "2026-11-15" },
    { ref: ref("pf"), label: "Fly · Payment failed", at: iso(NOW - 2 * H), type: "billing", what: "payment_failed", name: "Fly.io", on: "2026-11-13", amount: "$29" },
  ]);
  const d = detect(l, { now: NOW, zone: ZONE }).filter((c) => c.kind === "deadline");
  const cf = d.find((c) => c.sender === "Cloudflare")!;
  expect(cf.words.zh).toBe("Cloudflare AI Search 11/15 起开始收费。还要用的话，去控制台确认一下。");
  expect(cf.urgent).toBe(false);
  expect(cf.step).toMatchObject({ kind: "lookup", needs: { browse: true, signedIn: true } });
  expect(detect(l, { now: Date.parse("2026-11-14T08:00:00+08:00"), zone: ZONE }).find((c) => c.sender === "Cloudflare")!.urgent).toBe(true); // the day before
  const pf = d.find((c) => c.sender === "Fly")!;
  expect(pf.words.zh).toBe("Fly.io 的扣款没成功（$29）。");
  expect(pf.urgent).toBe(true);
  for (const c of d) expect(fitsBudget(c.words.zh, true)).toBe(true);
});

test("之前说的有变: a later notice on something already said is a correction, said at once", () => {
  const l = ledger();
  const [shut] = l.add([{ ref: ref("c1"), label: "Conductor · Conductor is shutting down on December 1", at: "2026-11-10T18:00:00+08:00", type: "service", what: "shutdown", name: "Conductor", start: "2026-12-01" }]);
  const said = [{ findId: "find_1", kind: "service" as const, topic: "Conductor", text: "Conductor 说 12/1 停止服务。", at: Date.parse("2026-11-11T08:00:00+08:00"), facts: [shut!.id] }];
  expect(detect(l, { now: NOW, zone: ZONE, said }).filter((c) => c.kind === "update")).toHaveLength(0);
  l.add([{ ref: ref("c2"), label: "Conductor · Update: Conductor is staying open", at: "2026-11-13T07:20:00+08:00", type: "service", what: "resolved", name: "Conductor shutdown", effect: "it is staying open" }]);
  const [u] = detect(l, { now: NOW, zone: ZONE, said }).filter((c) => c.kind === "update");
  expect(u!.words.zh).toBe("更正：之前说的「Conductor 说 12/1 停止服务」不算数了。");
  expect(u!.words.en).toBe('Correction: "Conductor 说 12/1 停止服务" no longer holds: it is staying open.');
  expect(u!.urgent).toBe(true);
  expect(u!.how.map((h) => h.what)).toEqual(["Conductor · Update: Conductor is staying open", "Conductor · Conductor is shutting down on December 1"]);
  // A find already passed is not corrected.
  expect(detect(l, { now: NOW, zone: ZONE, said: [{ ...said[0]!, passed: true }] }).filter((c) => c.kind === "update")).toHaveLength(0);
});

test("the person's zone: the app's hello says it, the home keeps it (a server home runs in UTC)", () => {
  const r = rig({ mode: "three" });
  try {
    expect(r.p.clientZone()).toBeUndefined();
    r.p.hello("Asia/Tokyo");
    expect(r.p.clientZone()).toBe("Asia/Tokyo");
    r.p.hello("Not/AZone");
    expect(r.p.clientZone()).toBe("Asia/Tokyo");
    expect(JSON.parse(readFileSync(join(r.dir, "proactive.json"), "utf8")).clientZone).toBe("Asia/Tokyo");
  } finally {
    r.stop();
  }
});
