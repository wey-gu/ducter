// Regression (live run): the partner called task_send with {taskId, message} and the task got an
// empty steer. Required arguments are now checked before any handler runs.
import { expect, test } from "bun:test";
import { checkArgs, createMcpHub } from "../src/mcp.ts";

test("required args are checked before the handler runs, with a helpful message", async () => {
  const hub = createMcpHub({ secret: "s" });
  const calls: unknown[] = [];
  hub.register(
    "partner",
    "task_send",
    "t",
    { type: "object", properties: { taskId: { type: "string" }, text: { type: "string" }, mode: { type: "string" } }, required: ["taskId", "text"] },
    async (a) => void calls.push(a),
  );
  await expect(hub.call({ role: "partner" }, "task_send", { taskId: "t1", message: "hi" })).rejects.toThrow(
    "task_send: missing or empty text. Expected arguments: taskId, text, mode?; got: taskId, message.",
  );
  await expect(hub.call({ role: "partner" }, "task_send", { taskId: "t1", text: "  " })).rejects.toThrow(/missing or empty text/);
  expect(calls).toEqual([]);
  await hub.call({ role: "partner" }, "task_send", { taskId: "t1", text: "hi" });
  expect(calls).toEqual([{ taskId: "t1", text: "hi" }]);
  expect(() => checkArgs("x", { type: "object" }, {})).not.toThrow();
});

// Fresh-user QA: Claude Code deferred Ducter's tools behind tool search, so a task called
// checkpoint with `{}` without its schema. Every listed tool asks to be loaded up front.
test("every listed tool carries Claude Code's always-load key", async () => {
  const hub = createMcpHub({ secret: "s" });
  hub.register("task", "checkpoint", "c", { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, async () => "ok");
  hub.register("task", "report_to_main", "r", { type: "object" }, async () => "ok");
  const { headers } = hub.configFor({ taskId: "t1" });
  const res = await hub.handle(
    new Request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );
  const tools = ((await res.json()) as { result: { tools: { name: string; _meta?: Record<string, unknown> }[] } }).result.tools;
  expect(tools.map((t) => t.name)).toEqual(["checkpoint", "report_to_main"]);
  for (const t of tools) expect(t._meta?.["anthropic/alwaysLoad"]).toBe(true);
});
