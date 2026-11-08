// Task-role Ducter MCP tools: report_to_main and checkpoint. Core serves them at /mcp; this
// registers the handlers. Call once at wiring time (main.ts) unless core registers its own.
import type { Attention, Bodies, EvidenceRef, Question } from "@ducter/protocol";
import type { CoreApi } from "@ducter/protocol/src/internal.ts";

const SUMMARY_MAX = 600;
const STATES = ["progress", "needs_input", "blocked", "done", "failed"] as const;
const EVIDENCE_KINDS = ["ci", "diff", "file", "url", "log", "test"] as const;

const ATTENTION: Record<Bodies["report"]["state"], Attention> = {
  progress: "working",
  needs_input: "needs_you",
  blocked: "blocked",
  done: "done_claimed",
  failed: "failed",
};

export const reportToMainSchema = {
  type: "object",
  properties: {
    state: { type: "string", enum: STATES, description: "progress | needs_input | blocked | done | failed" },
    summary: { type: "string", maxLength: SUMMARY_MAX, description: "At most 600 characters: what you did and what stands." },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          blocking: { type: "boolean" },
          default: { type: "string", description: "What you will do if nobody answers." },
          reversible: { type: "boolean", description: "Whether the default can be undone." },
        },
        required: ["id", "text", "blocking", "reversible"],
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: EVIDENCE_KINDS },
          label: { type: "string" },
          ref: { type: "string" },
        },
        required: ["kind", "label", "ref"],
      },
    },
  },
  required: ["state", "summary"],
} as const;

export const checkpointSchema = {
  type: "object",
  properties: {
    text: { type: "string", description: "Where the work stands, what is done, what comes next, open questions." },
    gitRef: { type: "string" },
  },
  required: ["text"],
} as const;

export function normalizeReport(taskId: string, args: any): Bodies["report"] {
  const state = STATES.includes(args?.state) ? (args.state as Bodies["report"]["state"]) : "progress";
  let summary = String(args?.summary ?? "").trim();
  if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX - 1) + "…";
  const questions: Question[] = Array.isArray(args?.questions)
    ? args.questions.map((q: any, i: number) => ({
        id: String(q?.id ?? `q${i + 1}`),
        text: String(q?.text ?? ""),
        blocking: Boolean(q?.blocking),
        default: q?.default != null ? String(q.default) : undefined,
        reversible: Boolean(q?.reversible),
      }))
    : [];
  const evidence: EvidenceRef[] = Array.isArray(args?.evidence)
    ? args.evidence.map((e: any) => ({
        kind: EVIDENCE_KINDS.includes(e?.kind) ? e.kind : "log",
        label: String(e?.label ?? ""),
        ref: String(e?.ref ?? ""),
      }))
    : [];
  return { taskId, state, summary, questions, evidence };
}

export function registerTaskTools(core: CoreApi): void {
  core.mcp.register(
    "task",
    "report_to_main",
    "Report to Ducter (the user's partner): when done, failed, blocked, or needing a decision. The only way to reach the user.",
    reportToMainSchema,
    async (args, ctx) => {
      if (!ctx.taskId) throw new Error("report_to_main requires a task token");
      const body = normalizeReport(ctx.taskId, args);
      const open = core.tasks.get(ctx.taskId)?.pendingDecision;
      if (open && body.state === "done") {
        // Live (desktop run): a task reported done before the user answered its own question,
        // so a later Go re-woke a finished task. Its question has to be answered first.
        throw new Error(
          `Your question "${open.question}" is still open: the user hasn't answered it. Don't report done yet. End your turn now; the answer will arrive as a message.`,
        );
      }
      const persona = core.tasks.get(ctx.taskId)?.persona;
      core.log.append({ persona, stream: `task:${ctx.taskId}`, origin: "task", kind: "report", body });
      const card = core.tasks.get(ctx.taskId);
      // No reason text: task_state.reason is user-facing copy (decisions.ts sets blocked/failed ones).
      core.tasks.setState(ctx.taskId, ATTENTION[body.state], card?.residency ?? "hot");
      return body.state === "progress"
        ? "Reported. Keep working."
        : "Reported. End your turn now; any answer will arrive as a new message.";
    },
  );
  core.mcp.register("task", "checkpoint", "Record where the work stands after a meaningful step.", checkpointSchema, async (args, ctx) => {
    if (!ctx.taskId) throw new Error("checkpoint requires a task token");
    const persona = core.tasks.get(ctx.taskId)?.persona;
    core.log.append({
      persona,
      stream: `task:${ctx.taskId}`,
      origin: "task",
      kind: "checkpoint",
      body: { taskId: ctx.taskId, text: String(args?.text ?? "").slice(0, 4000), gitRef: args?.gitRef ? String(args.gitRef) : undefined },
    });
    return "Checkpoint saved.";
  });
}
