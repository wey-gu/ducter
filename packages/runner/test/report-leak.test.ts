// research/124: a small model wrote the rest of its report_to_main call into the summary string.
import { expect, test } from "bun:test";
import { normalizeReport } from "../src/tools.ts";

const leaked =
  'README.md 已缩短，没有改动代码。</summary>\n<parameter name="evidence">[{"kind": "file", "label": "缩短后的 README", "ref": "README.md"}]';

test("a summary that runs into its own tool markup ends there, and the leaked evidence is kept", () => {
  const r = normalizeReport("t1", { state: "done", summary: leaked });
  expect(r.summary).toBe("README.md 已缩短，没有改动代码。");
  expect(r.evidence).toEqual([{ kind: "file", label: "缩短后的 README", ref: "README.md" }]);
});

test("evidence passed properly wins over a leaked copy; a leak that isn't JSON is dropped", () => {
  const r = normalizeReport("t1", { state: "done", summary: leaked, evidence: [{ kind: "test", label: "bun test", ref: "4 pass" }] });
  expect(r.evidence).toEqual([{ kind: "test", label: "bun test", ref: "4 pass" }]);
  const s = normalizeReport("t1", { state: "done", summary: 'Done.\n<parameter name="evidence">not json</parameter>' });
  expect(s.summary).toBe("Done.");
  expect(s.evidence).toEqual([]);
});

test("an ordinary summary is untouched, angle brackets included", () => {
  const r = normalizeReport("t1", { state: "done", summary: "Fixed `a < b` in <Header>; tests pass." });
  expect(r.summary).toBe("Fixed `a < b` in <Header>; tests pass.");
});
