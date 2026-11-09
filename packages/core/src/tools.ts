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

// Principle 5: a read is capped before it enters. A search hit is a pointer with enough text to
// judge it; log_read on its seq gives the whole event.
const HIT_CHARS = 1200;
const clipStrings = (v: unknown): unknown => {
  if (typeof v === "string") return v.length <= HIT_CHARS ? v : `${v.slice(0, HIT_CHARS - 1)}…`;
  if (Array.isArray(v)) return v.map(clipStrings);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clipStrings(x)]));
  return v;
};
const hit = (e: LogEvent) => {
  const c = compact(e);
  return { ...c, body: clipStrings(c.body) };
};

export function registerCoreTools(mcp: CoreMcpHub, log: LogStore, tasks: CoreRegistry) {
  const logSearch = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Words to find, any language. Use the distinctive words the person likely used (their own language and terms, names, ids), not a paraphrase.",
      },
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
  mcp.register(
    "partner",
    "log_search",
    "Search the whole Ducter Log (the conversation, from its first day, and every task). Best matches first; each hit has its seq, and log_read from near that seq gives the context.",
    logSearch,
    async (a) => log.search(String(a.query ?? ""), { stream: a.stream, limit: clampLimit(a.limit, 12) }).map(hit),
  );
  mcp.register("partner", "log_read", "Read events from one Log stream in order.", logRead, async (a) =>
    log.read({ stream: String(a.stream), fromSeq: a.fromSeq, limit: clampLimit(a.limit, 50) }).map(compact),
  );

  // A task reads only within its reach (focus-window.md "Pull tools"): its own stream, its
  // persona's channel, and its persona's other tasks. A browser task reads only its own stream
  // (D62), so a hostile page can't pull the conversation out through it.
  const reachOf = (taskId: string | undefined) => {
    const me = taskId ? tasks.get(taskId) : undefined;
    if (!me) throw new Error("log tools need a task");
    const own = taskStream(me.taskId);
    const onlyOwn = me.place.kind === "browser";
    const ok = (e: LogEvent) => {
      if (e.stream === own) return true;
      if (onlyOwn || e.persona !== me.persona) return false;
      if (e.stream === "channel") return true;
      if (!e.stream.startsWith("task:")) return false;
      return tasks.get(e.stream.slice("task:".length))?.persona === me.persona;
    };
    const streamOk = (s: string) => {
      if (s === own) return true;
      if (onlyOwn) return false;
      if (s === "channel") return true;
      return s.startsWith("task:") && tasks.get(s.slice("task:".length))?.persona === me.persona;
    };
    const refuse = (s: string) => new Error(onlyOwn ? `${s} is out of reach: a browser task reads only its own stream (${own}).` : `${s} is out of reach: read ${own}, "channel", or another task of the same person.`);
    return { own, ok, streamOk, refuse };
  };
  mcp.register(
    "task",
    "log_search",
    "Search the Ducter Log within your reach: the conversation, your own task and the other tasks for the same person (a browser task: only its own). Best matches first; each hit has its seq, and log_read from near that seq gives the context.",
    logSearch,
    async (a, ctx) => {
      const r = reachOf(ctx.taskId);
      const stream = a.stream ? String(a.stream) : undefined;
      if (stream && !r.streamOk(stream)) throw r.refuse(stream);
      const limit = clampLimit(a.limit, 12);
      // Search wide, then keep what is in reach (the store has no multi-stream filter).
      const found = log.search(String(a.query ?? ""), { stream: stream ?? (r.streamOk("channel") ? undefined : r.own), limit: stream ? limit : MAX_LIMIT });
      return found.filter(r.ok).slice(0, limit).map(hit);
    },
  );
  mcp.register("task", "log_read", "Read events from one Log stream in order: your own task's, the conversation (\"channel\"), or another task of the same person.", logRead, async (a, ctx) => {
    const r = reachOf(ctx.taskId);
    const stream = String(a.stream);
    if (!r.streamOk(stream)) throw r.refuse(stream);
    return log.read({ stream, fromSeq: a.fromSeq, limit: clampLimit(a.limit, 50) }).filter(r.ok).map(compact);
  });

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
