// D449: Settings › Partner on a free key, the same words as the Mac's: about how many requests are
// left today and that results aren't looked over again (never "paid per use"); the day's cap said
// with the provider's name, its own reset and the paid way.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";

const KEYS = [
  "loadout.brain.wait.free", "loadout.brain.wait.free.minute", "loadout.brain.held.free", "loadout.free.more.openrouter", "loadout.free.more.google",
  "loadout.budget.left", "loadout.budget.page", "loadout.budget.out", "loadout.budget.look", "loadout.acct.free.short",
];

test("every word in zh and en, never a dot join, the same as the Mac's", () => {
  const mac = readFileSync(new URL("../../desktop/internal/i18n/loadout.go", import.meta.url), "utf8");
  for (const lang of ["zh", "en"] as const) {
    const L = strings(lang);
    for (const k of KEYS) {
      const v = L.t(k, "X", "Y", "Z");
      expect(v).not.toBe(k);
      expect(v).not.toContain(" · ");
      expect(mac).toContain(`"${k}":`);
      expect(mac).toContain(JSON.stringify(L.t(k)));
    }
  }
});

test("the lines: about 12 left; the provider's own page when it shows the cap; the spent day with its reset and the paid way", async () => {
  const { A } = await import("../src/app.ts");
  const { budgetLine, heldLine } = await import("../src/partner-story.tsx");
  A.L = strings("zh");
  const reset = new Date(Date.now() + 3 * 3600_000).toISOString();
  const at = (await import("../src/format.ts")).stamp(A.L, reset);
  expect(budgetLine({ provider: "openrouter", limit: 50, left: 12, resetsAt: reset })).toBe("OpenRouter 的免费额度，今天还剩约 12 次");
  expect(budgetLine({ provider: "google", resetsAt: reset })).toBe("Gemini 的免费额度，每天有上限，用完了到它的时间就恢复");
  expect(budgetLine({ provider: "openrouter", limit: 50, left: 0, resetsAt: reset, out: true })).toBe(`OpenRouter 的免费额度今天用完了，${at} 恢复`);
  const held = { from: "pi" as const, why: "quota" as const, until: reset, resetKnown: true, waits: true as const, free: "openrouter" as const };
  expect(heldLine(held)).toBe(`OpenRouter 的免费额度今天用完了，${at} 恢复；想不等的话，充 $10 就能多很多。这期间发来的消息到时按顺序回`);
  expect(heldLine({ ...held, free: "google" })).toContain("在 Google AI Studio 开通付费就宽很多");
  expect(heldLine({ ...held, why: "rate_limited" })).toBe(`OpenRouter 的免费额度这一分钟用满了，${at} 接着回`);
  // Not a free tier's: D435's line as before.
  const { free: _f, ...plain } = held;
  expect(heldLine(plain)).toBe(`额度用完了，${at} 恢复。别的 AI 也接不上，这期间发来的消息到时按顺序回`);
  A.L = strings("en");
  expect(budgetLine({ provider: "openrouter", limit: 50, left: 12, resetsAt: reset })).toBe("On OpenRouter's free allowance: about 12 left today");
});

test("the Thinks section: the readout replaces paid-per-use on a free key", () => {
  const f = readFileSync(new URL("../src/partner-story.tsx", import.meta.url), "utf8");
  expect(f).toMatch(/if \(budget\) \{[\s\S]*?budgetLine\(budget\)[\s\S]*?loadout\.budget\.look[\s\S]*?\} else if \(h\?\.billing === "usage"\) lines\.push\(t\("loadout\.brain\.key"\)\)/);
});
