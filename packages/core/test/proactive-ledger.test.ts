// D165 step 2: the facts ledger. Typed facts with pointers; never a body or a snippet; 0600;
// each fact expires 30 days after its own date; removing an account drops its facts.
import { afterEach, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FINDINGS_FILE, openLedger, type NewFact } from "../src/proactive/ledger.ts";
import { tempDir } from "./helpers.ts";

const dirs: (() => void)[] = [];
afterEach(() => dirs.splice(0).forEach((f) => f()));
const scratch = () => {
  const t = tempDir();
  dirs.push(t.cleanup);
  return t.dir;
};

const ref = (id: string, connectionId = "conn_oo") => ({ connectionId, service: "gmail", account: "wey@example.com", id, thread: `t_${id}` });

test("keeps typed facts with pointers, never what the mail said", () => {
  const dir = scratch();
  const l = openLedger(dir);
  const leaky = {
    ref: ref("m_cf"),
    label: "Cloudflare · Your domain ducter.dev renews on November 16",
    at: "2026-10-17T09:12:00+08:00",
    type: "renewal",
    name: "ducter.dev",
    due: "2026-11-16",
    amount: "$10.44",
    cardExpired: true,
    // What a careless caller might pass along: never written.
    snippet: "The card ending 4242 expired in October",
    body: "full text of the mail",
  } as unknown as NewFact;
  const [f] = l.add([leaky]);
  expect(f).toMatchObject({ type: "renewal", name: "ducter.dev", due: "2026-11-16", amount: "$10.44", cardExpired: true, ref: { id: "m_cf", service: "gmail" } });
  const raw = readFileSync(join(dir, FINDINGS_FILE), "utf8");
  expect(raw).not.toContain("4242");
  expect(raw).not.toContain("full text");
  expect((statSync(join(dir, FINDINGS_FILE)).mode & 0o777).toString(8)).toBe("600");
  // A flight keeps where it lands in its own time ("21:40 local"), not converted.
  const [b] = l.add([{ ref: ref("m_ca"), label: "Air China · Itinerary", at: "2026-11-02T20:01:00+08:00", type: "booking", what: "flight", name: "CA929", start: "2026-11-21T17:20:00+08:00", end: "2026-11-21T21:40:00+09:00" }]);
  expect(b).toMatchObject({ end: "2026-11-21T21:40:00+09:00", date: "2026-11-21T21:40:00+09:00" });
});

test("the same thing said twice is one fact; a reminder in another mail is another", () => {
  const l = openLedger(scratch());
  const f: NewFact = { ref: ref("m1"), label: "x", at: "2026-11-01T00:00:00Z", type: "renewal", name: "a", due: "2026-11-20" };
  expect(l.add([f, f])).toHaveLength(1);
  expect(l.add([f])).toHaveLength(0);
  expect(l.add([{ ...f, ref: ref("m2") }])).toHaveLength(1);
  expect(l.size()).toBe(2);
});

test("a fact expires 30 days after its own date; it survives a restart until then", () => {
  const dir = scratch();
  const l = openLedger(dir);
  l.add([
    { ref: ref("old"), label: "x", at: "2026-09-01T00:00:00Z", type: "booking", what: "hotel", name: "old", start: "2026-09-10", end: "2026-09-12" },
    { ref: ref("new"), label: "y", at: "2026-11-01T00:00:00Z", type: "booking", what: "hotel", name: "new", start: "2026-11-22", end: "2026-11-25" },
  ]);
  expect(openLedger(dir).size()).toBe(2);
  expect(l.sweep(Date.parse("2026-10-11T00:00:00Z"))).toBe(0); // 29 days after 9/12
  expect(l.sweep(Date.parse("2026-10-13T00:00:00Z"))).toBe(1);
  expect(openLedger(dir).all().map((x) => (x as { name: string }).name)).toEqual(["new"]);
});

test("removing an account drops its facts, and only its", () => {
  const l = openLedger(scratch());
  l.add([
    { ref: ref("a", "conn_oo"), label: "a", at: "2026-11-01T00:00:00Z", type: "payment", name: "a" },
    { ref: ref("b", "conn_self"), label: "b", at: "2026-11-01T00:00:00Z", type: "payment", name: "b" },
  ]);
  expect(l.drop("conn_oo")).toBe(1);
  expect(l.all().map((f) => f.ref.connectionId)).toEqual(["conn_self"]);
});

test("a fact whose dates don't parse is dropped, never guessed", () => {
  const l = openLedger(scratch());
  expect(l.add([{ ref: ref("x"), label: "x", at: "2026-11-01T00:00:00Z", type: "renewal", name: "x", due: "next Friday" }])).toHaveLength(0);
  expect(l.add([{ ref: { connectionId: "", service: "gmail", id: "" }, label: "x", at: "2026-11-01T00:00:00Z", type: "payment", name: "x" }])).toHaveLength(0);
});
