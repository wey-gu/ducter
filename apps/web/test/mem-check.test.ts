// D465: Nowledge Mem would like to check (two memories that may disagree, a rule it learned) and the
// rules every connected AI tool follows, on Settings › 记忆. zh and en together; the Mac has the same
// words (apps/desktop/internal/i18n/memory.go) and test (memory_check_test.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { MemView } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const KEYS = Object.keys(memoryWords.zh).filter((k) => k.startsWith("mem.check.") || k.startsWith("said.mem.check.") || k.startsWith("mem.rules.") || k === "said.mem.rules.off");

describe("Nowledge Mem would like to check (D465)", () => {
  test("every word in zh and en, no counter, no dot-joined facts, no text arrows", () => {
    expect(KEYS.length).toBe(33);
    for (const k of KEYS) {
      expect(memoryWords.en[k]).toBeTruthy();
      for (const w of [memoryWords.zh[k]!, memoryWords.en[k]!]) {
        expect(w).not.toMatch(/ · |件|->|→|=>/);
      }
    }
    expect(memoryWords.zh["mem.check.title"]).toBe("Nowledge Mem 拿不定的地方");
    expect(memoryWords.en["mem.rules.title"]).toBe("What all your AI tools follow");
  });

  test("the page: after what it knows, before the other tools; one quiet row, Take the suggestions the one primary", () => {
    const src = readFileSync(new URL("../src/memory.tsx", import.meta.url), "utf8");
    expect(src.indexOf("<MemCheckSec />")).toBeGreaterThan(src.indexOf("<MemAbout />"));
    expect(src.indexOf("<MemRules />")).toBeLessThan(src.indexOf("<MemTools />"));
    // D569: the suggestion is the secondary clay per ask; the group's one primary takes them all.
    expect(src).toContain('kind={a === it.suggest ? "secondary" : "text"}');
    expect(src).toContain('<Btn kind="primary" size="sm" label={t("mem.check.take")}');
    expect(memoryWords.zh["mem.check.unsure"]).toBe("Nowledge Mem 有 %d\u00a0处拿不定");
    expect(memoryWords.zh["mem.check.take"]).toBe("按建议都处理");
    expect(memoryWords.en["mem.check.take"]).toBe("Take the suggestions");
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
    expect(css).toContain(".mem-pair li");
  });

  test("an answer leaves at once (a rule turned on joins the rules on); a refusal brings a line back", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("zh");
    const sent: unknown[] = [];
    const send = A.send;
    (A as any).send = (f: unknown) => sent.push(f);
    try {
      A.mem = {
        state: "connected",
        noted: [],
        check: {
          asks: [
            { id: "e1", kind: "contradiction", pair: [{ title: "Cloud resets at UTC midnight" }, { title: "Mem resets on a rolling 24h" }], suggest: "both", answers: ["newer", "older", "both"] },
            { id: "rule:feishu", kind: "rule", title: "Deploys go through CI", body: "Never by hand", suggest: "use", answers: ["use", "not"] },
          ],
          rules: [{ id: "rule:ci", title: "CI first" }],
          more: true,
        },
      } as MemView;
      A.memSettle("rule:feishu", "use");
      expect(sent.at(-1)).toEqual({ t: "mem_answer", id: "rule:feishu", answer: "use" });
      expect(A.mem!.check!.asks.map((x) => x.id)).toEqual(["e1"]);
      expect(A.mem!.check!.rules.map((x) => x.id)).toEqual(["rule:feishu", "rule:ci"]);
      A.memSettle("rule:ci", "not");
      expect(A.mem!.check!.rules.map((x) => x.id)).toEqual(["rule:feishu"]);
      // D569: Take the suggestions answers each as suggested, once each.
      const { takeSuggestions } = await import("../src/memory.tsx");
      const before = sent.length;
      takeSuggestions([{ id: "e1", kind: "contradiction", suggest: "newer", why: "后记的是更正。", answers: ["newer", "older", "both"] }, { id: "x", kind: "contradiction", answers: ["newer", "both"] }]);
      expect(sent.slice(before)).toEqual([{ t: "mem_answer", id: "e1", answer: "newer" }]);
      A.receive({ t: "mem_answered", id: "e1", answer: "newer", ok: false });
      expect(A.memSettleFailed).toBe("e1");
      A.receive({ t: "mem_answered", id: "e1", answer: "newer", ok: true });
      expect(A.memSettleFailed).toBeUndefined();
    } finally {
      (A as any).send = send;
    }
  });
});
