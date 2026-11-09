// An opened task as blocks (D148): the agent's voice, its steps folded per stretch, keys hidden.
// The desktop (apps/desktop/internal/views/transcript_test.go) passes the same cases.
import { expect, test } from "bun:test";
import cases from "../fixtures/transcript.json";
import { cases as source } from "../fixtures/transcript-cases.ts";
import type { LogEvent } from "../src/index.ts";
import { blocksOf, latestVoice } from "../src/transcript.ts";

for (const c of cases)
  test(`transcript: ${c.name}`, () => {
    expect(blocksOf(c.harness, c.events as LogEvent[], c.working)).toEqual(c.want as never);
  });

test("the fixture is what the cases file says", () => {
  expect(JSON.parse(JSON.stringify(source.map((c) => c.events)))).toEqual(cases.map((c) => c.events));
});

test("no key survives into any block", () => {
  for (const c of cases) expect(JSON.stringify(blocksOf(c.harness, c.events as LogEvent[], c.working))).not.toContain("8fK2pQx7");
});

test("probes that find nothing are not errors; a real failure is; the live stretch is the last one while working", () => {
  const [done, running, cc] = cases.map((c) => blocksOf(c.harness, c.events as LogEvent[], c.working));
  const first = done!.find((b) => b.k === "steps")!;
  expect(first.k === "steps" && first.gist).toEqual({ kind: "look", steps: 5, files: 0, errors: 0 });
  expect(running!.at(-1)).toMatchObject({ k: "steps", live: true });
  expect(done!.some((b) => b.k === "steps" && b.live)).toBe(false);
  const ccSteps = cc!.find((b) => b.k === "steps")!;
  expect(ccSteps.k === "steps" && ccSteps.gist.errors).toBe(1);
  // A checkpoint saving what it just said is said once, marked saved.
  expect(done!.filter((b) => b.k === "voice" && b.text.startsWith("Starting Nowledge Mem"))).toHaveLength(1);
  expect(latestVoice(running!)).toContain("pipx");
});
