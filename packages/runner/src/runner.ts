import { randomBytes } from "node:crypto";
import type { Attention, Bodies, LogEvent, Place, Residency, TaskCard } from "@ducter/protocol";
import type { CoreApi, HarnessEvent, HarnessPort, HarnessSession, Runner, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { NUDGE, kickoff, taskBrief } from "./brief.ts";
import { createOarHarnessPort } from "./oar.ts";
import { planPlace, provisionPlace } from "./places.ts";
import { PREVIEW_MAX, preview } from "./normalize.ts";

type HarnessId = SessionSpec["harness"];
const HARNESSES: HarnessId[] = ["claude-code", "codex", "pi"];

export interface RunnerOptions {
  harness?: HarnessPort; // default: OAR
  defaultHarness?: HarnessId;
  partnerName?: string; // default core.persona.name
  newId?: () => string;
  now?: () => Date;
}

/** Runner plus test/ops helpers that are not part of the contract. */
export interface RunnerExt extends Runner {
  /** Resolves when the task's session is started and its first turn sent (or provisioning failed). */
  whenStarted(taskId: string): Promise<void>;
  /** Native session id of a task (for resume), if started. */
  sessionId(taskId: string): string | undefined;
  /** Close all sessions and stop listening. */
  dispose(): Promise<void>;
}

interface TaskRt {
  id: string;
  persona: string;
  card: TaskCard;
  spec: SessionSpec;
  session?: HarnessSession;
  sessionId?: string;
  running: boolean; // our view: a turn is in flight
  reportedThisTurn: boolean;
  nudged: boolean;
  stallNoted: boolean;
  dropped: boolean;
  attention: Attention;
  residency: Residency;
  started: Promise<void>;
}

const REPORT_ATTENTION: Record<Bodies["report"]["state"], Attention> = {
  progress: "working",
  needs_input: "needs_you",
  blocked: "blocked",
  done: "done_claimed",
  failed: "failed",
};

export function shortId(): string {
  // 8 chars of base32-ish lowercase; collision-safe enough for one persona's task list.
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

export function createRunner(core: CoreApi, opts: RunnerOptions = {}): RunnerExt {
  const harness = opts.harness ?? createOarHarnessPort();
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? shortId;
  const tasks = new Map<string, TaskRt>();

  const unsubscribe = core.log.subscribe((e: LogEvent) => {
    if (e.kind !== "report") return;
    const body = e.body as Bodies["report"];
    const t = tasks.get(body.taskId);
    if (!t) return;
    t.reportedThisTurn = true;
    t.attention = REPORT_ATTENTION[body.state] ?? t.attention;
  });

  const stream = (id: string) => `task:${id}`;

  function setState(t: TaskRt, attention: Attention, residency: Residency, reason?: string) {
    if (t.attention === attention && t.residency === residency && !reason) return;
    t.attention = attention;
    t.residency = residency;
    core.tasks.setState(t.id, attention, residency, reason);
  }

  /** Attention as core sees it (reports/decisions may have moved it), else our own view. */
  function currentAttention(t: TaskRt): Attention {
    return core.tasks.get(t.id)?.attention ?? t.attention;
  }

  function logEvent(t: TaskRt, ev: Omit<Bodies["task_event"], "taskId">) {
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "task", kind: "task_event", body: { taskId: t.id, ...ev } });
  }

  function isBusy(t: TaskRt): boolean {
    const s = t.session as any;
    if (s && typeof s.busy === "function") {
      try {
        return Boolean(s.busy());
      } catch {
        /* fall through */
      }
    }
    return t.running;
  }

  async function sendTurn(t: TaskRt, text: string) {
    t.running = true;
    setState(t, "working", "hot");
    await deliver(t, text, "turn");
  }

  async function deliver(t: TaskRt, text: string, mode: "turn" | "steer" | "queue") {
    logEvent(t, { role: "user", text: preview(text, 16 * 1024), raw: { delivered: mode } });
    await t.session!.send(text, mode);
  }

  async function startSession(t: TaskRt, resume: boolean) {
    const spec: SessionSpec = resume && t.sessionId ? { ...t.spec, resumeSessionId: t.sessionId } : t.spec;
    const session = await harness.start(spec);
    t.session = session;
    try {
      t.sessionId = session.id;
    } catch {
      /* some sessions learn their id later */
    }
    void pump(t, session);
  }

  async function pump(t: TaskRt, session: HarnessSession) {
    try {
      for await (const ev of session.events()) {
        if (!t.sessionId) {
          try {
            t.sessionId = session.id || undefined;
          } catch {
            /* not yet */
          }
        }
        handleEvent(t, ev);
        if (ev.turnEnd) await onTurnEnd(t, ev);
      }
    } catch (err) {
      logEvent(t, { role: "system", text: `event stream error: ${preview(String(err), 500)}` });
    }
    if (t.session === session) {
      t.session = undefined;
      t.running = false;
      if (!t.dropped) setState(t, currentAttention(t), "parked");
    }
  }

  function handleEvent(t: TaskRt, ev: HarnessEvent) {
    if (ev.tool && /(^|__)report_to_main$/.test(ev.tool.name) && ev.tool.ok !== false) t.reportedThisTurn = true;
    if (!ev.text && !ev.tool && !ev.turnEnd) return; // usage-only or empty
    const raw = ev.turnEnd ? { turnEnd: true, usage: ev.usage, ...(ev.raw as object | undefined) } : undefined;
    const tool = ev.tool
      ? { ...ev.tool, output: preview(ev.tool.output, PREVIEW_MAX), input: capInput(ev.tool.input) }
      : undefined;
    logEvent(t, { role: ev.role, text: ev.text != null ? preview(ev.text, 16 * 1024) : undefined, tool, raw });
  }

  async function onTurnEnd(t: TaskRt, ev: HarnessEvent) {
    const outcome = (ev.raw as any)?.outcome as string | undefined;
    const busy = isBusy(t);
    t.running = busy;
    const reported = t.reportedThisTurn;
    t.reportedThisTurn = false;
    if (!busy && !t.dropped) setState(t, currentAttention(t), "warm");
    if (t.dropped || busy) return;
    if (reported) {
      t.nudged = false;
      t.stallNoted = false;
      return;
    }
    if (outcome && outcome !== "completed") return; // aborted/failed: no nudge
    if (!t.nudged) {
      t.nudged = true;
      try {
        await sendTurn(t, NUDGE);
      } catch (err) {
        logEvent(t, { role: "system", text: `nudge failed: ${preview(String(err), 500)}` });
      }
      return;
    }
    if (!t.stallNoted) {
      t.stallNoted = true;
      logEvent(t, { role: "system", text: "no report after one nudge; leaving the task idle (stall rule)", raw: { stall: true } });
    }
  }

  function get(taskId: string): TaskRt {
    const t = tasks.get(taskId);
    if (!t) throw new Error(`unknown task ${taskId}`);
    return t;
  }

  const runner: RunnerExt = {
    harness,

    async openTask(input) {
      const id = newId();
      const h = (input.harness ?? opts.defaultHarness ?? "claude-code") as HarnessId;
      if (!HARNESSES.includes(h)) throw new Error(`unknown harness ${input.harness}`);
      const title = input.title.trim() || "Untitled task";
      const resolved = await planPlace(input.place, id, title, core.dataDir);
      const project = input.project ?? "";
      const persona = input.persona || core.persona.id;

      core.log.append({
        persona,
        stream: stream(id),
        origin: "system",
        kind: "task_open",
        body: { taskId: id, title, project, place: resolved.place, harness: h, model: input.model, brief: input.brief },
      });

      const mcp = core.mcp.configFor({ taskId: id });
      const spec: SessionSpec = {
        harness: h,
        model: input.model,
        cwd: resolved.cwd,
        appendSystemPrompt: taskBrief({
          partnerName: opts.partnerName ?? core.persona.name ?? "Ducter",
          taskId: id,
          title,
          brief: input.brief,
          place: resolved.place,
          cwd: resolved.cwd,
          project: project || undefined,
          mcpServerName: mcp.name,
        }),
        mcp: [mcp],
        permissionMode: "bypass",
      };
      const card: TaskCard = {
        taskId: id,
        persona,
        title,
        project,
        place: resolved.place,
        harness: h,
        model: input.model,
        attention: "queued",
        residency: "provisioning",
        updatedAt: now().toISOString(),
      };
      const t: TaskRt = {
        id,
        persona,
        card,
        spec,
        running: false,
        reportedThisTurn: false,
        nudged: false,
        stallNoted: false,
        dropped: false,
        attention: "queued",
        residency: "provisioning",
        started: Promise.resolve(),
      };
      tasks.set(id, t);
      core.tasks.setState(id, "queued", "provisioning");

      t.started = (async () => {
        try {
          await provisionPlace(resolved);
          await startSession(t, false);
          await sendTurn(t, kickoff(title));
        } catch (err) {
          const reason = preview(err instanceof Error ? err.message : String(err), 500);
          logEvent(t, { role: "system", text: `failed to start: ${reason}` });
          setState(t, "failed", "archived", reason);
        }
      })();

      return core.tasks.get(id) ?? card;
    },

    async send(taskId, text, mode) {
      const t = get(taskId);
      if (t.dropped) throw new Error(`task ${taskId} was dropped`);
      await t.started;
      t.nudged = false;
      t.stallNoted = false;
      if (!t.session) {
        // Parked (process gone): resume by native session id, or fail loudly.
        if (!t.sessionId) throw new Error(`task ${taskId} has no session to resume`);
        setState(t, currentAttention(t), "provisioning");
        await startSession(t, true);
      }
      const session = t.session!;
      if (isBusy(t)) {
        const canSteer = (session as any).canSteer !== false;
        if (mode !== "queue" && canSteer) {
          await deliver(t, text, "steer");
          return { delivered: "steered" };
        }
        await deliver(t, text, "queue");
        return { delivered: "queued" };
      }
      await sendTurn(t, text);
      return { delivered: "queued" }; // idle: delivered as the next turn (contract has no "prompted")
    },

    async interrupt(taskId) {
      const t = get(taskId);
      await t.started;
      await t.session?.interrupt();
    },

    async drop(taskId) {
      const t = get(taskId);
      t.dropped = true;
      await t.started.catch(() => {});
      setState(t, "dropped", "parked");
      const s = t.session;
      t.session = undefined;
      t.running = false;
      await s?.close().catch(() => {});
      // The worktree and branch are kept on purpose.
    },

    whenStarted(taskId) {
      return get(taskId).started;
    },

    sessionId(taskId) {
      return tasks.get(taskId)?.sessionId;
    },

    async dispose() {
      unsubscribe();
      await Promise.all([...tasks.values()].map((t) => t.session?.close().catch(() => {})));
    },
  };
  return runner;
}

function capInput(input: unknown): unknown {
  if (input == null) return undefined;
  const s = typeof input === "string" ? input : JSON.stringify(input);
  if (s.length <= PREVIEW_MAX) return input;
  return preview(s, PREVIEW_MAX);
}

export type { Place };
