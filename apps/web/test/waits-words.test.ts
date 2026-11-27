// D628: the waiting label is 等结果, not the standalone 在等. The header, the lane, a task's
// state, the face and a helper's hand-over state say the same thing; English stays short.
import { describe, expect, test } from "bun:test";
import { TABLES } from "../src/i18n.ts";

describe("the waiting words", () => {
  test("zh says 等结果 for every standalone waiting label this client draws", () => {
    expect(TABLES.zh["lane.waiting"]).toBe("等结果");
    expect(TABLES.zh["state.blocked"]).toBe("等结果");
    expect(TABLES.zh["header.waiting"]).toBe("%d 个等结果");
    expect(TABLES.zh["onhand.say.waiting"]).toBe("%d 个等结果");
    expect(TABLES.zh["face.waiting"]).toBe("%s 等结果");
    expect(TABLES.zh["ho.handed.waiting"]).toBe("等结果");
  });

  test("en stays short and says the same thing", () => {
    expect(TABLES.en["lane.waiting"]).toBe("Waiting");
    expect(TABLES.en["state.blocked"]).toBe("Waiting");
    expect(TABLES.en["header.waiting"]).toBe("%d waiting");
    expect(TABLES.en["face.waiting"]).toBe("%s is waiting");
    expect(TABLES.en["ho.handed.waiting"]).toBe("Waiting");
  });

  test("a settled hand-off reads as no longer needed, with the PR's own why", () => {
    expect(TABLES.zh["handoff.settled"]).toBe("用不着了：%s");
    expect(TABLES.zh["handoff.settled.merged"]).toBe("PR 已合并");
    expect(TABLES.zh["handoff.settled.closed"]).toBe("PR 已关闭");
    expect(TABLES.en["handoff.settled"]).toBe("No longer needed: %s");
  });
});
