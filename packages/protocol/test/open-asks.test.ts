// D618: one predicate for "a question still waits on the person", read by the needs-you count
// and every list. The Mac reads the same fixture in store/open_asks_test.go.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askOpen, settlesByDefault } from "../src/open-asks.ts";

interface Fixture {
  now: string;
  cases: { name: string; decision: Parameters<typeof askOpen>[0]; state?: Parameters<typeof askOpen>[1]; open: boolean }[];
}

const f = JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/open-asks.json"), "utf8")) as Fixture;
const now = Date.parse(f.now);

test("the shared open predicate: offers, put-off questions and due defaults are never needs-you", () => {
  for (const c of f.cases) expect({ name: c.name, open: askOpen(c.decision, { ...c.state, now }) }).toEqual({ name: c.name, open: c.open });
});

test("a Hold default settles at its time even when the card is not reversible; a Go default only when it is", () => {
  expect(settlesByDefault({ defaultOption: "hold", defaultAt: "2026-11-23T09:00:00.000Z", reversible: false })).toBe(true);
  expect(settlesByDefault({ defaultOption: "go", defaultAt: "2026-11-23T09:00:00.000Z", reversible: false })).toBe(false);
  expect(settlesByDefault({ defaultOption: "go", defaultAt: "2026-11-23T09:00:00.000Z", reversible: true })).toBe(true);
  expect(settlesByDefault({ defaultOption: "hold" })).toBe(false);
});
