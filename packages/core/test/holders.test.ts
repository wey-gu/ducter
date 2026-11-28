// D661 (research/245 §3.3 rule 5): one holder per outside thing, keyed repo#n. #11230 appears
// once under the Keep item that holds it; the author is an attribute on that row. #11408 appears
// once under the task that opened it; the hand-off is an attribute.
import { describe, expect, test } from "bun:test";
import { holderIndexOf } from "../src/holdings.ts";
import { HEL_CARDS, JX, KEEPS, PR, TM } from "./fixtures/hel-board.ts";

describe("D661: one holder per repo#n", () => {
  const idx = holderIndexOf(HEL_CARDS, KEEPS);

  test("#11230 is held once, by the helper's Keep item", () => {
    const r = idx.byRef.get("nowledge-co/mem#11230");
    expect(r?.taskId).toBe("jxikmjm9");
    expect(idx.byTask.get("jxikmjm9")?.holder).toBe(true);
  });

  test("the author is an attribute on that row, not a row of its own", () => {
    const r = idx.byRef.get("nowledge-co/mem#11230");
    expect(r?.attrs.some((a) => a.role === "author" && a.taskId === TM.taskId)).toBe(true);
    expect(idx.byTask.get(TM.taskId)?.holder).toBe(false);
    expect(idx.byTask.get(TM.taskId)?.taskId).toBe("jxikmjm9");
    expect(r?.attrs.some((a) => a.taskId === JX.taskId)).toBe(false); // the holder is not its own attribute
  });

  test("#11408 is held by the task that opened it; the hand-off is an attribute", () => {
    const r = idx.byRef.get("nowledge-co/mem#11408");
    expect(r?.taskId).toBe("4rg2ebi7");
    expect(r?.attrs.some((a) => a.role === "handoff" && a.to?.includes("Babysitter"))).toBe(true);
  });

  test("the fixture's four cards make two PR rows, not five", () => {
    const rows = new Set([...idx.byTask.values()].filter((x) => x.holder).map((x) => x.taskId));
    expect(rows.has(JX.taskId)).toBe(true);
    expect(rows.has(PR.taskId)).toBe(true);
    expect(rows.size).toBe(2);
  });
});
