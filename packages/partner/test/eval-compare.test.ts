// D487: an A/B over several eval runs says what flips within a side and what holds across them.
import { expect, test } from "bun:test";
import { compare, parseRun, signTest } from "../eval/compare.ts";

const run = (rows: Record<string, boolean>) =>
  parseRun(["| Scenario | Lang | Result | Reason |", "|---|---|---|---|", ...Object.entries(rows).map(([id, ok]) => `| ${id} | zh | ${ok ? "pass" : "**fail**"} | judge: … |`)].join("\n"));

test("rows parsed; steady wins and losses, flips within a side, the sign test", () => {
  expect([...run({ "greet-zh": true, "wp-x": false }).entries()]).toEqual([["greet-zh", true], ["wp-x", false]]);
  const a = { runs: [run({ w: false, l: true, f: true, s: true }), run({ w: false, l: true, f: false, s: true })] };
  const b = { runs: [run({ w: true, l: false, f: true, s: true }), run({ w: true, l: false, f: true, s: true })] };
  const c = compare(a, b);
  expect(c.totals).toEqual({ a: [3, 2], b: [3, 3] });
  expect(c.steadyWins).toEqual(["w"]);
  expect(c.steadyLosses).toEqual(["l"]);
  expect(c.flaky).toEqual({ a: ["f"], b: [] });
  expect(c.better.sort()).toEqual(["f", "w"]);
  expect(signTest(0, 0)).toBe(1);
  expect(signTest(5, 0)).toBeCloseTo(0.0625, 4);
  expect(signTest(35, 31)).toBeGreaterThan(0.5);
});
