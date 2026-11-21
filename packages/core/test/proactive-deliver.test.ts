// D165 step 5: the morning note, same-day fold-ins, the urgent path and quiet hours.
import { afterEach, expect, test } from "bun:test";
import { fitsBudget } from "../src/proactive/judge.ts";
import { MORNING, quietDay } from "./fixtures/inbox.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const HOUR = 3_600_000;

test("每天最多 3 条 (chosen): the morning note at the end of quiet hours, at most 3, most costly first, offers, one silent notification", async () => {
  const r = make({ mode: "three" });
  await r.p.lookNow(40); // 07:00, in quiet hours: nothing is said yet
  expect(r.notes()).toHaveLength(0);
  expect(r.sent).toHaveLength(0);
  await r.advance(HOUR + 2 * 60_000); // past 08:00
  const notes = r.notes();
  expect(notes).toHaveLength(1);
  const n = notes[0]!.body;
  expect(n.rung).toBe("morning");
  expect(n.finds.map((f) => f.kind)).toEqual(["mismatch", "deadline", "waiting_on_you"]);
  // D173: a greeting, never what or how much was read.
  expect(n.opening).toBe("早。");
  // What was left out is the partner's to say when asked; no screen shows it.
  expect(n.leftOut).toBe("没说的：3 封通知和收据，看标题就知道；1 封像推销，没理它。");
  for (const f of n.finds) {
    expect(fitsBudget(f.text, "zh")).toBe(true);
    expect(f.how.length).toBeGreaterThan(0);
    expect(f.decisionId).toBeString(); // its one next step
    expect(f.offer).toBe(true); // D453: an offer, never an ask
  }
  // Each step is an offer's decision: never auto-runs, never needs-you, never pushes on its own.
  const ds = r.log.read({ stream: "channel", kinds: ["decision"] }).map((e) => e.body as { findId?: string; defaultOption: string; reversible: boolean; offer?: boolean });
  expect(ds).toHaveLength(3);
  expect(ds.every((d) => d.findId && d.offer && d.defaultOption === "hold" && !d.reversible)).toBe(true);
  expect(r.sent).toHaveLength(1);
  expect(r.sent[0]).toMatchObject({ title: "Ducter", level: "passive" });
  // The finds themselves, never an "N things" summary (D173).
  expect(r.sent[0]!.body).toStartWith("11/21 的 CA929");
  expect(r.sent[0]!.body).not.toMatch(/\d+ [件条个]/);
  // Nothing is said twice: the next look finds the same things, and says nothing.
  await r.p.lookNow(40);
  expect(r.notes()).toHaveLength(1);
});

test("a quiet day sends nothing and shows nothing: the note is only in the Log, for the partner (D173)", async () => {
  const r = make({ mode: "three", fx: quietDay() });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  const n = r.lastNote()!;
  expect(n).toMatchObject({ rung: "morning", quiet: true, finds: [] });
  expect(r.sent).toHaveLength(0);
});

test("only when I ask: nothing watches, nothing is said", async () => {
  const r = make({ mode: "off" });
  await r.advance(3 * HOUR);
  expect(r.acc.calls).toHaveLength(0);
  expect(r.notes()).toHaveLength(0);
});

test("D250, D453: never chosen is 有用就说; its first morning note carries the chips once, the next ones don't", async () => {
  const r = make({}); // proactive never chosen
  expect(r.settings.get()).toMatchObject({ proactive: "useful", proactiveBy: "default" });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000); // past 08:00
  const first = r.notes().map((e) => e.body).filter((n) => n.rung === "morning" && !n.quiet);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ opening: "早。", ask: "cadence" });
  expect(first[0]!.finds.length).toBeGreaterThan(0);
  expect(r.sent.map((m) => m.level)).toEqual(["passive"]);
  // The next morning, something new: a plain note.
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "r1" }, label: "Vendor · renews", at: new Date(r.clock.now()).toISOString(), type: "renewal", name: "plan", due: new Date(r.clock.now() + 4 * 86_400_000).toISOString().slice(0, 10), amount: "$9" }]);
  await r.advance(24 * HOUR, 5 * 60_000);
  const mornings = r.notes().map((e) => e.body).filter((n) => n.rung === "morning" && !n.quiet && !n.revises);
  expect(mornings).toHaveLength(2);
  expect(mornings[1]!.ask).toBeUndefined();
  // A chip settles the question in the first note.
  r.settings.set({ proactive: "three" });
  await r.settle();
  expect(r.settings.get().proactiveBy).toBe("chosen");
  expect(r.lastNote()).toMatchObject({ revises: first[0]!.noteId, answered: "three" });
}, 60_000);

test("只说急的: no morning note; only what costs something if it waits goes, at once (a person who asked again too)", async () => {
  const fx = (await import("./fixtures/inbox.ts")).busyWeek();
  fx.triage.m_cf = { person: false, needsAnswer: false, facts: [{ type: "renewal", name: "ducter.dev", due: "2026-11-11", amount: "$10.44", cardExpired: true }] };
  const r = make({ mode: "urgent", fx });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  const ns = r.notes().map((e) => e.body);
  expect(ns.every((n) => n.rung === "now")).toBe(true);
  // D232: urgent by what waiting costs: the card that expired before a renewal, and Lina, who
  // asked 4 days ago and again today (a person waiting is said in 只说急的 too).
  // D388: found in the same look, they are one message with one notification, each its own find.
  expect(ns.flatMap((n) => n.finds.map((f) => f.kind))).toEqual(["deadline", "waiting_on_you"]);
  expect(r.sent.map((m) => m.level).every((l) => l === "time-sensitive")).toBe(true);
  expect(r.sent.length).toBe(ns.length);
});

