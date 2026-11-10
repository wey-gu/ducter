// Principle 16: a semantic check runs on the cheapest capable model, read from the one registry
// (protocol/src/harnesses.ts cheapModel), on every harness that has one (research/48 F3).
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESSES, HARNESS_IDS } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createHarnessAsk, judgeModel, weightedTokens } from "../src/judge.ts";

/** A harness that answers "[]" with a usage report and records each session's spec. */
function answering(usage: HarnessEvent["usage"]) {
  const specs: SessionSpec[] = [];
  const port: HarnessPort = {
    async start(spec) {
      specs.push(spec);
      let sent = false;
      return {
        id: "s",
        canSteer: false,
        busy: () => false,
        send: async () => void (sent = true),
        interrupt: async () => {},
        close: async () => {},
        async *events() {
          while (!sent) await new Promise((r) => setTimeout(r, 1));
          yield { role: "assistant", text: "[]", usage, turnEnd: true } as HarnessEvent;
        },
      };
    },
    available: async () => [],
  };
  return { port, specs };
}

test("proactive triage runs on the registry's cheap model; the bar on the partner's own (research/48 P1)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-ask-"));
  try {
    for (const h of ["claude-code", "codex"] as const) {
      const a = answering({ inputTokens: 1_000, outputTokens: 100, cacheRead: 10_000 });
      const pick = () => ({ harness: h, model: "brain-model" });
      const triage = await createHarnessAsk({ harness: () => a.port, pick, dataDir: dir, cheap: true, dir: "triage" })("x");
      await createHarnessAsk({ harness: () => a.port, pick, dataDir: dir, cheap: false, dir: "judge" })("x");
      expect(a.specs.map((s) => s.model)).toEqual([HARNESSES[h].cheapModel!, "brain-model"]);
      // Cache reads count at a tenth (P4): 1,000 + 100 + 10,000 x 0.1.
      expect(triage.tokens).toBe(2_100);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  expect(weightedTokens({ cacheRead: 50_000, cacheWrite: 2_000 })).toBe(7_000);
});

test("the judge runs on each harness's registered cheap model, else the brain's own", () => {
  expect(judgeModel("claude-code", "opus")).toBe("haiku");
  expect(judgeModel("codex", "gpt-6.1-sol")).toBe(HARNESSES.codex.cheapModel!);
  expect(judgeModel("pi", "anthropic/claude-sonnet")).toBe("anthropic/claude-sonnet"); // none registered
  expect(judgeModel("pi", undefined)).toBeUndefined();
  for (const h of HARNESS_IDS) if (HARNESSES[h].cheapModel) expect(judgeModel(h, "x")).toBe(HARNESSES[h].cheapModel!);
});
