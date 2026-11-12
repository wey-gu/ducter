// D228: the look back on hel read nothing, on fakes shaped like OOMOL's real answers (research/68).
// Through OOMOL, gmail.search_threads gives a thread id and a snippet only: no sender, subject,
// date or labels. Every item it gave was dated 1970 and had no subject, so the 60-day look back's
// filter (a facty subject, or the last 3 days) kept none of them and marked itself done; and the
// watcher marked items seen even when triage failed on them, so they were never read again.
// Proved here: the watcher reads fetch_emails (dated, labelled, paged); an item whose reading
// failed waits (on disk, ids only) and is read when the model is back, even after a restart; a
// home whose look back ran before this runs it again once; a refused subject search falls back to
// the newest mail; and 只说急的 then says the flight change and the invoice.
// (The day's mail is made up: example.com / example.org.)
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { LOOK_BACK_REV, PROACTIVE_FILE } from "../src/proactive/engine.ts";
import { recordedTriage, type Triage } from "../src/proactive/triage.ts";
import { WATCH_FILE } from "../src/proactive/watch.ts";
import { ME, MORNING, type Fixture, type Triaged } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const MIN = 60_000;
const T = (s: string) => new Date(Date.parse(s)).toISOString();
const GMAIL = `conn_oo|gmail|${ME}`;

const rigs: Rig[] = [];
const dirs: { cleanup: () => void }[] = [];
let logs: string[] = [];
const keep = { log: console.log, warn: console.warn };
afterEach(() => {
  rigs.splice(0).forEach((r) => r.stop());
  dirs.splice(0).forEach((d) => d.cleanup());
  console.log = keep.log;
  console.warn = keep.warn;
  logs = [];
});
const capture = () => {
  console.log = (...a: unknown[]) => void logs.push(a.join(" "));
  console.warn = (...a: unknown[]) => void logs.push(a.join(" "));
};
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const scratch = () => {
  const t = tempDir();
  dirs.push(t);
  return t.dir;
};

/** A realistic inbox: mostly notices and promotions, a flight change, an invoice due tomorrow, a hotel booked a month ago, a person asking. */
function day(): Fixture {
  // 120 notices over the last three days: more than one read's 100, so a look has to page.
  const updates = Array.from({ length: 120 }, (_, i) => ({
    id: `m_u${i}`,
    threadId: `t_u${i}`,
    from: `Service ${i} <notifications@svc${i}.example.com>`,
    to: [ME],
    subject: `Your weekly summary #${i}`,
    snippet: "Here is what happened this week.",
    date: T(`2026-11-0${7 + (i % 3)}T${String(8 + (i % 12)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00+08:00`),
    labelIds: ["CATEGORY_UPDATES"],
  }));
  const promos = Array.from({ length: 30 }, (_, i) => ({
    id: `m_p${i}`,
    threadId: `t_p${i}`,
    from: `Shop ${i} <hello@shop${i}.example.com>`,
    to: [ME],
    subject: `${10 + i}% off this week`,
    snippet: "Don't miss out.",
    date: T(`2026-11-0${1 + (i % 9)}T12:00:00+08:00`),
    labelIds: ["CATEGORY_PROMOTIONS"],
  }));
  const triage: Record<string, Triaged> = {
    m_nh: { person: false, needsAnswer: false, facts: [{ type: "change", what: "flight_changed", name: "NH920", on: "2026-11-11T09:40:00+08:00" }] },
    m_inv: { person: false, needsAnswer: false, facts: [{ type: "renewal", name: "Vercel Pro", due: "2026-11-11", amount: "$20.00" }] },
    m_hotel: { person: false, needsAnswer: false, facts: [{ type: "booking", what: "hotel", name: "Hotel Gracery Shinjuku", place: "Tokyo", start: "2026-11-20", end: "2026-11-23" }] },
    m_lina: { person: true, needsAnswer: true, facts: [{ type: "ask", what: "review the deck" }] },
  };
  return {
    mail: [
      ...updates,
      ...promos,
      { id: "m_nh", threadId: "t_nh", from: "ANA <info@ana.example.co.jp>", to: [ME], subject: "Schedule change: NH920 on 11 Nov", snippet: "Your flight NH920 now departs at 09:40.", date: T("2026-11-09T21:00:00+08:00"), labelIds: ["CATEGORY_PERSONAL"] },
      { id: "m_inv", threadId: "t_inv", from: "Vercel <billing@vercel.example.com>", to: [ME], subject: "Invoice INV-2207 is due Nov 11", snippet: "Your invoice of $20.00 is due on November 11.", date: T("2026-11-09T18:00:00+08:00"), labelIds: ["CATEGORY_PERSONAL"] },
      { id: "m_hotel", threadId: "t_hotel", from: "Booking <stays@booking.example.com>", to: [ME], subject: "Your booking is confirmed: Hotel Gracery Shinjuku", snippet: "Check-in Friday, November 20.", date: T("2026-10-20T10:00:00+08:00"), labelIds: ["CATEGORY_PERSONAL"] },
      { id: "m_lina", threadId: "t_lina", from: "Lina Wu <lina@example.org>", to: [ME], subject: "The deck for Thursday", snippet: "Could you look at the deck before Thursday?", date: T("2026-11-09T16:00:00+08:00"), labelIds: ["CATEGORY_PERSONAL"] },
    ],
    events: [],
    github: [],
    chat: [],
    triage,
  };
}

