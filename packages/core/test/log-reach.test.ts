// A task's log_search / log_read stay within its reach (focus-window.md "Pull tools", D62):
// its own stream, its persona's channel and sibling tasks; a browser task only its own stream.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Place } from "@ducter/protocol";
import { openLog, type SqliteLog } from "../src/log.ts";
import { createMcpHub, type CoreMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { registerCoreTools } from "../src/tools.ts";
import { tempDir } from "./helpers.ts";

let t: ReturnType<typeof tempDir>;
let log: SqliteLog;
let mcp: CoreMcpHub;

const open = (taskId: string, persona: string, place: Place = { kind: "none" }) =>
  log.append({ persona, stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: taskId, project: "", place, harness: "claude-code", brief: "b" } });
const say = (persona: string, stream: string, text: string) =>
  stream === "channel"
    ? log.append({ persona, stream, origin: "user", kind: "user_msg", body: { text } })
    : log.append({ persona, stream, origin: "task", kind: "checkpoint", body: { taskId: stream.slice(5), text } });

beforeEach(() => {
  t = tempDir();
  log = openLog({ path: join(t.dir, "ducter.db"), persona: "ann" });
  const tasks = createRegistry(log);
  mcp = createMcpHub({ secret: "s" });
  registerCoreTools(mcp, log, tasks);
  open("mine", "ann");
  open("sib", "ann");
  open("other", "bob");
  open("web", "ann", { kind: "browser", device: "local", profile: "ducter" });
  say("ann", "channel", "zebra plans with ann");
  say("bob", "channel", "zebra plans with bob");
  say("ann", "task:mine", "zebra in my own task");
  say("ann", "task:sib", "zebra in a sibling task");
  say("bob", "task:other", "zebra in bob's task");
  say("ann", "task:web", "zebra on the web page");
});
afterEach(() => {
  log.close();
  t.cleanup();
});

const texts = (r: unknown) => (r as { body: { text?: string } }[]).map((e) => e.body.text).filter(Boolean).sort();

test("a task searches its own stream, its persona's channel and sibling tasks; never another persona's", async () => {
  const hits = texts(await mcp.call({ role: "task", taskId: "mine" }, "log_search", { query: "zebra" }));
  expect(hits).toEqual(["zebra in a sibling task", "zebra in my own task", "zebra on the web page", "zebra plans with ann"]);
  await expect(mcp.call({ role: "task", taskId: "mine" }, "log_search", { query: "zebra", stream: "task:other" })).rejects.toThrow(/out of reach/);
  expect(texts(await mcp.call({ role: "task", taskId: "mine" }, "log_read", { stream: "task:sib" }))).toContain("zebra in a sibling task");
  expect(texts(await mcp.call({ role: "task", taskId: "mine" }, "log_read", { stream: "channel" }))).toEqual(["zebra plans with ann"]);
  await expect(mcp.call({ role: "task", taskId: "mine" }, "log_read", { stream: "task:other" })).rejects.toThrow(/out of reach/);
  await expect(mcp.call({ role: "task", taskId: "mine" }, "log_read", { stream: "partner" })).rejects.toThrow(/out of reach/);
});

test("a browser task reads only its own stream (D62)", async () => {
  const web = { role: "task" as const, taskId: "web" };
  expect(texts(await mcp.call(web, "log_search", { query: "zebra" }))).toEqual(["zebra on the web page"]);
  await expect(mcp.call(web, "log_read", { stream: "channel" })).rejects.toThrow(/browser task/);
  await expect(mcp.call(web, "log_search", { query: "zebra", stream: "task:mine" })).rejects.toThrow(/out of reach/);
  expect(texts(await mcp.call(web, "log_read", { stream: "task:web" }))).toEqual(["zebra on the web page"]);
});

test("the partner still searches the whole Log", async () => {
  expect(texts(await mcp.call({ role: "partner" }, "log_search", { query: "zebra" }))).toHaveLength(6);
});
