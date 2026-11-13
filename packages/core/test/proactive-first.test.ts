// D165 step 8: the first account (§11). The partner speaks in the conversation, asks once. D250:
// no answer = 每天最多 3 件 (connecting is consent to read), and the quiet look back waits half an
// hour for the offer's answer. Yes: a 3-day look answered within a minute, then the one cadence
// question; meanwhile, silently, 60 days into the ledger.
import { afterEach, expect, test } from "bun:test";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
afterEach(() => rigs.splice(0).forEach((r) => r.stop()));
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};

/** How many days back each mail look reached. */
const reach = (r: Rig) => [...new Set(r.acc.calls.filter((c) => c.action === "gmail.fetch_emails" && /after:/.test(String(c.input.query))).map((c) => Math.round((r.clock.now() - Number(/after:(\d+)/.exec(String(c.input.query))![1]) * 1000) / 86_400_000)))];

test("the first add: one offer; D250: watching on the default, the quiet look back waits for the answer, then goes on its own", async () => {
  const r = make({ start: Date.parse("2026-11-10T09:00:00+08:00") });
  r.p.added("conn_oo");
  r.p.added("conn_oo"); // once
  const offer = r.lastNote()!;
  expect(r.notes()).toHaveLength(1);
  expect(offer).toMatchObject({ rung: "first", ask: "first_look", finds: [], opening: "已经能看你的 Gmail、日历、GitHub、Discord 了。要不要我现在看一眼最近两周，挑出要你管的？" });
  expect(r.settings.get()).toMatchObject({ proactive: "three", proactiveBy: "default" });
  expect(r.p.look("conn_oo")!.watching).toBe(true);
  await r.advance(25 * 60_000);
  // Watching reads only what is new; nothing looked back while the offer waits.
  expect(reach(r).filter((d) => d >= 1)).toEqual([]);
  await r.advance(15 * 60_000);
  // Silence: the quiet look back went (60 days, the last 3 in full).
  expect(reach(r)).toContain(60);
  // Only what can't wait was said (a person who asked again today, D232), as on any day at the default.
  expect(r.notes().slice(1).map((e) => e.body.rung)).toEqual(["now"]);
  expect(r.sent.map((m) => m.level)).toEqual(["time-sensitive"]); // that "now" only: the offer is in the conversation, never a notification
});

test("好，看一眼: 3 days in full and two weeks that may hold a fact, what needs the person (D232), then the cadence question; 60 days fill the ledger silently", async () => {
  const r = make({ start: Date.parse("2026-11-10T09:00:00+08:00") });
  r.p.added("conn_oo");
  const offer = r.lastNote()!;
  const t0 = Date.now();
  await r.p.answer(offer.noteId, "first_look", true);
  await r.settle();
  expect(Date.now() - t0).toBeLessThan(60_000);
  const ns = r.notes().map((e) => e.body);
  expect(ns[1]).toMatchObject({ revises: offer.noteId, answered: "yes" });
  const answer = ns[2]!;
  expect(answer.rung).toBe("first");
  expect(answer.ask).toBe("cadence");
  // D232: not only who is waiting: anything that needs the person, at most 3, most costly first.
  expect(answer.opening).toBe("有 3 件要你管："); // D173: what matters, never "I read N emails"
  expect(answer.finds.map((f) => f.kind)).toEqual(["mismatch", "waiting_on_you", "waiting_on_them"]);
  expect(answer.finds[1]!.text).toContain("Lina");
  // The first look read the last 3 days in full, then two weeks of facty subjects; then the quiet
  // 60-day look back.
  expect(reach(r)).toEqual([3, 14, 60]);
  const types = r.p.ledger.all().map((f) => f.type);
  expect(types).toContain("renewal");
  expect(types).toContain("booking");
  expect(r.notes()).toHaveLength(3); // the backfill said nothing
  // D250: watching is on at the default already; the default is not an answer.
  const before = r.acc.calls.length;
  await r.advance(30 * 60_000);
  expect(r.acc.calls.every((c) => c.who === "watch")).toBe(true);
  expect(r.acc.calls.length).toBeGreaterThan(before);
  expect(r.notes()).toHaveLength(3);
  r.settings.set({ proactive: "three" });
  await r.settle();
  expect(r.lastNote()).toMatchObject({ revises: answer.noteId, answered: "three" });
  expect(r.settings.get().proactiveBy).toBe("chosen");
});

test("先不用: still the one question; D250: no answer leaves it at 每天最多 3 件", async () => {
  const r = make({ start: Date.parse("2026-11-10T09:00:00+08:00"), language: "en" });
  r.p.added("conn_oo");
  expect(r.lastNote()!.opening).toBe("I can read your Gmail, calendar, GitHub and Discord now. Want me to look through the last two weeks for anything that needs you?");
  await r.p.answer(r.lastNote()!.noteId, "first_look", false);
  expect(r.lastNote()).toMatchObject({ rung: "first", ask: "cadence", opening: "OK, not now.", finds: [] });
  expect(reach(r)).toEqual([]); // no look back yet
  expect(r.settings.get()).toMatchObject({ proactive: "three", proactiveBy: "default" });
  expect(r.lastNote()!.answered).toBeUndefined();
});

test("a second source, after the person already said how: no second offer", async () => {
  const r = make({ mode: "three" });
  r.p.added("conn_oo");
  expect(r.notes()).toHaveLength(0);
});
