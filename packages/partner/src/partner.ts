// The partner (main AI): one Claude Code session behind runner.harness, fed by core triggers.
//
// Turn loop (principle 6)
//   onTrigger() never blocks: it dedupes by seq, applies immediate side effects (job_status
//   done/failed on a task's final report), and queues the event. One turn runs at a time;
//   everything that arrived while a turn ran is coalesced into the next turn's input as
//   origin-tagged L4 lines ("[user] …", "[task <id> report: done] …", …).
//
// Ack protocol (the clean approach chosen tonight)
//   Assistant text is held as `pending` until the next harness event shows what follows it:
//     - a task_open (seen either as the tool event in the stream, or as the MCP call reaching
//       our handler, whichever comes first) turns `pending` into an `ack` with a fresh jobId;
//     - anything else (more text, another tool, turn end) flushes it as an `ai_msg`.
//   The ack is appended BEFORE runner.openTask runs, so it shows in ~the time the model takes
//   to write it. jobId is a partner-generated id ("job_…"), not the task id: the ack exists
//   before the task does. The job_status events (running/done/failed) carry both jobId and
//   taskId, which is how clients and the partner bind the two. If the model calls task_open
//   without writing a line first, a short localized ack is generated from the title.
//
// Session / expiry (principle 4, simplified)
//   Warm (idle ≤ 55 min): keep the live session, or resume it by id after a restart.
//   Cold: start a fresh session whose first input is the projection (last N channel events +
//   tasks) followed by the turn's deltas. Never any "you were reset" text (research/13).
//
// wait_until (tonight: timers only)
//   `at` set: appends `waiter {state:"armed"}` on the channel. Core owns the timer (it is
//   rebuilt from the Log after a restart), appends `waiter {state:"fired"}` when due, and
//   that event triggers us; it renders as "[timer fired] <reason>". `taskId` without `at` is
//   a no-op: the task's next report already wakes the partner.
//
// Memory (Nowledge Mem, see memory.ts)
//   memory_search: at most one recall per turn unless the user asks to look again; results are
//   background for the model, never pasted. memory_add: durable things only (secret- and
//   plumbing-shaped text is refused), at most two per turn, provenance = persona + the Log seq
//   of the user's message (+ task id). Each saved memory appends `memory_noted` on the channel
//   after the turn's text, which clients show as one quiet line ("记下了 · <title>").
//   Mem missing or down: the tools say so and the partner carries on.
//
// Restart
//   state.json keeps the session id, last activity, and the highest trigger seq a finished
//   turn covered. On start, triggers after that seq (a turn cut off by the restart, or events
//   that arrived while down) are queued again; user messages that already got a reply are not.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent, Place } from "../../protocol/src/index.ts";
import type { CoreApi, HarnessEvent, HarnessSession, Partner, Runner } from "../../protocol/src/internal.ts";
import { createNmemClient, noMemory, type MemoryClient } from "./memory.ts";
import { buildSystemPrompt } from "./persona.ts";
import { realFs, resolvePlace, type PlaceFs } from "./place.ts";
import { isChinese, renderProjection, renderTime, renderTrigger, type RenderCtx } from "./render.ts";

export interface PartnerOptions {
  now?: () => number;
  idleColdMs?: number; // default 55 min
  historyLimit?: number; // channel events in a cold seed, default 40
  model?: string; // default env DUCTER_PARTNER_MODEL or "opus"
  turnTimeoutMs?: number; // max silence inside a turn before interrupting, default 10 min
  fs?: PlaceFs;
  persistState?: boolean; // write <dataDir>/partner/state.json, default true
  ackWaitMs?: number; // how long the task_open handler waits for the streamed ack text, default 250
  settleMs?: number; // a turn woken only by reports/timers waits this long for more, default 1500
  onError?: (err: unknown) => void;
  prewarm?: boolean; // start/resume the session at creation, default true
  ready?: Promise<unknown>; // sessions start after this settles (e.g. L1 identity from Mem)
  memory?: MemoryClient; // default: the nmem CLI (DUCTER_MEMORY=off: none); tests inject a fake
}

export interface PartnerHandle extends Partner {
  /** Resolves when the queue is empty and no turn is running. */
  idle(): Promise<void>;
  close(): Promise<void>;
  /** For tests and diagnostics. */
  readonly stats: { turns: number; freshStarts: number; resumes: number; sessionId?: string };
}

interface TurnState {
  triggers: LogEvent[];
  userTexts: string[];
  replyTo?: number;
  pending: string | null;
  unboundAck: { jobId: string } | null;
  // task_open calls seen in the stream vs. handled by the MCP handler. Stream events can lag
  // the MCP call; a stream event for a call the handler already acked must not ack again.
  opensSeen: number;
  opensHandled: number;
  acked?: boolean; // an ack went out this turn
  asked?: boolean; // the partner made a decision card (ask) this turn
  askedId?: string; // the last decision it made this turn
  quiet?: boolean; // woken only by task questions the user already sees as decision cards
  results?: number; // done reports in this turn (several = one combined message)
  zh: boolean;
  recalls: number; // memory_search calls this turn
  noted: { title: string; memoryId?: string }[]; // memory_add successes, shown after the turn's text
  carried?: Carried; // this turn redoes one a restart cut off
}

interface Job {
  jobId: string;
  title: string;
  replyTo?: number;
  state?: Bodies["job_status"]["state"]; // last job_status appended
}

const COLD_MS = 55 * 60 * 1000;
const TASK_OPEN_RE = /(^|__)task_open$/;
const TASK_SEND_RE = /(^|__)task_send$/;
const QUIET_TOOL_RE = /(^ToolSearch$)|((^|__)(log_search|log_read|task_read|memory_search|memory_add|task_retitle)$)/;

/** The user asks to look harder, which lifts the one-recall-per-turn gate. */
const ASKS_RECALL = /(再|多|仔细|好好)(查|找|搜|想想|翻)|翻翻|想不起|look (again|harder)|search (again|more)|\bdig\b|check (your )?memory|do you remember|还记得/i;
/** Task plumbing never goes to Mem: ids, branches, worktrees, commits (a hex run with a digit). */
const PLUMBING_RE = /\/worktrees\/|\.ducter\/|\bjob_[a-z0-9]{6,}|\bducter\/[a-z0-9][a-z0-9-]*|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/i;

/** Same rule as core's triggersPartner (principle 6). */
function isTrigger(e: LogEvent): boolean {
  if (e.origin === "partner") return false;
  if (e.kind === "user_msg" || e.kind === "decision_resolved") return true;
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress";
  if (e.kind === "waiter") return (e.body as Bodies["waiter"]).state === "fired";
  return false;
}

/** Prose that tells the user to pick Go / Hold (only true when a decision event exists). */
const CLAIMS_CHOICE = /(选|点|按|回复?|回)\s*[「“"]?\s*(Go|Hold|好|先等等)\b|\b(tap|press|choose|pick|select|reply|hit|say)\s+["“]?(Go|Hold)\b|\bGo\s*\/\s*Hold\b/i;

