// D310: one meaning of Done today (fixtures/done-today.json, shared with the Go twin).
import { describe, expect, test } from "bun:test";
import cases from "../fixtures/done-today.json" with { type: "json" };
import { countDoneToday, isDoneToday } from "../src/done-today.ts";

describe("done today", () => {
  test("each case", () => {
    for (const c of cases.cases) expect({ c: c._, got: isDoneToday(c.attention, c.at || undefined, Date.parse(c.now), c.zone, "prOpen" in c ? !!c.prOpen : false) }).toEqual({ c: c._, got: c.want });
  });
  test("a count is the cases that count", () => {
    const now = Date.parse("2026-11-17T10:00:00Z");
    const same = cases.cases.filter((c) => c.now === "2026-11-17T10:00:00Z" && c.zone === "Asia/Shanghai");
    expect(countDoneToday(same.map((c) => ({ attention: c.attention, at: c.at, prOpen: "prOpen" in c ? !!c.prOpen : false })), now, "Asia/Shanghai")).toBe(same.filter((c) => c.want).length);
  });
});
