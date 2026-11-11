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

// Principle 6: a Codex partner runs in its read-only sandbox, which declines MCP calls not marked
// read-only. A session that says it is sandboxed (the partner, or a read-only task) gets the mark.
test("Ducter's tools are marked read-only only for a sandboxed session", async () => {
  const hub = createMcpHub({ secret: "s" });
  hub.register("partner", "task_open", "o", { type: "object" }, async () => "ok");
  hub.register("task", "checkpoint", "c", { type: "object" }, async () => "ok");
  const list = async (role: "partner" | { taskId: string }, query: string) => {
    const res = await hub.handle(
      new Request(`http://127.0.0.1/mcp${query}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...hub.configFor(role).headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    return ((await res.json()) as { result: { tools: { annotations?: { readOnlyHint?: boolean } }[] } }).result.tools[0]!.annotations;
  };
  expect(await list("partner", "?sandbox=read-only")).toEqual({ readOnlyHint: true });
  expect(await list("partner", "")).toBeUndefined();
  // 2026-11-11: a read-only Codex task had report_to_main declined ("approval policy is never").
  expect(await list({ taskId: "t1" }, "?sandbox=read-only")).toEqual({ readOnlyHint: true });
  expect(await list({ taskId: "t1" }, "")).toBeUndefined();
});