const mailOnly = { apps: [{ service: "gmail", title: "Gmail", account: ME }] };
const notInstalled: Triage = async () => {
  throw new Error("harness codex is not installed");
};

test("hel on 0.0.33: the look back had read nothing and called itself done; it runs again, reads dated mail, and 只说急的 says the flight change and the invoice", async () => {
  capture();
  const dir = scratch();
  const fx = day();
  // What hel had (counts only): the look back done, 3 read, nothing noted; the watcher on
  // search_threads, with every thread id it ever got marked seen.
  writeFileSync(join(dir, PROACTIVE_FILE), JSON.stringify({ backfill: { conn_oo: "done" }, month: { key: "2026-11", tokens: { conn_oo: 9527 }, told: [] }, today: { day: "2026-11-10", read: 3, noted: 0, skipped: { notices: 0, promo: 0, muted: 0 } } }));
  writeFileSync(join(dir, WATCH_FILE), JSON.stringify({ since: { [GMAIL]: MORNING - 10 * MIN }, seen: { [GMAIL]: fx.mail.map((m) => m.threadId!) }, action: { [GMAIL]: "gmail.search_threads" }, reads: [] }));
  const r = make({ mode: "urgent", fx, dir, accounts: mailOnly });
  await r.settle();
  expect(logs).toContain("[proactive] look back again for 1 source(s): the last one could not read dates or subjects");
  const line = logs.find((l) => l.startsWith("[proactive] look back: "))!;
  expect(line).toMatch(/^\[proactive\] look back: read \d+, kept \d+, noted \d+$/);
  const [read, kept, noted] = line.match(/\d+/g)!.map(Number);
  expect(read).toBeGreaterThan(120); // every mail of the last 3 days (paged), and the facty subjects of 60
  expect(kept).toBeLessThan(read! / 2); // notices and promotions are left by rules, not read by a model
  expect(noted).toBeGreaterThanOrEqual(4);
  // Read with fetch_emails (the memo of search_threads doesn't hold it back).
  expect(r.acc.calls.some((c) => c.action === "gmail.fetch_emails")).toBe(true);
  expect(r.acc.calls.some((c) => c.action === "gmail.search_threads")).toBe(false);
  expect(r.p.ledger.of("booking").map((f) => f.name)).toEqual(["Hotel Gracery Shinjuku"]); // only the subject search finds a month-old mail
  expect(r.p.ledger.of("change").map((f) => f.name)).toEqual(["NH920"]);
  const st = JSON.parse(readFileSync(join(dir, PROACTIVE_FILE), "utf8"));
  expect(st.backfill.conn_oo).toBe("done");
  expect(st.lookBackRev).toBe(LOOK_BACK_REV);
  // Past 08:00: 只说急的 says the two urgent ones now (Lina asked yesterday: not yet waiting long).
  await r.advance(70 * MIN);
  const now = r.notes().map((n) => n.body as Bodies["finds"]).filter((b) => b.rung === "now");
  expect(now.flatMap((b) => b.finds.map((f) => f.kind)).sort()).toEqual(["deadline", "plan_changed"]);
  expect(r.p.day()).toMatchObject({ said: 2, read: expect.any(Number) });
  expect(r.p.day().read).toBeGreaterThanOrEqual(4);
  expect(r.acc.writes()).toHaveLength(0);
  // Once: a restart doesn't run it a third time.
  r.stop();
  rigs.splice(0);
  logs = [];
  const again = make({ mode: "urgent", fx, dir, accounts: mailOnly });
  await again.settle();
  expect(logs.some((l) => l.startsWith("[proactive] look back"))).toBe(false);
});

