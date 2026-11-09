// Task-role connection tools (D96): read-only, and only for connections the partner granted the
// task (connection_share). Listed to a task only when the user has a connection at all, so a
// plain coding task carries no extra tools. The partner's own tools, which can ask for Go, live
// in @ducter/partner (partner.ts): they make decision cards inside the partner's turn.
import type { ConnectionCaller } from "@ducter/protocol/src/internal.ts";
import type { ConnectionsStore } from "./connections.ts";
import type { Ctx, CoreMcpHub } from "./mcp.ts";

const who = (ctx: Ctx): ConnectionCaller => (ctx.role === "task" && ctx.taskId ? { role: "task", taskId: ctx.taskId } : { role: "partner" });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function registerConnectionTools(mcp: CoreMcpHub, c: ConnectionsStore) {
  const any = () => c.view().length > 0;
  mcp.registerWhen(
    "task",
    "connection_search",
    "Look in the user's connections (their mail, calendar, GitHub…) that the partner shared with this task. With `query`: find actions. With `action`: that action's guide (its input, and whether it reads or writes). Without either: which connections you may read.",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "What you want to do, in a few words" },
        action: { type: "string", description: "An action id to get its guide, e.g. gmail.search_threads" },
        connection: { type: "string", description: "Connection id or name; omit for all you were given" },
        service: { type: "string", description: "Optional service id, e.g. gmail, github, googlecalendar" },
      },
    },
    async (a, ctx) => {
      const w = who(ctx as Ctx);
      const action = str(a.action);
      const connection = str(a.connection) || undefined;
      if (action) return c.guide(w, connection ?? c.list(w)[0]?.id ?? "", action);
      if (!str(a.query)) return { connections: c.list(w) };
      return c.search(w, str(a.query), { connection, service: str(a.service) || undefined });
    },
    any,
  );
  mcp.registerWhen(
    "task",
    "connection_read",
    "Run one READ action in a connection shared with this task. Anything that sends, changes or deletes is refused: tell the partner what you'd do and why.",
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
    any,
  );
}
