// An opened task as turns (D210, after D152): the agent's voice, its steps as lines, keys hidden.
// The desktop (apps/desktop/internal/views/transcript_test.go) passes the same cases.
import { expect, test } from "bun:test";
import cases from "../fixtures/transcript.json";
import { cases as source } from "../fixtures/transcript-cases.ts";
import type { LogEvent } from "../src/index.ts";
import { blocksOf, failLine, latestVoice, linesOf, turnsOf, type Block } from "../src/transcript.ts";
import { editDiff, linesDiff } from "../src/editdiff.ts";

for (const c of cases)
  test(`transcript: ${c.name}`, () => {
    expect(turnsOf(blocksOf(c.harness, c.events as LogEvent[], c.working))).toEqual(c.want as never);
  });

test("the fixture is what the cases file says", () => {
  expect(JSON.parse(JSON.stringify(source.map((c) => c.events)))).toEqual(cases.map((c) => c.events));
});

test("no key survives into any block", () => {
  for (const c of cases) expect(JSON.stringify(blocksOf(c.harness, c.events as LogEvent[], c.working))).not.toContain("8fK2pQx7");
});

const stepsOf = (bs: Block[]) => bs.filter((b): b is Extract<Block, { k: "steps" }> => b.k === "steps");

test("probes that find nothing are not errors; a real failure is; looks fold; the live stretch is the last one while working", () => {
  const [done, running, cc] = cases.map((c) => blocksOf(c.harness, c.events as LogEvent[], c.working));
  const first = stepsOf(done!)[0]!;
  expect(first.lines[0]).toMatchObject({ k: "looks", reads: 1, searches: 4 });
  expect(running!.at(-1)).toMatchObject({ k: "steps", live: true });
  expect(done!.some((b) => b.k === "steps" && b.live)).toBe(false);
  const bad = stepsOf(cc!).flatMap((b) => b.lines).filter((l) => l.k === "row" && l.row.outcome === "error");
  expect(bad).toHaveLength(1);
  // A checkpoint saving what it just said is said once, marked saved.
  expect(done!.filter((b) => b.k === "voice" && b.text.startsWith("Starting Nowledge Mem"))).toHaveLength(1);
  expect(latestVoice(running!)).toContain("pipx");
});

test("turns open on what someone said to the agent", () => {
  const c = cases.find((x) => x.name.startsWith("a long claude code run, finished"))!;
  const turns = turnsOf(blocksOf(c.harness, c.events as LogEvent[], c.working));
  expect(turns.map((t) => t.prompt?.k)).toEqual(["brief", "you"]);
  expect(turns[0]!.prompt).toMatchObject({ media: [{ w: 688 }] });
  expect(turns[1]!.prompt).toMatchObject({ media: [{ w: 688 }] });
});

test("an edit carries its own diff; a failure its telling line", () => {
  expect(linesDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual([" a", "-b", "+B", " c"]);
  expect(editDiff({ file_path: "x", content: "1\n2\n" })).toEqual({ lines: ["+1", "+2"], added: 2, removed: 0, more: 0 });
  expect(editDiff({ file_path: "x" })).toBeUndefined();
  const big = editDiff({ content: Array.from({ length: 100 }, (_, i) => String(i)).join("\n") })!;
  expect([big.lines.length, big.more, big.added]).toEqual([60, 40, 100]);
  expect(failLine("bun test\n 2 pass\n 0 fail\n✗ cart > total [1ms]\n 1 fail")).toBe("✗ cart > total [1ms]");
  expect(failLine("just\nthe last")).toBe("the last");
  const rows = [{ seq: 1, step: { kind: "read" as const }, n: 1, outcome: "ok" as const }, { seq: 2, step: { kind: "ran" as const }, n: 1, outcome: "ok" as const }];
  expect(linesOf(rows).map((l) => l.k)).toEqual(["row", "row"]);
});
