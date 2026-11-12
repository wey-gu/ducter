// D232: on hel, the next two weeks of calendar were all-day, free events with a place (stays and
// trips; one Gmail made from a booking mail), dropped as "not a meeting": the ledger held nothing.
// An all-day event with a place is a booking; without a place (a birthday, a holiday) nothing.
// Shapes as Google Calendar answers through OOMOL (types only); the places are made up.
import { expect, test } from "bun:test";
import { itemsOf } from "../src/proactive/items.ts";
import { eventFact } from "../src/proactive/triage.ts";

const t = { connectionId: "c", source: "oo" as const, service: "googlecalendar", title: "Google Calendar", me: [] };
const ev = (o: Record<string, unknown>) => ({ kind: "calendar#event", id: String(o.summary), status: "confirmed", transparency: "transparent", eventType: "default", start: { date: "2026-11-20" }, end: { date: "2026-11-23" }, ...o });

test("an all-day event with a place is a stay or a trip; one without a place is nothing; a timed one is still a meeting", () => {
  const items = itemsOf(t, "event", { items: [ev({ summary: "Stay at Hotel Gracery Shinjuku", location: "Tokyo", eventType: "fromGmail" }), ev({ summary: "KubeCon", location: "Salt Lake City" }), ev({ summary: "Mia's birthday" }), { id: "m1", summary: "Standup", start: { dateTime: "2026-11-13T10:00:00+09:00" }, end: { dateTime: "2026-11-13T10:15:00+09:00" } }] });
  const facts = items.map(eventFact);
  expect(facts[0]).toMatchObject({ type: "booking", what: "hotel", name: "Stay at Hotel Gracery Shinjuku", place: "Tokyo", start: "2026-11-20T00:00:00.000Z", end: "2026-11-23T00:00:00.000Z" });
  expect(facts[1]).toMatchObject({ type: "booking", what: "other", place: "Salt Lake City" });
  expect(facts[2]).toBeUndefined();
  expect(facts[3]).toMatchObject({ type: "meeting", title: "Standup" });
});
