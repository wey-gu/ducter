// D222 (design/calendar.md §6): calendar times read from the ISO string's own wall clock, the
// person's words for days, the other side's zone, and who else is on an event.
import { describe, expect, test } from "bun:test";
import { dateRun, dayHead, hmOf, leafParts, offsetOf, otherZoneLine, peopleWords, placeTimeLine, theirSide, todayIn, whenWords } from "../src/cal-format.ts";

describe("calendar words", () => {
  test("the wall clock comes from the string, not this device's zone", () => {
    expect(hmOf("2026-11-19T15:00:00+09:00")).toBe("15:00");
    expect(offsetOf("2026-11-19T15:00:00+09:00")).toBe(540);
    expect(offsetOf("2026-11-19T15:00:00-08:00")).toBe(-480);
    expect(todayIn(undefined, Date.parse("2026-11-18T16:30:00Z"), 540)).toBe("2026-11-19");
    expect(todayIn("Asia/Tokyo", Date.parse("2026-11-18T16:30:00Z"))).toBe("2026-11-19");
  });

  test("a day's head and a change's time, zh and en", () => {
    expect(dayHead("zh", "2026-11-18", "2026-11-18")).toBe("今天 11月18日 周三");
    expect(dayHead("en", "2026-11-18", "2026-11-18")).toBe("Today, Wed, Nov 18");
    expect(dayHead("en", "2026-11-20", "2026-11-18")).toBe("Fri, Nov 20");
    expect(whenWords("zh", "2026-11-19T15:00:00+09:00", "2026-11-19T15:30:00+09:00", false, "2026-11-18", "全天")).toBe("明天 11月19日 周四 15:00–15:30");
    expect(whenWords("en", "2026-11-19T15:00:00+09:00", "2026-11-19T15:30:00+09:00", false, "2026-11-18", "All day")).toBe("Tomorrow, Thu Nov 19, 15:00–15:30");
    expect(dateRun("zh", "2026-11-21", "2026-11-22")).toBe("11月21日–22日");
    expect(dateRun("en", "2026-11-30", "2026-12-02")).toBe("Nov 30 – Dec 2");
  });

  test("the other side's zone, only when it differs", () => {
    expect(otherZoneLine("zh", "America/Los_Angeles", "2026-11-18T14:00:00+09:00")).toBe("洛杉矶当地 11月17日 21:00");
    expect(otherZoneLine("en", "America/Los_Angeles", "2026-11-18T14:00:00+09:00")).toBe("21:00 Nov 17 in Los Angeles");
    expect(otherZoneLine("zh", "Asia/Tokyo", "2026-11-18T14:00:00+09:00")).toBe("");
    expect(theirSide("en", "America/Los_Angeles", "2026-11-19T17:00:00+09:00")).toEqual({ when: "00:00 Thu Nov 19", city: "Los Angeles" });
  });

  test("a date leaf's three words, and the other side said as a place", () => {
    expect(leafParts("zh", "2026-12-12T15:00:00+09:00")).toEqual({ month: "12 月", day: "12", weekday: "周六" });
    expect(leafParts("en", "2026-12-12T15:00:00+09:00")).toEqual({ month: "DEC", day: "12", weekday: "Sat" });
    expect(placeTimeLine("zh", "Asia/Singapore", "2026-12-12T15:00:00+09:00")).toBe("新加坡时间 周六 14:00");
    expect(placeTimeLine("en", "Asia/Singapore", "2026-12-12T15:00:00+09:00")).toBe("14:00 Sat, Singapore time");
    expect(placeTimeLine("zh", "Asia/Singapore", "2026-12-12T15:00:00+08:00")).toBe("");
  });

  test("who else is on it", () => {
    expect(peopleWords("zh", 2, ["Lina Chen", "alice"])).toBe("和 Lina Chen、alice");
    expect(peopleWords("en", 5, ["Lina Chen", "alice"])).toBe("with Lina Chen, alice +3");
    expect(peopleWords("zh", 5, ["Lina Chen", "alice"])).toBe("和 Lina Chen、alice 等 5 人");
    expect(peopleWords("en", 0, [])).toBe("");
  });
});
