// An opened task as turns (D210, after D152): the agent's voice, its steps as lines, keys hidden.
// The desktop (apps/desktop/internal/views/transcript_test.go) passes the same cases.
import { expect, test } from "bun:test";
import cases from "../fixtures/transcript.json";
import { cases as source } from "../fixtures/transcript-cases.ts";
import type { LogEvent } from "../src/index.ts";
import { blocksOf, failLine, failOf, inTurn, lastSeq, latestVoice, linesOf, serviceName, trivialOutput, turnsOf, wakeOf, type Block } from "../src/transcript.ts";
import { editDiff, linesDiff } from "../src/editdiff.ts";
import { builtTurns, indexOf, slotsOf } from "../src/session.ts";

for (const c of cases)
  test(`transcript: ${c.name}`, () => {
    expect(turnsOf(blocksOf(c.harness, c.events as LogEvent[], c.working))).toEqual(c.want as never);
    expect(inTurn(c.events as LogEvent[])).toBe(c.inTurn);
    // D320: its index, and built turn by turn from it, the same turns.
    expect(JSON.parse(JSON.stringify(indexOf(c.events as LogEvent[])))).toEqual(c.index as never);
    expect(builtTurns(slotsOf(c.harness, indexOf(c.events as LogEvent[]), c.events as LogEvent[], c.working, new Map()))).toEqual(c.want as never);
  });

// D271: a wake is a turn's opening of its own, never the partner's card; a rest is no turn.
test("a wake opens a turn as a hairline; a task resting on its wait is in no turn", () => {
  expect(wakeOf("等到了：「约45分钟后继续检查」（1794807944）。接着做。")).toEqual({ reason: "约45分钟后继续检查", timer: false });
  expect(wakeOf("等到了：「CI（main）跑完」。接着做。")).toEqual({ reason: "CI（main）跑完", timer: false });
  expect(wakeOf('The wait is over: "CI to finish" (green). Carry on.')).toEqual({ reason: "CI to finish", timer: false });
  expect(wakeOf("到时间了：「看一眼部署」。接着做。")).toEqual({ reason: "看一眼部署", timer: true });
  expect(wakeOf('It\'s time: "look at the deploy". Carry on.')).toEqual({ reason: "look at the deploy", timer: true });
  expect(wakeOf("没等到：「CI 跑完」，它被取消了。看看接下来怎么做。")).toBeUndefined();
  const c = cases.find((x) => x.name === "a review loop on its own wait (zh)")!;
  const turns = turnsOf(blocksOf(c.harness, c.events as LogEvent[], c.working));
  expect(turns.map((t) => t.prompt?.k)).toEqual(["brief", "wake", "wake", "wake"]);
  expect(JSON.stringify(turns)).not.toContain("1794807944");
  expect(c.inTurn).toBe(false);
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
  expect(first.lines[0]).toMatchObject({ k: "group", n: 5, tally: [{ kind: "searched", n: 3 }, { kind: "read", n: 1 }, { kind: "browsed", n: 1 }] });
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
  expect(linesOf(rows).map((l) => l.k)).toEqual(["group"]);
  expect(linesOf(rows.slice(0, 1)).map((l) => l.k)).toEqual(["row"]);
});

test("D268: one summary line per run, edits and commands first, a service by its name", () => {
  const c = cases.find((x) => x.name.startsWith("a run through"))!;
  const bs = blocksOf(c.harness, c.events as LogEvent[], c.working);
  const lines = stepsOf(bs).flatMap((b) => b.lines);
  const groups = lines.filter((l) => l.k === "group");
  expect(groups[0]).toMatchObject({ n: 14, tally: [{ kind: "used", name: "GitHub", n: 14 }] });
  expect(groups.find((g) => g.k === "group" && g.tally[0]!.kind === "edited")).toMatchObject({ tally: [{ kind: "edited" }, { kind: "ran" }, { kind: "read" }] });
  // A failure stands alone, its JSON unwrapped; a subagent and thinking stand alone, with how long they took.
  expect(lines.find((l) => l.k === "row" && l.row.outcome === "error")).toMatchObject({ row: { hint: "Not Found", code: 404 } });
  expect(lines.find((l) => l.k === "row" && l.row.step?.kind === "delegated")).toMatchObject({ row: { ms: 46000 } });
  expect(lines.find((l) => l.k === "row" && !l.row.step)).toMatchObject({ row: { ms: 4000 } });
  // "Action completed." opens nothing; the plan is one block with its latest items; a compaction is a divider.
  expect(groups[0]!.k === "group" && groups[0]!.rows.find((r) => r.step?.target === "get issue")?.output).toBeUndefined();
  expect(bs.filter((b) => b.k === "plan")).toHaveLength(1);
  expect(bs.find((b) => b.k === "plan")).toMatchObject({ items: [{ state: "done" }, { state: "done" }, { state: "done" }, { state: "doing" }] });
  expect(bs.some((b) => b.k === "note" && b.say === "compacted")).toBe(true);
  expect(bs.at(-1)).toMatchObject({ k: "steps", live: true });
  expect(lastSeq(bs.at(-1)!)).toBe(c.events.at(-1)!.seq);
});

test("D268: failures in words, trivial output, service names", () => {
  expect(failOf('GitHub API error 404: {"message":"Not Found","status":"404"}')).toEqual({ hint: "Not Found", code: 404 });
  expect(failOf("HTTP 503 Service Unavailable")).toEqual({ hint: "HTTP 503 Service Unavailable", code: 503 });
  expect(failOf('{"error":{"message":"rate limited","code":429}}')).toEqual({ hint: "rate limited", code: 429 });
  expect(failOf("error: unknown command")).toEqual({ hint: "error: unknown command" });
  for (const t of ["Action completed.", "", "OK", "Done", "done!"]) expect(trivialOutput(t)).toBe(true);
  expect(trivialOutput("50/50 ok")).toBe(false);
  expect([serviceName("github"), serviceName("claude_ai_Gmail"), serviceName("my-tracker")]).toEqual(["GitHub", "Gmail", "My Tracker"]);
});

test("D268: a retry says itself only while it is the latest thing", () => {
  const base = cases.find((x) => x.name.startsWith("a run through"))!.events as LogEvent[];
  const retry = { ...base.at(-1)!, seq: 9999, body: { taskId: "cd1", role: "system", text: "retry 2: overloaded", raw: { kind: "retry" } } } as LogEvent;
  const live = blocksOf("claude-code", [...base, retry], true);
  expect(live.at(-1)).toMatchObject({ k: "note", say: "retry", name: "2" });
  expect(live.at(-2)).toMatchObject({ k: "steps", live: true });
  const after = blocksOf("claude-code", [...base, retry, { ...base.at(-1)!, seq: 10000 }], true);
  expect(after.some((b) => b.k === "note" && b.say === "retry")).toBe(false);
});
