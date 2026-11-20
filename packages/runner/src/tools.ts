// Task-role Ducter MCP tools: report_to_main and checkpoint. Core serves them at /mcp; this
// registers the handlers. Call once at wiring time (main.ts) unless core registers its own.
import { ASK_NOTE_MAX, ASKS_MAX, MEDIA_LIMITS, type AskReport, type Attention, type Bodies, type BranchChanges, type EvidenceRef, type FolderSummary, type MediaRef, type Question, type RememberNote } from "@ducter/protocol";
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
    // D349: the bar itself is in the brief (the task tools' budget is tight).
    summary: { type: "string", maxLength: SUMMARY_MAX, description: "For the user, result first. At most 600 characters." },
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
    asks: {
      type: "array",
      description: "Only when your brief lists the things asked: each one's state, in that order, with a short note of what came of it.",
      items: {
        type: "object",
        properties: { state: { type: "string", enum: STATES }, note: { type: "string" } },
        required: ["state"],
      },
    },
    show: {
      type: "array",
      maxItems: MEDIA_LIMITS.perReport,
      description:
        "Files the user should see with this report, as paths: a screenshot that shows the result, a picture you generated or drew, a file you made for them. They appear in the conversation. Only what shows the outcome or what they asked to see, never everything you read or tried. Paths in your working folder, your evidence folder, or where your image tool saved a picture.",
      items: { type: "string" },
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
    text: { type: "string", description: "Your own note: where the work stands, what comes next, open questions." },
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

/**
 * research/124: a small model sometimes writes the rest of its tool call into the summary string:
 * `…done.</summary>\n<parameter name="evidence">[…]`. The summary ends at the leak, and a leaked
 * argument the call didn't also pass properly (evidence, questions, remember) is taken from it when
 * it is valid JSON; anything else in the leak is dropped.
 */
export function unleakReport(args: any): any {
  const raw = typeof args?.summary === "string" ? args.summary : undefined;
  const at = raw ? raw.search(/<\/summary>|<parameter name="/) : -1;
  if (!raw || at < 0) return args;
  const out = { ...args, summary: raw.slice(0, at) };
  for (const m of raw.slice(at).matchAll(/<parameter name="(\w+)">([\s\S]*?)(?=<\/parameter>|<parameter name="|$)/g)) {
    const [, name, value] = m;
    if (!["evidence", "questions", "remember"].includes(name!) || (Array.isArray(out[name!]) && out[name!].length)) continue;
    try {
      const v = JSON.parse(value!.trim());
      if (Array.isArray(v)) out[name!] = v;
    } catch {
      /* not JSON: dropped */
    }
  }
  return out;
}

export function normalizeReport(taskId: string, raw: any): Bodies["report"] {
  const args = unleakReport(raw);
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
  // D426: its word on each of the things asked, in the brief's order.
  const asks: AskReport[] = Array.isArray(args?.asks)
    ? args.asks.slice(0, ASKS_MAX).map((a: any) => ({ state: (STATES as readonly string[]).includes(a?.state) ? a.state : state, ...(a?.note ? { note: cut(String(a.note), ASK_NOTE_MAX) } : {}) }))
    : [];
  return { taskId, state, summary, questions, evidence, ...(remember.length ? { remember } : {}), ...(asks.length ? { asks } : {}) };
}

/** D206: the paths a report shows, cut to the limit; empty ones dropped. */
export function normalizeShow(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const paths = v.map((x) => (typeof x === "string" ? x : typeof x?.path === "string" ? x.path : "").trim()).filter((p) => p && p.length <= 1024);
  return [...new Set(paths)].slice(0, MEDIA_LIMITS.perReport);
}

export interface TaskToolOptions {
  /** D439: a document the report shows is checked page by page (core's doc-check.ts): words back
   *  to the task once instead of reporting, else what is still so (and the media paired: an Office
   *  file with its PDF). Absent: every report as it is. */
  docCheck?(taskId: string, body: Bodies["report"]): Promise<{ again?: string; doc?: Bodies["report"]["doc"]; media?: MediaRef[] } | undefined>;
  /** D437: another AI's one look before a result goes out (core's second-look.ts): true when it
   *  took the report (it logs it itself, now or after the task's fix). Absent: every report as it is. */
  secondLook?: { take(taskId: string, body: Bodies["report"]): boolean; readonly heldWords: string };
  /** D206: copies the files a report shows into the home's media store (the runner's shown):
   *  what could be shown, and a line for each that couldn't. */
  shown?(taskId: string, paths: string[]): Promise<{ media: MediaRef[]; refused: string[] } | undefined>;
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

/**
 * D349: the runs in a summary that read as a task's own notes, not as words for a person: Latin
 * letters and digits glued in turns ("5requests4mentions", "16checks15success1preuninstallrunning",
 * "1307exec1304pass3skip"). Seen live on a Codex watcher whose checkpoints, then reports, became a
 * ledger. A hash, a version, a path, a URL or an identifier (with _ - . / :) is never one, nor a
 * short name like "Round58", "P2", "H264" or "iPhone15".
 */
export function gluedRuns(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/[A-Za-z0-9_./:#@+-]+/g)) {
    const w = m[0];
    if (w.length < 10 || /[_./:#@-]/.test(w)) continue;
    if (/^[0-9a-f]+$/i.test(w)) continue; // a hash or a hex number
    const groups = w.match(/[A-Za-z]+|[0-9]+/g) ?? [];
    if (groups.length >= 4 || (groups.length === 3 && /^\d/.test(w))) out.push(w);
  }
  return out;
}

/** Notes, not words: two glued runs or more (one could be a model name). */
export const crammed = (summary: string) => gluedRuns(summary).length >= 2;

/** Words as compared for "the same report": no spacing, punctuation or case. */
const flatWords = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

/** Near-identical: the same words, or character pairs that overlap by 85% or more (Dice). */
export function nearlySame(a: string, b: string): boolean {
  const x = flatWords(a);
  const y = flatWords(b);
  if (x === y) return true;
  if (x.length < 2 || y.length < 2) return false;
  const pairs = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const px = pairs(x);
  const py = pairs(y);
  let both = 0;
  for (const [k, n] of px) both += Math.min(n, py.get(k) ?? 0);
  return (2 * both) / (x.length - 1 + (y.length - 1)) >= 0.85;
}

/**
 * D339: a blocked or failed report that says what the task's last report said, with nothing from
 * the person in the task since (no message of theirs). Questions, pictures and evidence make it new.
 */
export function sameWaitAgain(core: CoreApi, taskId: string, body: Bodies["report"]): boolean {
  if (body.state !== "blocked" && body.state !== "failed") return false;
  if (body.questions?.length || body.media?.length || body.evidence?.length) return false;
  const evs = core.log.read({ stream: `task:${taskId}`, kinds: ["report", "task_event"], limit: 400 });
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i]!;
    if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      if (b.role === "user" && b.from === "user") return false;
      continue;
    }
    const r = e.body as Bodies["report"];
    return r.state === body.state && !r.questions?.length && nearlySame(r.summary ?? "", body.summary ?? "");
  }
  return false;
}

export function registerTaskTools(core: CoreApi, opts: TaskToolOptions = {}): void {
  // D349: tasks already asked once to write a crammed summary again; the second one goes as it is.
  const askedPlain = new Set<string>();
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
      // D349: a summary that reads as the task's own notes goes back once, before anything is kept.
      if (crammed(body.summary) && !askedPlain.has(ctx.taskId)) {
        askedPlain.add(ctx.taskId);
        const runs = gluedRuns(body.summary).slice(0, 3).join(", ");
        return `Not sent yet: this summary reads as your own notes (${runs}), and the user reads it as it is. Call report_to_main again with the same state, written for them in their language: the result in one plain sentence, then at most a few short lines, ordinary spacing, numbers with their units, and none of your own counters, round numbers or ids.`;
      }
      const persona = core.tasks.get(ctx.taskId)?.persona;
      if (body.state === "done" || body.state === "failed") {
        const branch = await branchOf(opts, ctx.taskId);
        if (branch) body.branch = branch;
        const folder = opts.folderChanges ? await inTime(opts.folderChanges(ctx.taskId)) : undefined;
        if (folder) body.folder = folder;
      }
      // D206: what the task shows the user, copied in before the report is logged (the Log keeps refs).
      const show = normalizeShow(args?.show);
      let refused: string[] = [];
      if (show.length && opts.shown) {
        const r = await opts.shown(ctx.taskId, show).catch((err) => ({ media: [] as MediaRef[], refused: [String((err as Error)?.message ?? err)] }));
        if (r?.media.length) body.media = r.media;
        refused = r?.refused ?? [];
      }
      // D439: a document to send is checked page by page before the user sees it; what it finds goes
      // back to the task once (it fixes it in this turn), what is still so after that rides on the report.
      if (body.media?.length && opts.docCheck) {
        const dc = await opts.docCheck(ctx.taskId, body).catch(() => undefined);
        if (dc?.media) body.media = dc.media;
        if (dc?.again) return dc.again + (refused.length ? ` Not shown: ${refused.join("; ")}.` : "");
        if (dc?.doc) body.doc = dc.doc;
      }
      // The mechanical check of done? -> done; a check that can't finish in time leaves refs unchecked.
      if (body.state === "done" && body.evidence.length && opts.checkEvidence) {
        const checked = await inTime(opts.checkEvidence(ctx.taskId, body.evidence));
        if (checked?.length === body.evidence.length) body.evidence = checked;
      }
      const card = core.tasks.get(ctx.taskId);
      // D339: the same wait said again, with no word from the person since, is not a new report: on
      // hel a phone task said 在等 three times in a row after a Stop (once per note it was told).
      if (sameWaitAgain(core, ctx.taskId, body)) {
        core.tasks.setState(ctx.taskId, ATTENTION[body.state], card?.residency ?? "hot");
        return "Already reported: this says the same as your last report, and the user hasn't written since, so nothing new was sent to them. End your turn now; any answer will arrive as a new message.";
      }
      // D437: a result that changed code, or something a Go would send, is read once by another AI first.
      if (opts.secondLook?.take(ctx.taskId, body)) {
        const notShown = refused.length ? ` Not shown: ${refused.join("; ")}.` : "";
        return `${opts.secondLook.heldWords}${notShown}`;
      }
      core.log.append({ persona, stream: `task:${ctx.taskId}`, origin: "task", kind: "report", body });
      // No reason text: task_state.reason is user-facing copy (decisions.ts sets blocked/failed ones).
      core.tasks.setState(ctx.taskId, ATTENTION[body.state], card?.residency ?? "hot");
      const notShown = refused.length ? ` Not shown: ${refused.join("; ")}.` : "";
      return body.state === "progress"
        ? `Reported.${notShown} Keep working.`
        : `Reported.${notShown} End your turn now; any answer will arrive as a new message.`;
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
