// Task-role connection tools (D96): read-only, and only for connections the partner granted the
// task (connection_share). The partner's own tools, which can ask for Go, live in
// @ducter/partner (partner.ts) because they make decision cards inside the partner's turn.
import type { ConnectionCaller } from "@ducter/protocol/src/internal.ts";
import type { ConnectionsStore } from "./connections.ts";
import type { Ctx, CoreMcpHub } from "./mcp.ts";

const who = (ctx: Ctx): ConnectionCaller => (ctx.role === "task" && ctx.taskId ? { role: "task", taskId: ctx.taskId } : { role: "partner" });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function registerConnectionTools(mcp: CoreMcpHub, c: ConnectionsStore) {
  mcp.register(
    "task",
    "connections_list",
    "The user's connections (their OpenConnector or other MCP servers) this task may read. Empty unless the partner shared one with you.",
    { type: "object", properties: {} },
    async (_a, ctx) => ({ connections: c.list(who(ctx as Ctx)) }),
  );
  mcp.register(
    "task",
    "connection_search",
    "Find actions in a connection you were given (e.g. \"search email\", \"list pull requests\"). Each one reads or writes; you may only run reads.",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "What you want to do, in a few words" },
        connection: { type: "string", description: "Connection id or name; omit for all you were given" },
        service: { type: "string", description: "Optional service id, e.g. gmail, github, googlecalendar" },
      },
      required: ["query"],
    },
    async (a, ctx) => c.search(who(ctx as Ctx), str(a.query), { connection: str(a.connection) || undefined, service: str(a.service) || undefined }),
  );
  mcp.register(
    "task",
    "connection_guide",
    "One action's guide: its input, and whether it reads or writes.",
    {
      type: "object",
      properties: { connection: { type: "string" }, action: { type: "string", description: "Action id, e.g. gmail.search_threads" } },
      required: ["connection", "action"],
    },
    async (a, ctx) => c.guide(who(ctx as Ctx), str(a.connection), str(a.action)),
  );
  mcp.register(
    "task",
    "connection_read",
    "Run one READ action in a connection you were given. Anything that sends, changes or deletes is refused: tell the partner instead.",
    {
      type: "object",
      properties: {
        connection: { type: "string" },
        action: { type: "string" },
        input: { type: "object", description: "The action's input, as its guide says" },
        account: { type: "string", description: "Optional named account inside the connection" },
      },
      required: ["connection", "action"],
    },
    async (a, ctx) => c.read(who(ctx as Ctx), str(a.connection), str(a.action), a.input ?? {}, str(a.account) || undefined),
  );
}
