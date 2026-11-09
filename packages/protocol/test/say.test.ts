// D154: a task's words in front of a reader of another language. The Go port
// (apps/desktop/internal/say) passes the same cases (fixtures/say.json).
import { describe, expect, test } from "bun:test";
import cases from "../fixtures/say.json";
import { inTongue, proofLabel, sayable } from "../src/say.ts";

describe("say (D154)", () => {
  for (const c of cases.tongue)
    test(`in tongue: ${c.text || "(empty)"}`, () => {
      expect(inTongue(c.text, "zh")).toBe(c.zh);
      expect(inTongue(c.text, "en")).toBe(c.en);
    });
  for (const c of cases.proof)
    test(`proof label: ${c.label}`, () => {
      const ev = { kind: c.kind as "log", label: c.label, ref: c.ref };
      expect(proofLabel(ev, "zh")).toBe(c.zh);
      expect(proofLabel(ev, "en")).toBe(c.en);
    });
  test("sayable: the task's English sentence isn't, for a Chinese reader", () => {
    expect(sayable("Nowledge Mem is connected.", "zh")).toBeUndefined();
    expect(sayable("Mem 连上了", "zh")).toBe("Mem 连上了");
    expect(sayable("  ", "en")).toBeUndefined();
  });
});
