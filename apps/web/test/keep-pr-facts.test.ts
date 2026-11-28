// D624: the Keep page's held PR rows carry what a board used to show: its CI, a draft, a
// conflict or changes requested, and the head commit — each its own element, in the same words On
// hand uses (prPhaseWords / prFacts), never a " · " join.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const keepSrc = readFileSync(join(import.meta.dir, "..", "src", "keep.tsx"), "utf8");

test("the Keep row draws the phase and every PR fact as its own element", async () => {
  const { A } = await import("../src/app.ts");
  const p = await import("../src/onhand-pr.tsx");
  A.L = strings("zh");
  const said = { phase: "changes" as const, by: ["hawkingrei"], checks: { passed: 2, total: 3, pending: 0 }, draft: true as const, sha: "b2c3d4e" };
  expect(p.prPhaseWords(said, "main")).toBe("hawkingrei 要求修改");
  const facts = p.prFacts(said);
  expect(facts).toEqual(["CI 通过 2/3", "草稿", "看的是 b2c3d4e"]);
  // Every fact is its own element: no dotted or comma-joined string.
  for (const f of facts) expect(f).not.toMatch(/ · |, /);
  const conflict = { phase: "conflict" as const, checks: { passed: 3, total: 3, pending: 0 }, sha: "d4e5f6a" };
  expect(p.prPhaseWords(conflict, "main")).toBe("和 main 有冲突");
  expect(p.prFacts(conflict)).toEqual(["CI 全部通过", "看的是 d4e5f6a"]);
  // A draft's own phase already says it once; the fact is not repeated.
  expect(p.prFacts({ phase: "draft" as const, checks: { passed: 1, total: 2, pending: 1 }, draft: true as const, sha: "a1b2c3d" })).toEqual(["CI 通过 1/2", "看的是 a1b2c3d"]);
});

test("the Keep item renders the facts through the shared Facts control, not the old check squares", () => {
  expect(keepSrc).toContain("<Facts class=\"kp-item-facts\" items={facts} />");
  expect(keepSrc).toContain("const facts = [...(x.said ? prFacts(x.said) : []), ...holderFactsOf(task)];"); // D661: and its holder facts
  expect(keepSrc).not.toContain("kp-checks");
});