test("a mail whose reading failed is not seen: it waits on disk (its id only) and is read when the model is back, after a restart too", async () => {
  capture();
  const dir = scratch();
  const fx = day();
  const r = make({ mode: "urgent", fx, dir, accounts: mailOnly, triage: notInstalled });
  await r.settle();
  // The catch-up look back read nothing (triage failing): not marked done.
  expect(JSON.parse(readFileSync(join(dir, PROACTIVE_FILE), "utf8")).backfill.conn_oo).toBe("catchup");
  // A person writes; the next look can't read it closely.
  fx.mail.push({ id: "m_mia", threadId: "t_mia", from: "Mia Chen <mia@example.org>", to: [ME], subject: "Are you free Friday?", snippet: "Can we meet on Friday at 3?", date: new Date(r.clock.now() + 2 * MIN).toISOString(), labelIds: ["CATEGORY_PERSONAL"] });
  fx.triage.m_mia = { person: true, needsAnswer: true, facts: [{ type: "ask", what: "meet on Friday at 3" }] };
  await r.advance(12 * MIN);
  let w = JSON.parse(readFileSync(join(dir, WATCH_FILE), "utf8"));
  expect(w.seen[GMAIL] ?? []).not.toContain("m_mia");
  expect(w.pending[GMAIL].map((p: { id: string }) => p.id)).toEqual(["m_mia"]);
  expect(JSON.stringify(w.pending)).not.toContain("Friday"); // ids and dates only, never what it says
  expect(r.p.day().problem?.waiting).toBeGreaterThanOrEqual(1);
  // A restart, now with an agent that reads (the in-memory retry is gone; the disk is not).
  r.stop();
  rigs.splice(0);
  const tri = recordedTriage(fx.triage);
  const r2 = make({ mode: "urgent", fx, dir, accounts: mailOnly, triage: tri });
  await r2.settle();
  await r2.advance(11 * MIN);
  expect(tri.seen.filter((id) => id === "m_mia").length).toBeGreaterThanOrEqual(1);
  expect(r2.p.ledger.of("ask_in").map((f) => f.from)).toContain("mia@example.org");
  w = JSON.parse(readFileSync(join(dir, WATCH_FILE), "utf8"));
  expect(w.seen[GMAIL]).toContain("m_mia");
  expect(w.pending[GMAIL]).toBeUndefined();
  expect(JSON.parse(readFileSync(join(dir, PROACTIVE_FILE), "utf8")).backfill.conn_oo).toBe("done");
  expect(r2.p.day().problem).toBeUndefined();
});

test("the subject searches refused: the look back reads the newest mail instead, says so in the log, and still finds what matters", async () => {
  capture();
  const fx = day();
  const r = make({ mode: "urgent", fx, accounts: { ...mailOnly, refuse: (i) => (String(i.query ?? "").includes("subject:(") ? "Invalid query: too long" : undefined) } });
  await r.settle();
  expect(logs.some((l) => /^\[watch\] Gmail: \d+ of \d+ subject searches refused \(Invalid query: too long\); reading the newest mail instead$/.test(l))).toBe(true);
  expect(r.p.ledger.of("change").map((f) => f.name)).toEqual(["NH920"]);
  expect(r.p.ledger.of("booking").map((f) => f.name)).toEqual(["Hotel Gracery Shinjuku"]); // in the newest 500
  expect(logs.find((l) => l.startsWith("[proactive] look back: "))).toMatch(/noted [1-9]/);
});

test("a look reads fetch_emails: dated, with sender, subject and labels, paged past one read", async () => {
  const r = make({ mode: "urgent", fx: day(), accounts: mailOnly });
  const a = r.acc.store.apps("conn_oo")[0]!;
  const items = (await r.p.watchers.look(a, MORNING - 3 * 86_400_000))!;
  expect(items.length).toBeGreaterThan(120); // paged past one read's 100
  const nh = items.find((i) => i.id === "m_nh")!;
  expect(nh).toMatchObject({ from: "info@ana.example.co.jp", subject: "Schedule change: NH920 on 11 Nov", thread: "t_nh" });
  expect(nh.at).toBe(Date.parse("2026-11-09T21:00:00+08:00"));
  expect(items.find((i) => i.id === "m_p8")).toMatchObject({ promo: true, bulk: true });
});

test("a look back no source answered is not done: it runs again once the account answers", async () => {
  capture();
  const dir = scratch();
  const fx = day();
  const r = make({ mode: "urgent", fx, dir, accounts: { ...mailOnly, state: "unreachable" } });
  await r.settle();
  expect(logs).toContain("[proactive] look back: read 0, kept 0, noted 0 (no source answered)");
  expect(JSON.parse(readFileSync(join(dir, PROACTIVE_FILE), "utf8")).backfill.conn_oo).toBe("catchup");
  r.stop();
  rigs.splice(0);
  const r2 = make({ mode: "urgent", fx, dir, accounts: mailOnly });
  await r2.settle();
  expect(JSON.parse(readFileSync(join(dir, PROACTIVE_FILE), "utf8")).backfill.conn_oo).toBe("done");
  expect(r2.p.ledger.of("change").map((f) => f.name)).toEqual(["NH920"]);
});
