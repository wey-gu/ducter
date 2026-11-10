// Principle 16: a semantic check runs on the cheapest capable model, read from the one registry
// (protocol/src/harnesses.ts cheapModel), on every harness that has one (research/48 F3).
import { expect, test } from "bun:test";
import { HARNESSES, HARNESS_IDS } from "@ducter/protocol";
import { judgeModel } from "../src/judge.ts";

test("the judge runs on each harness's registered cheap model, else the brain's own", () => {
  expect(judgeModel("claude-code", "opus")).toBe("haiku");
  expect(judgeModel("codex", "gpt-6.1-sol")).toBe(HARNESSES.codex.cheapModel!);
  expect(judgeModel("pi", "anthropic/claude-sonnet")).toBe("anthropic/claude-sonnet"); // none registered
  expect(judgeModel("pi", undefined)).toBeUndefined();
  for (const h of HARNESS_IDS) if (HARNESSES[h].cheapModel) expect(judgeModel(h, "x")).toBe(HARNESSES[h].cheapModel!);
});