/**
 * Secret-shaped strings never reach a task (G-safety G3): the user's words are copied into the
 * brief verbatim, so a pasted key would land in the task's prompt, transcript and Log.
 */
const SECRET_RE =
  /\b(sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
export function redactSecrets(text: string): string {
  return text.replace(SECRET_RE, "[secret removed: the user pasted it in the conversation; use a placeholder and let the user fill it in]");
}

const RESULT_PLUMBING = /分支|branch|合并|合回|merge|冲突|conflict|提交|commit|\b[0-9a-f]{7,}\b|\d+\s*\/\s*\d+|\d+\s*个测试|测试(都|全)?(通过|过了)|^\s*(全部|都)(通过|过了)\s*$|\b\d+\s+tests?\b|tests? pass|\ball pass|\bpassing\b|src\/|\.ts\b|对外|outside|推送|push/i;
/** Drops the clauses of a combined result that repeat evidence or plumbing; keeps the rest. */
export function stripResultPlumbing(text: string): string {
  const out = text
    .split(/(?<=[。！？!?\n]|\.\s)/)
    .map((sentence) => {
      const end = /[。！？!?.\s]+$/.exec(sentence)?.[0] ?? "";
      const body = sentence.slice(0, sentence.length - end.length);
      const kept = body.split(/[，,；;]\s*/).filter((c) => c.trim() && !RESULT_PLUMBING.test(c));
      if (!kept.length) return "";
      const sep = /[\u4e00-\u9fff]/.test(body) ? "，" : ", ";
      return kept.join(sep) + (end || "");
    })
    .join("")
    .trim();
  return out || text;
}

function stripDefault(q: string): string {
  const out = q
    .replace(/\s*[（(]\s*(默认|default)[^)）]*[)）]/gi, "")
    .replace(/\s*(默认|default)\s*[:：][^。.!?！？\n]*[。.]?/gi, "")
    .trim();
  return out || q.trim();
}

/** What a turn cut off by a restart had already done, from the Log after it started. */
interface Carried {
  seqs: Set<number>; // its triggers
  tasks: { taskId: string; title: string; jobId?: string; unbound?: boolean }[];
  waits: Set<string>; // wait_until reasons
  asks: Map<string, string>; // ask question -> its decisionId
  said: Set<string>; // ai_msg / ack texts
  note: string; // rendered for the model
}

export function carriedFrom(log: CoreApi["log"], inflight: { seqs: number[]; from: number }): Carried | undefined {
  const evs = log.read({ stream: "channel", fromSeq: inflight.from + 1, limit: 2000 });
  const c: Carried = { seqs: new Set(inflight.seqs), tasks: [], waits: new Set(), asks: new Map(), said: new Set(), note: "" };
  for (const e of evs) {
    if (e.kind === "job_status" && e.origin === "partner") {
      const b = e.body as Bodies["job_status"];
      if (b.state === "running" && b.taskId) c.tasks.push({ taskId: b.taskId, title: b.text });
    } else if (e.kind === "waiter" && (e.body as Bodies["waiter"]).state === "armed") c.waits.add((e.body as Bodies["waiter"]).reason);
    else if (e.kind === "decision" && e.origin === "partner") c.asks.set((e.body as Bodies["decision"]).question, (e.body as Bodies["decision"]).decisionId);
    else if ((e.kind === "ai_msg" || e.kind === "ack") && e.origin === "partner") c.said.add((e.body as { text: string }).text.trim());
  }
  // A task whose task_open is in the Log but whose job_status isn't (the process died inside
  // runner.openTask, soak): it exists and will start; bind it to its ack when handed back.
  for (const e of log.read({ fromSeq: inflight.from + 1, limit: 2000, kinds: ["task_open"] })) {
    const b = e.body as Bodies["task_open"];
    if (c.tasks.some((t) => t.taskId === b.taskId)) continue;
    const ack = evs.find((x) => x.kind === "ack" && x.origin === "partner" && (x.body as Bodies["ack"]).text.includes(b.title));
    c.tasks.push({ taskId: b.taskId, title: b.title, unbound: true, ...(ack ? { jobId: (ack.body as Bodies["ack"]).jobId } : {}) });
  }
  const done = [
    ...c.tasks.map((t) => `opened task ${t.taskId} "${t.title}"`),
    ...[...c.waits].map((r) => `set a timer "${r}"`),
    ...[...c.asks.keys()].map((q) => `asked "${q}"`),
    ...[...c.said].map((t) => `said "${t.length > 160 ? t.slice(0, 159) + "…" : t}"`),
  ];
  if (!done.length) return { ...c, note: "" };
  c.note = `[note] Your last turn on the lines below was cut off before it finished. It had already ${done.join("; ")}. Don't do those again; do only what is left.`;
  return c;
}

/** A task the carried turn opened with this title (taken: it is handed back once). */
function carriedTask(c: Carried, title: unknown, take: boolean): Carried["tasks"][number] | undefined {
  if (typeof title !== "string") return undefined;
  const i = c.tasks.findIndex((t) => t.title === title.trim());
  if (i < 0) return undefined;
  return take ? c.tasks.splice(i, 1)[0] : c.tasks[i];
}

const generatedAck = (zh: boolean, title: string) => (zh ? `好，我去做：${title}` : `On it: ${title}`);

