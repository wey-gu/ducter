// Regression (live run, ack latency): the partner needs to see a task_open call the moment the
// model starts it, not after the whole brief is written. The normalizer emits an early
// tool_call_started event; the runner does not log it.
import { expect, test } from "bun:test";
import { Normalizer, headBefore } from "../src/normalize.ts";

test("the task_open title is surfaced as soon as it streams in, once", () => {
  const n = new Normalizer(() => undefined);
  n.push({ kind: "tool_call_started", callId: "c1", tool: "mcp__ducter__task_open" });
  expect(n.push({ kind: "tool_call_input_delta", callId: "c1", delta: '{"title":"foo: add has(k' })).toEqual([]);
  expect(n.push({ kind: "tool_call_input_delta", callId: "c1", delta: ') to \\"Cache\\"","brief":"User' })).toEqual([
    { role: "tool", tool: { name: "mcp__ducter__task_open", input: { title: 'foo: add has(k) to "Cache"' } }, raw: { kind: "tool_call_title", callId: "c1" } },
    // D120: everything before "brief" is the head the partner opens the task from.
    { role: "tool", tool: { name: "mcp__ducter__task_open", input: { title: 'foo: add has(k) to "Cache"' } }, raw: { kind: "tool_call_head", callId: "c1" } },
  ]);
  expect(n.push({ kind: "tool_call_input_delta", callId: "c1", delta: '\'s words"}' })).toEqual([]);
});

test("the head before the brief carries title and place, once, as soon as the brief key starts", () => {
  const n = new Normalizer(() => undefined);
  n.push({ kind: "tool_call_started", callId: "c1", tool: "mcp__ducter__task_open" });
  const a = n.push({ kind: "tool_call_input_delta", callId: "c1", delta: '{"title":"brief, in short","place":{"kind":"repo","repoPath":"~/dev/f{o}o"},"bri' });
  expect(a.map((e) => (e.raw as { kind: string }).kind)).toEqual(["tool_call_title"]);
  const b = n.push({ kind: "tool_call_input_delta", callId: "c1", delta: 'ef": "User\'s words' });
  expect(b).toEqual([
    { role: "tool", tool: { name: "mcp__ducter__task_open", input: { title: "brief, in short", place: { kind: "repo", repoPath: "~/dev/f{o}o" } } }, raw: { kind: "tool_call_head", callId: "c1" } },
  ]);
  expect(n.push({ kind: "tool_call_input_delta", callId: "c1", delta: ' and more"}' })).toEqual([]);
});

test("headBefore: a value that reads brief is not the key; nested keys don't count", () => {
  expect(headBefore('{"title":"brief","x":1,"brief":"', "brief")).toEqual({ title: "brief", x: 1 });
  expect(headBefore('{"place":{"brief":"no"},"title":"t"', "brief")).toBeNull();
  expect(headBefore('{"title":"t","brief"', "brief")).toBeNull();
  expect(headBefore('{"brief":"', "brief")).toEqual({});
});

test("tool_call_started flushes held text and emits an early tool event", () => {
  const n = new Normalizer(() => undefined);
  expect(n.push({ kind: "text_delta", text: "I'll look into it." })).toEqual([]);
  const out = n.push({ kind: "tool_call_started", callId: "c1", tool: "mcp__ducter__task_open" });
  expect(out).toEqual([
    { role: "assistant", text: "I'll look into it." },
    { role: "tool", tool: { name: "mcp__ducter__task_open" }, raw: { kind: "tool_call_started", callId: "c1" } },
  ]);
  const end = n.push({ kind: "tool_call_ended", callId: "c1", result: "ok", content: [{ type: "text", text: "{}" }] });
  expect(end[0]!.tool).toMatchObject({ name: "mcp__ducter__task_open", ok: true, output: "{}" });
});

test("thinking is kept as its headings only, before the words that follow it (D127)", () => {
  const n = new Normalizer(() => undefined);
  expect(n.push({ kind: "reasoning", content: { kind: "text", text: "**Opening App Store Connect**\n\nI need the login page first, then" } })).toEqual([]);
  n.push({ kind: "reasoning", content: { kind: "text", text: " the app record.\n\n**Checking the build**\n" } });
  n.push({ kind: "reasoning", content: { kind: "redacted" } });
  n.push({ kind: "text_delta", text: "Opening the site." });
  const out = n.push({ kind: "tool_call_started", callId: "c1", tool: "commandExecution" });
  expect(out.slice(0, 2)).toEqual([
    { role: "assistant", thinking: ["Opening App Store Connect", "Checking the build"] },
    { role: "assistant", text: "Opening the site." },
  ]);
  // Thinking with no heading says nothing.
  n.push({ kind: "reasoning", content: { kind: "text", text: "just musing about it" } });
  expect(n.flush()).toEqual([]);
});
