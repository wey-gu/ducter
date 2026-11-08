import { randomBytes } from "node:crypto";
import type { Attention, Bodies, Delivery, LogEvent, Place, Residency, TaskCard } from "@ducter/protocol";
import type { CoreApi, HarnessEvent, HarnessPort, HarnessSession, Runner, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { NUDGE, REOPENED, RESUME_AFTER_RESTART, kickoff, taskBrief } from "./brief.ts";
import { createOarHarnessPort } from "./oar.ts";
import { cwdOf, planPlace, provisionPlace } from "./places.ts";
import { browserSidecar, type BrowserOptions, type BrowserSidecar } from "./browser.ts";
import { PREVIEW_MAX, preview } from "./normalize.ts";
import { mergeTaskBranch, openDraftPr, type ActionResult } from "./integrate.ts";
import { DEVICE_BACK, DeviceOfflineError, deviceOf, isOffline, remoteOps, type PlaceOps } from "./remote.ts";

/** task_state reason for a task whose worker dropped; clients render it as "<device> 连不上 / Can't reach <device>". */
export const unreachableReason = (device: string) => `device:unreachable:${device}`;

type HarnessId = SessionSpec["harness"];
type From = NonNullable<Bodies["task_event"]["from"]>;
const HARNESSES: HarnessId[] = ["claude-code", "codex", "pi"];

export interface RunnerOptions {
  harness?: HarnessPort; // default: OAR
  defaultHarness?: HarnessId;
  defaultModel?: string; // default env DUCTER_TASK_MODEL; else the harness default
  gh?: string; // GitHub CLI binary (tests)
  isolateUserConfig?: boolean; // tasks keep the user's own harness setup by default (system.md)
  partnerName?: string; // default core.persona.name
  newId?: () => string;
  now?: () => Date;
  browser?: BrowserOptions; // browser places: env gate and test seams
  taskModel?: string; // default model when the partner passes none (default env DUCTER_TASK_MODEL)
  /** How long a worker may be gone before its working tasks show as waiting (D52: 2 min). */
  offlineGraceMs?: number;
}

/** Runner plus test/ops helpers that are not part of the contract. */
export interface RunnerExt extends Runner {
  /** Resolves when the task's session is started and its first turn sent (or provisioning failed). */
  whenStarted(taskId: string): Promise<void>;
  /** Native session id of a task (for resume), if started. */
  sessionId(taskId: string): string | undefined;
  /** Resume (or start) the session of a finished or dropped task and tell it to carry on. */
  reopen(taskId: string): Promise<{ delivered: Delivery }>;
  undrop(taskId: string): Promise<ActionResult>;
  merge(taskId: string): Promise<ActionResult>;
  openPr(taskId: string): Promise<ActionResult>;
  /** Alias of dispose, called by main on shutdown. */
  stop(): Promise<void>;
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
  loggedSessionId?: string;
  running: boolean; // our view: a turn is in flight
  reportedThisTurn: boolean;
  nudged: boolean;
  stallNoted: boolean;
  interruptRequested?: boolean; // the user stopped the current turn
  dropped: boolean;
  attention: Attention;
  residency: Residency;
  started: Promise<void>;
  sidecar?: BrowserSidecar; // browser place
  ops: PlaceOps; // where the place lives: this machine or a worker (remote.ts)
  resumeOnBack?: boolean; // its worker dropped mid-work: resume when the worker is back
  offlineTimer?: ReturnType<typeof setTimeout>;
  offlineOff?: () => void;
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
  const graceMs = opts.offlineGraceMs ?? Number(process.env.DUCTER_OFFLINE_GRACE_MS || 120_000);
  const localOps: PlaceOps = {
    plan: (place, id, title) => planPlace(place, id, title, core.dataDir),
    provision: (r) => provisionPlace(r),
    harness,
    merge: (place) => mergeTaskBranch(place),
    openPr: (place) => openDraftPr(place, { gh: opts.gh }),
  };
  /** A paired worker's ops when the place names one; any other name (e.g. "mac") is this machine. */
  function opsFor(place: Place | undefined): PlaceOps {
    const device = deviceOf(place);
    const link = device ? core.workers?.link(device) : undefined;
    return link ? remoteOps(link) : localOps;
  }

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
    const s = t.session;
    if (s) {
      try {
        return Boolean(s.busy());
      } catch {
        /* fall through */
      }
    }
    return t.running;
  }

  async function sendTurn(t: TaskRt, text: string, from: From, logged = false) {
    t.running = true;
    setState(t, "working", "hot");
    await deliver(t, text, "turn", from, logged);
  }

  const logInput = (t: TaskRt, text: string, from: From, mode: string) =>
    logEvent(t, { role: "user", from, text: preview(text, 16 * 1024), raw: { delivered: mode } });

  /** Logs the text first (the Log is the record even if delivery fails), then delivers it. */
  async function deliver(t: TaskRt, text: string, mode: "turn" | "steer" | "queue", from: From, logged = false) {
    if (!logged) logInput(t, text, from, mode);
    try {
      await t.session!.send(text, mode);
    } catch (err) {
      if (mode === "turn") t.running = false;
      logEvent(t, { role: "system", from: "runner", text: `delivery failed: ${preview(String(err), 500)}` });
      throw err;
    }
  }

  /** Records the native session id once known, so a restarted runner can resume it. */
  function noteSessionId(t: TaskRt, session: HarnessSession) {
    let id: string | undefined;
    try {
      id = session.id || undefined;
    } catch {
      /* some sessions learn their id later */
    }
    if (!id || id === t.loggedSessionId) return;
    t.sessionId = id;
    t.loggedSessionId = id;
    // On a worker, the cwd was planned there: record it, a restarted main resumes from it.
    logEvent(t, { role: "system", from: "runner", text: "session started", raw: { sessionId: id, ...(t.ops.device ? { cwd: t.spec.cwd, device: t.ops.device.id } : {}) } });
  }

  async function startSession(t: TaskRt, resume: boolean) {
    const spec: SessionSpec = resume && t.sessionId ? { ...t.spec, resumeSessionId: t.sessionId } : t.spec;
    const session = await t.ops.harness.start(spec);
    t.session = session;
    noteSessionId(t, session);
    void pump(t, session);
  }

  async function pump(t: TaskRt, session: HarnessSession) {
    let offline = false;
    try {
      for await (const ev of session.events()) {
        noteSessionId(t, session);
        handleEvent(t, ev);
        if (ev.turnEnd) await onTurnEnd(t, ev);
      }
    } catch (err) {
      if (isOffline(err)) offline = true;
      else logEvent(t, { role: "system", text: `event stream error: ${preview(String(err), 500)}` });
    }
    if (t.session === session) {
      const wasRunning = t.running;
      t.session = undefined;
      t.running = false;
      if (offline && !t.dropped) deviceLost(t, wasRunning);
      else if (!t.dropped) setState(t, currentAttention(t), "parked");
    }
  }

  // ---------- workers: a task's machine drops and comes back (focus-window-states invariant 1) ----------
  function deviceLost(t: TaskRt, midTurn: boolean) {
    const d = t.ops.device;
    if (!d || t.dropped) return;
    const was = currentAttention(t);
    t.resumeOnBack = t.resumeOnBack || midTurn || was === "working" || was === "queued";
    setState(t, was, "offline");
    logEvent(t, { role: "system", from: "runner", text: `${d.name} disconnected; the task carries on when it is back`, raw: { device: d.id, offline: true } });
    clearTimeout(t.offlineTimer);
    // Short blips stay silent (D52); past the grace, working tasks show as waiting on the device.
    if (t.resumeOnBack)
      t.offlineTimer = setTimeout(() => {
        if (!d.online() && !t.dropped && !t.session) setState(t, "blocked", "offline", unreachableReason(d.name));
      }, graceMs);
    t.offlineOff?.();
    t.offlineOff = d.onOnline(() => {
      t.offlineOff?.();
      t.offlineOff = undefined;
      clearTimeout(t.offlineTimer);
      void deviceBack(t);
    });
  }

  async function deviceBack(t: TaskRt) {
    if (t.dropped || t.session) return;
    const d = t.ops.device!;
    if (!t.resumeOnBack) return setState(t, currentAttention(t), "parked");
    t.resumeOnBack = false;
    logEvent(t, { role: "system", from: "runner", text: `${d.name} is back; resuming the session`, raw: { device: d.id, offline: false } });
    try {
      if (t.sessionId) {
        await startSession(t, true);
        await sendTurn(t, DEVICE_BACK, "runner");
      } else {
        await t.ops.provision({ place: t.card.place, cwd: t.spec.cwd });
        await startSession(t, false);
        await sendTurn(t, kickoff(t.card.title), "runner");
      }
    } catch (err) {
      if (isOffline(err)) return deviceLost(t, true);
      const reason = preview(err instanceof Error ? err.message : String(err), 500);
      logEvent(t, { role: "system", from: "runner", text: `failed to resume on ${d.name}: ${reason}` });
      setState(t, "failed", "parked", reason);
    }
  }

  function handleEvent(t: TaskRt, ev: HarnessEvent) {
    const status = ev.tool && t.sidecar?.statusFor(ev.tool);
    if (status) logEvent(t, { role: "system", text: status.text, raw: { browser: { host: status.host, url: status.url } } });
    const early = (ev.raw as { kind?: string } | undefined)?.kind;
    if (early === "tool_call_started" || early === "tool_call_title") return; // the ended event logs the call
    if (ev.tool && /(^|__)report_to_main$/.test(ev.tool.name) && ev.tool.ok !== false) t.reportedThisTurn = true;
    if (!ev.text && !ev.tool && !ev.turnEnd) return; // usage-only or empty
    const raw = ev.turnEnd ? { turnEnd: true, ...(ev.raw as object | undefined) } : undefined;
    const tool = ev.tool
      ? { ...ev.tool, output: preview(ev.tool.output, PREVIEW_MAX), input: capInput(ev.tool.input) }
      : undefined;
    const body: Omit<Bodies["task_event"], "taskId"> = { role: ev.role };
    if (ev.text != null) body.text = preview(ev.text, 16 * 1024);
    if (tool) body.tool = tool;
    if (ev.turnEnd && ev.usage) body.usage = ev.usage;
    if (raw) body.raw = raw;
    logEvent(t, body);
  }

  async function onTurnEnd(t: TaskRt, ev: HarnessEvent) {
    const outcome = (ev.raw as any)?.outcome as string | undefined;
    const busy = isBusy(t);
    t.running = busy;
    const reported = t.reportedThisTurn;
    t.reportedThisTurn = false;
    const stopped = t.interruptRequested && outcome === "aborted";
    if (outcome) t.interruptRequested = false;
    // Stopped by the user: it is not working any more, it waits for them (truthful card).
    if (!busy && !t.dropped) setState(t, stopped && currentAttention(t) === "working" ? "blocked" : currentAttention(t), "warm");
    // A finished browser task quits its browser cleanly so sign-ins are saved (browser.ts).
    if (!busy && t.sidecar && ["done_claimed", "done", "failed"].includes(currentAttention(t))) void t.sidecar.close().catch(() => false);
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
        await sendTurn(t, NUDGE, "runner");
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

  function specFor(id: string, open: Bodies["task_open"], cwd: string): SessionSpec {
    const mcp = core.mcp.configFor({ taskId: id });
    const spec: SessionSpec = {
      harness: open.harness as HarnessId,
      cwd,
      appendSystemPrompt: taskBrief({
        partnerName: opts.partnerName ?? core.persona.name ?? "Ducter",
        taskId: id,
        title: open.title,
        brief: open.brief,
        place: open.place,
        cwd,
        project: open.project || undefined,
        mcpServerName: mcp.name,
      }),
      mcp: [mcp],
      permissionMode: "bypass",
      isolateUserConfig: opts.isolateUserConfig ?? false,
    };
    if (open.model) spec.model = open.model;
    return spec;
  }

  function newRt(id: string, persona: string, card: TaskCard, spec: SessionSpec, ops: PlaceOps = localOps): TaskRt {
    return {
      ops,
      id,
      persona,
      card,
      spec,
      running: false,
      reportedThisTurn: false,
      nudged: false,
      stallNoted: false,
      dropped: card.attention === "dropped",
      attention: card.attention,
      residency: card.residency,
      started: Promise.resolve(),
    };
  }

  // ---------- recovery: rebuild tasks from the Log after a restart ----------
  // Every known task becomes addressable again (send resumes its native session by id).
  // Tasks that were mid-turn when the process died are resumed and told to carry on.
  const recovered: TaskRt[] = [];
  for (const e of core.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_open"] })) {
    const open = e.body as Bodies["task_open"];
    const card = core.tasks.get(open.taskId);
    if (!card || tasks.has(open.taskId)) continue;
    const ops = opsFor(open.place);
    // A worker's cwd is on the worker; it was planned there and recorded in the place.
    const cwd = ops.device ? remoteCwd(open.place) : cwdOf(open.place, open.taskId, core.dataDir);
    const t = newRt(open.taskId, e.persona, card, specFor(open.taskId, open, cwd), ops);
    for (const ev of core.log.read({ stream: stream(open.taskId), kinds: ["task_event"], limit: 50_000 })) {
      const raw = (ev.body as Bodies["task_event"]).raw as { sessionId?: string; cwd?: string } | undefined;
      if (raw?.sessionId) t.sessionId = t.loggedSessionId = raw.sessionId;
      if (raw?.sessionId && raw.cwd && ops.device) t.spec.cwd = raw.cwd;
    }
    tasks.set(open.taskId, t);
    recovered.push(t);
  }
  for (const t of recovered) {
    const was = t.attention;
    if (t.residency === "hot" || t.residency === "warm" || t.residency === "provisioning") setState(t, was, "parked");
    if (was !== "working" && was !== "queued") continue;
    t.started = (async () => {
      try {
        await Bun.sleep(0); // let the caller finish wiring (registerTaskTools, partner)
        if (t.sessionId) {
          logEvent(t, { role: "system", from: "runner", text: "main process restarted; resuming the session" });
          await startSession(t, true);
          await sendTurn(t, RESUME_AFTER_RESTART, "runner");
        } else {
          await t.ops.provision({ place: t.card.place, cwd: t.spec.cwd });
          await startSession(t, false);
          await sendTurn(t, kickoff(t.card.title), "runner");
        }
      } catch (err) {
        if (isOffline(err)) return deviceLost(t, true);
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        logEvent(t, { role: "system", from: "runner", text: `failed to resume after restart: ${reason}` });
        setState(t, "failed", "parked", reason);
      }
    })();
  }

  const runner: RunnerExt = {
    harness,

    async openTask(input) {
      const id = newId();
      const h = (input.harness ?? opts.defaultHarness ?? "claude-code") as HarnessId;
      if (!HARNESSES.includes(h)) throw new Error(`unknown harness ${input.harness}`);
      const title = input.title.trim() || "Untitled task";
      // Where it runs: this machine, or a worker that must be connected right now.
      const ops = opsFor(input.place);
      if (ops.device && !ops.device.online()) throw new DeviceOfflineError(ops.device.name);
      if (ops.device && input.place?.kind === "browser") throw new Error(`browser places run on this machine only for now, not on ${ops.device.name}`);
      const resolved = await ops.plan(input.place, id, title);
      const project = input.project ?? "";
      const persona = input.persona || core.persona.id;
      const partnerName = opts.partnerName ?? core.persona.name ?? "Ducter";
      // Throws before the task exists when a browser place is unavailable (the partner says why).
      const sidecar = await browserSidecar({ place: resolved.place, persona, taskId: id, dataDir: core.dataDir, partnerName }, opts.browser);

      // The partner's choice wins; else DUCTER_TASK_MODEL; else the harness default.
      const model = input.model || (h === "claude-code" ? (opts.defaultModel ?? opts.taskModel ?? process.env.DUCTER_TASK_MODEL) || undefined : undefined);
      const open: Bodies["task_open"] = { taskId: id, title, project, place: resolved.place, harness: h, model, brief: input.brief };
      const opened = core.log.append({ persona, stream: stream(id), origin: "system", kind: "task_open", body: open });
      const card: TaskCard = {
        taskId: id,
        persona,
        title,
        project,
        place: resolved.place,
        harness: h,
        model,
        attention: "queued",
        residency: "provisioning",
        openedAt: opened.ts,
        updatedAt: opened.ts,
      };
      const spec = specFor(id, open, resolved.cwd);
      if (sidecar) {
        spec.appendSystemPrompt = (spec.appendSystemPrompt ?? "") + sidecar.brief;
        spec.mcp = [...spec.mcp, sidecar.mcp];
        if (h === "claude-code") Object.assign(spec, sidecar.claude);
      }
      const t = newRt(id, persona, card, spec, ops);
      if (sidecar) t.sidecar = sidecar;
      tasks.set(id, t);
      core.tasks.setState(id, "queued", "provisioning");

      t.started = (async () => {
        try {
          await ops.provision(resolved);
          await sidecar?.ready();
          await startSession(t, false);
          await sendTurn(t, kickoff(title), "runner");
        } catch (err) {
          if (isOffline(err)) return deviceLost(t, true);
          const reason = preview(err instanceof Error ? err.message : String(err), 500);
          logEvent(t, { role: "system", from: "runner", text: `failed to start: ${reason}` });
          setState(t, "failed", "archived", reason);
        }
      })();

      return core.tasks.get(id) ?? card;
    },

    async send(taskId, text, mode, from = "partner") {
      const t = get(taskId);
      if (typeof text !== "string" || !text.trim()) throw new Error("send needs non-empty text");
      if (t.dropped) throw new Error(`task ${taskId} was dropped`);
      await t.started.catch(() => {});
      t.nudged = false;
      t.stallNoted = false;
      if (!t.session) {
        // Its worker is away: say so, and deliver nothing (the partner tells the user).
        if (t.ops.device && !t.ops.device.online()) throw new DeviceOfflineError(t.ops.device.name);
        // Parked (process gone or restarted): resume by native session id, or fail loudly.
        if (!t.sessionId) throw new Error(`task ${taskId} has no session to resume`);
        // Resuming takes seconds (measured ~10 s for Claude Code): log the text now so the
        // transcript shows it at once; a resumed session is idle, so it becomes the next turn.
        logInput(t, text, from, "turn");
        setState(t, currentAttention(t), "provisioning");
        try {
          await startSession(t, true);
        } catch (err) {
          setState(t, currentAttention(t), "parked");
          logEvent(t, { role: "system", from: "runner", text: `delivery failed: could not resume the session: ${preview(String(err), 400)}` });
          throw err;
        }
        setState(t, "working", "hot");
        await sendTurn(t, text, from, true);
        return { delivered: "prompted" };
      }
      if (isBusy(t)) {
        if (mode !== "queue" && t.session!.canSteer) {
          await deliver(t, text, "steer", from);
          return { delivered: "steered" };
        }
        await deliver(t, text, "queue", from);
        return { delivered: "queued" };
      }
      // Idle: the text becomes the next turn. A finished or held task goes back to work.
      const a = currentAttention(t);
      if (a !== "working") setState(t, "working", "hot");
      await sendTurn(t, text, from);
      return { delivered: "prompted" };
    },

    async reopen(taskId) {
      const t = get(taskId);
      await t.started.catch(() => {});
      t.dropped = false;
      if (t.session || t.sessionId) return runner.send(taskId, REOPENED, undefined, "user");
      // Never got a session (e.g. failed to start): start one from the brief.
      t.started = (async () => {
        await t.ops.provision({ place: t.card.place, cwd: t.spec.cwd });
        await startSession(t, false);
        await sendTurn(t, kickoff(t.card.title), "runner");
      })();
      try {
        await t.started;
      } catch (err) {
        setState(t, "failed", "parked", preview(err instanceof Error ? err.message : String(err), 500));
        throw err;
      }
      return { delivered: "prompted" as const };
    },

    stop() {
      return runner.dispose();
    },

    async interrupt(taskId) {
      const t = get(taskId);
      await t.started;
      if (!t.session) return;
      t.interruptRequested = true;
      await t.session.interrupt();
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
      await t.sidecar?.close().catch(() => false);
      // The worktree and branch are kept on purpose.
    },

    async undrop(taskId) {
      const t = get(taskId);
      if (!t.dropped && currentAttention(t) !== "dropped") return { ok: true, message: "The task wasn't dropped." };
      // What it was before the drop, from the Log (survives a restart).
      const states = core.log.read({ stream: stream(taskId), kinds: ["task_state"], limit: 50_000 });
      let before: Attention = "blocked";
      for (let i = states.length - 1; i >= 0; i--) {
        const a = (states[i]!.body as Bodies["task_state"]).attention;
        if (a !== "dropped") {
          before = a;
          break;
        }
      }
      t.dropped = false;
      if (before === "working" || before === "queued") {
        // It was mid-work; its session was closed by the drop, so carry on from where it was.
        await runner.reopen(taskId);
        return { ok: true, message: "Back, and carrying on." };
      }
      setState(t, before, "parked");
      return { ok: true, message: "Back where it was." };
    },

    async merge(taskId) {
      const t = get(taskId);
      const card = core.tasks.get(taskId) ?? t.card;
      const r = await t.ops.merge(card.place);
      if (r.ok) logEvent(t, { role: "system", from: "runner", text: r.message, raw: { effect: "merge", ref: r.ref } });
      return r;
    },

    async openPr(taskId) {
      const t = get(taskId);
      const card = core.tasks.get(taskId) ?? t.card;
      const r = await t.ops.openPr(card.place);
      // Pushing and opening a PR leave the user's machines: an outside effect (I-results "Outside").
      if (r.ok) logEvent(t, { role: "system", from: "runner", text: r.message, raw: { effect: "outside", what: "draft_pr", ref: r.ref } });
      return r;
    },

    whenStarted(taskId) {
      return get(taskId).started;
    },

    sessionId(taskId) {
      return tasks.get(taskId)?.sessionId;
    },

    async dispose() {
      unsubscribe();
      for (const t of tasks.values()) {
        clearTimeout(t.offlineTimer);
        t.offlineOff?.();
      }
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

/** A worker task's cwd, from its recorded place (planned on the worker at open time). */
function remoteCwd(place: Place): string {
  if (place.kind === "repo") return place.worktree ?? place.repoPath;
  if (place.kind === "folder") return place.path;
  return "";
}