let idCounter = 0;
function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createPartner(core: CoreApi, runner: Runner, opts: PartnerOptions = {}): PartnerHandle {
  const now = opts.now ?? (() => Date.now());
  const idleColdMs = opts.idleColdMs ?? COLD_MS;
  const historyLimit = opts.historyLimit ?? 40;
  const model = opts.model ?? process.env.DUCTER_PARTNER_MODEL ?? "opus";
  const turnTimeoutMs = opts.turnTimeoutMs ?? 10 * 60 * 1000;
  const fs = opts.fs ?? realFs;
  const persist = opts.persistState ?? true;
  const ackWaitMs = opts.ackWaitMs ?? 250;
  const settleMs = opts.settleMs ?? 1500;
  const onError = opts.onError ?? ((err) => console.error("[partner]", err));
  const memory = opts.memory ?? (process.env.DUCTER_MEMORY === "off" ? noMemory : createNmemClient());

  const cwd = join(core.dataDir, "partner");
  const stateFile = join(cwd, "state.json");
  try {
    mkdirSync(cwd, { recursive: true });
  } catch (err) {
    onError(err);
  }

  // ---------- state ----------
  const queue: LogEvent[] = [];
  const seen = new Set<number>();
  let running: Promise<void> | null = null;
  let closed = false;
  let session: HarnessSession | null = null;
  let iter: AsyncIterator<HarnessEvent> | null = null;
  let lastActivity = 0;
  let lastSessionId: string | undefined;
  // Hash of the system prompt the last session was started with. A session started under a
  // different persona (an upgrade, a rename, the identity arriving) is not resumed: its history
  // speaks in the old voice and its cache is gone anyway (live: 您 and branch talk survived a
  // persona fix because the partner resumed yesterday's session).
  let lastPromptHash: string | undefined;
  const promptHash = () => String(Bun.hash(buildSystemPrompt(core.persona)));
  const canResume = () => !!lastSessionId && lastPromptHash === promptHash();
  let handledSeq: number | undefined; // highest trigger seq covered by a finished turn
  // The turn in flight: its trigger seqs and the Log head when it started (state.json). A turn
  // cut off by a restart is run again with all of its triggers, and what it already did is
  // carried over so it is not done twice (soak: two messages shared a turn, the first one's task
  // was opened, the process died; on restart the first was opened again and the second dropped).
  let inflight: { seqs: number[]; from: number } | undefined;
  let carried: Carried | undefined; // what a cut-off turn already did, for the turn that redoes it
  let requeuing = false; // queueing the triggers a restart left over
  let turn: TurnState | null = null;
  let warming: Promise<void> | null = null; // pre-start of the session at boot
  let unseeded = false; // the live session was started fresh and has not had its seed yet
  const jobs = new Map<string, Job>(); // taskId -> job
  const stats: PartnerHandle["stats"] = { turns: 0, freshStarts: 0, resumes: 0 };

  if (persist) {
    try {
      const s = JSON.parse(readFileSync(stateFile, "utf8")) as { sessionId?: string; lastActivity?: number; handledSeq?: number; promptHash?: string; inflight?: { seqs: number[]; from: number } };
      inflight = s.inflight;
      lastSessionId = s.sessionId;
      lastPromptHash = s.promptHash;
      lastActivity = s.lastActivity ?? 0;
      handledSeq = s.handledSeq;
    } catch {
      /* first run */
    }
  }
  const saveState = () => {
    if (!persist) return;
    try {
      writeFileSync(stateFile, JSON.stringify({ sessionId: lastSessionId, lastActivity, handledSeq, promptHash: lastPromptHash, ...(inflight ? { inflight } : {}) }));
    } catch (err) {
      onError(err);
    }
  };

  // Rebuild taskId -> job from the Log, so reports after a restart still close their job.
  try {
    const acks = new Map<string, number>();
    for (const e of core.log.read({ stream: "channel", kinds: ["ack"], limit: 500 })) {
      const b = e.body as Bodies["ack"];
      acks.set(b.jobId, b.replyTo);
    }
    for (const e of core.log.read({ stream: "channel", kinds: ["job_status"], limit: 500 })) {
      const b = e.body as Bodies["job_status"];
      if (e.origin !== "partner" || !b.taskId) continue;
      if (!jobs.has(b.taskId)) jobs.set(b.taskId, { jobId: b.jobId, title: b.text, replyTo: acks.get(b.jobId) });
      const j = jobs.get(b.taskId)!;
      if (j.jobId === b.jobId) j.state = b.state;
    }
  } catch (err) {
    onError(err);
  }

  const ctx: RenderCtx = {
    taskTitle: (id) => core.tasks.get(id)?.title ?? jobs.get(id)?.title,
    merged: (id) =>
      core.log
        .read({ stream: "channel", kinds: ["job_status"], limit: 500 })
        .some((e) => e.origin === "user" && (e.body as Bodies["job_status"]).taskId === id && /\bmerged\b/.test((e.body as Bodies["job_status"]).text)),
    taskBase: (id) => {
      const p = core.tasks.get(id)?.place;
      return p?.kind === "repo" ? p.baseBranch : undefined;
    },
    decision: (decisionId) => {
      const evs = core.log.read({ stream: "channel", kinds: ["decision"], limit: 500 });
      for (let i = evs.length - 1; i >= 0; i--) {
        const d = evs[i]!.body as Bodies["decision"];
        if (d.decisionId === decisionId) return d;
      }
      return undefined;
    },
  };

  // ---------- channel output ----------
  const appendAiMsg = (text: string) => {
    const t = text.trim();
    if (!t) return;
    // Said already in the cut-off turn this one redoes: once is enough.
    if (turn?.carried && turn.carried.said.delete(t)) return;
    if (CLAIMS_CHOICE.test(t) && !openDecisionExists()) {
      // Honesty guard (live: "选 Go 就保留" with no decision anywhere). The words are already
      // the model's; make them true right away or have it take them back, in a follow-up turn.
      corrections.push(t);
    }
    core.log.append({
      stream: "channel",
      origin: "partner",
      kind: "ai_msg",
      body: turn?.replyTo !== undefined ? { text: t, replyTo: turn.replyTo } : { text: t },
    });
  };
  const corrections: string[] = [];
  const openDecisionExists = () => {
    const evs = core.log.read({ stream: "channel", kinds: ["decision", "decision_resolved"], limit: 500 });
    const done = new Set(evs.filter((e) => e.kind === "decision_resolved").map((e) => (e.body as Bodies["decision_resolved"]).decisionId));
    return evs.some((e) => e.kind === "decision" && !done.has((e.body as Bodies["decision"]).decisionId));
  };
  let syntheticSeq = 0;
  const queueCorrections = () => {
    if (!corrections.length) return;
    const said = corrections.splice(0).join(" / ");
    queue.push({
      seq: --syntheticSeq, // never in the Log
      ts: new Date(now()).toISOString(),
      persona: core.persona.id,
      stream: "channel",
      origin: "system",
      kind: "ai_msg",
      body: { text: `You told the user they have a Go / Hold choice ("${said.slice(0, 300)}"), but no such choice exists, so they see no buttons. Call ask now with that question and its default, without repeating it in text. If no choice is really needed, say in one short line what you will do instead.` },
    });
  };
  const replyToFor = (t: TurnState) => t.replyTo ?? t.triggers[t.triggers.length - 1]?.seq ?? core.log.head();
  const appendAck = (t: TurnState, text: string): { jobId: string } => {
    const jobId = newId("job");
    core.log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId, text: text.trim(), replyTo: replyToFor(t) } });
    t.acked = true;
    return { jobId };
  };
  const flushPending = () => {
    if (!turn || turn.pending === null) return;
    const p = turn.pending;
    turn.pending = null;
    // Silence after the ack (live: "Task opened.", "任务已开。" right after it). With a
    // single ask in the turn, a short line after the ack that asks nothing is dropped.
    if (turn.acked && turn.userTexts.length <= 1 && p.trim().length < 200 && !/[?？]/.test(p)) return;
    // The card speaks for itself (eval: "Pending your answer.", "上面那张卡片等你点 Go 或 Hold"):
    // a short line after an ask only describes the card, so it is dropped.
    if (turn.asked && p.trim().length < 200) return;
    if (turn.quiet && p.trim().length < 300) return;
    // Several results at once: the app renders each one's evidence, Outside and Merge under
    // the message, so clauses about tests, commits, branches or merging only repeat or guess
    // (eval two-done-zh, 0/4 under the prompt alone).
    appendAiMsg((turn.results ?? 0) >= 2 ? stripResultPlumbing(p) : p);
  };
  const claimAck = (t: TurnState): { jobId: string } | null => {
    if (t.unboundAck) return t.unboundAck;
    if (t.pending === null || !t.pending.trim()) return null;
    const text = t.pending;
    t.pending = null;
    t.unboundAck = appendAck(t, text);
    return t.unboundAck;
  };

  // ---------- harness events ----------
  const onHarnessEvent = (ev: HarnessEvent) => {
    if (!turn) return;
    if (ev.role === "assistant" && ev.text !== undefined && !ev.tool) {
      flushPending();
      turn.pending = ev.text;
      return;
    }
    if (ev.tool) {
      // Handing more work to an existing task is an action like opening one: the line before
      // it is the ack, and a short line after it is filler (live: "已经交给它去做了，做完会告诉您结果。").
      if (TASK_SEND_RE.test(ev.tool.name) && !turn.acked && turn.pending !== null && turn.pending.trim()) {
        const line = turn.pending;
        turn.pending = null;
        appendAiMsg(line);
        turn.acked = true;
      }
      if (TASK_OPEN_RE.test(ev.tool.name) && turn.carried && carriedTask(turn.carried, (ev.tool.input as { title?: unknown } | undefined)?.title, false)) {
        turn.pending = null; // its ack went out in the cut-off turn
      } else if (TASK_OPEN_RE.test(ev.tool.name)) {
        const kind = (ev.raw as { kind?: string } | undefined)?.kind;
        // One call yields up to three stream events (started, title, ended); count calls by
        // the start event (a tool event with no output yet).
        if (kind === "tool_call_started" || (!kind && !ev.tool.output && ev.tool.ok === undefined)) turn.opensSeen++;
        const handled = turn.opensSeen <= turn.opensHandled; // the MCP handler already acked it
        if (!handled) {
          // No-op if there is no pending text or an ack is already waiting.
          const ack = claimAck(turn);
          // No line before the call: ack by the title as soon as it streams in, instead of
          // after the whole brief is written (live: 5 s).
          const title = (ev.tool.input as { title?: unknown } | undefined)?.title;
          if (!ack && typeof title === "string" && title.trim()) turn.unboundAck = appendAck(turn, generatedAck(turn.zh, title.trim()));
        }
      } else if (QUIET_TOOL_RE.test(ev.tool.name)) {
        // Lookups between the ack line and task_open (Claude Code's deferred-tool ToolSearch,
        // reads of the Log or a task) must not turn the pending ack into a separate message.
      } else {
        flushPending();
      }
    }
  };

  // ---------- session ----------
  async function startSession(resumeSessionId?: string): Promise<void> {
    const s = await runner.harness.start({
      harness: "claude-code",
      model,
      cwd,
      systemPrompt: buildSystemPrompt(core.persona), // built per start: identity may arrive after boot
      mcp: [core.mcp.configFor("partner")],
      permissionMode: "bypass",
      isolateUserConfig: true, // never the user's CLAUDE.md, hooks or MCP servers (live: zh replies, 20 s acks)
      // Ducter's handful of tools load up front: deferring them behind ToolSearch cost a full
      // model round trip (~3 s) before the ack on a fresh session (live, sonnet).
      env: { ENABLE_TOOL_SEARCH: "false" },
      ...(resumeSessionId ? { resumeSessionId } : {}),
    });
    session = s;
    iter = null;
    lastPromptHash = promptHash();
    lastSessionId = s.id || resumeSessionId;
    stats.sessionId = lastSessionId;
  }
  async function dropSession() {
    const s = session;
    session = null;
    iter = null;
    if (s) await s.close().catch(() => {});
  }
  /** Returns true when the session is fresh (needs the projection seed). */
  async function ensureSession(): Promise<boolean> {
    if (opts.ready) await opts.ready.catch(() => {});
    if (warming) {
      await warming;
      warming = null;
    }
    if (session && unseeded) {
      unseeded = false;
      return true; // pre-started fresh session: this turn carries the projection seed
    }
    const warm = lastActivity > 0 && now() - lastActivity <= idleColdMs;
    if (session && warm) return false;
    if (session && !warm) await dropSession();
    if (!session && warm && canResume()) {
      try {
        await startSession(lastSessionId);
        stats.resumes++;
        return false;
      } catch (err) {
        onError(err);
      }
    }
    await startSession();
    stats.freshStarts++;
    return true;
  }

  const userActions: LogEvent[] = [];
  core.log.subscribe((e) => {
    if (e.stream === "channel" && e.kind === "job_status" && e.origin === "user") userActions.push(e);
  });

  function buildInput(batch: LogEvent[], fresh: boolean, note?: string): string {
    // Things the user did by button since our last turn (merge, open PR): context, not triggers.
    const noted = fresh ? [] : userActions.splice(0);
    const deltas = [...noted.map((e) => renderTrigger(e, ctx)), ...batch.map((e) => renderTrigger(e, ctx))];
    // The identity may say the user prefers Chinese; the language of this message wins.
    const lastUser = [...batch].reverse().find((e) => e.kind === "user_msg");
    if (lastUser && !isChinese((lastUser.body as Bodies["user_msg"]).text)) {
      deltas.push("[language] The user wrote this in English (not Chinese): reply in English, including the first line.");
    } else if (!lastUser) {
      // A report or timer has no language of its own (live eval: an English user got a Chinese
      // failure report). The user's last message decides.
      const prev = core.log.read({ stream: "channel", kinds: ["user_msg"], beforeSeq: core.log.head() + 1, limit: 1 });
      const t = (prev[prev.length - 1]?.body as Bodies["user_msg"] | undefined)?.text;
      if (t && !isChinese(t)) deltas.push("[language] The user's last message was in English: reply in English.");
    }
    if (note) deltas.unshift(note);
    const done = batch.filter((e) => e.kind === "report" && (e.body as Bodies["report"]).state === "done").length;
    if (done >= 2 && !lastUser)
      deltas.push(`[results] ${done} tasks finished together: one message, one short line per task saying what now works, in the user's terms. The app shows tests, commits, branches and Merge under it.`);
    deltas.push(renderTime(new Date(now())));
    const devices = renderDevices(core.workers?.list() ?? []);
    if (devices) deltas.push(devices);
    if (!fresh) return deltas.join("\n");
    const batchSeqs = new Set(batch.map((e) => e.seq));
    const history = core.log
      .read({
        stream: "channel",
        beforeSeq: core.log.head() + 1,
        limit: historyLimit + batch.length,
        kinds: ["user_msg", "ai_msg", "ack", "job_status", "report", "decision", "decision_resolved", "waiter", "memory_noted"],
      })
      .filter((e) => !batchSeqs.has(e.seq))
      .sort((a, b) => a.seq - b.seq)
      .slice(-historyLimit);
    const background = renderProjection(history, core.tasks.list(), ctx);
    return background ? `${background}\n\n${deltas.join("\n")}` : deltas.join("\n");
  }

  async function nextEvent(): Promise<IteratorResult<HarnessEvent> | "timeout"> {
    if (!iter) iter = session!.events()[Symbol.asyncIterator]();
    let h: unknown;
    const timeout = new Promise<"timeout">((res) => {
      h = setTimeout(() => res("timeout"), turnTimeoutMs);
    });
    try {
      return await Promise.race([iter.next(), timeout]);
    } finally {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    }
  }

  async function readTurn(): Promise<void> {
    let sawEvent = false;
    for (;;) {
      const r = await nextEvent();
      if (r === "timeout") {
        onError(new Error("partner turn timed out; interrupting"));
        await session?.interrupt().catch(() => {});
        return;
      }
      if (r.done) {
        iter = null;
        // A stream that ends without delivering anything means the session is gone.
        if (!sawEvent) await dropSession();
        return;
      }
      sawEvent = true;
      onHarnessEvent(r.value);
      if (r.value.turnEnd) return;
    }
  }

  async function runTurn(batch: LogEvent[]) {
    const userEvents = batch.filter((e) => e.kind === "user_msg");
    const userTexts = userEvents.map((e) => (e.body as Bodies["user_msg"]).text);
    let replyTo = userEvents[userEvents.length - 1]?.seq;
    if (replyTo === undefined) {
      for (const e of batch) {
        if (e.kind === "report") {
          const j = jobs.get((e.body as Bodies["report"]).taskId);
          if (j?.replyTo !== undefined) {
            replyTo = j.replyTo;
            break;
          }
        }
      }
    }
    let zh = userTexts.some(isChinese);
    if (!userTexts.length) {
      const lastUser = core.log.read({ stream: "channel", kinds: ["user_msg"], beforeSeq: core.log.head() + 1, limit: 1 });
      const t = (lastUser[lastUser.length - 1]?.body as Bodies["user_msg"] | undefined)?.text;
      zh = t ? isChinese(t) : true;
    }

    const fresh = await ensureSession();
    const redo = carried && batch.some((e) => carried!.seqs.has(e.seq)) ? carried : undefined;
    if (redo) carried = undefined;
    const input = buildInput(batch, fresh, redo?.note);
    // A task question is shown with its own Go / Hold / Reply; prose about it only repeats it
    // (eval: restated in 4 of 4 runs whatever the persona said).
    const quiet = batch.length > 0 && batch.every((e) => e.kind === "report" && (e.body as Bodies["report"]).state === "needs_input");
    const results = batch.filter((e) => e.kind === "report" && (e.body as Bodies["report"]).state === "done").length;
    turn = { triggers: batch, userTexts, replyTo, pending: null, unboundAck: null, opensSeen: 0, opensHandled: 0, zh, quiet, results, recalls: 0, noted: [] };
    if (redo) turn.carried = redo;
    const real = batch.map((e) => e.seq).filter((n) => n > 0);
    if (real.length) inflight = { seqs: real, from: core.log.head() }, saveState();
    stats.turns++;
    try {
      const reading = readTurn();
      await session!.send(input, "turn");
      await reading;
      flushPending();
      appendNoted(turn);
      handledSeq = Math.max(handledSeq ?? 0, ...batch.map((e) => e.seq));
      if (!batch.some((e) => e.seq < 0)) queueCorrections(); // one correction round, never a loop
      else corrections.length = 0;
    } finally {
      turn = null;
      inflight = undefined;
      lastActivity = now();
      saveState();
    }
  }

  async function drain() {
    while (queue.length && !closed) {
      // Settlement batch (I-results rule 3, research/16): tasks that finish within a moment of
      // each other become one turn, so one message. Only when nothing from the user waits.
      if (settleMs > 0 && !queue.some((e) => e.kind === "user_msg" || e.seq < 0)) await Bun.sleep(settleMs);
      const batch = queue.splice(0, queue.length);
      try {
        await runTurn(batch);
      } catch (err) {
        onError(err);
        await dropSession();
      }
    }
  }
  function kick() {
    if (running || closed) return;
    running = drain().finally(() => {
      running = null;
      if (queue.length && !closed) kick();
    });
  }

  // ---------- trigger side effects ----------
  function onReport(r: Bodies["report"]) {
    if (r.state !== "done" && r.state !== "failed") return;
    const j = jobs.get(r.taskId);
    if (!j || j.state === r.state) return; // e.g. a report re-queued after a restart
    j.state = r.state;
    core.log.append({
      stream: "channel",
      origin: "partner",
      kind: "job_status",
      body: { jobId: j.jobId, text: j.title, state: r.state, taskId: r.taskId },
    });
  }

  // ---------- memory ----------
  const appendNoted = (t: TurnState) => {
    for (const n of t.noted.splice(0)) {
      const body: Bodies["memory_noted"] = { title: n.title };
      if (n.memoryId) body.memoryId = n.memoryId;
      if (t.replyTo !== undefined) body.replyTo = t.replyTo;
      core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body });
    }
  };
  const UNAVAILABLE = "Memory isn't available right now. Carry on as someone who just doesn't remember: if you need it, ask the user plainly in one short line (\"上次用的什么参数？\" / \"Which settings did we use?\"). Never say you couldn't find a record, or that memory or anything is unavailable, unless the user asks about memory.";

  // ---------- MCP tools (role "partner") ----------
  const withVerbatim = (brief: string, userTexts: string[]) => {
    const missing = userTexts.map((t) => t.trim()).filter((t) => t && !brief.includes(t));
    if (!missing.length) return brief;
    return `${brief.trimEnd()}\n\nUser's words (verbatim):\n${missing.map((t) => `> ${t.replace(/\n/g, "\n> ")}`).join("\n")}`;
  };

  core.mcp.register(
    "partner",
    "task_open",
    "Open a task: a separate working session in its own place (repo, folder, browser) for anything that needs a place, writes, or takes more than ~10s. A follow-up on recent work (same repo, builds on what a task just did) is NOT a new task: task_send it to that task, even if it is done; it keeps its branch, worktree and session. Open a new task only for separate work; if it must build on an unmerged task branch, set place.baseBranch to that branch. Write a one-line ack naming the action BEFORE calling this. The brief must quote the user's words verbatim and list decisions, done-criteria, out of scope, and the place. " +
      'Choose place {"kind":"browser"} when the work happens on the web: looking something up, checking or reading a page or site, comparing products, filling a form. The browser keeps its sign-ins between tasks. ' +
      "A browser task never signs in, submits, posts, buys, or pays by itself: it stops and asks the user with a question, so put that in the brief's out of scope. " +
      "Returns at once; the task reports back on its own. Never wait on it.",
    {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title in the user's language" },
        brief: { type: "string", description: "User's verbatim words, decisions, done-criteria, out of scope, place" },
        place: {
          type: "object",
          description:
            'Where it works: {"kind":"repo","device":"local","repoPath":"~/dev/foo"}, {"kind":"folder","device":"local","path":"~/Documents/x"}, or {"kind":"browser","device":"local","profile":"default"} for web work. Omit if none.',
          properties: {
            kind: { type: "string", enum: ["none", "repo", "folder", "browser"] },
            device: { type: "string", description: '"local" (default). Another device only when the user asks for it or the task needs what only it has; names come from the [devices] line' },
            repoPath: { type: "string" },
            path: { type: "string" },
            profile: { type: "string" },
            baseBranch: { type: "string", description: "Repo only: branch to start from. For new work that builds on an earlier task's unmerged branch, pass that branch." },
          },
          required: ["kind"],
        },
        project: { type: "string" },
        harness: { type: "string", enum: ["claude-code", "codex", "pi"] },
        model: { type: "string" },
      },
      required: ["title", "brief"],
    },
    async (raw: { title?: unknown; brief?: unknown; place?: Place; project?: string; harness?: string; model?: string }) => {
      // Validate before any channel side effect (live: a call without `title` crashed after
      // "On it: undefined" and a failed job_status were already on the channel).
      const briefIn = typeof raw?.brief === "string" ? raw.brief.trim() : "";
      if (!briefIn) return { ok: false, error: "task_open needs `brief` (the user's words, decisions, done-criteria, out of scope, place) and `title`." };
      const firstLine = briefIn.split("\n").find((l) => l.trim())!.replace(/^[#>*\-\s"“]+/, "").trim();
      const title = (typeof raw.title === "string" && raw.title.trim()) || (firstLine.length > 60 ? firstLine.slice(0, 59) + "…" : firstLine);
      const args = { ...raw, title, brief: briefIn };
      const t = turn;
      // Opened already by the cut-off turn this one redoes: hand back that task.
      const again = t?.carried && carriedTask(t.carried, args.title, true);
      if (again) {
        t!.pending = null;
        t!.opensHandled++;
        if (again.unbound) {
          const jobId = again.jobId ?? newId("job");
          jobs.set(again.taskId, { jobId, title: again.title, replyTo: replyToFor(t!), state: "running" });
          core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: again.title, state: "running", taskId: again.taskId } });
        }
        return { ok: true, taskId: again.taskId, title: again.title, note: "This task was already opened for this message; it was not opened again. It reports back on its own." };
      }
      let jobId: string;
      if (t) {
        let ack = claimAck(t);
        if (!ack) {
          // The MCP call can overtake the streamed text; give the stream a moment.
          const until = Date.now() + ackWaitMs;
          while (!ack && Date.now() < until) {
            await Bun.sleep(10);
            ack = claimAck(t);
          }
        }
        if (!ack) ack = appendAck(t, generatedAck(t.zh, args.title));
        t.unboundAck = null;
        t.opensHandled++;
        jobId = ack.jobId;
      } else {
        jobId = newId("job");
      }
      const userTexts = t?.userTexts ?? [];
      const place = resolvePlace(args.place, [args.brief, args.title, ...userTexts], core.tasks.list(), fs);
      const brief = redactSecrets(withVerbatim(args.brief, userTexts));
      try {
        const card = await runner.openTask({
          persona: core.persona.id,
          title: args.title,
          brief,
          place,
          ...(args.project !== undefined ? { project: args.project } : {}),
          ...(args.harness ? { harness: args.harness } : {}),
          ...(args.model ? { model: args.model } : {}),
        });
        jobs.set(card.taskId, { jobId, title: card.title || args.title, replyTo: t ? replyToFor(t) : undefined, state: "running" });
        core.log.append({
          stream: "channel",
          origin: "partner",
          kind: "job_status",
          body: { jobId, text: card.title || args.title, state: "running", taskId: card.taskId },
        });
        return {
          ok: true,
          taskId: card.taskId,
          title: card.title,
          place: card.place,
          attention: card.attention,
          note: "Task opened. It reports back on its own; do not wait on it or guess its result.",
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: `${args.title}: ${msg}`, state: "failed" } });
        return { ok: false, error: `task_open failed: ${msg}` };
      }
    },
  );

  core.mcp.register(
    "partner",
    "task_send",
    "Send text to a task, running or finished (a finished one resumes in its own branch and worktree): the user's follow-up or correction, the next step on the same work, or a question that needs the task's own judgment. Only on the same subject and its unmerged change: other work in the same repo, or anything after the user merged it, is a new task (task_open). Read first (task_read, log_search, log_read); ask only what the Log can't answer. mode 'steer' (default) interrupts at the next safe point; 'queue' waits for its current turn.",
    {
      type: "object",
      properties: {
        taskId: { type: "string" },
        text: { type: "string" },
        mode: { type: "string", enum: ["steer", "queue"] },
      },
      required: ["taskId", "text"],
    },
    async (args: { taskId: string; text: string; mode?: "steer" | "queue" }) => {
      await Bun.sleep(5); // let the streamed text land first
      flushPending(); // a line written before this call is a message, not an ack
      // A turn woken only by a task's question: the user answers it on its card (eval: the
      // partner sent "Go：…" to the task on the user's behalf).
      if (turn?.quiet) return { ok: false, error: "The user answers this question on its card; send the task nothing and end your turn." };
      try {
        const r = await runner.send(args.taskId, redactSecrets(args.text), args.mode);
        return { ok: true, ...r };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // Review 2 #3: one card kept its first title for three different jobs. A retitle is a new
  // task_open for the same task (same place and brief): every client already takes the latest
  // one for the title, the registry keeps openedAt and state, and runner recovery uses the first.
  core.mcp.register(
    "partner",
    "task_retitle",
    "Give a task a new title when a follow-up you sent it changes or widens what it is about, so its card says what it is doing now. Short, in the user's language, covering all of its work. Not for new separate work (open a new task for that).",
    {
      type: "object",
      properties: { taskId: { type: "string" }, title: { type: "string" } },
      required: ["taskId", "title"],
    },
    async (args: { taskId: string; title: string }) => {
      const title = String(args.title ?? "").trim().slice(0, 80);
      if (!title) return { ok: false, error: "task_retitle needs a title" };
      if (!core.tasks.get(args.taskId)) return { ok: false, error: `unknown task ${args.taskId}` };
      const opens = core.log.read({ stream: `task:${args.taskId}`, kinds: ["task_open"], limit: 1000 });
      const last = opens[opens.length - 1];
      if (!last) return { ok: false, error: `task ${args.taskId} has no task_open` };
      const prev = last.body as Bodies["task_open"];
      if (prev.title === title) return { ok: true, title };
      core.log.append({ persona: last.persona, stream: last.stream, origin: "partner", kind: "task_open", body: { ...prev, title } });
      const j = jobs.get(args.taskId);
      if (j) j.title = title;
      return { ok: true, title };
    },
  );

  core.mcp.register(
    "partner",
    "wait_until",
    "Come back to something later. Give `at` (ISO time) and a reason; returns at once, and a [timer fired] line arrives when it is due. With only taskId, nothing is needed: the task's next report wakes you anyway.",
    {
      type: "object",
      properties: {
        at: { type: "string", description: "ISO 8601 time" },
        taskId: { type: "string" },
        decisionId: { type: "string", description: "Only if this wait is about a question you asked: it is cancelled when the user answers" },
        reason: { type: "string", description: "Shown to the user on On hand: short, in their language, addressed to them (提醒你回邮件 / Remind you to reply to the email)" },
      },
      required: ["reason"],
    },
    async (args: { at?: string; taskId?: string; decisionId?: string; reason: string }) => {
      await Bun.sleep(5); // let the streamed text land first
      flushPending(); // keep the line before the status line
      // Review 2 #4: after its own ask the partner armed "等你决定…". The card comes back on
      // its own; a reminder in the same turn is only for one the user asked for.
      if (turn?.asked && !turn.userTexts.some((t) => /提醒|叫我|remind|alarm|\d\s*(点|:|pm|am)|明天|tomorrow/i.test(t)))
        return { ok: false, error: "No reminder needed: the decision card stays on screen until the user answers. End your turn." };
      if (!args.at) {
        if (args.taskId) return { ok: true, note: "The task's next report will wake you; no timer set." };
        return { ok: false, error: "wait_until needs `at` (ISO time) tonight." };
      }
      const at = Date.parse(args.at);
      if (Number.isNaN(at)) return { ok: false, error: `could not parse time: ${args.at}` };
      if (args.taskId && !core.tasks.get(args.taskId)) return { ok: false, error: `unknown task ${args.taskId}` };
      // Core arms the timer from this event (it survives restarts) and appends waiter "fired",
      // which wakes us; a task-bound waiter is cancelled if the task finishes first.
      if (turn?.carried?.waits.delete(args.reason)) return { ok: true, note: "That timer is already set." };
      const body: Bodies["waiter"] = { waiterId: newId("wait"), at: new Date(at).toISOString(), reason: args.reason, state: "armed" };
      if (args.taskId) body.taskId = args.taskId;
      // A wait armed in the same turn as an ask is about that ask (review 2 #4), even unlinked.
      const decisionId = (typeof args.decisionId === "string" && args.decisionId.trim()) || turn?.askedId;
      if (decisionId) body.decisionId = decisionId;
      core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body });
      return { ok: true, waiterId: body.waiterId, firesAt: body.at };
    },
  );

  core.mcp.register(
    "partner",
    "ask",
    "Ask the user to choose, BEFORE any task exists (e.g. \"ask me before changing the public API\"). The user sees the question with Go / Hold / Reply buttons; never ask a choice in prose and never tell the user to type Go. Returns at once; end your turn. The answer arrives as a [your question answered: …] line, and then you act on it (e.g. open the task). Only refer to a choice the user can see if you created it with this tool.",
    {
      type: "object",
      properties: {
        question: { type: "string", description: "One question in the user's language" },
        goLabel: { type: "string", description: "What Go does, short, in the user's language (e.g. 改签名 / Change the signature)" },
        default: { type: "string", enum: ["go", "hold"], description: "What happens if the user doesn't answer (go only if reversible)" },
        reversible: { type: "boolean", description: "Whether the default can be undone" },
        defaultInMinutes: { type: "number", description: "When the default applies (reversible only); omit to wait for the user" },
      },
      required: ["question", "goLabel"],
    },
    async (args: { question: string; goLabel: string; default?: "go" | "hold"; reversible?: boolean; defaultInMinutes?: number }) => {
      await Bun.sleep(5); // let the streamed text land first
      flushPending(); // a line before the question stays a message, never an ack
      // One card per turn (eval: the same rename asked twice, the second in English).
      if (turn?.askedId) return { ok: false, error: "You already asked this turn; that card is on screen. End your turn." };
      const reversible = Boolean(args.reversible);
      const body: Bodies["decision"] = {
        decisionId: newId("d"),
        // The question states the choice; a default written into it contradicts the card's
        // own default line (live: "默认：直接改名" on a card that waits for the user).
        question: stripDefault(args.question),
        goLabel: args.goLabel.trim(),
        defaultOption: args.default === "go" && reversible ? "go" : "hold",
        reversible,
      };
      if (reversible && body.defaultOption === "go" && args.defaultInMinutes && args.defaultInMinutes > 0) {
        body.defaultAt = new Date(now() + args.defaultInMinutes * 60_000).toISOString();
      }
      // Asked already by the cut-off turn this one redoes (restart): it is in front of the user.
      const askedBefore = turn?.carried?.asks.get(body.question);
      if (turn && askedBefore) {
        turn.carried!.asks.delete(body.question);
        (turn.asked = true), (turn.askedId = askedBefore);
        return { ok: true, decisionId: askedBefore, note: "That question is already in front of the user. End your turn now." };
      }
      core.log.append({ stream: "channel", origin: "partner", kind: "decision", body });
      if (turn) (turn.asked = true), (turn.askedId = body.decisionId);
      return { ok: true, decisionId: body.decisionId, note: "The user sees it with Go / Hold / Reply. End your turn now; do not repeat the question." };
    },
  );

  core.mcp.register(
    "partner",
    "memory_search",
    "Recall from the user's long-term memory (Nowledge Mem): their preferences, past decisions, people and earlier work that this conversation does not show. Use it when the user refers to something from before (\"像上次那样\", \"the usual\", a person or project you don't see here), or before asking the user something memory may already know. One search per turn. Results are background for you: use what fits, in your own words; never paste them, list them, or say you searched.",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "A few distinctive words (names, project, topic), in the user's language or English" },
        limit: { type: "number", description: "Max results, default 5 (at most 8)" },
      },
      required: ["query"],
    },
    async (args: { query?: unknown; limit?: unknown }) => {
      const query = typeof args?.query === "string" ? args.query.trim() : "";
      if (!query) return { ok: false, error: "memory_search needs `query`." };
      const t = turn;
      if (t) {
        if (t.recalls >= 1 && !t.userTexts.some((u) => ASKS_RECALL.test(u)))
          return { ok: false, error: "You already searched memory this turn. Answer with what you have, or ask the user in one short line." };
        t.recalls++;
      }
      const limit = Math.min(8, Math.max(1, Math.round(Number(args.limit) || 5)));
      const r = await memory.search(query, limit);
      if (!r.ok) return { ok: false, available: false, note: UNAVAILABLE };
      if (!r.hits.length) return { ok: true, results: [], note: "Nothing in memory fits. Carry on as someone who just doesn't remember: if you need it, ask the user plainly in one short line; never say you found no record." };
      return {
        ok: true,
        results: r.hits,
        note: "Background for you, not for the user: use only what clearly fits, in your own words. Never paste or list these, never say you searched or checked memory. If none fits, carry on or ask.",
      };
    },
  );

  core.mcp.register(
    "partner",
    "memory_add",
    "Remember something durable about the user in their long-term memory (Nowledge Mem): a preference they stated, a decision they made, a lasting fact about their work, projects or people. Never secrets (keys, passwords, tokens), never task plumbing (ids, branches, worktrees, commits, progress), never one-off chatter. The app shows the user a small \"Noted\" line with the title, so don't announce it in your reply.",
    {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title in the user's language, e.g. 测试统一用假时钟 / Fake clock in tests" },
        content: { type: "string", description: "One or two self-contained sentences: what, and the why if the user gave one" },
        importance: { type: "number", description: "0..1, default 0.6; 0.8+ for explicit \"always/never\" rules" },
      },
      required: ["title", "content"],
    },
    async (args: { title?: unknown; content?: unknown; importance?: unknown }) => {
      const title = typeof args?.title === "string" ? args.title.trim().slice(0, 80) : "";
      const content = typeof args?.content === "string" ? args.content.trim().slice(0, 1200) : "";
      if (!title || !content) return { ok: false, error: "memory_add needs `title` and `content`." };
      const text = `${title}\n${content}`;
      if (redactSecrets(text) !== text) return { ok: false, error: "That contains a secret. Never store secrets; nothing was saved." };
      const t = turn;
      const taskIds = core.tasks.list().map((c) => c.taskId);
      if (PLUMBING_RE.test(text) || taskIds.some((id) => text.includes(id)))
        return { ok: false, error: "That is task plumbing (ids, branches, worktrees, commits). Remember only durable things about the user and their work; nothing was saved." };
      if (t && t.noted.length >= 2) return { ok: false, error: "Enough remembered this turn." };
      // A one-time instruction is not a preference (review 2 round 2, eval: "Metric units: this
      // report only" saved). Judged on the user's words this turn, and on what would be saved.
      const ONE_TIME = /这次|这一次|本次|仅此|只这|\bthis (one )?time\b|\bjust (for )?this\b|\bfor this (one|report|task|pr|time)\b|\bonly (for )?this\b|\bthis .{0,12} only\b/i;
      if (ONE_TIME.test(text) || (t?.userTexts.some((u) => ONE_TIME.test(u)) && !t.userTexts.some((u) => /以后|往后|总是|always|from now on|every time|每次/i.test(u))))
        return { ok: false, error: "That is an instruction for this piece of work only, not a lasting preference: put it in the task's brief instead; nothing was saved." };
      const report = t?.triggers.find((e) => e.kind === "report");
      const r = await memory.add({
        title,
        content,
        importance: typeof args.importance === "number" ? args.importance : undefined,
        provenance: {
          persona: core.persona.id,
          logSeq: t ? replyToFor(t) : core.log.head(),
          ...(report ? { taskId: (report.body as Bodies["report"]).taskId } : {}),
        },
      });
      if (!r.ok) return { ok: false, saved: false, note: `${UNAVAILABLE} Nothing was saved.` };
      const noted = { title, ...(r.id ? { memoryId: r.id } : {}) };
      if (t) t.noted.push(noted);
      else core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: noted });
      return { ok: true, note: "Remembered. The user sees a small Noted line; don't mention it in your reply." };
    },
  );

  // ---------- public ----------
  const api: PartnerHandle = {
    stats,
    onTrigger(e: LogEvent) {
      if (closed) return;
      if (seen.has(e.seq)) return;
      seen.add(e.seq);
      if (seen.size > 5000) {
        const keep = [...seen].slice(-2000);
        seen.clear();
        for (const s of keep) seen.add(s);
      }
      if (e.origin === "partner") return; // never wake on our own output
      if (e.kind === "report") onReport(e.body as Bodies["report"]);
      queue.push(e);
      if (!requeuing) kick();
    },
    async idle() {
      while (running) await running;
    },
    async close() {
      closed = true;
      await api.idle().catch(() => {});
      await dropSession();
    },
  };

  // Start (or resume) the session at boot, so the first message does not pay for process
  // start-up and the MCP handshake (measured live: ~5-7 s of a 15 s first ack).
  if (opts.prewarm ?? true) {
    warming = (async () => {
      try {
        await opts.ready?.catch(() => {});
        const warm = lastActivity > 0 && now() - lastActivity <= idleColdMs;
        if (warm && canResume()) {
          try {
            await startSession(lastSessionId);
            stats.resumes++;
            return;
          } catch (err) {
            onError(err);
          }
        }
        await startSession();
        stats.freshStarts++;
        unseeded = true;
      } catch (err) {
        onError(err);
        session = null;
      }
    })();
  }

  // Re-queue triggers that no finished turn covered (cut off by a restart, or arrived while down).
  if (persist && handledSeq !== undefined) {
    const from = handledSeq + 1;
    const missed = core.log
      .read({ fromSeq: from, limit: 200, kinds: ["user_msg", "decision_resolved", "report", "waiter"] })
      .filter(isTrigger);
    const replied = new Set(
      core.log
        .read({ stream: "channel", fromSeq: from, limit: 5000, kinds: ["ai_msg", "ack"] })
        .map((e) => (e.body as { replyTo?: number }).replyTo),
    );
    // The cut-off turn's own triggers run again, whatever it managed to say first.
    const cut = new Set(inflight?.seqs ?? []);
    const todo = missed.filter((e) => cut.has(e.seq) || !(e.kind === "user_msg" && replied.has(e.seq)));
    if (inflight && todo.some((e) => cut.has(e.seq))) carried = carriedFrom(core.log, inflight);
    inflight = undefined;
    // All at once, so a cut-off turn runs again as one turn (not one per trigger).
    if (todo.length)
      queueMicrotask(() => {
        requeuing = true;
        todo.forEach((e) => api.onTrigger(e));
        requeuing = false;
        kick();
      });
  } else if (persist) {
    handledSeq = core.log.head(); // first run: history is background, not new work
  }
  return api;
}

/**
 * Other machines that can run tasks, as one context line; empty when there are none (so prompts
 * without workers are unchanged). Device states use the glossary words (醒着 / Awake).
 */
export function renderDevices(workers: { name: string; online: boolean; os?: string; harnesses?: { id: string; loggedIn: boolean }[] }[]): string {
  if (!workers.length) return "";
  const one = (w: (typeof workers)[number]) => {
    const ai = (w.harnesses ?? []).filter((h) => h.loggedIn).map((h) => h.id);
    return `${w.name} (${w.online ? "awake" : "can't reach"}${w.os ? `, ${w.os}` : ""}${ai.length ? `, signed in: ${ai.join(", ")}` : ", no AI signed in"})`;
  };
  return `[devices] local (this machine, the default) · ${workers.map(one).join(" · ")}. To run a task on another device, pass place.device = its name.`;
}
