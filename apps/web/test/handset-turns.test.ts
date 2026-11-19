// D280: Android's prompt to allow a recording is the person's turn, said in every window with its
// countdown and one quiet 不录了; a loan's end is a hairline in the task (你收回了 Pixel Fold · 20:14).
import { describe, expect, test } from "bun:test";
import { toldOf } from "@ducter/protocol/src/transcript.ts";
import { TABLES } from "../src/i18n.ts";

describe("the recording card (D280)", () => {
  test("its countdown reads m:ss and stops at the end", async () => {
    const { recordLeft } = await import("../src/handset.tsx");
    const now = Date.parse("2026-11-16T20:14:00Z");
    expect(recordLeft("2026-11-16T20:16:00Z", now)).toBe("2:00");
    expect(recordLeft("2026-11-16T20:15:42.500Z", now)).toBe("1:42");
    expect(recordLeft("2026-11-16T20:14:05Z", now)).toBe("0:05");
    expect(recordLeft("2026-11-16T20:13:59Z", now)).toBe("");
    expect(recordLeft(undefined, now)).toBe("");
  });
});

describe("a loan's end, as a hairline (D280)", () => {
  test("taken back, given back and lost each have their words, named by the phone", () => {
    expect(toldOf("Your loan of Pixel Fold ended: the user took it back with Stop (停下). The phone was returned to them.", "ducter")).toEqual({ say: "taken_back", name: "Pixel Fold" });
    expect(toldOf("Your loan of Pixel Fold ended: Android's switch for Ducter went off on it.", "ducter")?.say).toBe("taken_back");
    expect(toldOf("Your loan of Pixel Fold ended: the task finished, and the phone was returned to the user.", "ducter")?.say).toBe("given_back");
    expect(toldOf("Your loan of Pixel Fold ended: the phone couldn't reach the home for 15 s.", "ducter")?.say).toBe("loan_lost");
    for (const lang of ["zh", "en"] as const) for (const k of ["told.taken_back", "told.given_back", "told.loan_lost"]) expect(TABLES[lang][k], `${lang} ${k}`).toContain("%s");
    // D291: the time is its own element beside the words, never joined to them.
    expect(TABLES.zh["told.taken_back"]!.replace("%s", "Pixel Fold")).toBe("你收回了 Pixel Fold");
  });
});
