// Task-role Ducter MCP tools: report_to_main and checkpoint. Core serves them at /mcp; this
// registers the handlers. Call once at wiring time (main.ts) unless core registers its own.
import type { Attention, Bodies, BranchChanges, EvidenceRef, FolderSummary, Question, RememberNote } from "@ducter/protocol";
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
          default: { type: "string", description: "What you will do if nobody answers, as a short verb in the user's language (at most 6 Chinese characters or 3 English words, no full stop): it is the label of the user's Go button, e.g. 继续 / Continue, 先填描述 / Fill in the text." },
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
    remember: {
      type: "array",
      maxItems: 3,
      description: "Final reports only, and only when you learned something durable about the user (a stated preference, a convention they keep, a lasting fact about their work or people). Your partner decides what to keep; you never write to their memory. Never secrets or task plumbing.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, in the user's language" },
          content: { type: "string", description: "One or two self-contained sentences" },
        },
        required: ["title", "content"],
      },
    },
  },
  required: ["state", "summary"],
} as const;

/** D168: a task's remember proposals, capped (3, 80 / 400 chars); empty ones dropped. */
export function normalizeRemember(v: unknown): RememberNote[] {
  if (!Array.isArray(v)) return [];
  const clip = (x: unknown, n: number) => {
    const t = String(x ?? "").replace(/\s+/g, " ").trim();
    return t.length <= n ? t : t.slice(0, n - 1) + "…";
  };
  return v
    .map((r: any) => ({ title: clip(r?.title, 80), content: clip(r?.content, 400) }))
    .filter((r) => r.title && r.content)
    .slice(0, 3);
}

export const checkpointSchema = {
  type: "object",
  properties: {
    text: { type: "string", description: "Where the work stands, what is done, what comes next, open questions." },
    gitRef: { type: "string" },
  },
  required: ["text"],
} as const;

/**
 * A report enters the partner's turn verbatim (partner/src/render.ts) and the Log, so every part of
 * it is bounded, not only the summary (principle 5; research/48 F2). A task that sends more questions
 * or evidence than this is cut to the first ones, which is what a person could act on anyway.
 */
export const REPORT_BOUNDS = { questions: 5, questionText: 500, questionDefault: 200, id: 40, evidence: 12, label: 120, ref: 300 } as const;
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

export function normalizeReport(taskId: string, args: any): Bodies["report"] {
  const state = STATES.includes(args?.state) ? (args.state as Bodies["report"]["state"]) : "progress";
  let summary = String(args?.summary ?? "").trim();
  if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX - 1) + "…";
  const B = REPORT_BOUNDS;
  const questions: Question[] = Array.isArray(args?.questions)
    ? args.questions.slice(0, B.questions).map((q: any, i: number) => ({
        id: cut(String(q?.id ?? `q${i + 1}`), B.id),
        text: cut(String(q?.text ?? ""), B.questionText),
        blocking: Boolean(q?.blocking),
        default: q?.default != null ? cut(String(q.default), B.questionDefault) : undefined,
        reversible: Boolean(q?.reversible),
      }))
    : [];
  const evidence: EvidenceRef[] = Array.isArray(args?.evidence)
    ? args.evidence.slice(0, B.evidence).map((e: any) => ({
        kind: EVIDENCE_KINDS.includes(e?.kind) ? e.kind : "log",
        label: cut(String(e?.label ?? ""), B.label),
        ref: cut(String(e?.ref ?? ""), B.ref),
        // never the task's own `check`: only Ducter sets it
      }))
    : [];
  const remember = normalizeRemember(args?.remember);
  return { taskId, state, summary, questions, evidence, ...(remember.length ? { remember } : {}) };
}

export interface TaskToolOptions {
  /** What the task's branch holds that its base doesn't, checked when a done or failed report
   *  lands (the runner's branchChanges). Clients offer Merge / Open draft PR only when it has some. */
  branchChanges?(taskId: string): Promise<BranchChanges | undefined>;
  /** A done report's evidence with `check` set where Ducter can check it (the runner's
   *  checkEvidence): a commit on the task branch, a file in its place. */
  checkEvidence?(taskId: string, evidence: EvidenceRef[]): Promise<EvidenceRef[] | undefined>;
  /** D142: a non-git folder task's changes and until when they can be undone (the runner's
   *  folderReport, which also starts the copy's 7 days). The partner's result says it. */
  folderChanges?(taskId: string): Promise<FolderSummary | undefined>;
}

/** The branch check must never hold a report up: past this it is left unknown. */
const BRANCH_CHECK_MS = 3_000;

async function inTime<T>(p: Promise<T | undefined>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), BRANCH_CHECK_MS)));
  try {
    return await Promise.race([p.catch(() => undefined), late]);
  } finally {
    clearTimeout(timer);
  }
}

async function branchOf(opts: TaskToolOptions, taskId: string): Promise<BranchChanges | undefined> {
  return opts.branchChanges ? inTime(opts.branchChanges(taskId)) : undefined;
}

export function registerTaskTools(core: CoreApi, opts: TaskToolOptions = {}): void {
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
      if (body.state === "done" || body.state === "failed") {
        const branch = await branchOf(opts, ctx.taskId);
        if (branch) body.branch = branch;
        const folder = opts.folderChanges ? await inTime(opts.folderChanges(ctx.taskId)) : undefined;
        if (folder) body.folder = folder;
      }
      // The mechanical check of done? -> done; a check that can't finish in time leaves refs unchecked.
      if (body.state === "done" && body.evidence.length && opts.checkEvidence) {
        const checked = await inTime(opts.checkEvidence(ctx.taskId, body.evidence));
        if (checked?.length === body.evidence.length) body.evidence = checked;
      }
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