test("now: during the day at once (time-sensitive), in its own room of 3 (D243)", async () => {
  const r = make({ mode: "three" });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000); // the morning note used the 3
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "chg" }, label: "Air China · Schedule change", at: new Date(r.clock.now()).toISOString(), type: "change", what: "flight_changed", name: "CA930", on: "2026-11-11T08:00:00+08:00" }]);
  await r.p.lookNow(0);
  // D243: what can't wait isn't pushed to tomorrow because the morning note used the day's 3.
  expect(r.notes().map((n) => n.body.rung)).toEqual(["morning", "now"]);
  for (let i = 0; i < 3; i++) r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: `chg${i}` }, label: `Air China · Schedule change ${i}`, at: new Date(r.clock.now()).toISOString(), type: "change", what: "flight_changed", name: `CA93${i + 1}`, on: "2026-11-11T08:00:00+08:00" }]);
  await r.p.lookNow(0);
  // NOW_MAX holds (D388: the two said together are one message).
  const nows = r.notes().filter((n) => n.body.rung === "now");
  expect(nows.flatMap((n) => n.body.finds)).toHaveLength(3);
  expect(nows).toHaveLength(2);
});

test("now: an urgent find while there's room goes at once; at night it waits unless that kind may wake them", async () => {
  const r = make({ mode: "useful", start: Date.parse("2026-11-10T23:30:00+08:00") });
  const change = (id: string) =>
    r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id }, label: "Air China · Schedule change", at: new Date(r.clock.now()).toISOString(), type: "change", what: "flight_changed", name: id, on: "2026-11-11T08:00:00+08:00" }]);
  change("CA1");
  await r.p.lookNow(0);
  expect(r.notes()).toHaveLength(0); // quiet hours hold it
  r.rules.addNotice({ text: "航班改了，夜里也叫我", kind: "plan_changed", wake: true });
  change("CA2");
  await r.p.lookNow(0);
  const ns = r.notes().map((e) => e.body);
  // The person said this kind may wake them: both changes, held and new, in one message (D388).
  expect(ns.map((n) => n.rung)).toEqual(["now"]);
  expect(ns[0]!.finds.map((f) => f.kind)).toEqual(["plan_changed", "plan_changed"]);
  expect(r.sent.every((m) => m.level === "time-sensitive")).toBe(true);
});

test("fold-in: while the person is in the app, a find timely today joins today's note in place, never re-notified", async () => {
  const r = make({ mode: "useful" });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  const morning = r.lastNote()!;
  const pushes = r.sent.length;
  r.setPresent(true);
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "p1", thread: "t_p1" }, label: "Wey · Re: deck", at: "2026-11-06T18:00:00+08:00", type: "commitment", to: "bob@acme.example.com", what: "send the deck", by: "2026-11-10" }]);
  await r.p.lookNow(0);
  const fold = r.lastNote()!;
  expect(fold).toMatchObject({ rung: "fold", revises: morning.noteId });
  expect(fold.finds.at(-1)!.kind).toBe("promised");
  expect(fold.finds.length).toBe(morning.finds.length + 1);
  expect(r.sent.length).toBe(pushes);
});

test("opened before the end of quiet hours: the note is assembled then, once", async () => {
  const r = make({ mode: "three", start: Date.parse("2026-11-10T06:30:00+08:00") });
  await r.p.lookNow(40);
  // D388: the person looking (a read receipt), not a reconnect, assembles it early.
  r.p.hello(undefined, true);
  await r.settle();
  expect(r.notes().map((e) => e.body.rung)).toEqual(["morning"]);
  await r.advance(2 * HOUR);
  expect(r.notes()).toHaveLength(1);
  void MORNING;
});

test("one booking mailed to two accounts is one find, said once", async () => {
  // D226: a quiet inbox, so the catch-up look back adds nothing of its own.
  const r = make({ mode: "useful", fx: quietDay() });
  const renewal = (account: string, id: string) => ({ ref: { connectionId: "conn_oo", service: "gmail", account, id }, label: "Cloudflare · renews", at: "2026-11-09T09:00:00+08:00", type: "renewal" as const, name: "ducter.dev", due: "2026-11-14", amount: "$10.44" });
  r.p.ledger.add([renewal("work", "a1"), renewal("home", "b1")]);
  await r.advance(HOUR + 2 * 60_000);
  expect(r.lastNote()!.finds.filter((f) => f.kind === "deadline")).toHaveLength(1);
});

test("no model to judge with: the bar falls back to code; the note still goes", async () => {
  const r = make({ mode: "three", judge: async () => Promise.reject(new Error("no AI agent to ask yet")) });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  expect(r.lastNote()!.finds).toHaveLength(3);
});
