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
