// D331: every window says where the loan of the person's phone stands: a Go waiting for the unlock,
// the phone out of reach (and why), a pause by their lock, the phone asking after the unlock, lent.
import { describe, expect, test } from "bun:test";
import { TABLES } from "../src/i18n.ts";

const KEYS = ["handset.wait.unlock", "handset.wait.away", "handset.wait.starting", "handset.away.limited", "handset.away.old", "handset.away.offline", "handset.away.unknown", "handset.paused", "handset.paused.why", "handset.paused.asking", "handset.withdraw", "handset.ask.waiting"];

describe("where the loan stands (D331)", () => {
  test("the words exist in both languages, and none says the card is still asking after a Go", () => {
    for (const lang of ["zh", "en"] as const) for (const k of KEYS) expect(TABLES[lang][k], `${lang} ${k}`).toBeTruthy();
    expect(TABLES.zh["handset.wait.unlock"]).toBe("借给它了：解锁你的 %s 就开始");
    expect(TABLES.zh["handset.withdraw"]).toBe("取消借用");
    expect(TABLES.en["handset.paused.asking"]).toBe("Asking on your %s: keep lending it?");
    // A lock no longer gives it back, so "locked" is not a reason it isn't answering.
    expect(TABLES.zh["handset.quiet"]).not.toContain("锁");
    expect(TABLES.en["handset.quiet"]).not.toContain("locked");
  });

  test("each state has its own line, and only away and a lock's pause say why under it", async () => {
    const { handsetTaskLine, handsetTaskWhy } = await import("../src/handset.tsx");
    const lines = new Set<string>();
    for (const hs of [{ device: "p", wait: "unlock" }, { device: "p", wait: "away", away: "limited" }, { device: "p", wait: "starting" }, { device: "p", paused: "locked" }, { device: "p", paused: "asking" }, { device: "p" }] as const) {
      const l = handsetTaskLine(hs as never, "Pixel Fold");
      expect(l).toContain("Pixel Fold");
      lines.add(l);
    }
    expect(lines.size).toBe(6);
    expect(handsetTaskWhy({ device: "p", wait: "away", away: "limited" } as never, "Pixel Fold")).toMatch(/Unrestricted|无限制/);
    expect(handsetTaskWhy({ device: "p", wait: "away" } as never, "Pixel Fold")).toBeTruthy(); // unknown, said as unknown
    expect(handsetTaskWhy({ device: "p", paused: "locked" } as never, "Pixel Fold")).toBeTruthy();
    expect(handsetTaskWhy({ device: "p", wait: "unlock" } as never, "Pixel Fold")).toBe("");
    expect(handsetTaskWhy({ device: "p", quiet: true } as never, "Pixel Fold")).toContain("Pixel Fold");
  });
});
