// D453: two lanes. Interruptions stay rare (a "now" note, a time-sensitive notification); offers are
// generous and quiet: never needs-you, no Hold, ranked by what the person took up, one slot for a
// kind left quiet, at most two of a kind in what is shown in full, faded at the next morning. All on
// the fake clock and fakes (the rig): nothing here reads the wall clock.
import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFFER_SHOWN } from "@ducter/protocol";
import { SAME_KIND_SHOWN } from "../src/proactive/engine.ts";
import { tempDir } from "./helpers.ts";
import { MORNING } from "./fixtures/inbox.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
const dirs: { cleanup: () => void }[] = [];
afterEach(() => {
  rigs.splice(0).forEach((r) => r.stop());
  dirs.splice(0).forEach((d) => d.cleanup());
});
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const HOUR = 3_600_000;
const seeded = (state: object) => {
  const t = tempDir();
  dirs.push(t);
  writeFileSync(join(t.dir, "proactive.json"), JSON.stringify(state));
  return t.dir;
};

test("有用就说: more than three offers, every one an offer (no needs-you), the first ones of mixed kinds", async () => {
  const r = make({ mode: "useful" });
  await r.p.lookNow(40);
  // Four more people who asked twice: 在等你回 would fill the note on its own.
  for (let i = 0; i < 4; i++)
    r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: `ask${i}`, thread: `th${i}` }, label: `Question ${i}`, at: new Date(MORNING - 3 * 86_400_000).toISOString(), type: "ask_in", from: `friend${i}@example.org`, name: `Friend ${i}`, what: `can you look at draft ${i}`, again: true, person: true }]);
  await r.advance(HOUR + 2 * 60_000);
  const n = r.notes().map((e) => e.body).find((b) => b.rung === "morning" && !b.quiet)!;
  expect(n.finds.length).toBeGreaterThan(3);
  expect(n.finds.every((f) => f.offer)).toBe(true);
  const shown = n.finds.slice(0, OFFER_SHOWN);
  const byKind = new Map<string, number>();
  for (const f of shown) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  expect(Math.max(...byKind.values())).toBeLessThanOrEqual(SAME_KIND_SHOWN);
  // Every step is an offer's: the decision says so, so no client lists it as needing the person.
  const ds = r.log.read({ stream: "channel", kinds: ["decision"] }).map((e) => e.body as { offer?: boolean; findId?: string });
  expect(ds.length).toBeGreaterThan(0);
  expect(ds.every((d) => d.findId && d.offer === true)).toBe(true);
  // One quiet notification for the note; never one per offer.
  expect(r.sent.map((m) => m.level)).toEqual(["passive"]);
});

test("a kind left quiet for days gets one slot even when the kinds taken up fill the note", async () => {
  const lately = MORNING - HOUR;
  const dir = seeded({ offeredKinds: { mismatch: lately, deadline: lately, waiting_on_you: lately } });
  const r = make({ mode: "three", dir });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  const n = r.notes().map((e) => e.body).find((b) => b.rung === "morning" && !b.quiet)!;
  expect(n.finds).toHaveLength(3);
  expect(n.finds.map((f) => f.kind)).toContain("waiting_on_them");
});

test("an urgent kind the person kept holding comes as an offer, folded in quietly, never a time-sensitive push", async () => {
  // As three Holds on its "now" notes left it (BAR_UP each three, here past any cost).
  const dir = seeded({ bars: { plan_changed: 95 }, barsRev: 1 });
  const r = make({ mode: "useful", dir, present: true });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000); // the morning note
  const before = r.sent.length;
  r.p.ledger.add([{ ref: { connectionId: "conn_oo", service: "gmail", id: "chg" }, label: "Air China · Schedule change", at: new Date(r.clock.now()).toISOString(), type: "change", what: "flight_changed", name: "CA930", on: new Date(r.clock.now() + 6 * HOUR).toISOString() }]);
  await r.p.lookNow(0);
  const ns = r.notes().map((e) => e.body);
  expect(ns.some((b) => b.rung === "now")).toBe(false);
  const fold = ns.filter((b) => b.rung === "fold").at(-1);
  expect(fold?.finds.at(-1)).toMatchObject({ kind: "plan_changed", offer: true });
  expect(r.sent.length).toBe(before); // a fold-in never notifies
});

test("an offer taken up acts at once: Go starts its task, and that kind ranks higher the next morning", async () => {
  const r = make({ mode: "useful" });
  await r.p.lookNow(40);
  await r.advance(HOUR + 2 * 60_000);
  const n = r.lastNote()!;
  const pick = n.finds.find((f) => f.kind === "waiting_on_them" && f.decisionId) ?? n.finds.find((f) => f.decisionId)!;
  r.decisions.decide(pick.decisionId!, "go");
  await r.settle();
  expect(r.states().find((s) => s.findId === pick.findId)?.state).toBe("go");
  expect(r.opened.length).toBe(1);
  const st = JSON.parse(require("node:fs").readFileSync(join(r.dir, "proactive.json"), "utf8")) as { weights: { kind: Record<string, number> } };
  expect(st.weights.kind[pick.kind]).toBe(1.5);
});
