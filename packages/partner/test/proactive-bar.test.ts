// D165: the triage-bar eval set, run with recorded triage and code's bar (no model): no misses,
// no false alarms, the urgent ones flagged "now", and the cap counted.
import { expect, test } from "bun:test";
import { perKind, runScenario } from "../eval/proactive/bar.ts";
import { SCENARIOS } from "../eval/proactive/inboxes.ts";

for (const s of SCENARIOS)
  test(`bar: ${s.name}`, async () => {
    const r = await runScenario(s);
    expect(r.misses).toEqual([]);
    expect(r.falseAlarms).toEqual([]);
    expect(r.urgentMissed).toEqual([]);
  });

test("the cap of 3 bites on the busy week only; quiet days say nothing", async () => {
  const rs = await Promise.all(SCENARIOS.map((s) => runScenario(s)));
  expect(rs.filter((r) => r.overCap > 0).map((r) => r.name)).toEqual(["busy-week"]);
  expect(rs.find((r) => r.name === "quiet-day")!.said).toEqual([]);
  expect(rs.find((r) => r.name === "noise")!.said).toEqual([]);
  expect(perKind(rs).every((k) => k.falseAlarms === 0)).toBe(true);
});
