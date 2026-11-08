// Regression (live run, ack latency): the partner needs to see a task_open call the moment the
// model starts it, not after the whole brief is written. The normalizer emits an early
// tool_call_started event; the runner does not log it.
import { expect, test } from "bun:test";
import { Normalizer } from "../src/normalize.ts";

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
