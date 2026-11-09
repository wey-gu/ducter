import { randomBytes } from "node:crypto";
import { HARNESS_IDS, harnessName, type Attention, type Bodies, type BranchChanges, type Delivery, type LogEvent, type Place, type Residency, type TaskCard } from "@ducter/protocol";
import type { CoreApi, HarnessEvent, HarnessPort, HarnessSession, Runner, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { NUDGE, REOPENED, RESUME_AFTER_RESTART, briefTurn, handedOver, kickoff, taskBrief } from "./brief.ts";
import { createOarHarnessPort } from "./oar.ts";
import { cwdOf, planPlace, provisionPlace } from "./places.ts";
import { browserSidecar, type BrowserOptions, type BrowserSidecar } from "./browser.ts";
import { PREVIEW_MAX, preview } from "./normalize.ts";
import { archiveWorktree, branchChanges, mergeTaskBranch, openDraftPr, type ActionResult } from "./integrate.ts";
import { DEVICE_BACK, DeviceOfflineError, deviceOf, isOffline, remoteOps, type PlaceOps } from "./remote.ts";

/** task_state reason for a task whose worker dropped; clients render it as "<device> 连不上 / Can't reach <device>". */
export const unreachableReason = (device: string) => `device:unreachable:${device}`;

type HarnessId = SessionSpec["harness"];
type From = NonNullable<Bodies["task_event"]["from"]>;
const HARNESSES: readonly HarnessId[] = HARNESS_IDS;

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
  /**
   * How long an idle session stays warm before it is parked: the harness process is closed and
   * the next input resumes it by session id (focus-window-states: warm -> parked, 15 min).
   * Without it every task that ever ran kept its harness process until the main restarted.
   * 0 = never park. Default env DUCTER_PARK_IDLE_MS, else 15 min.
   */
  parkIdleMs?: number;
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
  /** What the task's branch holds that its base doesn't; undefined when not a repo task or unknown. */
  branchChanges(taskId: string): Promise<BranchChanges | undefined>;
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
  parkTimer?: ReturnType<typeof setTimeout>;
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
  const harness = opts.harness ?? createOarHarnessPort({ dataDir: core.dataDir });
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? shortId;
  const tasks = new Map<string, TaskRt>();
  const graceMs = opts.offlineGraceMs ?? Number(process.env.DUCTER_OFFLINE_GRACE_MS || 120_000);
  const parkMs = opts.parkIdleMs ?? Number(process.env.DUCTER_PARK_IDLE_MS || 15 * 60_000);
  const localOps: PlaceOps = {
    plan: (place, id, title) => planPlace(place, id, title, core.dataDir),
    provision: (r) => provisionPlace(r),
    harness,
    merge: (place) => mergeTaskBranch(place),
    openPr: (place) => openDraftPr(place, { gh: opts.gh }),
    changes: (place) => branchChanges(place),
    archive: (place) => archiveWorktree(place, core.dataDir),
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

  /** Idle and warm: park it after parkMs (the next input resumes it by session id). */
  function armPark(t: TaskRt) {
    clearTimeout(t.parkTimer);
    t.parkTimer = undefined;
    if (!(parkMs > 0)) return;
    t.parkTimer = setTimeout(() => void park(t), parkMs);
  }
  async function park(t: TaskRt) {
    t.parkTimer = undefined;
    const s = t.session;
    // Only a session that can be resumed: without its id, closing it would lose the task.
    if (!s || !t.sessionId || t.dropped || isBusy(t)) return;
    t.session = undefined; // first: input arriving from now on resumes instead of using it
    t.running = false;
    setState(t, currentAttention(t), "parked");
    await s.close().catch(() => {});
  }

  async function sendTurn(t: TaskRt, text: string, from: From, logged = false) {
    clearTimeout(t.parkTimer);
    t.running = true;
    setState(t, "working", "hot");
    await deliver(t, text, "turn", from, logged);
  }

  // clientId: the client's id for a user's task_send, so core can tell a resend from a new message.
  const logInput = (t: TaskRt, text: string, from: From, mode: string, clientId?: string) =>
    logEvent(t, { role: "user", from, text: preview(text, 16 * 1024), ...(clientId ? { clientId } : {}), raw: { delivered: mode } });

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
    // Only work in flight is said out loud; an idle task just shows its machine as away.
    if (t.resumeOnBack) logEvent(t, { role: "system", from: "runner", text: `${d.name} disconnected; the task carries on when it is back`, raw: { device: d.id, offline: true } });
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
    if (early === "tool_call_started" || early === "tool_call_title" || early === "tool_call_head") return; // the ended event logs the call
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
    if (!busy && !t.dropped) armPark(t);
    else clearTimeout(t.parkTimer);
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

  /**
   * A merged task is done and archived (product-model "Archive and disk", EC-steering-places
   * step 7): its session closes, its clean worktree goes, its branch stays. A task still working
   * (a follow-up in flight) keeps everything. A worktree with leftovers is kept and the reason
   * logged on the task; a follow-up later adds the worktree back from the branch (send).
   */
  async function archiveAfterMerge(t: TaskRt, place: Place) {
    if (place.kind !== "repo" || t.dropped || isBusy(t) || !["done_claimed", "done"].includes(currentAttention(t))) return;
    clearTimeout(t.parkTimer);
    const s = t.session;
    t.session = undefined;
    t.running = false;
    await s?.close().catch(() => {});
    let a: ActionResult & { removed: boolean };
    try {
      a = await t.ops.archive(place);
    } catch (err) {
      a = { ok: false, removed: false, message: `Kept the worktree: ${preview(err instanceof Error ? err.message : String(err), 300)}` };
    }
    if (a.removed || !a.ok) logEvent(t, { role: "system", from: "runner", text: a.message, raw: { archive: a.removed ? "removed" : "kept" } });
    setState(t, "done", a.ok ? "archived" : "parked");
  }

  function get(taskId: string): TaskRt {
    const t = tasks.get(taskId);
    if (!t) throw new Error(`unknown task ${taskId}`);
    return t;
  }

  /** briefed=false: the brief is still being written and comes as the first turn (D120). */
  function specFor(id: string, open: Bodies["task_open"], cwd: string, briefed = true): SessionSpec {
    const mcp = core.mcp.configFor({ taskId: id });
    const spec: SessionSpec = {
      harness: open.harness as HarnessId,
      cwd,
      appendSystemPrompt: taskBrief({
        partnerName: opts.partnerName ?? core.persona.name ?? "Ducter",
        taskId: id,
        title: open.title,
        brief: briefed ? open.brief : null,
        place: open.place,
        cwd,
        project: open.project || undefined,
        mcpServerName: mcp.name,
        ...(open.language ? { language: open.language } : {}),
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
  // The latest task_open of each task: a task opened before its brief was written (D120) logs a
  // second one with the brief, and a retitle logs one with the new title.
  const opens = new Map<string, LogEvent>();
  for (const e of core.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_open"] })) opens.set((e.body as Bodies["task_open"]).taskId, e);
  for (const e of opens.values()) {
    const open = e.body as Bodies["task_open"];
    const card = core.tasks.get(open.taskId);
    if (!card || tasks.has(open.taskId)) continue;
    const ops = opsFor(open.place);
    // A worker's cwd is on the worker; it was planned there and recorded in the place.
    const cwd = ops.device ? remoteCwd(open.place) : cwdOf(open.place, open.taskId, core.dataDir);
    // After a switch (D89) the card holds who does it now, not who it opened with.
    const now = card.body ? { ...open, harness: card.body.harness, model: card.body.model } : open;
    const t = newRt(open.taskId, e.persona, card, specFor(open.taskId, now, cwd), ops);
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
    // Cut off before its brief arrived (D120): it never did anything, so it never starts.
    if (!opens.get(t.id) || !(opens.get(t.id)!.body as Bodies["task_open"]).brief.trim()) {
      t.dropped = true;
      setState(t, "dropped", "archived", "not started");
      continue;
    }
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

  /** Opens a task; `brief` still being written (a promise) starts the session before it arrives (D120). */
  async function open(input: Parameters<Runner["openTask"]>[0], briefIn: string | Promise<string>): Promise<TaskCard> {
    const id = newId();
    // Who does it (D89): the person's rules, the limits and Use it for tasks, through core's
    // chooser; a pick this runner can't run (or no device info) keeps the old default.
    const picked = await core.bodies?.choose({ title: input.title, brief: input.brief, place: input.place, harness: input.harness, model: input.model });
    if (picked && "none" in picked) throw new Error(picked.none);
    const pick = picked && HARNESSES.includes(picked.harness as HarnessId) ? picked : undefined;
    if (pick) input = { ...input, harness: pick.harness, ...(pick.model ? { model: pick.model } : {}) };
    // D85: the partner's choice; else the first account the user lets tasks use (Settings
    // taskAccounts; a missing entry is enabled), in first-wave order.
    const accounts = core.settings?.get().taskAccounts ?? {};
    const enabled = (x: HarnessId) => accounts[x]?.enabled !== false;
    const h = (input.harness ?? opts.defaultHarness ?? HARNESSES.find(enabled) ?? "claude-code") as HarnessId;
    if (!HARNESSES.includes(h)) throw new Error(`unknown harness ${input.harness}`);
    if (input.harness && !enabled(h)) throw new Error(`the user switched ${harnessName(h)} off for tasks; leave harness out or ask them`);
    const title = input.title.trim() || "Untitled task";
    // Where it runs: this machine, or a worker that must be connected right now.
    const ops = opsFor(input.place);
    if (ops.device && !ops.device.online()) throw new DeviceOfflineError(ops.device.name);
    if (ops.device && input.place?.kind === "browser") throw new Error(`browser places run on this machine only for now, not on ${ops.device.name}`);
    const resolved = await ops.plan(input.place, id, title);
    // A worker plans its own place; it can't turn it into something this machine then runs
    // (a browser place starts cua-driver here).
    if (ops.device && resolved?.place?.kind !== (input.place?.kind ?? "none")) throw new Error(`${ops.device.name} answered with a different kind of place`);
    const project = input.project ?? "";
    const persona = input.persona || core.persona.id;
    const partnerName = opts.partnerName ?? core.persona.name ?? "Ducter";
    // Throws before the task exists when a browser place is unavailable (the partner says why).
    const sidecar = await browserSidecar({ place: resolved.place, persona, taskId: id, dataDir: core.dataDir, partnerName }, opts.browser);

    // The partner's choice wins; else DUCTER_TASK_MODEL; else the harness default.
    const model = input.model || (h === "claude-code" ? (opts.defaultModel ?? opts.taskModel ?? process.env.DUCTER_TASK_MODEL) || undefined : undefined);
    const later = typeof briefIn !== "string";
    const body: Bodies["task_open"] = { taskId: id, title, project, place: resolved.place, harness: h, model, brief: later ? "" : briefIn, ...(input.language ? { language: input.language } : {}) };
    const opened = core.log.append({ persona, stream: stream(id), origin: "system", kind: "task_open", body });
    core.log.append({ persona, stream: stream(id), origin: "system", kind: "body_selected", body: { taskId: id, harness: h, ...(model ? { model } : {}), why: pick?.why ?? { kind: input.harness ? "partner" : "default" } } });
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
    const specOf = (b: Bodies["task_open"], briefed: boolean) => {
      const spec = specFor(id, b, resolved.cwd, briefed);
      if (sidecar) {
        spec.appendSystemPrompt = (spec.appendSystemPrompt ?? "") + sidecar.brief;
        spec.mcp = [...spec.mcp, sidecar.mcp];
        if (h === "claude-code") Object.assign(spec, sidecar.claude);
      }
      return spec;
    };
    const spec = specOf(body, !later);
    const t = newRt(id, persona, card, spec, ops);
    if (sidecar) t.sidecar = sidecar;
    tasks.set(id, t);
    core.tasks.setState(id, "queued", "provisioning");

    t.started = (async () => {
      try {
        await ops.provision(resolved);
        await sidecar?.ready();
        await startSession(t, false);
        let first = kickoff(title);
        if (later) {
          // The session is up (or coming up) while the partner finishes the brief.
          let text: string;
          try {
            text = await briefIn;
          } catch {
            // Never briefed (the partner's call changed or failed): gone before it did anything.
            if (t.dropped) return;
            t.dropped = true;
            setState(t, "dropped", "archived", "not started");
            const s = t.session;
            t.session = undefined;
            await s?.close().catch(() => {});
            await sidecar?.close().catch(() => false);
            return;
          }
          if (t.dropped) return;
          // The briefed task_open is the one the registry, recovery and hand-offs read.
          const full = { ...body, brief: text };
          core.log.append({ persona, stream: stream(id), origin: "system", kind: "task_open", body: full });
          t.spec = { ...specOf(full, true), cwd: t.spec.cwd };
          first = briefTurn(text, title);
        }
        if (t.dropped) return;
        await sendTurn(t, first, "runner");
      } catch (err) {
        if (isOffline(err)) return deviceLost(t, true);
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        logEvent(t, { role: "system", from: "runner", text: `failed to start: ${reason}` });
        setState(t, "failed", "archived", reason);
      }
    })();

    return core.tasks.get(id) ?? card;
  }

  const runner: RunnerExt = {
    harness,

    openTask: (input) => open(input, input.brief),
    // D120: the card, the place and the session start while the partner still writes the brief.
    openTaskEarly: (input, brief) => open({ ...input, brief: "" }, brief),

    async send(taskId, text, mode, from = "partner", clientId) {
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
        logInput(t, text, from, "turn", clientId);
        const archived = t.residency === "archived";
        setState(t, currentAttention(t), "provisioning");
        try {
          // Archived after a merge: its worktree was removed; add it back from the kept branch.
          if (archived) await t.ops.provision({ place: core.tasks.get(taskId)?.place ?? t.card.place, cwd: t.spec.cwd });
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
          logInput(t, text, from, "steer", clientId);
          await deliver(t, text, "steer", from, true);
          return { delivered: "steered" };
        }
        logInput(t, text, from, "queue", clientId);
        await deliver(t, text, "queue", from, true);
        return { delivered: "queued" };
      }
      // Idle: the text becomes the next turn. A finished or held task goes back to work.
      const a = currentAttention(t);
      if (a !== "working") setState(t, "working", "hot");
      if (clientId) logInput(t, text, from, "turn", clientId);
      await sendTurn(t, text, from, !!clientId);
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

    async switchBody(taskId, harness, model) {
      const t = get(taskId);
      if (!HARNESSES.includes(harness as HarnessId)) return { ok: false, message: `${harness} can't do tasks here yet.` };
      if (t.dropped) return { ok: false, message: "That task was dropped. Undo the drop first." };
      await t.started.catch(() => {});
      const from = t.spec.harness;
      const wasRunning = !!t.session && isBusy(t);
      const att = currentAttention(t);
      // The old session closes; its native session can't carry over to another harness.
      const old = t.session;
      t.session = undefined;
      t.running = false;
      t.sessionId = undefined;
      await old?.close().catch(() => {});
      t.spec = { ...t.spec, harness: harness as HarnessId };
      if (model) t.spec.model = model;
      else delete t.spec.model;
      logEvent(t, { role: "system", from: "runner", text: `moved from ${from} to ${harness}${model ? ` (${model})` : ""}` });
      // Something left to do: carry on there now, from the saved progress. A finished or waiting
      // task keeps its state; the next message starts the new session.
      if (!wasRunning && att !== "working" && att !== "queued") {
        setState(t, att, "parked");
        return { ok: true };
      }
      const progress = core.log
        .read({ stream: stream(taskId), kinds: ["checkpoint"], limit: 20 })
        .map((e) => (e.body as Bodies["checkpoint"]).text);
      t.started = (async () => {
        await startSession(t, false);
        setState(t, "working", "hot");
        await sendTurn(t, handedOver(from, progress), "runner");
      })();
      try {
        await t.started;
      } catch (err) {
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        setState(t, "failed", "parked", reason);
        return { ok: false, message: reason };
      }
      return { ok: true };
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
      if (!r.ok) return r;
      logEvent(t, { role: "system", from: "runner", text: r.message, raw: { effect: "merge", ref: r.ref } });
      await archiveAfterMerge(t, card.place);
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

    async branchChanges(taskId) {
      const t = tasks.get(taskId);
      const place = core.tasks.get(taskId)?.place ?? t?.card.place;
      if (!t || place?.kind !== "repo") return undefined;
      return t.ops.changes(place).catch(() => undefined);
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
        clearTimeout(t.parkTimer);
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
