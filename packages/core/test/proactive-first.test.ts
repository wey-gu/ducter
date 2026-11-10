// D165 step 8: the first account (§11). The partner speaks in the conversation, asks once; no
// answer = nothing watches. Yes: a 3-day look answered within a minute, then the one cadence
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

test("the first add: one offer, nothing read or watched until the person says yes", async () => {
  const r = make({ start: Date.parse("2026-11-10T09:00:00+08:00") });
  r.p.added("conn_oo");
  r.p.added("conn_oo"); // once
  const offer = r.lastNote()!;
  expect(r.notes()).toHaveLength(1);
  expect(offer).toMatchObject({ rung: "first", ask: "first_look", finds: [], opening: "已经能看你的 Gmail、日历、GitHub、Discord 了。要不要我现在看一眼过去 3 天，有没有在等你回的？" });
  await r.advance(3 * 3_600_000);
  expect(r.acc.calls).toHaveLength(0); // connecting is not consent to watch
  expect(r.sent).toHaveLength(0); // the moment is in the conversation, never a notification
});

test("好，看一眼: a 3-day look, the person waiting on them, then the cadence question; 60 days fill the ledger silently", async () => {
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
  expect(answer.opening).toBe("有 1 件在等你回："); // D172: what matters, never "I read N emails"
  expect(answer.finds.map((f) => f.kind)).toEqual(["waiting_on_you"]);
  expect(answer.finds[0]!.text).toContain("Lina");
  // The 3-day look read only mail, GitHub and chat over 3 days; then the quiet 60-day look back.
  const looks = r.acc.calls.filter((c) => c.action === "gmail.search_threads").map((c) => Number(/after:(\d+)/.exec(String(c.input.query))![1]) * 1000);
  expect(Math.round((r.clock.now() - looks[0]!) / 86_400_000)).toBe(3);
  expect(Math.round((r.clock.now() - looks[1]!) / 86_400_000)).toBe(60);
  const types = r.p.ledger.all().map((f) => f.type);
  expect(types).toContain("renewal");
  expect(types).toContain("booking");
  expect(r.notes()).toHaveLength(3); // the backfill said nothing
  // Only the person's answer starts watching.
  await r.advance(30 * 60_000);
  expect(r.acc.calls.every((c) => c.who === "watch")).toBe(true);
  const before = r.acc.calls.length;
  await r.advance(30 * 60_000);
  expect(r.acc.calls.length).toBe(before);
  r.settings.set({ proactive: "three" });
  await r.settle();
  expect(r.lastNote()).toMatchObject({ revises: answer.noteId, answered: "three" });
  await r.advance(10 * 60_000);
  expect(r.acc.calls.length).toBeGreaterThan(before);
});

test("先不用: still the one question; no answer leaves it at 不用主动找我", async () => {
  const r = make({ start: Date.parse("2026-11-10T09:00:00+08:00"), language: "en" });
  r.p.added("conn_oo");
  expect(r.lastNote()!.opening).toBe("I can read your Gmail, calendar, GitHub and Discord now. Want me to look through the last 3 days for anything waiting on you?");
  await r.p.answer(r.lastNote()!.noteId, "first_look", false);
  expect(r.lastNote()).toMatchObject({ rung: "first", ask: "cadence", opening: "OK, not now.", finds: [] });
  expect(r.acc.calls).toHaveLength(0);
  expect(r.settings.get().proactive).toBeUndefined();
});

test("a second source, after the person already said how: no second offer", async () => {
  const r = make({ mode: "three" });
  r.p.added("conn_oo");
  expect(r.notes()).toHaveLength(0);
});
