// Core-owned Ducter MCP tools. Partner and runner register theirs via core.mcp.register.
import type { Bodies, EvidenceRef, LogEvent, Question } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { CoreMcpHub } from "./mcp.ts";
import { taskStream, type CoreRegistry } from "./registry.ts";

const STATES = ["progress", "needs_input", "blocked", "done", "failed"] as const;
const EVIDENCE_KINDS = ["ci", "diff", "file", "url", "log", "test"] as const;
const MAX_LIMIT = 200;

/** Compact form for tool output: drops raw harness payloads. */
const compact = (e: LogEvent) => {
  const body = { ...(e.body as Record<string, unknown>) };
  delete body.raw;
  return { seq: e.seq, ts: e.ts, stream: e.stream, origin: e.origin, kind: e.kind, body, ...(e.supersedes ? { supersedes: e.supersedes } : {}) };
};
const clampLimit = (n: unknown, d: number) => Math.min(MAX_LIMIT, Math.max(1, Number(n) || d));

export function normalizeReport(taskId: string, a: any): Bodies["report"] {
  if (!STATES.includes(a?.state)) throw new Error(`state must be one of ${STATES.join(", ")}`);
  if (typeof a.summary !== "string" || !a.summary.trim()) throw new Error("summary is required");
  const questions: Question[] = (Array.isArray(a.questions) ? a.questions : []).map((q: any, i: number) => {
    const out: Question = {
      id: String(q?.id ?? `q${i + 1}`),
      text: String(q?.text ?? ""),
      blocking: q?.blocking !== false,
      reversible: q?.reversible === true,
    };
    if (typeof q?.default === "string" && q.default.trim()) out.default = q.default.trim();
    return out;
  });
  const evidence: EvidenceRef[] = (Array.isArray(a.evidence) ? a.evidence : [])
    .filter((ev: any) => ev && typeof ev.ref === "string")
    .map((ev: any) => ({ kind: EVIDENCE_KINDS.includes(ev.kind) ? ev.kind : "file", label: String(ev.label ?? ev.ref), ref: ev.ref }));
  return { taskId, state: a.state, summary: a.summary.trim().slice(0, 600), questions, evidence };
}

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

  mcp.register(
    "task",
    "report_to_main",
    "Report to Ducter's main AI. The only way to wake it. Use needs_input with a blocking question (with a default) when you need the user; done with evidence refs when finished.",
    {
      type: "object",
      properties: {
        state: { type: "string", enum: [...STATES] },
        summary: { type: "string", description: "At most 600 characters" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              blocking: { type: "boolean" },
              default: { type: "string", description: "The action taken if the user doesn't answer, e.g. 'Rebase'" },
              reversible: { type: "boolean", description: "The default applies on its own only if reversible" },
            },
            required: ["text"],
          },
        },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: { kind: { type: "string", enum: [...EVIDENCE_KINDS] }, label: { type: "string" }, ref: { type: "string" } },
            required: ["ref"],
          },
        },
      },
      required: ["state", "summary"],
    },
    async (a, ctx) => {
      const taskId = ctx.taskId!;
      const e = log.append({ stream: taskStream(taskId), origin: "task", kind: "report", body: normalizeReport(taskId, a) });
      return { ok: true, seq: e.seq };
    },
  );

  mcp.register(
    "task",
    "checkpoint",
    "Record where the work stands (done, next, open questions) so the task can be resumed or handed off.",
    { type: "object", properties: { text: { type: "string" }, gitRef: { type: "string" } }, required: ["text"] },
    async (a, ctx) => {
      const body: Bodies["checkpoint"] = { taskId: ctx.taskId!, text: String(a.text ?? "") };
      if (a.gitRef) body.gitRef = String(a.gitRef);
      const e = log.append({ stream: taskStream(ctx.taskId!), origin: "task", kind: "checkpoint", body });
      return { ok: true, seq: e.seq };
    },
  );
}
