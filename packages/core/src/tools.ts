// Core-owned Ducter MCP tools: log_search, log_read (both roles), task_read (partner).
// report_to_main / checkpoint come from @ducter/runner's registerTaskTools(core); core reacts
// to the appended `report` events (decisions.ts), not inside the tool handler.
import type { LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub } from "./mcp.ts";
import { taskStream, type CoreRegistry } from "./registry.ts";

const MAX_LIMIT = 200;

/** Compact form for tool output: drops raw harness payloads. */
const compact = (e: LogEvent) => {
  const body = { ...(e.body as Record<string, unknown>) };
  delete body.raw;
  return { seq: e.seq, ts: e.ts, stream: e.stream, origin: e.origin, kind: e.kind, body, ...(e.supersedes ? { supersedes: e.supersedes } : {}) };
};
const clampLimit = (n: unknown, d: number) => Math.min(MAX_LIMIT, Math.max(1, Number(n) || d));

export function registerCoreTools(mcp: CoreMcpHub, log: LogStore, tasks: CoreRegistry) {
  const logSearch = {
    type: "object",
    properties: {
      query: { type: "string", description: "Words to find (substring match, any language)" },
      stream: { type: "string", description: '"channel" or "task:<id>"; omit for all' },
      limit: { type: "number" },
    },
    required: ["query"],
  };
  const logRead = {
    type: "object",
    properties: {
      stream: { type: "string", description: '"channel" or "task:<id>"' },
      fromSeq: { type: "number", description: "Read forward from this seq; omit for the latest events" },
      limit: { type: "number" },
    },
    required: ["stream"],
  };
  for (const role of ["partner", "task"] as const) {
    mcp.register(role, "log_search", "Full-text search over the Ducter Log (conversation and tasks). Newest first.", logSearch, async (a) =>
      log.search(String(a.query ?? ""), { stream: a.stream, limit: clampLimit(a.limit, 20) }).map(compact),
    );
    mcp.register(role, "log_read", "Read events from one Log stream in order.", logRead, async (a) =>
      log.read({ stream: String(a.stream), fromSeq: a.fromSeq, limit: clampLimit(a.limit, 50) }).map(compact),
    );
  }

  mcp.register(
    "partner",
    "task_read",
    "Read a task: its card, its latest report, or its transcript.",
    {
      type: "object",
      properties: {
        taskId: { type: "string" },
        level: { type: "string", enum: ["card", "report", "transcript"] },
        limit: { type: "number" },
      },
      required: ["taskId"],
    },
    async (a) => {
      const card = tasks.get(String(a.taskId));
      if (!card) throw new Error(`unknown task ${a.taskId}`);
      if (a.level === "report") return { card, report: card.lastReport ?? null };
      if (a.level === "transcript")
        return { card, events: log.read({ stream: taskStream(card.taskId), limit: clampLimit(a.limit, 50) }).map(compact) };
      return card;
    },
  );
}
