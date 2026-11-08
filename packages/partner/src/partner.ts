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
// Restart
//   state.json keeps the session id, last activity, and the highest trigger seq a finished
//   turn covered. On start, triggers after that seq (a turn cut off by the restart, or events
//   that arrived while down) are queued again; user messages that already got a reply are not.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent, Place } from "../../protocol/src/index.ts";
import type { CoreApi, HarnessEvent, HarnessSession, Partner, Runner } from "../../protocol/src/internal.ts";
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
  onError?: (err: unknown) => void;
  prewarm?: boolean; // start/resume the session at creation, default true
  ready?: Promise<unknown>; // sessions start after this settles (e.g. L1 identity from Mem)
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
  zh: boolean;
}

interface Job {
  jobId: string;
  title: string;
  replyTo?: number;
  state?: Bodies["job_status"]["state"]; // last job_status appended
}

const COLD_MS = 55 * 60 * 1000;
const TASK_OPEN_RE = /(^|__)task_open$/;
const QUIET_TOOL_RE = /(^ToolSearch$)|((^|__)(log_search|log_read|task_read)$)/;

/** Same rule as core's triggersPartner (principle 6). */
function isTrigger(e: LogEvent): boolean {
  if (e.origin === "partner") return false;
  if (e.kind === "user_msg" || e.kind === "decision_resolved") return true;
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress";
  if (e.kind === "waiter") return (e.body as Bodies["waiter"]).state === "fired";
  return false;
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
  const onError = opts.onError ?? ((err) => console.error("[partner]", err));

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
  let handledSeq: number | undefined; // highest trigger seq covered by a finished turn
  let turn: TurnState | null = null;
  let warming: Promise<void> | null = null; // pre-start of the session at boot
  let unseeded = false; // the live session was started fresh and has not had its seed yet
  const jobs = new Map<string, Job>(); // taskId -> job
  const stats: PartnerHandle["stats"] = { turns: 0, freshStarts: 0, resumes: 0 };

  if (persist) {
    try {
      const s = JSON.parse(readFileSync(stateFile, "utf8")) as { sessionId?: string; lastActivity?: number; handledSeq?: number };
      lastSessionId = s.sessionId;
      lastActivity = s.lastActivity ?? 0;
      handledSeq = s.handledSeq;
    } catch {
      /* first run */
    }
  }
  const saveState = () => {
    if (!persist) return;
    try {
      writeFileSync(stateFile, JSON.stringify({ sessionId: lastSessionId, lastActivity, handledSeq }));
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
    core.log.append({
      stream: "channel",
      origin: "partner",
      kind: "ai_msg",
      body: turn?.replyTo !== undefined ? { text: t, replyTo: turn.replyTo } : { text: t },
    });
  };
  const replyToFor = (t: TurnState) => t.replyTo ?? t.triggers[t.triggers.length - 1]?.seq ?? core.log.head();
  const appendAck = (t: TurnState, text: string): { jobId: string } => {
    const jobId = newId("job");
    core.log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId, text: text.trim(), replyTo: replyToFor(t) } });
    return { jobId };
  };
  const flushPending = () => {
    if (!turn || turn.pending === null) return;
    const p = turn.pending;
    turn.pending = null;
    appendAiMsg(p);
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
      if (TASK_OPEN_RE.test(ev.tool.name)) {
        // No-op if there is no pending text or an ack is already waiting.
        const ack = claimAck(turn);
        // No line before the call: ack by the title as soon as it streams in, instead of
        // after the whole brief is written (live: 5 s).
        const title = (ev.tool.input as { title?: unknown } | undefined)?.title;
        if (!ack && typeof title === "string" && title.trim()) turn.unboundAck = appendAck(turn, generatedAck(turn.zh, title.trim()));
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
      ...(resumeSessionId ? { resumeSessionId } : {}),
    });
    session = s;
    iter = null;
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
    if (!session && warm && lastSessionId) {
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

  function buildInput(batch: LogEvent[], fresh: boolean): string {
    const deltas = batch.map((e) => renderTrigger(e, ctx));
    // The identity may say the user prefers Chinese; the language of this message wins.
    const lastUser = [...batch].reverse().find((e) => e.kind === "user_msg");
    if (lastUser && !isChinese((lastUser.body as Bodies["user_msg"]).text)) {
      deltas.push("[language] The user wrote this in English (not Chinese): reply in English, including the first line.");
    }
    deltas.push(renderTime(new Date(now())));
    if (!fresh) return deltas.join("\n");
    const batchSeqs = new Set(batch.map((e) => e.seq));
    const history = core.log
      .read({
        stream: "channel",
        beforeSeq: core.log.head() + 1,
        limit: historyLimit + batch.length,
        kinds: ["user_msg", "ai_msg", "ack", "job_status", "report", "decision", "decision_resolved", "waiter"],
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
    const input = buildInput(batch, fresh);
    turn = { triggers: batch, userTexts, replyTo, pending: null, unboundAck: null, zh };
    stats.turns++;
    try {
      const reading = readTurn();
      await session!.send(input, "turn");
      await reading;
      flushPending();
      handledSeq = Math.max(handledSeq ?? 0, ...batch.map((e) => e.seq));
    } finally {
      turn = null;
      lastActivity = now();
      saveState();
    }
  }

  async function drain() {
    while (queue.length && !closed) {
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
            device: { type: "string" },
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
        jobId = ack.jobId;
      } else {
        jobId = newId("job");
      }
      const userTexts = t?.userTexts ?? [];
      const place = resolvePlace(args.place, [args.brief, args.title, ...userTexts], core.tasks.list(), fs);
      const brief = withVerbatim(args.brief, userTexts);
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
    "Send text to a task, running or finished (a finished one resumes in its own branch and worktree): the user's follow-up or correction, the next step on the same work, or a question that needs the task's own judgment. Read first (task_read, log_search, log_read); ask only what the Log can't answer. mode 'steer' (default) interrupts at the next safe point; 'queue' waits for its current turn.",
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
      try {
        const r = await runner.send(args.taskId, args.text, args.mode);
        return { ok: true, ...r };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
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
        reason: { type: "string" },
      },
      required: ["reason"],
    },
    async (args: { at?: string; taskId?: string; reason: string }) => {
      await Bun.sleep(5); // let the streamed text land first
      flushPending(); // keep the line before the status line
      if (!args.at) {
        if (args.taskId) return { ok: true, note: "The task's next report will wake you; no timer set." };
        return { ok: false, error: "wait_until needs `at` (ISO time) tonight." };
      }
      const at = Date.parse(args.at);
      if (Number.isNaN(at)) return { ok: false, error: `could not parse time: ${args.at}` };
      if (args.taskId && !core.tasks.get(args.taskId)) return { ok: false, error: `unknown task ${args.taskId}` };
      // Core arms the timer from this event (it survives restarts) and appends waiter "fired",
      // which wakes us; a task-bound waiter is cancelled if the task finishes first.
      const body: Bodies["waiter"] = { waiterId: newId("wait"), at: new Date(at).toISOString(), reason: args.reason, state: "armed" };
      if (args.taskId) body.taskId = args.taskId;
      core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body });
      return { ok: true, waiterId: body.waiterId, firesAt: body.at };
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
      kick();
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
        if (warm && lastSessionId) {
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
    const todo = missed.filter((e) => !(e.kind === "user_msg" && replied.has(e.seq)));
    if (todo.length) queueMicrotask(() => todo.forEach((e) => api.onTrigger(e)));
  } else if (persist) {
    handledSeq = core.log.head(); // first run: history is background, not new work
  }
  return api;
}
