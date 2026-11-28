// research/244 rule 6: offers wait for a quiet moment. The person just writing, a card being open,
// or quiet hours are not that moment; the same question is asked by the to-do offers and by the
// update note, so both wait for the same gap.
import { expect, test } from "bun:test";
import type { LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { quietGap, SUBJECT_LIVE_MS, subjectLive } from "../src/quiet-gap.ts";

const NOW = Date.parse("2026-11-27T14:24:00Z");
const NIGHT = { start: "23:00", end: "08:00", tz: "UTC" };

function logWith(userAt?: number): LogStore {
  const events: LogEvent[] = userAt
    ? [{ seq: 1, ts: new Date(userAt).toISOString(), persona: "default", stream: "channel", origin: "user", kind: "user_msg", body: { text: "接着做" } } as LogEvent]
    : [];
  return {
    read: (o: { kinds?: string[] }) => (o.kinds?.includes("user_msg") ? events : []),
    head: () => events.length,
  } as unknown as LogStore;
}
const noCards = { openIds: () => [] };

test("nothing live and not night: a quiet gap", () => {
  expect(quietGap({ log: logWith(), decisions: noCards, now: NOW, quiet: NIGHT })).toBe(true);
});

test("the person wrote in the last few minutes: a subject is live, so no offer", () => {
  expect(subjectLive({ log: logWith(NOW - 60_000), decisions: noCards, now: NOW })).toBe(true);
  expect(quietGap({ log: logWith(NOW - 60_000), decisions: noCards, now: NOW, quiet: NIGHT })).toBe(false);
  // The same words a few minutes later: the subject is quiet again.
  expect(subjectLive({ log: logWith(NOW - SUBJECT_LIVE_MS - 1), decisions: noCards, now: NOW })).toBe(false);
});

test("a card is open: no offer lands on top of it", () => {
  const one = { openIds: () => ["d_1"] };
  expect(subjectLive({ log: logWith(), decisions: one, now: NOW })).toBe(true);
  expect(quietGap({ log: logWith(), decisions: one, now: NOW, quiet: NIGHT })).toBe(false);
});

test("an open offer is not a live subject: another offer may come at the next gap", () => {
  const offers = { openIds: () => ["d_offer"], get: (id: string) => (id === "d_offer" ? { offer: true } : undefined) };
  expect(subjectLive({ log: logWith(), decisions: offers, now: NOW })).toBe(false);
  const card = { openIds: () => ["d_ask"], get: () => ({ offer: false }) };
  expect(subjectLive({ log: logWith(), decisions: card, now: NOW })).toBe(true);
});

test("quiet hours hold it until morning, even with nothing live", () => {
  const night = { start: "23:00", end: "08:00", tz: "UTC" };
  const at = (h: number) => Date.parse(`2026-11-27T${String(h).padStart(2, "0")}:00:00Z`);
  expect(quietGap({ log: logWith(), decisions: noCards, now: at(23), quiet: night })).toBe(false);
  expect(quietGap({ log: logWith(), decisions: noCards, now: at(3), quiet: night })).toBe(false);
  expect(quietGap({ log: logWith(), decisions: noCards, now: at(9), quiet: night })).toBe(true);
});
